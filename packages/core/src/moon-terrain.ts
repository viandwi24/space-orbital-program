/**
 * Terrain of the stock moon (plan 044, ADR 0054): an airless, cratered surface from the same kind of
 * height function as the home planet's (`TerrainField`, ADR 0043): metres above the reference
 * sphere for a body-fixed unit direction, pure float64, read by the sim and mirrored in GLSL by the
 * renderer. Craters come from five scales of a jittered lattice in kilometres: each cell may hold
 * one crater (a parabolic bowl with a raised rim) whose centre is a 3D point near the surface, so a
 * centre that lies above or below the surface makes a smaller, shallower crater. Round the landing
 * site (latitude 0, longitude 0) the craters fade out into a plain, so the default landing is flat.
 *
 * `0 <= h <= MOON_MAX_HEIGHT` (the reference sphere is the lowest ground); the slope never exceeds
 * `MOON_MAX_SLOPE` (measured by the tests).
 */
import type { Vec3 } from './math.ts';
import { latLonDirection, pcgX, terrainNoise, type TerrainField } from './terrain.ts';

/** Upper bound of every height, m. */
export const MOON_MAX_HEIGHT = 6_000;
/** Steepest slope (rise over run) of the height function. Measured by the tests. */
export const MOON_MAX_SLOPE = 0.5;

export const MOON_SHAPE = {
	/** Level of the undisturbed ground above the reference sphere, m. */
	base: 3_500,
	/** Bowl depth as a share of the crater radius, rim height likewise, rim half-width in radii. */
	depth: 0.085,
	rim: 0.035,
	rimWidth: 0.28,
	/** Lattice scales: cell edge (km), crater radius as a share of the cell (min, span), lattice salt. */
	scales: [
		{ cellKm: 70, radius: [0.2, 0.2], salt: 101 },
		{ cellKm: 26, radius: [0.2, 0.22], salt: 131 },
		{ cellKm: 10, radius: [0.18, 0.24], salt: 151 },
		{ cellKm: 3.6, radius: [0.16, 0.26], salt: 173 },
		{ cellKm: 1.3, radius: [0.14, 0.28], salt: 197 }
	] as const,
	/** Craters are not drawn beyond this many radii. */
	reach: 2.4,
	hillAmplitude: 320,
	hillWavelengthKm: 38,
	hillSalt: 223,
	/** Round the landing site craters and hills fade in between these arcs, m. */
	plainFrom: 10_000,
	plainTo: 42_000
} as const;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const smoothstep = (e0: number, e1: number, x: number): number => {
	const t = clamp((x - e0) / (e1 - e0), 0, 1);
	return t * t * (3 - 2 * t);
};

/** Height contribution of one crater at `x` radii from its centre (3D distance). */
function craterProfile(x: number, radius: number): number {
	const s = MOON_SHAPE;
	let h = 0;
	if (x < 1) {
		const bowl = 1 - x * x;
		h -= s.depth * radius * bowl * bowl;
	}
	const u = (x - 1) / s.rimWidth;
	return h + s.rim * radius * Math.exp(-u * u);
}

/** Salted hashes of a lattice cell: `moonHash(ix, iy, iz, k)` for k = 1.. in [0, 1]. */
const cellHash = (ix: number, iy: number, iz: number, salt: number, k: number): number =>
	pcgX(ix + salt * 131 + k * 7919, iy + salt * 71 + k * 104729, iz + salt * 17 + k * 1299709);

/** Largest `seed` of a craters body (ADR 0067): keeps every salted lattice index inside 32 bits. */
export const CRATERS_MAX_SEED = 999;
/** Added to every lattice salt per unit of seed, so each seed is its own crater field (the shader adds the same). */
export const CRATERS_SEED_SALT = 977;

/**
 * Height in metres above the reference sphere of the unit body-fixed direction `n` on a cratered body
 * of `radius`. `seed` (0 = the stock moon) moves every lattice, so a body of another seed has its own
 * craters and hills on the same shape (ADR 0067).
 */
export function moonHeight(n: Vec3, radius: number, seed = 0): number {
	const s = MOON_SHAPE;
	const shift = seed * CRATERS_SEED_SALT;
	const km = radius / 1000;
	const q = { x: n.x * km, y: n.y * km, z: n.z * km };
	const arc = radius * Math.acos(clamp(n.x, -1, 1)); // the landing site is latitude 0, longitude 0: +X
	const relief = smoothstep(s.plainFrom, s.plainTo, arc);
	if (relief <= 0) return s.base;
	let h = 0;
	for (const scale of s.scales) {
		const fx = q.x / scale.cellKm;
		const fy = q.y / scale.cellKm;
		const fz = q.z / scale.cellKm;
		const x0 = Math.floor(fx);
		const y0 = Math.floor(fy);
		const z0 = Math.floor(fz);
		for (let dx = -1; dx <= 1; dx++) {
			for (let dy = -1; dy <= 1; dy++) {
				for (let dz = -1; dz <= 1; dz++) {
					const ix = x0 + dx;
					const iy = y0 + dy;
					const iz = z0 + dz;
					const cx = (ix + cellHash(ix, iy, iz, scale.salt + shift, 1)) * scale.cellKm;
					const cy = (iy + cellHash(ix, iy, iz, scale.salt + shift, 2)) * scale.cellKm;
					const cz = (iz + cellHash(ix, iy, iz, scale.salt + shift, 3)) * scale.cellKm;
					const r =
						scale.cellKm *
						1000 *
						(scale.radius[0] + scale.radius[1] * cellHash(ix, iy, iz, scale.salt + shift, 4));
					const d = Math.hypot(q.x - cx, q.y - cy, q.z - cz) * 1000;
					const x = d / r;
					if (x < s.reach) h += craterProfile(x, r);
				}
			}
		}
	}
	const hills =
		s.hillAmplitude * (terrainNoise(q, 1 / s.hillWavelengthKm, s.hillSalt + shift) - 0.5) * 2;
	return s.base + relief * (h + hills);
}

export interface MoonTerrainOptions {
	/** Body radius, m. */
	radius: number;
	/** Crater field seed, 0 to `CRATERS_MAX_SEED` (default 0: the stock moon). */
	seed?: number;
}

/** The terrain field of the stock moon; the landing plain is at latitude 0, longitude 0. */
export function createMoonTerrainField(options: MoonTerrainOptions): TerrainField {
	return {
		maxHeight: MOON_MAX_HEIGHT,
		heightAt: (direction) => moonHeight(direction, options.radius, options.seed ?? 0)
	};
}

/** Body-fixed unit direction of the landing plain's centre. */
export const MOON_LANDING_DIRECTION: Vec3 = latLonDirection(0, 0);
