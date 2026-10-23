/**
 * Site buildings from a building list (plan 091, ADR 0117): each placed building is drawn by the
 * generator its definition names, sized from its footprint (10 m cells, ADR 0115), turned by its
 * rotation and put at its cells. Site-local metres: x east, y up, z south.
 */
import { BufferGeometry, Matrix4, Quaternion, Vector3 } from 'three';
import { buildControl, buildHangar, buildOffice, buildService } from './site-buildings.ts';
import { box, cylinder, emptyParts, lin, type SiteParts } from './site-geo.ts';
import { dishStaticParts } from './site-dish.ts';
import type { BoxSpec } from './site.ts';

export const SITE_CELL = 10;

export interface SiteBuildingView {
	id: string;
	/** `visual.generator` of the building's definition. */
	generator: string;
	/** Footprint at rotation 0, cells east (w) × north (d). */
	size: { w: number; d: number };
	cell: { i: number; j: number };
	rotation: 0 | 90 | 180 | 270;
	/**
	 * Share of the construction done, 0 to 1, while the building is being built (plan 388); absent
	 * when it stands. It is drawn as its final shape in outline, a scaffold and a rising core.
	 */
	construction?: number;
}

/** Centre of a footprint in site-local x (east) and z (south), and its turned extents in cells. */
export function footprintCentre(b: Pick<SiteBuildingView, 'size' | 'cell' | 'rotation'>): {
	x: number;
	z: number;
	w: number;
	d: number;
} {
	const turned = b.rotation === 90 || b.rotation === 270;
	const w = turned ? b.size.d : b.size.w;
	const d = turned ? b.size.w : b.size.d;
	const east = (b.cell.i + (w - 1) / 2) * SITE_CELL;
	const north = (b.cell.j + (d - 1) / 2) * SITE_CELL;
	return { x: east, z: -north, w, d };
}

const ASPHALT = lin(0x3b3d40);
const CONCRETE = lin(0xb9b6ae);
const STEEL = lin(0xc9ccce);
const WHITE = lin(0xe9e9e4);

/** One building, at the origin, unturned: w east-west and d north-south in metres. */
export function generate(generator: string, w: number, d: number, p: SiteParts): void {
	const spec = (kind: BoxSpec['kind'], h: number): BoxSpec => ({ x: 0, z: 0, w, d, h, kind });
	switch (generator) {
		case 'hangar':
			return buildHangar(spec('hangar', Math.min(38, 0.5 * Math.min(w, d) + 14)), p);
		case 'control':
			return buildControl(spec('control', 9), p);
		case 'office':
			return buildOffice(spec('office', 10), p);
		case 'launch-pad': {
			// a concrete deck with a flame trench; the tower of today's site stands on the Legacy pad
			const r = Math.min(w, d) / 2;
			p.painted.push(cylinder(r, r, 0.6, 0, 0.3, 0, CONCRETE, 40));
			p.painted.push(box(r * 0.5, 0.2, r * 1.6, 0, 0.62, 0, lin(0x6f6c66)));
			return;
		}
		case 'runway': {
			p.painted.push(box(w, 0.2, d, 0, 0.1, 0, ASPHALT));
			for (let z = -d / 2 + 20; z < d / 2 - 20; z += 40)
				p.painted.push(box(1, 0.05, 18, 0, 0.22, z, WHITE));
			return;
		}
		case 'dish': {
			const r = Math.min(w, d) / 2;
			p.painted.push(box(w * 0.6, 1.2, d * 0.6, 0, 0.6, 0, CONCRETE));
			p.structure.push(cylinder(0.6, 0.9, 6, 0, 4.2, 0, STEEL, 10));
			p.painted.push(cylinder(r * 0.95, r * 0.25, 1.6, 0, 8, 0, WHITE, 28));
			return;
		}
		case 'deep-space-dish':
			// static and stowed (the build menu's thumbnail); the site draws it moving (plan 234)
			return dishStaticParts('low', p);
		case 'tanks': {
			const r = Math.min(w, d) / 5;
			for (const [x, z] of [
				[-r * 1.2, -r * 1.2],
				[r * 1.2, -r * 1.2],
				[-r * 1.2, r * 1.2],
				[r * 1.2, r * 1.2]
			] as const)
				p.painted.push(cylinder(r, r, r * 3, x, r * 1.5, z, WHITE, 20));
			p.structure.push(box(w * 0.9, 0.4, d * 0.9, 0, 0.2, 0, CONCRETE));
			return;
		}
		default:
			return buildService(spec('service', 8), p, lin(0xcfd3d6));
	}
}

export const BUCKETS = [
	'structure',
	'painted',
	'siding',
	'glass',
	'door',
	'lamp',
	'thin',
	'glassLit',
	'beacon'
] as const;

