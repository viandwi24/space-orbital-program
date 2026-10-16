/**
 * Launch-site layout, pure and seeded. Coordinates are site-local metres in the frame
 * `placeOnSurface` uses: +x east, +y up, +z south, origin at the pad centre on the ground.
 * Everything here is data; `site-meshes.ts` turns it into Three objects and the ground shader
 * paints the pad, apron and roads from the same constants (ADR 0027).
 */
import { createRng } from '@orbital/core';
import { fbm3 } from './noise.ts';

/** Concrete pad radius, m. The vessel stands at the centre. */
export const PAD_RADIUS = 11;
/** Radius of the burnt zone under the engines, m. */
export const SCORCH_RADIUS = 4.5;

export interface BoxSpec {
	x: number;
	z: number;
	/** Extent east-west, m. */
	w: number;
	/** Extent north-south, m. */
	d: number;
	h: number;
	kind: 'hangar' | 'office' | 'service' | 'garage' | 'control';
}
export interface TankSpec {
	x: number;
	z: number;
	radius: number;
	kind: 'sphere' | 'cylinder';
	height: number;
}
export interface RoadSpec {
	ax: number;
	az: number;
	bx: number;
	bz: number;
	width: number;
}
export interface TreeSpec {
	x: number;
	z: number;
	/** Scale factor around 1. */
	scale: number;
	kind: 'pine' | 'round';
	yaw: number;
}
export interface RockSpec {
	x: number;
	z: number;
	scale: number;
	yaw: number;
}

export const TOWER = { x: 7.5, z: 0, size: 2.6, height: 25 } as const;
export const MASTS: readonly { x: number; z: number; height: number }[] = [
	{ x: 24, z: 24, height: 32 },
	{ x: -24, z: 24, height: 32 },
	{ x: 24, z: -24, height: 32 },
	{ x: -24, z: -24, height: 32 }
];
/** Floodlight banks on the masts: where the lamps are and how bright (candela, night only). */
export const FLOOD_LIGHT_INTENSITY = 1500;
export const floodLightPositions = (): { x: number; y: number; z: number }[] =>
	MASTS.map((m) => ({ x: m.x, y: m.height - 4, z: m.z }));
export const BUILDINGS: readonly BoxSpec[] = [
	{ x: -70, z: -135, w: 74, d: 50, h: 38, kind: 'hangar' },
	{ x: 70, z: -100, w: 42, d: 24, h: 10, kind: 'office' },
	{ x: 120, z: 44, w: 28, d: 18, h: 8, kind: 'service' },
	{ x: -22, z: -80, w: 20, d: 12, h: 6, kind: 'garage' },
	{ x: 36, z: -52, w: 34, d: 16, h: 9, kind: 'control' }
];
/** Shipping containers: stacks at a position, `yaw` 0 = long side east-west. */
export interface ContainerStack {
	x: number;
	z: number;
	yaw: number;
	levels: number;
	/** Palette index. */
	colour: number;
}
export const CONTAINERS: readonly ContainerStack[] = [
	{ x: 112, z: 62, yaw: 0, levels: 2, colour: 0 },
	{ x: 112, z: 65, yaw: 0, levels: 1, colour: 2 },
	{ x: 112, z: 68, yaw: 0, levels: 3, colour: 1 },
	{ x: 125, z: 62.5, yaw: 0, levels: 1, colour: 3 },
	{ x: 125, z: 66, yaw: 0, levels: 2, colour: 0 }
];
export interface VehicleSpec {
	x: number;
	z: number;
	yaw: number;
	kind: 'truck' | 'van' | 'crane';
	colour: number;
}
export const VEHICLES: readonly VehicleSpec[] = [
	{ x: 58, z: -88, yaw: 0, kind: 'van', colour: 0 },
	{ x: 66, z: -85, yaw: 0.05, kind: 'truck', colour: 1 },
	{ x: 82, z: -90, yaw: Math.PI, kind: 'van', colour: 2 },
	{ x: -78, z: -108, yaw: 0, kind: 'crane', colour: 0 },
	{ x: -48, z: -82, yaw: Math.PI / 2, kind: 'truck', colour: 3 }
];
/** Chain-link fence rectangles (centre, half extents) around the tank farm. */
export const FENCES: readonly { x: number; z: number; hx: number; hz: number }[] = [
	{ x: -62, z: 53, hx: 22, hz: 20 }
];
export const TANKS: readonly TankSpec[] = [
	{ x: -55, z: 44, radius: 5.5, kind: 'sphere', height: 0 },
	{ x: -70, z: 44, radius: 5.5, kind: 'sphere', height: 0 },
	{ x: -62, z: 62, radius: 3.5, kind: 'cylinder', height: 16 }
];
export const ROADS: readonly RoadSpec[] = [
	{ ax: 0, az: -PAD_RADIUS + 2, bx: 0, bz: -82, width: 8 },
	{ ax: -95, az: -82, bx: 135, bz: -82, width: 8 },
	{ ax: -70, az: -82, bx: -70, bz: -104, width: 12 },
	{ ax: 135, az: -82, bx: 135, bz: 44, width: 7 },
	{ ax: -PAD_RADIUS + 2, az: 0, bx: -62, bz: 0, width: 6 },
	{ ax: -62, az: 0, bx: -62, bz: 50, width: 6 }
];
/** Paved aprons as centre + half extents (x, z). */
export const APRONS: readonly { x: number; z: number; hx: number; hz: number }[] = [
	{ x: -70, z: -108, hx: 42, hz: 10 },
	{ x: 70, z: -88, hx: 26, hz: 8 },
	{ x: 120, z: 30, hx: 20, hz: 8 }
];

