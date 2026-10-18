/**
 * Renderer side of the terrain (ADR 0036, ADR 0044): the step rule of the planet pass's ray march
 * and a reference march, tested in Bun. The height function itself, its constants and the flat
 * zones live in `@orbital/core` (`terrain.ts`, ADR 0043) because the sim reads them too. No Three.js.
 */
import {
	SITE_FLAT_RADIUS,
	TERRAIN_MAX_SLOPE,
	latLonDirection,
	terrainHeight,
	type TerrainContext,
	type Vec3
} from '@orbital/core';
import { dot, normalize, scale, smoothstep, vec } from './vec.ts';

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
/**
 * The floor grows from `STEP_MIN_FRACTION` of the distance up to this fraction beyond 500 m (a pixel
 * is 0.1 % of the distance, so far geometry is still sampled 60 times per pixel): a camera lying on
 * the ground reaches the horizon in about 60 steps.
 */
export const STEP_FAR_FRACTION = 0.08;
export const STEP_MIN_METRES = 3;
/**
 * Smallest slope bound the shader's step uses: the step is `clearance / (slope + descent)` with
 * `slope = clamp(2 |gradient| + this, this, TERRAIN_MAX_SLOPE)` (ADR 0044), so gentle ground is
 * crossed in long steps. Steeper ground, up to the global bound, keeps the safe short ones.
 */
export const TERRAIN_MARCH_SLOPE_MIN = 0.25;

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
	const fraction =
		STEP_MIN_FRACTION + (STEP_FAR_FRACTION - STEP_MIN_FRACTION) * smoothstep(50, 500, t);
	const floor = Math.max(t * fraction, t * pixelAngle * 1.5, STEP_MIN_METRES);
	const safe = (STEP_RELAX * Math.max(clearance, 0)) / (slope + Math.max(descent, 0));
	return Math.max(floor, safe);
}

/** The slope bound the shader's march uses where the baked gradient has magnitude `gradient`. */
export const localMarchSlope = (gradient: number): number =>
	Math.min(
		TERRAIN_MAX_SLOPE,
		Math.max(TERRAIN_MARCH_SLOPE_MIN, 2 * gradient + TERRAIN_MARCH_SLOPE_MIN)
	);

/**
 * Distant slopes are drawn this much steeper than they are, in the shading only (plan 039): a pixel
 * tens of metres wide averages the crags away and mountains read as pale sheets. Full strength from a
 * pixel footprint of `SLOPE_EXAGGERATION_RANGE[1]` metres, none under `[0]` (a landing view is exact).
 */
export const SLOPE_EXAGGERATION = 4;
export const SLOPE_EXAGGERATION_RANGE = [8, 80] as const;

// --- march prepass (plan 039, ADR 0053) --------------------------------------------------------

/**
 * The planet pass marches the terrain once per block of this many pixels per side, before the full
 * march, with a cone wide enough for every ray of the block; the full march then starts where the
 * cone first came near the ground. Far rays (the expensive ones) are crossed at a sixteenth of the cost.
 */
export const MARCH_BLOCK = 4;
/** Half angle of the prepass cone in pixels: from the block's centre to its farthest pixel centre (2.12) plus margin. */
export const MARCH_CONE_PIXELS = 2.5;
/** Start distance written for a ray whose cone never comes near the terrain: the pixel skips the march. */
export const MARCH_NO_HIT = 1e10;

export interface ConeStart {
	/** Every ray of the cone is clear of the ground up to here, m; `MARCH_NO_HIT` when the cone never nears it. */
	start: number;
	steps: number;
}

/**
 * The prepass march of one block (the planet pass does the same in GLSL): sphere-traces the ground
 * under the block's centre ray with the clearance reduced by the cone's radius `t * coneAngle` (and by
 * the terrain rising at the global slope bound per metre sideways), and returns the last sample before the cone may touch
 * the ground. `coneAngle` is `MARCH_CONE_PIXELS * pixelAngle`. Same step rule as `marchTerrain`; the
 * shader also looks inside steps that are long against the clearance, which only moves the start earlier.
 */
