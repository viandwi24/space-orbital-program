/**
 * Stones on an airless body's ground (plan 052, ADR 0068): where they are and how big, by pure
 * hashing of a world-fixed lattice, so the same stone stands in the same place on every visit, in
 * every session and on the GPU. The lattice is a gnomonic cube-face chart of the body (about
 * metres per unit near the middle of a face, which is where the landing plain is): a cell is
 * (face, i, j), holds at most one stone, and its hash decides presence (patches of quiet and busy
 * ground by a coarser region hash), place, size, yaw and shade. `shaders/moon.glsl.ts` carries the
 * GLSL twin that draws the same stones as bumps beyond the instanced radius; the instanced meshes
 * (`moon-stones.ts`) are built from `stonesAround`. Stones are scenery: the sim's ground is the
 * height field and a stone has no collision (ADR 0068).
 */
import { pcgX, type Vec3 } from '@orbital/core';
import { normalize, vec } from './vec.ts';

export const STONES = {
	/** Edge of a cell, m. */
	cell: 2.4,
	/** A region (density patch) is this many cells on a side. */
	regionCells: 10,
	/** Chance that a cell holds a stone: `quiet + busy * r^3` for the region's hash `r` (mean about 0.16). */
	quiet: 0.04,
	busy: 0.5,
	/** Radius, m: `min + span * h^2`; one stone in `boulderChance` is `boulderScale` times larger. */
	radiusMin: 0.16,
	radiusSpan: 0.46,
	boulderChance: 0.03,
	boulderScale: 2.4,
	/** Height of the visible dome as a share of the radius, and how much of the radius is buried. */
	flatten: 0.78,
	sink: 0.2,
	/** Stones within this distance of the camera are instances, m. */
	instanceRadius: 56,
	/** Within this distance an instance has the detailed mesh, m. */
	nearRadius: 18,
	/** The lattice stones' bump on the ground fades out between these camera distances, m (smaller than a pixel beyond). */
	farFade: [90, 260],
	/** Never more than this many instances. */
	maxInstances: 1024,
	/** Instances are rebuilt when the camera has moved this far from where they were built, m. */
	refreshDistance: 8,
	/** Instances are drawn below this camera altitude above the ground, m. */
	maxAltitude: 140,
	/** Lattice salt (kept apart from the terrain's). */
	salt: 4001
} as const;

/** The six faces of the chart: unit axis of the face and the chart's two tangent axes. */
const FACES = [
	{ major: vec(1, 0, 0), u: vec(0, 1, 0), v: vec(0, 0, 1) },
	{ major: vec(-1, 0, 0), u: vec(0, 1, 0), v: vec(0, 0, 1) },
	{ major: vec(0, 1, 0), u: vec(0, 0, 1), v: vec(1, 0, 0) },
	{ major: vec(0, -1, 0), u: vec(0, 0, 1), v: vec(1, 0, 0) },
	{ major: vec(0, 0, 1), u: vec(1, 0, 0), v: vec(0, 1, 0) },
	{ major: vec(0, 0, -1), u: vec(1, 0, 0), v: vec(0, 1, 0) }
] as const;

export interface ChartPoint {
	face: number;
	/** Position on the face, m (the gnomonic coordinates times the body radius). */
	x: number;
	y: number;
}

/** The chart coordinates of a unit body-fixed direction (the face is the axis of its largest component). */
export function chartOf(n: Vec3, radius: number): ChartPoint {
	const ax = Math.abs(n.x);
	const ay = Math.abs(n.y);
	const az = Math.abs(n.z);
	if (ax >= ay && ax >= az)
		return { face: n.x > 0 ? 0 : 1, x: (n.y / ax) * radius, y: (n.z / ax) * radius };
	if (ay >= az) return { face: n.y > 0 ? 2 : 3, x: (n.z / ay) * radius, y: (n.x / ay) * radius };
	return { face: n.z > 0 ? 4 : 5, x: (n.x / az) * radius, y: (n.y / az) * radius };
}

/** The unit body-fixed direction of chart coordinates (the inverse of `chartOf`). */
export function chartDirection(p: ChartPoint, radius: number): Vec3 {
	const f = FACES[p.face]!;
	const a = p.x / radius;
	const b = p.y / radius;
	return normalize(
		vec(
			f.major.x + a * f.u.x + b * f.v.x,
			f.major.y + a * f.u.y + b * f.v.y,
			f.major.z + a * f.u.z + b * f.v.z
		)
	);
}

export interface Stone {
	face: number;
	i: number;
	j: number;
	/** Position on the face, m. */
	x: number;
	y: number;
	/** Unit body-fixed direction of the stone's centre. */
	direction: Vec3;
	/** Radius, m. */
	radius: number;
	/** Yaw about the local vertical, rad. */
	yaw: number;
	/** Shade in [0, 1]. */
	shade: number;
}

/** Hash of a cell and a purpose `k`, in [0, 1]. The GLSL twin calls the same function with the same integers. */
export const cellHash = (face: number, i: number, j: number, k: number): number =>
	pcgX(i + k * 7919, j + k * 104729, face * 131 + STONES.salt);

/** The density of the region of a cell, the third power of its hash. */
export function regionRichness(face: number, i: number, j: number): number {
	const ri = Math.floor(i / STONES.regionCells);
	const rj = Math.floor(j / STONES.regionCells);
	const r = pcgX(ri, rj, face * 131 + STONES.salt + 1);
	return r * r * r;
}

/** The stone of a cell, or null when the cell is empty. */
export function stoneInCell(face: number, i: number, j: number, radius: number): Stone | null {
	const chance = STONES.quiet + STONES.busy * regionRichness(face, i, j);
	if (cellHash(face, i, j, 0) >= chance) return null;
	const x = (i + 0.2 + 0.6 * cellHash(face, i, j, 1)) * STONES.cell;
	const y = (j + 0.2 + 0.6 * cellHash(face, i, j, 2)) * STONES.cell;
	const h = cellHash(face, i, j, 3);
	const boulder = cellHash(face, i, j, 4) > 1 - STONES.boulderChance;
	return {
		face,
		i,
		j,
		x,
		y,
		direction: chartDirection({ face, x, y }, radius),
		radius: (STONES.radiusMin + STONES.radiusSpan * h * h) * (boulder ? STONES.boulderScale : 1),
		yaw: cellHash(face, i, j, 5) * Math.PI * 2,
		shade: cellHash(face, i, j, 6)
	};
}

/**
 * The stones within `within` m of the ground point under unit direction `n`, nearest first, at most
 * `max` of them. Pure: the same direction gives the same list.
 */
export function stonesAround(
	n: Vec3,
	radius: number,
	within: number = STONES.instanceRadius,
	max: number = STONES.maxInstances
): Stone[] {
	const c = chartOf(n, radius);
	const i0 = Math.floor((c.x - within) / STONES.cell) - 1;
	const i1 = Math.floor((c.x + within) / STONES.cell) + 1;
	const j0 = Math.floor((c.y - within) / STONES.cell) - 1;
	const j1 = Math.floor((c.y + within) / STONES.cell) + 1;
	const found: { stone: Stone; d: number }[] = [];
	for (let j = j0; j <= j1; j++) {
		for (let i = i0; i <= i1; i++) {
			const stone = stoneInCell(c.face, i, j, radius);
			if (!stone) continue;
			const d = Math.hypot(stone.x - c.x, stone.y - c.y);
			if (d <= within) found.push({ stone, d });
		}
	}
	found.sort((a, b) => a.d - b.d || a.stone.j - b.stone.j || a.stone.i - b.stone.i);
	return found.slice(0, max).map((f) => f.stone);
}
