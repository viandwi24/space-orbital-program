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
	kind: 'hangar' | 'office' | 'service' | 'garage';
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
export const BUILDINGS: readonly BoxSpec[] = [
	{ x: -70, z: -135, w: 74, d: 50, h: 38, kind: 'hangar' },
	{ x: 70, z: -100, w: 42, d: 24, h: 10, kind: 'office' },
	{ x: 120, z: 44, w: 28, d: 18, h: 8, kind: 'service' },
	{ x: -22, z: -80, w: 20, d: 12, h: 6, kind: 'garage' }
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
	for (const m of MASTS) if (Math.hypot(x - m.x, z - m.z) < margin) return true;
	for (const r of ROADS) {
		if (distanceToSegment(x, z, r.ax, r.az, r.bx, r.bz) < r.width / 2 + margin) return true;
	}
	return false;
}

export interface SiteLayout {
	trees: TreeSpec[];
	rocks: RockSpec[];
}

export const TREE_INNER = 45;
export const TREE_OUTER = 1_800;

/** Vegetation for a preset's tree budget: clustered into groves, clear of everything built. */
export function layoutVegetation(treeCount: number, seed = 7): SiteLayout {
	const rng = createRng(seed);
	const trees: TreeSpec[] = [];
	const cell = 7;
	const taken = new Set<string>();
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
	return { trees, rocks };
}