export function coneStart(
	origin: Vec3,
	dir: Vec3,
	ctx: TerrainContext,
	options: { maxSteps?: number; pixelAngle?: number; tMax?: number; coneAngle?: number } = {}
): ConeStart {
	const maxSteps = options.maxSteps ?? 400;
	const pixelAngle = options.pixelAngle ?? 0.0009;
	const coneAngle = options.coneAngle ?? MARCH_CONE_PIXELS * pixelAngle;
	const R = ctx.radius;
	const tMax = options.tMax ?? 400_000;
	const at = (t: number): Vec3 =>
		vec(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t);
	const heightAt = (t: number): number => {
		const p = at(t);
		return Math.hypot(p.x, p.y, p.z) - R - terrainHeight(normalize(p), ctx);
	};
	let t = 0;
	let prev = 0;
	for (let i = 0; i < maxSteps; i++) {
		const p = at(t);
		const r = Math.hypot(p.x, p.y, p.z);
		const n = scale(p, 1 / r);
		const e = normalize(vec(-n.z, 0, n.x));
		const north = vec(n.y * e.z - n.z * e.y, n.z * e.x - n.x * e.z, n.x * e.y - n.y * e.x);
		const k = 100 / R;
		const sample = (a: Vec3, sgn: number): number =>
			terrainHeight(
				normalize(vec(n.x + a.x * k * sgn, n.y + a.y * k * sgn, n.z + a.z * k * sgn)),
				ctx
			);
		const slope = localMarchSlope(
			Math.hypot((sample(e, 1) - sample(e, -1)) / 200, (sample(north, 1) - sample(north, -1)) / 200)
		);
		// sideways the ground may rise at the global bound, whatever the local gradient says at the centre ray
		const cone = heightAt(t) - t * coneAngle * (1 + TERRAIN_MAX_SLOPE);
		if (cone < 0) return { start: prev, steps: i };
		prev = t;
		const descent = -dot(dir, n);
		t += marchStep(cone, descent, t, pixelAngle, slope);
		if (t > tMax) return { start: MARCH_NO_HIT, steps: i };
	}
	return { start: prev, steps: maxSteps };
}

export interface MarchResult {
	hit: boolean;
	/** Distance along the ray, m. */
	t: number;
	steps: number;
	/**
	 * For a miss (plan 133): the smallest clearance over the marched samples in pixel footprints,
	 * `c / (t · pixelAngle)`, and the distance where it was. `Infinity` when nothing came near. Within
	 * 1.5 footprints the real clearance where a parabola through the closest sample and its neighbours
	 * is lowest refines it; negative there means the ray crossed a crest between two samples.
	 */
	closest: { s: number; t: number };
}

/**
 * The share of a missing pixel the ground covers (plan 133): a ray whose closest approach is `s`
 * pixel footprints clear of the ground is half covered at 0 and clear from half a footprint up.
 */
export const silhouetteCoverage = (s: number): number => Math.min(1, Math.max(0, 0.5 - s));

/**
 * The lowest point of the parabola through `(x1, cA)`, `(0, cB)`, `(x3, cC)` (`x1 < 0 < x3`), clamped
 * to the interval; undefined when it opens downwards or the points are degenerate. A negative `c`
 * means the curve dips below the ground between the samples.
 */
export function parabolaMin(
	x1: number,
	cA: number,
	cB: number,
	x3: number,
	cC: number
): { u: number; c: number } | undefined {
	const den = x1 * x3 * (x1 - x3);
	if (!Number.isFinite(cA) || !Number.isFinite(cB) || !(x3 > 0) || Math.abs(den) <= 1e-6)
		return undefined;
	const pa = (x3 * (cA - cB) - x1 * (cC - cB)) / den;
	const pb = (x1 * x1 * (cC - cB) - x3 * x3 * (cA - cB)) / den;
	if (!(pa > 0)) return undefined;
	const u = Math.min(x3, Math.max(x1, -pb / (2 * pa)));
	return { u, c: cB + pa * u * u + pb * u };
}