const SCAFFOLD = lin(0x9a9d9f);
const SCAFFOLD_RAIL = lin(0xd8902a);

/** The tallest point of a building's parts, m. */
function heightOf(parts: SiteParts): number {
	let h = 0;
	for (const k of BUCKETS) {
		for (const g of parts[k] as BufferGeometry[]) {
			g.computeBoundingBox();
			h = Math.max(h, g.boundingBox?.max.y ?? 0);
		}
	}
	return h;
}

/**
 * A building site (plan 388): poles round the footprint every 3 m or so, ledgers every 2 m up to the
 * finished height with orange rails on the top one, and a concrete core rising with `progress`.
 * Origin-centred and unturned, as `generate`.
 */
export function constructionParts(
	w: number,
	d: number,
	height: number,
	progress: number,
	p: SiteParts
): void {
	const h = Math.max(3, height);
	const pole = 0.12;
	const ring = (y: number, colour: ReturnType<typeof lin>, t: number): void => {
		p.thin.push(box(w + 1, t, t, 0, y, -d / 2 - 0.5, colour));
		p.thin.push(box(w + 1, t, t, 0, y, d / 2 + 0.5, colour));
		p.thin.push(box(t, t, d + 1, -w / 2 - 0.5, y, 0, colour));
		p.thin.push(box(t, t, d + 1, w / 2 + 0.5, y, 0, colour));
	};
	const nx = Math.max(1, Math.round(w / 3));
	const nz = Math.max(1, Math.round(d / 3));
	for (let i = 0; i <= nx; i++) {
		const x = -w / 2 - 0.5 + ((w + 1) * i) / nx;
		p.thin.push(box(pole, h, pole, x, h / 2, -d / 2 - 0.5, SCAFFOLD));
		p.thin.push(box(pole, h, pole, x, h / 2, d / 2 + 0.5, SCAFFOLD));
	}
	for (let j = 1; j < nz; j++) {
		const z = -d / 2 - 0.5 + ((d + 1) * j) / nz;
		p.thin.push(box(pole, h, pole, -w / 2 - 0.5, h / 2, z, SCAFFOLD));
		p.thin.push(box(pole, h, pole, w / 2 + 0.5, h / 2, z, SCAFFOLD));
	}
	for (let y = 2; y < h; y += 2) ring(y, SCAFFOLD, 0.08);
	ring(h, SCAFFOLD_RAIL, 0.14);
	const t = Math.min(1, Math.max(0, progress));
	// the slab first, then the core walls up to the share built
	p.structure.push(box(w, 0.3, d, 0, 0.15, 0, CONCRETE));
	const core = Math.max(0.3, t * h);
	p.structure.push(box(w * 0.92, core, d * 0.92, 0, 0.3 + core / 2, 0, lin(0xa8a59e)));
}

/** Every building of the list and the road cells, in one set of material buckets; `planned` holds
 * the finished shapes of the buildings under construction (drawn faint, plan 388). */
export function buildSiteList(
	buildings: readonly SiteBuildingView[],
	roads: readonly { i: number; j: number }[]
): SiteParts & { planned: BufferGeometry[] } {
	const out = { ...emptyParts(), planned: [] as BufferGeometry[] };
	for (const b of buildings) {
		const f = footprintCentre(b);
		const tmp = emptyParts();
		// generators draw their long side east-west; a turned footprint is drawn unturned and rotated
		const turned = b.rotation === 90 || b.rotation === 270;
		const w = (turned ? f.d : f.w) * SITE_CELL - 2;
		const d = (turned ? f.w : f.d) * SITE_CELL - 2;
		generate(b.generator, w, d, tmp);
		// a building under construction: its site in the buckets, its finished shape faint (plan 388)
		let parts = tmp;
		const shape: BufferGeometry[] = [];
		if (b.construction !== undefined) {
			parts = emptyParts();
			constructionParts(w, d, heightOf(tmp), b.construction, parts);
			for (const k of BUCKETS) shape.push(...(tmp[k] as BufferGeometry[]));
		}
		const m = new Matrix4().compose(
			new Vector3(f.x, 0, f.z),
			new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (b.rotation * Math.PI) / 180),
			new Vector3(1, 1, 1)
		);
		for (const k of BUCKETS) {
			for (const g of parts[k] as BufferGeometry[])
				(out[k] as BufferGeometry[]).push(g.applyMatrix4(m));
		}
		for (const g of shape) out.planned.push(g.applyMatrix4(m));
	}
	for (const c of roads) {
		out.painted.push(
			box(SITE_CELL, 0.06, SITE_CELL, c.i * SITE_CELL, 0.03, -c.j * SITE_CELL, ASPHALT)
		);
	}
	return out;
}

/** A home site by id and place (ADR 0321): a host names the site whose buildings or view it means. */
export interface SitePlace {
	id: string;
	latitude: number;
	longitude: number;
}
