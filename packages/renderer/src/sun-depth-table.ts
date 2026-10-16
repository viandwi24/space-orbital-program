/**
 * Optical depth of the air between a point and the top of the atmosphere along a ray, as a baked
 * table (plan 039, ADR 0053). The planet pass and the sky pass used to integrate it per view sample
 * with 5 samples (12 view samples x 5 light samples per pixel); with the table it is one filtered
 * fetch. `sunDepthLookup` is the CPU twin of the shader's fetch and is tested against a fine
 * integration.
 *
 * Parametrisation: height `h` enters as `sqrt(h / atmosphereHeight)` (the air thins exponentially, so
 * the table is dense near the ground), the ray's cosine against the vertical `mu` as
 * `sqrt((mu - muHorizon) / (1 - muHorizon))` where `muHorizon` is the grazing ray that just misses
 * the planet from that height (dense where the path through the air changes fastest). Rays under the
 * horizon hit the planet and have no entry. Values are the Rayleigh and Mie optical depths in
 * metres divided by `SUN_DEPTH_SCALE`, stored as half floats (filtered in hardware everywhere).
 */
import { DataUtils } from 'three';
import type { Atmosphere } from './atmosphere-model.ts';

export const SUN_DEPTH_MU = 128;
export const SUN_DEPTH_H = 64;
/** Metres per stored unit: keeps the horizon's 2e5 m of Rayleigh depth inside half-float range with 3 digits. */
export const SUN_DEPTH_SCALE = 1e5;
/** Integration samples per texel (quadratic spacing like the shader's old loop, from the point outward). */
const BAKE_STEPS = 96;

/** Cosine of the grazing ray that just misses a planet of `radius` from `r` (negative above the surface). */
export const horizonMu = (radius: number, r: number): number =>
	r <= radius ? 0 : -Math.sqrt(Math.max(1 - (radius / r) ** 2, 0));

/** Distance along a ray from radius `r` with cosine `mu` to the sphere of radius `rs` (the far root), or null. */
function farRoot(r: number, mu: number, rs: number): number | null {
	const disc = r * r * (mu * mu - 1) + rs * rs;
	return disc < 0 ? null : -r * mu + Math.sqrt(disc);
}

/**
 * Rayleigh and Mie optical depth, metres, from radius `r` toward cosine `mu` to the top of the
 * atmosphere by quadratic quadrature (`steps` samples); null when the planet blocks the ray.
 */
export function sunDepthExact(
	atm: Atmosphere,
	r: number,
	mu: number,
	steps = 2000
): [number, number] | null {
	if (mu < horizonMu(atm.radius, r) - 1e-12) return null;
	const len = farRoot(r, mu, atm.radius + atm.height);
	if (len === null || len <= 0) return [0, 0];
	let rayleigh = 0;
	let mie = 0;
	for (let i = 0; i < steps; i++) {
		const u = (i + 0.5) / steps;
		const s = len * u * u;
		const ds = (len * 2 * u) / steps;
		const h = Math.max(Math.sqrt(r * r + 2 * r * mu * s + s * s) - atm.radius, 0);
		rayleigh += Math.exp(-h / atm.rayleighHeight) * ds;
		mie += Math.exp(-h / atm.mieHeight) * ds;
	}
	return [rayleigh, mie];
}

/** The table's coordinates (both in [0, 1]) of a point at height `h` and a ray with cosine `mu`; null when blocked. */
export function sunDepthCoords(
	atm: Atmosphere,
	h: number,
	mu: number
): { u: number; v: number } | null {
	const r = atm.radius + Math.max(h, 0);
	const muH = horizonMu(atm.radius, r);
	if (mu < muH) return null;
	const m = Math.min(Math.max((mu - muH) / (1 - muH), 0), 1);
	return {
		u: Math.sqrt(m),
		v: Math.sqrt(Math.min(Math.max(h / atm.height, 0), 1))
	};
}

/** Inverse of `sunDepthCoords` for the texel `(i, j)`: height and cosine of the ray it stores. */
export function sunDepthTexel(atm: Atmosphere, i: number, j: number): { h: number; mu: number } {
	const u = i / (SUN_DEPTH_MU - 1);
	const v = j / (SUN_DEPTH_H - 1);
	const h = v * v * atm.height;
	const muH = horizonMu(atm.radius, atm.radius + h);
	return { h, mu: muH + u * u * (1 - muH) };
}

/**
 * The table as `SUN_DEPTH_MU` x `SUN_DEPTH_H` texels of (Rayleigh, Mie) half floats, row `j` (height)
 * major. Blocked rays cannot occur: every texel is on or above its height's horizon.
 */
export function sunDepthTable(atm: Atmosphere): Uint16Array {
	const out = new Uint16Array(SUN_DEPTH_MU * SUN_DEPTH_H * 2);
	for (let j = 0; j < SUN_DEPTH_H; j++) {
		for (let i = 0; i < SUN_DEPTH_MU; i++) {
			const { h, mu } = sunDepthTexel(atm, i, j);
			const od = sunDepthExact(atm, atm.radius + h, mu, BAKE_STEPS) ?? [0, 0];
			const k = (j * SUN_DEPTH_MU + i) * 2;
			out[k] = DataUtils.toHalfFloat(od[0] / SUN_DEPTH_SCALE);
			out[k + 1] = DataUtils.toHalfFloat(od[1] / SUN_DEPTH_SCALE);
		}
	}
	return out;
}

/** CPU twin of the shader's fetch: bilinear read of the table (as half floats) at (h, mu); null when blocked. */
export function sunDepthLookup(
	atm: Atmosphere,
	table: Uint16Array,
	h: number,
	mu: number
): [number, number] | null {
	const c = sunDepthCoords(atm, h, mu);
	if (!c) return null;
	const x = c.u * (SUN_DEPTH_MU - 1);
	const y = c.v * (SUN_DEPTH_H - 1);
	const i0 = Math.min(Math.floor(x), SUN_DEPTH_MU - 2);
	const j0 = Math.min(Math.floor(y), SUN_DEPTH_H - 2);
	const fx = x - i0;
	const fy = y - j0;
	const at = (i: number, j: number, c: number): number =>
		DataUtils.fromHalfFloat(table[(j * SUN_DEPTH_MU + i) * 2 + c]!);
	const read = (c: number): number =>
		(at(i0, j0, c) * (1 - fx) + at(i0 + 1, j0, c) * fx) * (1 - fy) +
		(at(i0, j0 + 1, c) * (1 - fx) + at(i0 + 1, j0 + 1, c) * fx) * fy;
	return [read(0) * SUN_DEPTH_SCALE, read(1) * SUN_DEPTH_SCALE];
}
