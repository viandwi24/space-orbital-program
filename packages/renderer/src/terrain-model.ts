/**
 * Terrain heights above the reference sphere (ADR 0036): the pure reference implementation of the
 * height function the GPU bakes into a cube map (`shaders/terrain.glsl.ts` is its GLSL twin and
 * takes every constant from here), the flat zones that keep the pad and a landing vessel clear of
 * hills, and the step rule of the planet pass's ray march. Everything is visual: the sim and the
 * physics ground stay on the sphere (ADR 0019). No Three.js, so it runs and is tested in Bun.
 */
import type { Vec3 } from '@orbital/core';
import { SEA_LEVEL, sampleMap, type PlanetMap } from './planet-map.ts';
import { clamp, dot, normalize, scale, smoothstep, vec } from './vec.ts';

/** Upper bound of every height, m; the ray march only looks inside the shell below this. */
export const TERRAIN_MAX_HEIGHT = 4_500;
/** Steepest slope (rise over run) the step rule must be safe for. Measured by the tests. */
export const TERRAIN_MAX_SLOPE = 1;

/** Terrain is exactly zero this far from the launch site, then rises over `SITE_BLEND_WIDTH`. */
export const SITE_FLAT_RADIUS = 5_000;
export const SITE_BLEND_WIDTH = 11_000;

/** Flat bubble around the camera's ground point at low altitude (vessels cannot sink into hills). */
export const BUBBLE_RADIUS = 1_800;
export const BUBBLE_RAMP = 3_500;
/** The bubble is full below `BUBBLE_FULL_ALTITUDE` and gone above `BUBBLE_GONE_ALTITUDE`. */
export const BUBBLE_FULL_ALTITUDE = 2_000;
export const BUBBLE_GONE_ALTITUDE = TERRAIN_MAX_HEIGHT + 400;

/** Shape parameters; the shader takes them from here. */
export const TERRAIN_SHAPE = {
	/** Coast margin: no relief below `landStart`, full from `landFull` (map elevation units). */
	landStart: SEA_LEVEL + 0.012,
	landFull: SEA_LEVEL + 0.07,
	hillAmplitude: 520,
	hillWavelengthKm: 30,
	hillOctaves: 4,
	hillLow: 0.35,
	hillHigh: 0.8,
	mountainAmplitude: 3_700,
	rangeWavelengthsKm: [55, 28] as const,
	rangeSalts: [5, 18] as const,
	rangeLow: 0.5,
	rangeHigh: 0.68,
	/** A scenic massif around the launch site: mountains in a ring 14 to 46 km out, broken up by noise. */
	backdropRiseMetres: [14_000, 24_000] as const,
	backdropFallMetres: [34_000, 46_000] as const,
	backdropSalt: 41,
	backdropWavelengthKm: 26,
	backdropLow: 0.38,
	backdropHigh: 0.6,
	ridgeWavelengthKm: 16,
	ridgeOctaves: 4,
	uplandLow: 0.55,
	uplandHigh: 0.92
} as const;

// --- noise: the integer-hash lattice noise of the shaders (pcg3d), in float64 -----------------

const u32 = (v: number): number => v >>> 0;

