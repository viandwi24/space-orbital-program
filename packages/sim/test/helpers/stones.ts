/** Test helpers for stone colliders (plan 060): find a boulder on flat ground and drop a lander on it. */
import {
	createBodyTerrainField,
	stonesAround,
	type BodyDefinition,
	type EntityId,
	type Stone,
	type TerrainField,
	type Vec3,
	type VesselDesign
} from '@orbital/core';
import { add, cross, length, normalize, scale } from '@orbital/kepler';
import { qFromBasis } from '../../src/math.ts';
import type { Sim } from '../../src/index.ts';

export interface Site {
	stone: Stone;
	/** Terrain height under the stone, m. */
	height: number;
}

/** Largest slope (rise over run) of the terrain within `within` m of direction `n`, sampled on a ring. */
export function localSlope(field: TerrainField, radius: number, n: Vec3, within: number): number {
	const east = normalize(cross({ x: 0, y: 1, z: 0 }, n));
	const north = cross(n, east);
	const h0 = field.heightAt(n);
	let worst = 0;
	for (let k = 0; k < 8; k++) {
		const a = (k / 8) * 2 * Math.PI;
		const d = add(
			n,
			scale(add(scale(east, Math.cos(a)), scale(north, Math.sin(a))), within / radius)
		);
		worst = Math.max(worst, Math.abs(field.heightAt(normalize(d)) - h0) / within);
	}
	return worst;
}

/**
 * The first stone of at least `minRadius` m, in order of distance from the body-fixed direction
 * `from`, with no other stone within `clear` m of it and flat ground (rise over run under `slope`)
 * within `reach` m; searching up to `within` m.
 */
export function findStone(
	body: BodyDefinition,
	from: Vec3,
	options: {
		minRadius: number;
		maxRadius?: number;
		clear: number;
		reach: number;
		slope: number;
		within: number;
	}
): Site {
	const field = createBodyTerrainField(body)!;
	const seed = body.terrain?.kind === 'craters' ? (body.terrain.seed ?? 0) : 0;
	const list = stonesAround(from, body.radius, options.within, 100_000, seed);
	for (const stone of list) {
		if (stone.radius < options.minRadius || stone.radius > (options.maxRadius ?? Infinity))
			continue;
		const near = stonesAround(stone.direction, body.radius, options.clear, 100_000, seed);
		if (near.length > 1) continue;
		if (localSlope(field, body.radius, stone.direction, options.reach) > options.slope) continue;
		return { stone, height: field.heightAt(stone.direction) };
	}
	throw new Error('no stone matches the search');
}

/** Rotation whose +Y is `up` and whose X is east. */
export function uprightAt(up: Vec3) {
	const eastRaw = cross({ x: 0, y: 1, z: 0 }, up);
	const east = length(eastRaw) > 1e-9 ? normalize(eastRaw) : { x: 0, y: 0, z: -1 };
	return { east, south: cross(east, up), q: qFromBasis(east, up, cross(east, up)) };
}

/**
 * Load `design` on `body` upright, `horizontal` m (east, south) from the ground point `anchor`
 * (body-fixed direction), its centre of mass `comAltitude` m above the terrain there, falling at
 * `speed` m/s. The body is at spin angle 0 (`t = 0`), so body-fixed is BCI. Returns the vessel.
 */
export function dropAt(
	sim: Sim,
	body: BodyDefinition,
	design: VesselDesign,
	anchor: Vec3,
	options: { east?: number; south?: number; comAltitude: number; speed: number }
): EntityId {
	const field = createBodyTerrainField(body)!;
	const up = normalize(anchor);
	const { east, south, q } = uprightAt(up);
	const ground = scale(up, body.radius + field.heightAt(up));
	const shifted = add(
		add(ground, scale(east, options.east ?? 0)),
		scale(south, options.south ?? 0)
	);
	const position = add(scale(normalize(shifted), length(shifted)), scale(up, options.comAltitude));
	const omega = (2 * Math.PI) / body.rotationPeriod;
	const placed = sim.dispatch({
		type: 'load-vessel',
		design,
		placement: {
			kind: 'state',
			body: body.id as never,
			position,
			velocity: add(cross({ x: 0, y: omega, z: 0 }, position), scale(up, -options.speed)),
			orientation: q
		}
	});
	if (!placed.ok) throw new Error(placed.reason);
	return placed.vessel!;
}

/**
 * Flat ground with no stone within `clear` m, the nearest to the body-fixed direction `from` (a grid
 * of chart steps of 3 m is scanned out to `within` m).
 */
export function findClearGround(
	body: BodyDefinition,
	from: Vec3,
	options: { clear: number; reach: number; slope: number; within: number }
): Vec3 {
	const field = createBodyTerrainField(body)!;
	const seed = body.terrain?.kind === 'craters' ? (body.terrain.seed ?? 0) : 0;
	const east = normalize(cross({ x: 0, y: 1, z: 0 }, from));
	const north = cross(from, east);
	for (let ring = 0; ring * 3 <= options.within; ring++) {
		for (let k = 0; k < Math.max(1, ring * 6); k++) {
			const a = (k / Math.max(1, ring * 6)) * 2 * Math.PI;
			const d = (ring * 3) / body.radius;
			const n = normalize(
				add(from, scale(add(scale(east, Math.cos(a)), scale(north, Math.sin(a))), d))
			);
			if (stonesAround(n, body.radius, options.clear, 4, seed).length > 0) continue;
			if (localSlope(field, body.radius, n, options.reach) > options.slope) continue;
			return n;
		}
	}
	throw new Error('no clear ground in the search');
}

/** Unit quaternion `q` applied to `v` (the vessel's body axes in BCI). */
export function rotatedAxis(q: { x: number; y: number; z: number; w: number }, v: Vec3): Vec3 {
	const t = cross({ x: q.x, y: q.y, z: q.z }, v);
	const t2 = scale(t, 2);
	return add(add(v, scale(t2, q.w)), cross({ x: q.x, y: q.y, z: q.z }, t2));
}
