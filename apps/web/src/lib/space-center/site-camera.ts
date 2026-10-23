/**
 * Where the Space Center's camera looks (plan 387, ADR 0326). Pure: boxes in site metres in, a
 * view out. A view is a focus point, a compass azimuth (radians clockwise from north, the
 * direction from the focus to the camera), an elevation above the horizon and a distance.
 * - `fitAll`: every box in the free part of the viewport, from the site's front at about 40°.
 * - `bestView`: one building from its entrance side, about 55 % of the free viewport, walking
 *   round it when another building blocks the line of sight; never below the ground.
 */

import {
	CELL_SIZE,
	entranceFronts,
	footprint,
	type BuildingDefinition,
	type Cell,
	type Rotation
} from '@orbital/core';
import { HEIGHTS } from './model';

export interface SiteBox {
	/** Centre of the footprint, site metres. */
	east: number;
	north: number;
	/** Footprint east-west and north-south, and height, m. */
	w: number;
	d: number;
	h: number;
}

export interface SiteView {
	focus: { east: number; north: number; up: number };
	/** rad, clockwise from north: where the camera stands, seen from the focus. */
	azimuth: number;
	/** rad above the horizon. */
	elevation: number;
	/** m from the focus. */
	distance: number;
}

export interface ViewportSpec {
	width: number;
	height: number;
	/** Vertical field of view, rad. */
	fovY: number;
	/** Interface over the view, CSS px. */
	insets: { top: number; right: number; bottom: number; left: number };
}

type V = { e: number; n: number; u: number };
const dot = (a: V, b: V): number => a.e * b.e + a.n * b.n + a.u * b.u;
const cross = (a: V, b: V): V => ({
	e: a.n * b.u - a.u * b.n,
	n: a.u * b.e - a.e * b.u,
	u: a.e * b.n - a.n * b.e
});
const norm = (a: V): V => {
	const l = Math.hypot(a.e, a.n, a.u) || 1;
	return { e: a.e / l, n: a.n / l, u: a.u / l };
};

/** Unit vector from the focus to the camera. */
export const toCamera = (azimuth: number, elevation: number): V => ({
	e: Math.sin(azimuth) * Math.cos(elevation),
	n: Math.cos(azimuth) * Math.cos(elevation),
	u: Math.sin(elevation)
});

/** The tangents of the half field of view over the free part of the viewport (insets left out). */
function freeTangents(vp: ViewportSpec): { x: number; y: number } {
	const ty = Math.tan(vp.fovY / 2);
	const tx = ty * (vp.width / Math.max(vp.height, 1));
	const freeW = Math.max(vp.width - vp.insets.left - vp.insets.right, vp.width * 0.3);
	const freeH = Math.max(vp.height - vp.insets.top - vp.insets.bottom, vp.height * 0.3);
	return { x: tx * (freeW / vp.width), y: ty * (freeH / vp.height) };
}

const corners = (b: SiteBox): V[] => {
	const out: V[] = [];
	for (const e of [-b.w / 2, b.w / 2])
		for (const n of [-b.d / 2, b.d / 2])
			for (const u of [0, b.h]) out.push({ e: b.east + e, n: b.north + n, u });
	return out;
};

/**
 * The view that holds every corner of `boxes` from `azimuth` and `elevation`, with `fill` of the
 * free viewport used (1 = edge to edge). The focus is the middle of the boxes' bounds.
 */
export function frameBoxes(
	boxes: readonly SiteBox[],
	vp: ViewportSpec,
	azimuth: number,
	elevation: number,
	fill = 0.9
): SiteView {
	const pts = boxes.flatMap(corners);
	if (pts.length === 0)
		return { focus: { east: 0, north: 0, up: 0 }, azimuth, elevation, distance: 400 };
	const min = (k: keyof V) => Math.min(...pts.map((p) => p[k]));
	const max = (k: keyof V) => Math.max(...pts.map((p) => p[k]));
	const focus = {
		e: (min('e') + max('e')) / 2,
		n: (min('n') + max('n')) / 2,
		u: (min('u') + max('u')) / 2
	};
	const c = toCamera(azimuth, elevation);
	const forward = { e: -c.e, n: -c.n, u: -c.u };
	const right = norm(cross(forward, { e: 0, n: 0, u: 1 }));
	const up = cross(right, forward);
	const t = freeTangents(vp);
	let distance = 0;
	for (const p of pts) {
		const r = { e: p.e - focus.e, n: p.n - focus.n, u: p.u - focus.u };
		// a point nearer the camera (r·c > 0) needs more room, one further away less
		const toward = dot(r, c);
		distance = Math.max(
			distance,
			Math.abs(dot(r, right)) / (t.x * fill) + toward,
			Math.abs(dot(r, up)) / (t.y * fill) + toward
		);
	}
	return {
		focus: { east: focus.e, north: focus.n, up: focus.u },
		azimuth,
		elevation,
		distance: Math.max(distance, 30)
	};
}

/** The site's front: the side most entrances open to (a compass azimuth), or the south. */
export function siteFront(facings: readonly number[]): number {
	if (facings.length === 0) return Math.PI;
	const e = facings.reduce((s, a) => s + Math.sin(a), 0);
	const n = facings.reduce((s, a) => s + Math.cos(a), 0);
	return Math.hypot(e, n) < 1e-6 ? Math.PI : Math.atan2(e, n);
}

/** Overview elevation (ADR 0326 point 1). */
export const OVERVIEW_ELEVATION = (40 * Math.PI) / 180;
/** A building's view elevation. */
export const BUILDING_ELEVATION = (32 * Math.PI) / 180;

/** The overview never frames less than this much ground, m: a branch with one HQ shows its land. */
export const MIN_OVERVIEW_SPAN = 180;

