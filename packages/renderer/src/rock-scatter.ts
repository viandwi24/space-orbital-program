/**
 * Rocks on the home planet's ground away from the launch site (plan 402, ADR 0339): where they are
 * and how big, by pure hashing of a body-fixed lattice, so a rock stands where it stood on every
 * visit, whatever the floating origin, the vessel in view or the graphics preset (the preset only
 * thins them). The lattice is `@orbital/core`'s gnomonic cube-face chart (`chartOf`); there is one
 * lattice per size class, a cell holds at most one rock, and its hash decides presence (by the
 * biome table and a patchy region hash), place, size, yaw and shade. A rock is not larger than
 * `SCATTER.sizeCut` (ADR 0339: visual only, nothing a landing leg would feel), so the sim does not
 * know them. No Three.js: runs and is tested in Bun.
 */
import {
	chartDirection,
	chartOf,
	directionLatLon,
	latLonDirection,
	pcgX,
	type TerrainField,
	type TerrainZone,
	type Vec3
} from '@orbital/core';
import { cross, dot, normalize, scale, add, smoothstep, vec } from './vec.ts';

export interface RockClass {
	/** Edge of a lattice cell, m. */
	cell: number;
	/** Radius range, m: `min + (max - min) * h^2` for a hash h. */
	radius: readonly [number, number];
	/** Chance that a cell of average richness and full biome weight holds one. */
	chance: number;
	/** Drawn no farther than this, m (a pebble is under a pixel beyond it). */
	range: number;
}

export const SCATTER = {
	/** Pebbles, then rocks. Index = the class number in a `Rock`. */
	classes: [
		{ cell: 3, radius: [0.05, 0.14], chance: 0.34, range: 50 },
		{ cell: 8, radius: [0.14, 0.4], chance: 0.3, range: 400 }
	] as const satisfies readonly RockClass[],
	/** The largest rock radius, m (ADR 0339): its dome is under 0.3 m high. */
	sizeCut: 0.4,
	/** Share of the radius that stands above the ground, and how deep it sits. */
	flatten: 0.7,
	sink: 0.25,
	/** A region (density patch) is this many cells on a side. */
	regionCells: 12,
	/** Salt of the lattice, apart from the terrain's and the moon stones'. */
	salt: 6101,
	/** Rocks are cleared from a site: none within `clear` m of arc of a zone's centre, all of them from `full`. */
	siteClear: 700,
	siteFull: 3_000,
	/** Half the baseline of the slope's central difference, m. */
	slopeBaseline: 2
} as const;

/** What a rock is drawn from. */
export interface Rock {
	/** `class:face:i:j`, the cell. */
	key: string;
	cls: number;
	/** Unit body-fixed direction of the rock's centre. */
	direction: Vec3;
	/** Height of the ground under it above the reference sphere, m. */
	height: number;
	/** Unit body-fixed ground normal. */
	normal: Vec3;
	radius: number;
	yaw: number;
	/** Shade in [0, 1]. */
	shade: number;
}

export interface ScatterContext {
	/** Body radius, m. */
	radius: number;
	/** The same height field the sim's ground uses. */
	terrain: TerrainField;
	/** The world's flat zones: the sites, which keep their own ground. */
	zones: readonly TerrainZone[];
	/** The terrain seed: two worlds do not share a pattern. */
	seed: number;
	/** 0 to 1, the graphics preset's thinning; 0 places nothing. */
	density: number;
}

const hashOf = (ctx: ScatterContext, cls: number, face: number, i: number, j: number, k: number) =>
	pcgX(
		i + k * 7919,
		j + k * 104729,
		face * 131 + cls * 17 + SCATTER.salt + ((ctx.seed | 0) % 9973)
	);

/**
 * How well the ground suits rocks, in [0, 1]: none in water, on the shore or in the snow, a few on
 * sand, an average amount on low ground, more on the uplands and on steep ground.
 */
export function biomeWeight(height: number, slope: number, water: boolean): number {
	if (water || height < 3) return 0;
	const land = smoothstep(3, 30, height);
	const sand = height < 40 ? 0.35 : 1;
	const snow = 1 - smoothstep(3_000, 3_600, height);
	const upland = 1 + 0.8 * smoothstep(1_200, 2_400, height);
	const steep = 1 + 0.9 * smoothstep(0.25, 0.7, slope) - 0.7 * smoothstep(1.1, 1.6, slope);
	return Math.max(0, Math.min(2, land * sand * snow * upland * steep));
}

/** Arc distance, m, from a unit body-fixed direction to the nearest zone's centre. */
export function siteArc(n: Vec3, radius: number, zones: readonly TerrainZone[]): number {
	let best = Infinity;
	for (const z of zones) {
		const s = latLonDirection(z.latitude, z.longitude);
		best = Math.min(best, Math.acos(Math.max(-1, Math.min(1, dot(n, s)))) * radius);
	}
	return best;
}

/** The patchiness of a cell's region, the square of a hash: quiet and busy ground. */
export function richness(ctx: ScatterContext, cls: number, face: number, i: number, j: number) {
	const rc = SCATTER.regionCells;
	const r = pcgX(
		Math.floor(i / rc),
		Math.floor(j / rc),
		face * 131 + cls * 17 + SCATTER.salt + 1 + ((ctx.seed | 0) % 9973)
	);
	return 0.25 + 1.5 * r * r;
}