/** Same hash as `pcg3d` in `shaders/atmosphere.glsl.ts`; returns the first component. */
function pcgX(ix: number, iy: number, iz: number): number {
	let x = u32(Math.imul(u32(ix), 1664525) + 1013904223);
	let y = u32(Math.imul(u32(iy), 1664525) + 1013904223);
	let z = u32(Math.imul(u32(iz), 1664525) + 1013904223);
	x = u32(x + Math.imul(y, z));
	y = u32(y + Math.imul(z, x));
	z = u32(z + Math.imul(x, y));
	x ^= x >>> 16;
	y ^= y >>> 16;
	z ^= z >>> 16;
	x = u32(x);
	y = u32(y);
	z = u32(z);
	x = u32(x + Math.imul(y, z));
	return x / 4294967295;
}

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Value noise in [0, 1] of `q * freq`, lattice shifted by `salt` (twin of `noiseT` in GLSL). */
export function terrainNoise(q: Vec3, freq: number, salt: number): number {
	const fx = q.x * freq;
	const fy = q.y * freq;
	const fz = q.z * freq;
	const x0 = Math.floor(fx);
	const y0 = Math.floor(fy);
	const z0 = Math.floor(fz);
	const cx = x0 + salt * 131;
	const cy = y0 + salt * 71;
	const cz = z0 + salt * 17;
	const tx = fade(fx - x0);
	const ty = fade(fy - y0);
	const tz = fade(fz - z0);
	const h = (dx: number, dy: number, dz: number): number => pcgX(cx + dx, cy + dy, cz + dz);
	const a = mix(h(0, 0, 0), h(1, 0, 0), tx);
	const b = mix(h(0, 1, 0), h(1, 1, 0), tx);
	const c = mix(h(0, 0, 1), h(1, 0, 1), tx);
	const d = mix(h(0, 1, 1), h(1, 1, 1), tx);
	return mix(mix(a, b, ty), mix(c, d, ty), tz);
}

/**
 * Fixed rotation (rows) applied between octaves so the lattice of the value noise never lines up
 * from one octave to the next (otherwise ridges follow the grid). The shader gets the same matrix.
 */
export const OCTAVE_ROTATION: readonly (readonly [number, number, number])[] = (() => {
	const [a, b, c] = [0.62, 0.83, 0.47];
	const [ca, sa, cb, sb, cc, sc] = [
		Math.cos(a),
		Math.sin(a),
		Math.cos(b),
		Math.sin(b),
		Math.cos(c),
		Math.sin(c)
	];
	// Rz(c) * Ry(b) * Rx(a)
	return [
		[cc * cb, cc * sb * sa - sc * ca, cc * sb * ca + sc * sa],
		[sc * cb, sc * sb * sa + cc * ca, sc * sb * ca - cc * sa],
		[-sb, cb * sa, cb * ca]
	] as const;
})();

const turn = (q: Vec3): Vec3 => {
	const m = OCTAVE_ROTATION;
	return vec(
		m[0]![0] * q.x + m[0]![1] * q.y + m[0]![2] * q.z,
		m[1]![0] * q.x + m[1]![1] * q.y + m[1]![2] * q.z,
		m[2]![0] * q.x + m[2]![1] * q.y + m[2]![2] * q.z
	);
};

function fbm(q0: Vec3, wavelengthKm: number, octaves: number, salt: number): number {
	let q = q0;
	let sum = 0;
	let amp = 1;
	let norm = 0;
	let freq = 1 / wavelengthKm;
	for (let i = 0; i < octaves; i++) {
		sum += amp * terrainNoise(q, freq, salt + i);
		norm += amp;
		amp *= 0.5;
		freq *= 2;
		q = turn(q);
	}
	return sum / norm;
}

function ridged(q0: Vec3, wavelengthKm: number, octaves: number, salt: number): number {
	let q = q0;
	let sum = 0;
	let amp = 1;
	let norm = 0;
	let freq = 1 / wavelengthKm;
	for (let i = 0; i < octaves; i++) {
		const r = 1 - Math.abs(2 * terrainNoise(q, freq, salt + i) - 1);
		sum += amp * r;
		norm += amp;
		amp *= 0.5;
		freq *= 2;
		q = turn(q);
	}
	return sum / norm;
}

// --- height ----------------------------------------------------------------------------------

export interface TerrainContext {
	/** Body radius, m. */
	radius: number;
	/** The biome map (elevation drives where land and uplands are). */
	map: PlanetMap;
	/** Unit body-fixed direction of the launch site. */
	siteDirection: Vec3;
}

/** Latitude/longitude of a body-fixed unit direction (map convention: +Y north, longitude 0 on +X). */
export const directionLatLon = (n: Vec3): [number, number] => [
	Math.asin(clamp(n.y, -1, 1)),
	Math.atan2(-n.z, n.x)
];

