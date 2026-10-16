/**
 * The ground under a point (ADR 0043): the height function of `@orbital/core` asked in the
 * body-fixed frame, and the plane that stands in for the terrain under a vessel (point and normal,
 * BCI axes). Without `createSim({ terrain })` the ground is the reference sphere: height 0 and the
 * radial normal, so every caller works unchanged.
 */
import type { Vec3 } from '@orbital/core';
import { add, cross, dot, length, normalize, scale } from '@orbital/kepler';
import type { SimCore } from './core.ts';
import { qAboutY, qRotate } from './math.ts';

/** Half the baseline of the central difference that gives the slope, m. */
export const SLOPE_BASELINE = 4;

/** `r` (BCI) turned into the body-fixed frame at the current time. */
export function toBodyFixed(core: SimCore, r: Vec3): Vec3 {
	return qRotate(qAboutY(-core.body.omega * core.t), r);
}

/** Height above the reference sphere, m, of the ground under the BCI position `r`; 0 without terrain. */
export function terrainUnder(core: SimCore, r: Vec3): number {
	const terrain = core.terrain;
	if (!terrain) return 0;
	return terrain.heightAt(normalize(toBodyFixed(core, r)));
}

/**
 * Height of the ground under `r` when the point is low enough to matter: undefined above the
 * highest terrain (so callers skip the evaluation of the noise high up), else `terrainUnder`.
 */
export function terrainBelow(core: SimCore, r: Vec3): number | undefined {
	const terrain = core.terrain;
	if (!terrain) return 0;
	if (length(r) - core.body.def.radius > terrain.maxHeight) return undefined;
	return terrain.heightAt(normalize(toBodyFixed(core, r)));
}

export interface GroundPlane {
	/** The terrain point on the radial of the query point, BCI, m. */
	point: Vec3;
	/** Unit normal of the terrain there (away from the body), BCI. */
	normal: Vec3;
	/** Height above the reference sphere at `point`, m. */
	height: number;
}

/**
 * The tangent plane of the terrain on the radial of `r` (BCI): the point at `R + h` and the normal
 * from the central difference of `h` over `SLOPE_BASELINE` metres to each side along the local east
 * and north of the body-fixed frame. A flat sphere (no terrain) gives the radial.
 */
export function groundPlane(core: SimCore, r: Vec3): GroundPlane {
	const radius = core.body.def.radius;
	const up = scale(r, 1 / length(r));
	const terrain = core.terrain;
	if (!terrain) return { point: scale(up, radius), normal: up, height: 0 };
	const spin = qAboutY(-core.body.omega * core.t);
	const n = qRotate(spin, up);
	const h = terrain.heightAt(n);
	// East = +Y x n, north = n x east (body-fixed); at the poles any horizontal pair will do.
	const ref = Math.abs(n.y) > 0.9999 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
	const east = normalize(cross(ref, n));
	const north = cross(n, east);
	const step = SLOPE_BASELINE / (radius + h);
	const sample = (axis: Vec3, sign: number): number =>
		terrain.heightAt(normalize(add(n, scale(axis, sign * step))));
	const slopeEast = (sample(east, 1) - sample(east, -1)) / (2 * SLOPE_BASELINE);
	const slopeNorth = (sample(north, 1) - sample(north, -1)) / (2 * SLOPE_BASELINE);
	// Surface P(n) = (R + h) n: its tangents along east and north (per metre of arc) are
	// (1 + h/R) e + slope n, the normal is their cross product.
	const k = 1 + h / radius;
	const tangentEast = add(scale(east, k), scale(n, slopeEast));
	const tangentNorth = add(scale(north, k), scale(n, slopeNorth));
	const normalBodyFixed = normalize(cross(tangentEast, tangentNorth));
	const turn = qAboutY(core.body.omega * core.t);
	return {
		point: scale(up, radius + h),
		normal: normalize(qRotate(turn, normalBodyFixed)),
		height: h
	};
}

/** Angle between the ground normal and the radial, rad (0 on the sphere). */
export function slopeAngle(plane: GroundPlane, up: Vec3): number {
	return Math.acos(Math.min(1, Math.max(-1, dot(plane.normal, up))));
}