/** Slope (rise over run) and unit body-fixed normal of the ground at `n`, from a central difference. */
export function groundSlope(
	terrain: TerrainField,
	radius: number,
	n: Vec3
): { slope: number; normal: Vec3; height: number } {
	const h = terrain.heightAt(n);
	const ref = Math.abs(n.y) > 0.9999 ? vec(0, 0, 1) : vec(0, 1, 0);
	const east = normalize(cross(ref, n));
	const north = cross(n, east);
	const step = SCATTER.slopeBaseline / (radius + h);
	const at = (axis: Vec3, sign: number): number =>
		terrain.heightAt(normalize(add(n, scale(axis, sign * step))));
	const se = (at(east, 1) - at(east, -1)) / (2 * SCATTER.slopeBaseline);
	const sn = (at(north, 1) - at(north, -1)) / (2 * SCATTER.slopeBaseline);
	const k = 1 + h / radius;
	const normal = normalize(
		cross(add(scale(east, k), scale(n, se)), add(scale(north, k), scale(n, sn)))
	);
	return { slope: Math.hypot(se, sn), normal, height: h };
}

/** The rock of a cell of class `cls`, or null when the cell is empty. */
export function rockInCell(
	ctx: ScatterContext,
	cls: number,
	face: number,
	i: number,
	j: number
): Rock | null {
	if (ctx.density <= 0) return null;
	const c = SCATTER.classes[cls]!;
	// the cheap tests first: the hash against the best chance this cell could have
	const top = c.chance * richness(ctx, cls, face, i, j) * 2 * ctx.density;
	const roll = hashOf(ctx, cls, face, i, j, 0);
	if (roll >= top) return null;
	const x = (i + 0.15 + 0.7 * hashOf(ctx, cls, face, i, j, 1)) * c.cell;
	const y = (j + 0.15 + 0.7 * hashOf(ctx, cls, face, i, j, 2)) * c.cell;
	const direction = chartDirection({ face, x, y }, ctx.radius);
	const clearance = smoothstep(
		SCATTER.siteClear,
		SCATTER.siteFull,
		siteArc(direction, ctx.radius, ctx.zones)
	);
	if (clearance <= 0) return null;
	const { slope, normal, height } = groundSlope(ctx.terrain, ctx.radius, direction);
	const water = ctx.terrain.waterAt?.(direction) ?? false;
	const weight = biomeWeight(height, slope, water);
	const chance = c.chance * richness(ctx, cls, face, i, j) * weight * clearance * ctx.density;
	if (roll >= chance) return null;
	const h = hashOf(ctx, cls, face, i, j, 3);
	return {
		key: `${cls}:${face}:${i}:${j}`,
		cls,
		direction,
		height,
		normal,
		radius: Math.min(SCATTER.sizeCut, c.radius[0] + (c.radius[1] - c.radius[0]) * h * h),
		yaw: hashOf(ctx, cls, face, i, j, 4) * Math.PI * 2,
		shade: hashOf(ctx, cls, face, i, j, 5)
	};
}

/** The cell indices of class `cls` within `within` m of the chart point of `n`, nearest first. */
export function cellsAround(
	n: Vec3,
	radius: number,
	cls: number,
	within: number
): { face: number; i: number; j: number; d: number }[] {
	const c = chartOf(n, radius);
	const cell = SCATTER.classes[cls]!.cell;
	const i0 = Math.floor((c.x - within) / cell);
	const i1 = Math.floor((c.x + within) / cell);
	const j0 = Math.floor((c.y - within) / cell);
	const j1 = Math.floor((c.y + within) / cell);
	const out: { face: number; i: number; j: number; d: number }[] = [];
	for (let j = j0; j <= j1; j++)
		for (let i = i0; i <= i1; i++) {
			const d = Math.hypot((i + 0.5) * cell - c.x, (j + 0.5) * cell - c.y);
			if (d <= within + cell) out.push({ face: c.face, i, j, d });
		}
	out.sort((a, b) => a.d - b.d || a.j - b.j || a.i - b.i);
	return out;
}

/**
 * The rocks within `within` m of the ground under unit direction `n`, nearest first, at most `max`:
 * pure, the same direction gives the same list (the renderer keeps a cell cache instead and fills
 * it a few cells a frame; this is the reference the tests hold it to).
 */
export function rocksAround(ctx: ScatterContext, n: Vec3, within: number, max = 4_096): Rock[] {
	const found: { rock: Rock; d: number }[] = [];
	const centre = chartOf(n, ctx.radius);
	SCATTER.classes.forEach((c, cls) => {
		for (const cell of cellsAround(n, ctx.radius, cls, Math.min(within, c.range))) {
			const rock = rockInCell(ctx, cls, cell.face, cell.i, cell.j);
			if (!rock) continue;
			const p = chartOf(rock.direction, ctx.radius);
			if (p.face !== centre.face) continue;
			const d = Math.hypot(p.x - centre.x, p.y - centre.y);
			if (d <= Math.min(within, c.range)) found.push({ rock, d });
		}
	});
	found.sort((a, b) => a.d - b.d || (a.rock.key < b.rock.key ? -1 : 1));
	return found.slice(0, max).map((f) => f.rock);
}

/** The latitude and longitude of a rock, for tests and tools. */
export const rockLatLon = (rock: Rock): [number, number] => directionLatLon(rock.direction);
