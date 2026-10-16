/**
 * Renderer side of the terrain (ADR 0036, ADR 0044): the step rule of the planet pass's ray march
 * and a reference march, tested in Bun. The height function itself, its constants and the flat
 * zones live in `@orbital/core` (`terrain.ts`, ADR 0043) because the sim reads them too. No Three.js.
 */
import {
	SITE_FLAT_RADIUS,
	TERRAIN_MAX_SLOPE,
	terrainHeight,
	type TerrainContext,
	type Vec3
} from '@orbital/core';
import { dot, normalize, scale, vec } from './vec.ts';

/**
 * Ground distance from the camera's ground point inside which the terrain is certainly zero: what
 * is left of the launch site's flat disc around the camera (the march skips it).
 */
export const flatSkipRadius = (groundDistanceToSite: number): number =>
	Math.max(0, SITE_FLAT_RADIUS - groundDistanceToSite);

// --- ray march -------------------------------------------------------------------------------

/** Fraction of the safe step that is taken (relaxed sphere tracing). */
export const STEP_RELAX = 0.8;
/** Smallest step: a fraction of the distance, a multiple of the pixel footprint, and a minimum, m. */
export const STEP_MIN_FRACTION = 0.05;
export const STEP_MIN_METRES = 3;

/**
 * Length of the next march step for a ray with `clearance` metres of air under it, descending at
 * `descent` (sine of its angle below the local horizontal, negative when rising) at distance `t`.
 * Safe for any terrain whose slope is at most `slope` whenever the clearance term dominates.
 */
export function marchStep(
	clearance: number,
	descent: number,
	t: number,
	pixelAngle: number,
	slope = TERRAIN_MAX_SLOPE
): number {
	const floor = Math.max(t * STEP_MIN_FRACTION, t * pixelAngle * 1.5, STEP_MIN_METRES);
	const safe = (STEP_RELAX * Math.max(clearance, 0)) / (slope + Math.max(descent, 0));
	return Math.max(floor, safe);
}

export interface MarchResult {
	hit: boolean;
	/** Distance along the ray, m. */
	t: number;
	steps: number;
}

/**
 * Reference march of a ray from `origin` (body-fixed, metres from the centre) along the unit
 * direction `dir` against `terrainHeight`; the planet pass does the same in GLSL.
 */
export function marchTerrain(
	origin: Vec3,
	dir: Vec3,
	ctx: TerrainContext,
	options: { maxSteps?: number; pixelAngle?: number; tMax?: number } = {}
): MarchResult {
	const maxSteps = options.maxSteps ?? 400;
	const pixelAngle = options.pixelAngle ?? 0.0009;
	const R = ctx.radius;
	const tMax = options.tMax ?? 400_000;
	const heightAt = (t: number): number => {
		const p = vec(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t);
		const r = Math.hypot(p.x, p.y, p.z);
		return r - R - terrainHeight(normalize(p), ctx);
	};
	let t = 0;
	let prevT = 0;
	let c = heightAt(0);
	for (let i = 0; i < maxSteps; i++) {
		if (c < 0) {
			let lo = prevT;
			let hi = t;
			for (let k = 0; k < 24; k++) {
				const mid = 0.5 * (lo + hi);
				if (heightAt(mid) < 0) hi = mid;
				else lo = mid;
			}
			return { hit: true, t: 0.5 * (lo + hi), steps: i };
		}
		const p = vec(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t);
		const r = Math.hypot(p.x, p.y, p.z);
		const descent = -dot(dir, scale(p, 1 / r));
		prevT = t;
		t += marchStep(c, descent, t, pixelAngle);
		if (t > tMax) return { hit: false, t: tMax, steps: i };
		c = heightAt(t);
	}
	return { hit: false, t, steps: maxSteps };
}

/**
 * Highest elevation angle (rad above the local horizontal) of the terrain seen from a point
 * `eyeHeight` above `site` (with the curvature of the sphere), over the given azimuths and out to
 * `range` m. The skyline the pad sees.
 */
export function skylineAngle(
	ctx: TerrainContext,
	eyeHeight: number,
	azimuths: number,
	range: number,
	stepMetres = 500
): number {
	const up = ctx.siteDirection;
	const ref = Math.abs(up.y) > 0.99 ? vec(1, 0, 0) : vec(0, 1, 0);
	const east = normalize(
		vec(ref.y * up.z - ref.z * up.y, ref.z * up.x - ref.x * up.z, ref.x * up.y - ref.y * up.x)
	);
	const north = vec(
		up.y * east.z - up.z * east.y,
		up.z * east.x - up.x * east.z,
		up.x * east.y - up.y * east.x
	);
	const R = ctx.radius;
	let best = -Math.PI / 2;
	for (let a = 0; a < azimuths; a++) {
		const az = (a / azimuths) * 2 * Math.PI;
		const h = vec(
			east.x * Math.cos(az) + north.x * Math.sin(az),
			east.y * Math.cos(az) + north.y * Math.sin(az),
			east.z * Math.cos(az) + north.z * Math.sin(az)
		);
		for (let d = stepMetres; d <= range; d += stepMetres) {
			const ang = d / R;
			const n = vec(
				up.x * Math.cos(ang) + h.x * Math.sin(ang),
				up.y * Math.cos(ang) + h.y * Math.sin(ang),
				up.z * Math.cos(ang) + h.z * Math.sin(ang)
			);
			const top = terrainHeight(n, ctx);
			// Height of the point above the eye's horizontal plane, over its horizontal distance.
			const drop = R * (1 - Math.cos(ang));
			const elevation = Math.atan2(top - drop - eyeHeight, R * Math.sin(ang));
			if (elevation > best) best = elevation;
		}
	}
	return best;
}