/**
 * Reference march of a ray from `origin` (body-fixed, metres from the centre) along the unit
 * direction `dir` against `terrainHeight`; the planet pass does the same in GLSL.
 */
export function marchTerrain(
	origin: Vec3,
	dir: Vec3,
	ctx: TerrainContext,
	options: { maxSteps?: number; pixelAngle?: number; tMax?: number; adaptive?: boolean } = {}
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
	const closest = { s: Infinity, t: 0 };
	// the closest sample with the one before and the one after it, for the parabola at the end
	let around = { tP: 0, cP: Infinity, cM: Infinity, tN: 0, cN: -1 };
	let grabNext = false;
	let [tLast, cLast] = [0, Infinity];
	for (let i = 0; i < maxSteps; i++) {
		if (c >= 0 && t > 0) {
			const s = c / (t * pixelAngle);
			if (grabNext) {
				around = { ...around, tN: t, cN: c };
				grabNext = false;
			}
			if (s < closest.s) {
				closest.s = s;
				closest.t = t;
				around = { tP: tLast, cP: cLast, cM: c, tN: 0, cN: -1 };
				grabNext = true;
			}
			[tLast, cLast] = [t, c];
		}
		if (c < 0) {
			let lo = prevT;
			let hi = t;
			for (let k = 0; k < 24; k++) {
				const mid = 0.5 * (lo + hi);
				if (heightAt(mid) < 0) hi = mid;
				else lo = mid;
			}
			return { hit: true, t: 0.5 * (lo + hi), steps: i, closest };
		}
		const p = vec(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t);
		const r = Math.hypot(p.x, p.y, p.z);
		const descent = -dot(dir, scale(p, 1 / r));
		prevT = t;
		let slope = TERRAIN_MAX_SLOPE;
		if (options.adaptive) {
			// the shader reads the baked gradient; here a central difference over 100 m of the ground under the ray
			const n = scale(p, 1 / r);
			const e = normalize(vec(-n.z, 0, n.x));
			const north = vec(n.y * e.z - n.z * e.y, n.z * e.x - n.x * e.z, n.x * e.y - n.y * e.x);
			const k = 100 / R;
			const at = (a: Vec3, sgn: number): number =>
				terrainHeight(
					normalize(vec(n.x + a.x * k * sgn, n.y + a.y * k * sgn, n.z + a.z * k * sgn)),
					ctx
				);
			slope = localMarchSlope(
				Math.hypot((at(e, 1) - at(e, -1)) / 200, (at(north, 1) - at(north, -1)) / 200)
			);
		}
		t += marchStep(c, descent, t, pixelAngle, slope);
		if (t > tMax) return { hit: false, t: tMax, steps: i, closest: refine() };
		c = heightAt(t);
	}
	return { hit: false, t, steps: maxSteps, closest: refine() };

	/** As the shader does after a miss: the real clearance where the parabola is lowest, for a near pass. */
	function refine(): { s: number; t: number } {
		const { tP, cP, cM, tN, cN } = around;
		if (!(closest.s < 1.5 && cN >= 0 && tN > closest.t && closest.t > tP && cM <= cP && cM <= cN))
			return closest;
		const vertex = parabolaMin(tP - closest.t, cP, cM, tN - closest.t, cN);
		if (!vertex) return closest;
		const tv = closest.t + vertex.u;
		const sv = heightAt(tv) / (tv * pixelAngle);
		return sv < closest.s ? { s: sv, t: tv } : closest;
	}
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
	const z0 = ctx.zones?.[0];
	const up = ctx.siteDirection ?? (z0 ? latLonDirection(z0.latitude, z0.longitude) : vec(1, 0, 0));
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
