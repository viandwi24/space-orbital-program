/**
 * Terrain-cast shadows on an airless body (plan 052, ADR 0068): the sun's visibility at a ground
 * point, by a short march from the point toward the sun through the height field. A ray point is
 * under the ground when its height above the reference sphere is less than the field's height under
 * it; the smallest clearance, in units of the sun's angular radius, gives a soft edge (the sun is a
 * disc, not a point). This is the CPU twin of `moonSunVisibility` in `shaders/moon.glsl.ts` (same
 * constants, same step spacing, same bias); it also serves the vessel (the one object that is not
 * drawn with the moon's shader). No Three.js: tested in Bun.
 */
import type { Vec3 } from '@orbital/core';
import { clamp, dot, length, normalize, vec } from './vec.ts';

/** Steps of the march per graphics preset: the cost is linear in them (journal 052); the shader's loop bound is `SHADOW_MARCH.steps`. */
export const SHADOW_STEPS = { high: 24, medium: 16, low: 10 } as const;

export const SHADOW_MARCH = {
	/** The most steps of the march (the `high` preset's); the spacing is quadratic, fine near the point and coarse far out. */
	steps: SHADOW_STEPS.high,
	/** First sample distance, m: a ray that starts on its own slope must not hit it. */
	minDistance: 1.5,
	/** Longest ray, m: inside the mid patch (it reaches 5 km from the camera) whatever the sun. */
	maxDistance: 5_000,
	/** Relief the ray must be able to clear, m: the ray is `relief / sin(elevation)` long, at least `minLength`. */
	relief: 300,
	minLength: 80,
	/** Sun elevation (sine) below which the length stops growing. */
	minSine: 0.06,
	/** Sun disc: tangent of its angular radius (0.267 degrees seen from the moon's distance). */
	sunRadius: 0.00466,
	/** Clearance allowed before a ray counts as blocked, m (absolute and per metre of ray): the mesh is a coarser surface than the baked field. */
	biasAbsolute: 0.05,
	biasPerMetre: 0.004,
	/** The point is lifted by this much, m, so stones and vessels standing on the ground do not shadow themselves. */
	lift: 0,
	/** Below this sine of the sun over the local horizon the point is in its own night (nothing to march). */
	nightSine: -0.35,
	/**
	 * At or above this sine nothing can shade a point: the cratered ground rises by at most `MOON_MAX_SLOPE`
	 * (0.5, so 26.6 degrees; sine 0.447) per metre, and the sun is higher than that. No march.
	 */
	freeSine: 0.46
} as const;

/** Length of the ray for a sun whose sine over the horizon at the point is `mu`, m. */
export function shadowRayLength(mu: number): number {
	const s = SHADOW_MARCH;
	return clamp(s.relief / Math.max(mu, s.minSine), s.minLength, s.maxDistance);
}

/** Distance of step `i` (1-based of `steps`) of a ray of length `len`, m. */
export function shadowStepDistance(
	i: number,
	len: number,
	steps: number = SHADOW_MARCH.steps
): number {
	const f = i / steps;
	return SHADOW_MARCH.minDistance + (len - SHADOW_MARCH.minDistance) * f * f;
}

export interface ShadowInput {
	/** Height of the ground (m above the reference sphere) under a body-fixed unit direction. */
	groundAt: (direction: Vec3) => number;
	/** Radius of the reference sphere, m. */
	radius: number;
	/** Unit body-fixed direction of the point and its height above the reference sphere, m. */
	direction: Vec3;
	height: number;
	/** Unit body-fixed direction to the sun. */
	sun: Vec3;
	/** Extra height of the point above `height`, m (default `SHADOW_MARCH.lift`). */
	lift?: number;
	/** Steps of the march (default `SHADOW_MARCH.steps`). */
	steps?: number;
}

/** Sun visibility in 0 (fully shadowed) to 1 (fully lit) at a point of the ground or just above it. */
export function terrainSunVisibility(input: ShadowInput): number {
	const s = SHADOW_MARCH;
	const n0 = input.direction;
	const mu = dot(n0, input.sun);
	if (mu < s.nightSine) return 0;
	if (mu >= s.freeSine) return 1;
	const R = input.radius;
	const hh = input.height + (input.lift ?? s.lift);
	const r0 = R + hh;
	const len = shadowRayLength(mu);
	let vis = 1;
	const steps = input.steps ?? s.steps;
	for (let i = 1; i <= steps; i++) {
		const t = shadowStepDistance(i, len, steps);
		// |Q|^2 - R^2 written without subtracting two large numbers (Q = r0 n0 + t sun).
		const d = hh * (2 * R + hh) + 2 * t * r0 * mu + t * t;
		const q = vec(
			r0 * n0.x + t * input.sun.x,
			r0 * n0.y + t * input.sun.y,
			r0 * n0.z + t * input.sun.z
		);
		const hq = d / (length(q) + R);
		const clearance = hq - input.groundAt(normalize(q));
		const a = (clearance + s.biasAbsolute + s.biasPerMetre * t) / t;
		vis = Math.min(vis, clamp(0.5 + (0.5 * a) / s.sunRadius, 0, 1));
		if (vis < 0.002) return 0;
	}
	return vis;
}

/** Sun direction (unit, body-fixed) at `elevation` rad over the horizon of `direction`, in the vertical plane of `azimuth` (east of north). */
export function sunAt(direction: Vec3, elevation: number, azimuth: number): Vec3 {
	const n = direction;
	const east = normalize(vec(-n.z, 0, n.x));
	const e = Math.hypot(east.x, east.y, east.z) > 0 ? east : vec(1, 0, 0);
	const north = vec(n.y * e.z - n.z * e.y, n.z * e.x - n.x * e.z, n.x * e.y - n.y * e.x);
	const h = vec(
		Math.sin(azimuth) * e.x + Math.cos(azimuth) * north.x,
		Math.sin(azimuth) * e.y + Math.cos(azimuth) * north.y,
		Math.sin(azimuth) * e.z + Math.cos(azimuth) * north.z
	);
	return normalize(
		vec(
			Math.cos(elevation) * h.x + Math.sin(elevation) * n.x,
			Math.cos(elevation) * h.y + Math.sin(elevation) * n.y,
			Math.cos(elevation) * h.z + Math.sin(elevation) * n.z
		)
	);
}