/** Every building, pad and road of the site in view, from its front at 40° (ADR 0326 point 1). */
export function fitAll(
	boxes: readonly SiteBox[],
	facings: readonly number[],
	vp: ViewportSpec
): SiteView {
	const all = [...boxes];
	if (boxes.length > 0) {
		const lo = (k: 'east' | 'north', size: 'w' | 'd') =>
			Math.min(...boxes.map((b) => b[k] - b[size] / 2));
		const hi = (k: 'east' | 'north', size: 'w' | 'd') =>
			Math.max(...boxes.map((b) => b[k] + b[size] / 2));
		all.push({
			east: (lo('east', 'w') + hi('east', 'w')) / 2,
			north: (lo('north', 'd') + hi('north', 'd')) / 2,
			w: MIN_OVERVIEW_SPAN,
			d: MIN_OVERVIEW_SPAN,
			h: 0
		});
	}
	return frameBoxes(all, vp, siteFront(facings), OVERVIEW_ELEVATION, 0.92);
}

/** Does the segment `a`→`b` pass through `box` (a slab test)? */
export function blocks(a: V, b: V, box: SiteBox): boolean {
	const lo = { e: box.east - box.w / 2, n: box.north - box.d / 2, u: 0 };
	const hi = { e: box.east + box.w / 2, n: box.north + box.d / 2, u: box.h };
	let t0 = 0;
	let t1 = 1;
	for (const k of ['e', 'n', 'u'] as const) {
		const d = b[k] - a[k];
		if (Math.abs(d) < 1e-9) {
			if (a[k] < lo[k] || a[k] > hi[k]) return false;
			continue;
		}
		let ta = (lo[k] - a[k]) / d;
		let tb = (hi[k] - a[k]) / d;
		if (ta > tb) [ta, tb] = [tb, ta];
		t0 = Math.max(t0, ta);
		t1 = Math.min(t1, tb);
		if (t0 > t1) return false;
	}
	return true;
}

/**
 * One building's best view (ADR 0326 point 2): from the side its entrance faces (`facing`, a
 * compass azimuth, or the south without one), filling about 55 % of the free viewport. When
 * another box stands between the camera and the building's middle, the camera walks round in
 * 20° steps, alternating sides, to the nearest clear azimuth; with none clear it climbs higher.
 */
export function bestView(
	target: SiteBox,
	facing: number | null,
	others: readonly SiteBox[],
	vp: ViewportSpec
): SiteView {
	const start = facing ?? Math.PI;
	const middle: V = { e: target.east, n: target.north, u: target.h / 2 };
	const clear = (v: SiteView): boolean => {
		const c = toCamera(v.azimuth, v.elevation);
		const cam = {
			e: v.focus.east + c.e * v.distance,
			n: v.focus.north + c.n * v.distance,
			u: v.focus.up + c.u * v.distance
		};
		return !others.some((o) => blocks(cam, middle, o));
	};
	const step = (20 * Math.PI) / 180;
	for (const elevation of [BUILDING_ELEVATION, BUILDING_ELEVATION + 0.35, 1.2]) {
		for (let k = 0; k <= 9; k++) {
			for (const sign of k === 0 ? [1] : [1, -1]) {
				const v = frameBoxes([target], vp, start + sign * k * step, elevation, 0.55);
				if (clear(v)) return v;
			}
		}
	}
	return frameBoxes([target], vp, start, 1.2, 0.55);
}

/** The shortest turn from `from` to `to`, rad, in (-π, π]. */
export function shortestTurn(from: number, to: number): number {
	const d = (((to - from) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI);
	return d - Math.PI;
}

// ---- the site as boxes -----------------------------------------------------------------------------

export interface SiteBuildingBox {
	id: string;
	box: SiteBox;
	/** Where its first entrance faces (compass azimuth), or null without one. */
	facing: number | null;
}

/** The site's buildings as boxes with their entrance facing; roads as flat boxes (ADR 0326). */
export function siteBoxes(
	site: {
		buildings?: readonly { id: string; kind: string; cell: Cell; rotation: Rotation }[];
		roads?: readonly Cell[];
	},
	registry: { get(id: string): BuildingDefinition | undefined }
): { buildings: SiteBuildingBox[]; roads: SiteBox[] } {
	const buildings = (site.buildings ?? []).flatMap((b): SiteBuildingBox[] => {
		const def = registry.get(b.kind);
		if (!def) return [];
		const cells = footprint(def.size, b.cell, b.rotation);
		const is = cells.map((c) => c.i);
		const js = cells.map((c) => c.j);
		const east = ((Math.min(...is) + Math.max(...is)) / 2) * CELL_SIZE;
		const north = ((Math.min(...js) + Math.max(...js)) / 2) * CELL_SIZE;
		const generator = def.visual.kind === 'generator' ? def.visual.generator : 'asset';
		const box: SiteBox = {
			east,
			north,
			w: (Math.max(...is) - Math.min(...is) + 1) * CELL_SIZE,
			d: (Math.max(...js) - Math.min(...js) + 1) * CELL_SIZE,
			h: HEIGHTS[generator] ?? 10
		};
		const front = entranceFronts(def, b.cell, b.rotation)[0];
		const facing = front
			? Math.atan2(front.i * CELL_SIZE - east, front.j * CELL_SIZE - north)
			: null;
		return [{ id: b.id, box, facing }];
	});
	const roads = (site.roads ?? []).map((c): SiteBox => ({
		east: c.i * CELL_SIZE,
		north: c.j * CELL_SIZE,
		w: CELL_SIZE,
		d: CELL_SIZE,
		h: 0.5
	}));
	return { buildings, roads };
}