/** Distance from a point to the segment (ax,az)-(bx,bz). */
export function distanceToSegment(
	px: number,
	pz: number,
	ax: number,
	az: number,
	bx: number,
	bz: number
): number {
	const dx = bx - ax;
	const dz = bz - az;
	const len2 = dx * dx + dz * dz;
	const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0;
	return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

/** True when a point is within `margin` m of any built structure (so vegetation keeps clear). */
export function isBuilt(x: number, z: number, margin: number): boolean {
	if (Math.hypot(x, z) < PAD_RADIUS + margin + 8) return true;
	for (const b of BUILDINGS) {
		if (Math.abs(x - b.x) < b.w / 2 + margin && Math.abs(z - b.z) < b.d / 2 + margin) return true;
	}
	for (const a of APRONS) {
		if (Math.abs(x - a.x) < a.hx + margin && Math.abs(z - a.z) < a.hz + margin) return true;
	}
	for (const t of TANKS) if (Math.hypot(x - t.x, z - t.z) < t.radius + margin) return true;
	for (const c of CONTAINERS) {
		if (Math.abs(x - c.x) < 7 + margin && Math.abs(z - c.z) < 2 + margin) return true;
	}
	for (const f of FENCES) {
		if (Math.abs(x - f.x) < f.hx + margin && Math.abs(z - f.z) < f.hz + margin) return true;
	}
	for (const m of MASTS) if (Math.hypot(x - m.x, z - m.z) < margin) return true;
	for (const r of ROADS) {
		if (distanceToSegment(x, z, r.ax, r.az, r.bx, r.bz) < r.width / 2 + margin) return true;
	}
	return false;
}

export interface BushSpec {
	x: number;
	z: number;
	scale: number;
	yaw: number;
}
export interface TuftSpec {
	x: number;
	z: number;
	scale: number;
	yaw: number;
	/** 0..1 tint variation (lush to dry). */
	tint: number;
}

export interface SiteLayout {
	trees: TreeSpec[];
	rocks: RockSpec[];
	bushes: BushSpec[];
}

/** True when a point is on or inside a paved or built footprint (grass never grows there). */
export function isPaved(x: number, z: number, margin: number): boolean {
	if (Math.hypot(x, z) < PAD_RADIUS + margin) return true;
	for (const b of BUILDINGS) {
		if (Math.abs(x - b.x) < b.w / 2 + margin && Math.abs(z - b.z) < b.d / 2 + margin) return true;
	}
	for (const a of APRONS) {
		if (Math.abs(x - a.x) < a.hx + margin && Math.abs(z - a.z) < a.hz + margin) return true;
	}
	for (const r of ROADS) {
		if (distanceToSegment(x, z, r.ax, r.az, r.bx, r.bz) < r.width / 2 + margin) return true;
	}
	for (const t of TANKS) if (Math.hypot(x - t.x, z - t.z) < t.radius + margin) return true;
	if (
		Math.abs(x - TOWER.x) < TOWER.size + 2.5 + margin &&
		Math.abs(z - TOWER.z) < TOWER.size + 2.5 + margin
	) {
		return true;
	}
	return false;
}

/** Radius around the pad inside which grass tufts are scattered, m. */
export const TUFT_RADIUS = 70;

/**
 * Grass tufts around the pad: jittered grid so the density is even, thinned toward the rim, none on
 * pavement or under buildings. Pure and seeded (the same layout every run).
 */
export function layoutTufts(count: number, seed = 11): TuftSpec[] {
	if (count <= 0) return [];
	const rng = createRng(seed);
	const out: TuftSpec[] = [];
	// A square grid sized so that about `count` points fall inside the disc.
	const cell = Math.sqrt((Math.PI * TUFT_RADIUS * TUFT_RADIUS) / (count * 1.6));
	const n = Math.ceil(TUFT_RADIUS / cell);
	for (let i = -n; i <= n && out.length < count; i++) {
		for (let j = -n; j <= n && out.length < count; j++) {
			const x = (i + rng.next()) * cell;
			const z = (j + rng.next()) * cell;
			const r = Math.hypot(x, z);
			if (r > TUFT_RADIUS) continue;
			// fewer toward the rim; a patchy lawn (dense and thin areas) from a slow noise
			const patch = fbm3(x / 9, 0.3, z / 9, 2, seed + 3);
			const keep = (1 - (r / TUFT_RADIUS) ** 3) * (0.7 + 0.6 * patch);
			if (rng.next() > keep) continue;
			if (isPaved(x, z, 0.3)) continue;
			out.push({
				x,
				z,
				scale: rng.range(0.7, 1.35),
				yaw: rng.range(0, Math.PI * 2),
				tint: rng.next()
			});
		}
	}
	return out;
}

/** Tree clusters near the site: centre, radius, count and the share of pines. */
export const GROVES: readonly {
	x: number;
	z: number;
	radius: number;
	count: number;
	pine: number;
}[] = [
	{ x: 105, z: 70, radius: 20, count: 26, pine: 0.3 },
	{ x: -130, z: 25, radius: 26, count: 34, pine: 0.55 },
	{ x: 60, z: -175, radius: 22, count: 30, pine: 0.7 },
	{ x: -40, z: 120, radius: 18, count: 22, pine: 0.2 },
	{ x: 175, z: -30, radius: 24, count: 28, pine: 0.4 }
];
export const TREE_INNER = 45;
export const TREE_OUTER = 1_800;

/** Vegetation for a preset's tree budget: clustered into groves, clear of everything built. */
export function layoutVegetation(treeCount: number, seed = 7): SiteLayout {
	const rng = createRng(seed);
	const trees: TreeSpec[] = [];
	const cell = 7;
	const taken = new Set<string>();
	// A few groves close to the pad frame the view and give the eye a scale for the buildings.
	for (const g of GROVES) {
		for (let i = 0; i < g.count && trees.length < treeCount; i++) {
			const a = rng.range(0, Math.PI * 2);
			const r = Math.abs(rng.next() + rng.next() - 1) * g.radius;
			const x = g.x + Math.cos(a) * r;
			const z = g.z + Math.sin(a) * r;
			if (isBuilt(x, z, 5)) continue;
			const key = `${Math.round(x / 4)},${Math.round(z / 4)}`;
			if (taken.has(key)) continue;
			taken.add(key);
			trees.push({
				x,
				z,
				scale: rng.range(0.8, 1.55),
				kind: rng.next() < g.pine ? 'pine' : 'round',
				yaw: rng.range(0, Math.PI * 2)
			});
		}
	}
	let attempts = 0;
	while (trees.length < treeCount && attempts < treeCount * 60) {
		attempts++;
		// Area-uniform in the annulus, then thinned by grove noise and by distance so the near
		// field is sparse and the horizon is wooded.
		const r = Math.sqrt(rng.range(TREE_INNER * TREE_INNER, TREE_OUTER * TREE_OUTER));
		const a = rng.range(0, Math.PI * 2);
		const x = Math.cos(a) * r;
		const z = Math.sin(a) * r;
		const grove = fbm3(x / 140, 0.5, z / 140, 3, seed);
		const near = Math.min(1, r / 400);
		if (grove < 0.5 + (1 - near) * 0.18 || rng.next() > 0.35 + near * 0.65) continue;
		if (isBuilt(x, z, 6)) continue;
		const key = `${Math.round(x / cell)},${Math.round(z / cell)}`;
		if (taken.has(key)) continue;
		taken.add(key);
		trees.push({
			x,
			z,
			scale: rng.range(0.75, 1.5),
			kind: grove > 0.62 ? 'pine' : 'round',
			yaw: rng.range(0, Math.PI * 2)
		});
	}
	const rocks: RockSpec[] = [];
	for (let i = 0; i < 90; i++) {
		const r = Math.sqrt(rng.range(30 * 30, 700 * 700));
		const a = rng.range(0, Math.PI * 2);
		const x = Math.cos(a) * r;
		const z = Math.sin(a) * r;
		if (isBuilt(x, z, 3)) continue;
		rocks.push({ x, z, scale: rng.range(0.4, 2.2), yaw: rng.range(0, Math.PI * 2) });
	}
	const bushes: BushSpec[] = [];
	const addBush = (x: number, z: number): void => {
		if (isBuilt(x, z, 0.4) && !isBuilt(x, z, -1.5)) return;
		if (isPaved(x, z, 0.8)) return;
		bushes.push({ x, z, scale: rng.range(0.6, 1.5), yaw: rng.range(0, Math.PI * 2) });
	};
	for (const b of BUILDINGS) {
		const per = 2 * (b.w + b.d);
		for (let d = 0; d < per; d += rng.range(4, 9)) {
			const off = 1.8 + rng.range(0, 1.6);
			let t = d;
			if (t < b.w) addBush(b.x - b.w / 2 + t, b.z - b.d / 2 - off);
			else if ((t -= b.w) < b.d) addBush(b.x + b.w / 2 + off, b.z - b.d / 2 + t);
			else if ((t -= b.d) < b.w) addBush(b.x + b.w / 2 - t, b.z + b.d / 2 + off);
			else addBush(b.x - b.w / 2 - off, b.z + b.d / 2 - (t - b.w));
		}
	}
	for (const r of ROADS) {
		const len = Math.hypot(r.bx - r.ax, r.bz - r.az);
		const nx = (r.bz - r.az) / len;
		const nz = -(r.bx - r.ax) / len;
		for (let d = 6; d < len - 6; d += rng.range(7, 18)) {
			if (rng.next() < 0.45) continue;
			const side = rng.next() < 0.5 ? -1 : 1;
			const off = r.width / 2 + rng.range(2.5, 5);
			addBush(
				r.ax + ((r.bx - r.ax) * d) / len + nx * off * side,
				r.az + ((r.bz - r.az) * d) / len + nz * off * side
			);
		}
	}
	for (let i = 0; i < 260; i++) {
		const r = Math.sqrt(rng.range(25 * 25, 500 * 500));
		const a = rng.range(0, Math.PI * 2);
		const grove = fbm3((Math.cos(a) * r) / 90, 2.3, (Math.sin(a) * r) / 90, 3, seed + 9);
		if (grove < 0.45) continue;
		addBush(Math.cos(a) * r, Math.sin(a) * r);
	}
	return { trees, rocks, bushes };
}