/** 0 to 1: zero within `SITE_FLAT_RADIUS` of the site, full beyond the blend ring. */
export const siteWeight = (arcMetres: number): number =>
	smoothstep(SITE_FLAT_RADIUS, SITE_FLAT_RADIUS + SITE_BLEND_WIDTH, arcMetres);

/** Height in metres above the reference sphere of the unit body-fixed direction `n`. */
export function terrainHeight(n: Vec3, ctx: TerrainContext): number {
	const s = TERRAIN_SHAPE;
	const [lat, lon] = directionLatLon(n);
	const e = sampleMap(ctx.map, lat, lon)[0];
	const land = smoothstep(s.landStart, s.landFull, e);
	if (land <= 0) return 0;
	const arc = ctx.radius * Math.acos(clamp(dot(n, ctx.siteDirection), -1, 1));
	const site = siteWeight(arc);
	if (site <= 0) return 0;
	const q = scale(n, ctx.radius / 1000);
	const hillN = fbm(q, s.hillWavelengthKm, s.hillOctaves, 11);
	const hills = s.hillAmplitude * smoothstep(s.hillLow, s.hillHigh, hillN);
	const rangeN =
		0.65 * terrainNoise(q, 1 / s.rangeWavelengthsKm[0], s.rangeSalts[0]) +
		0.35 * terrainNoise(q, 1 / s.rangeWavelengthsKm[1], s.rangeSalts[1]);
	const backdrop =
		smoothstep(s.backdropRiseMetres[0], s.backdropRiseMetres[1], arc) *
		(1 - smoothstep(s.backdropFallMetres[0], s.backdropFallMetres[1], arc)) *
		smoothstep(
			s.backdropLow,
			s.backdropHigh,
			terrainNoise(q, 1 / s.backdropWavelengthKm, s.backdropSalt)
		);
	const range = Math.max(smoothstep(s.rangeLow, s.rangeHigh, rangeN), backdrop);
	const ridge = ridged(q, s.ridgeWavelengthKm, s.ridgeOctaves, 31);
	const upland = smoothstep(s.uplandLow, s.uplandHigh, e);
	const mountains =
		s.mountainAmplitude * range * smoothstep(0.25, 0.8, ridge) * (0.7 + 0.3 * upland);
	return land * site * (hills + mountains);
}

// --- flat bubble around the camera -----------------------------------------------------------

/** 1 at low altitude (bubble in force) to 0 above `BUBBLE_GONE_ALTITUDE`. */
export const bubbleStrength = (altitude: number): number =>
	1 - smoothstep(BUBBLE_FULL_ALTITUDE, BUBBLE_GONE_ALTITUDE, altitude);

/**
 * Weight applied to terrain heights at ground distance `groundDistance` from the camera's ground
 * point: 0 inside the bubble at low altitude, 1 far away and at any distance from high up.
 */
export function bubbleWeight(groundDistance: number, altitude: number): number {
	const a = bubbleStrength(altitude);
	return mix(1, smoothstep(BUBBLE_RADIUS, BUBBLE_RADIUS + BUBBLE_RAMP, groundDistance), a);
}

/** Distance from the camera's ground point inside which the weight is zero (the march skips it). */
export const bubbleSkipRadius = (altitude: number): number =>
	altitude <= BUBBLE_FULL_ALTITUDE ? BUBBLE_RADIUS : 0;

/**
 * Ground distance from the camera's ground point inside which the terrain is certainly zero: the
 * larger of the bubble and what is left of the launch site's flat disc around the camera.
 */
export const flatSkipRadius = (altitude: number, groundDistanceToSite: number): number =>
	Math.max(bubbleSkipRadius(altitude), SITE_FLAT_RADIUS - groundDistanceToSite);

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
 * direction `dir` against `terrainHeight`; the planet pass does the same in GLSL. `weight`
 * multiplies heights (camera bubble); the default is 1 everywhere.
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
