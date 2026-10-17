/**
 * Terrain heights above the reference sphere (ADR 0036, made physical by ADR 0043): the one height
 * function the sim's ground tile, surface rails and debris rules, the renderer's camera clamp and
 * the GPU bake of the planet pass all read. Pure float64 TypeScript; `renderer/shaders/terrain.glsl.ts`
 * is its GLSL twin and takes every constant from the tables here.
 *
 * `h(n)` is metres above the sphere for the body-fixed unit direction `n`; `0 <= h <= TERRAIN_MAX_HEIGHT`.
 * It is exactly zero over the ocean, on a margin around coasts, on the floor of lakes (plan 038) and
 * within `SITE_FLAT_RADIUS` of the launch site (the pad stays flat), and its slope never exceeds
 * `TERRAIN_MAX_SLOPE`.
 */
import type { Vec3 } from './math.ts';
import { SEA_LEVEL, cachedPlanetMap, sampleMap, type PlanetMap } from './planet-map.ts';

/** Upper bound of every height, m; the ray march only looks inside the shell below this. */
export const TERRAIN_MAX_HEIGHT = 4_500;
/** Steepest slope (rise over run) of the height function. Measured by the tests. */
export const TERRAIN_MAX_SLOPE = 1;

/** Terrain is exactly zero this far from the launch site, then rises over `SITE_BLEND_WIDTH`. */
export const SITE_FLAT_RADIUS = 5_000;
export const SITE_BLEND_WIDTH = 11_000;

/** Width of the canonical biome map every height is read from, whatever the graphics preset. */
export const TERRAIN_MAP_WIDTH = 1024;

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
	/** A scenic massif around the launch site: mountains in a ring 12 to 44 km out, broken up by noise. */
	backdropRiseMetres: [12_000, 21_000] as const,
	backdropFallMetres: [30_000, 44_000] as const,
	backdropSalt: 41,
	backdropWavelengthKm: 26,
	backdropLow: 0.36,
	backdropHigh: 0.56,
	ridgeWavelengthKm: 16,
	ridgeOctaves: 4,
	/**
	 * The ridge's `abs` is a soft abs `sqrt(x^2 + e^2) - e`: no crease of unbounded curvature, so a
	 * regular grid of 4 m texels reproduces the field within centimetres (ADR 0043, ADR 0044).
	 */
	ridgeSoftness: 0.18,
	/** Width of the smooth maximum of the range mask and the scenic massif. */
	rangeBlend: 0.2,
	uplandLow: 0.55,
	uplandHigh: 0.92
} as const;

/**
 * The biome map has 3.7 km texels, so bilinear contours of it show the grid (coast stair steps).
 * Reads of the map go through a domain warp of this size: a few kilometres of smooth noise added to
 * latitude and longitude. The terrain mask and the ground shader use the same warp.
 */
export const MAP_WARP = {
	/** Largest displacement, rad (about 1.9 km). */
	amplitude: 0.0032,
	wavelengthsKm: [13, 5.5] as const,
	weights: [1, 0.45] as const,
	saltsLat: [61, 63] as const,
	saltsLon: [62, 64] as const
} as const;

/**
 * Lakes (plan 038, ADR 0072). A lake lies where the basin level `p * siteGate` (one octave of value
 * noise, so its gradient is bounded) reaches `to`; there the height is exactly zero, the ocean's own
 * height, so a vessel stands on a lake as on the sea. Around a lake the relief is capped by a cone,
 * `h' = max(0, min(h, slope * (to - level) / gradientBound))`: the cap is a Lipschitz function of the
 * position with constant `slope`, so the minimum with the old height keeps the slope bound
 * `TERRAIN_MAX_SLOPE` by construction (given `gradientBound`, which the tests measure), and the
 * ground falls to the water over kilometres instead of a cliff. The site gate keeps lakes away from
 * the launch site, so the scenery around the pad is the terrain of plan 031 unchanged.
 */
export const LAKE_SHAPE = {
	wavelengthKm: 30,
	salt: 81,
	/** The level at which the ground is flat water level. */
	to: 0.9,
	/** Lipschitz constant of the cap around a lake (a bank this steep or less), rise over run. */
	slope: 0.9,
	/** Upper bound of the horizontal gradient of the level, per metre (measured by the tests, with margin). */
	gradientBound: 7e-5,
	/** Distance from the launch site (m of arc) where lakes start to be allowed and where they are free. */
	siteFrom: 30_000,
	siteTo: 80_000,
	/** What the planet pass draws: depth (m) at the middle and the distance (m) over which it deepens. */
	depthMetres: 6,
	depthRampMetres: 160
} as const;

// --- noise: the integer-hash lattice noise of the shaders (pcg3d), in float64 -----------------

const u32 = (v: number): number => v >>> 0;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const smoothstep = (e0: number, e1: number, x: number): number => {
	const t = clamp((x - e0) / (e1 - e0), 0, 1);
	return t * t * (3 - 2 * t);
};
const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const scale = (a: Vec3, s: number): Vec3 => vec(a.x * s, a.y * s, a.z * s);
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

/** Same hash as `pcg3d` in `renderer/shaders/atmosphere.glsl.ts`; returns the first component, in [0, 1]. */
export function pcgX(ix: number, iy: number, iz: number): number {
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

/**
 * Polynomial smooth maximum (blend width `TERRAIN_SHAPE.rangeBlend`): `max(a, b)` has a crease where
 * the two terms cross, which a fixed grid cannot follow; this one is continuous in slope.
 */
const smoothMax = (a: number, b: number): number => {
	const k = TERRAIN_SHAPE.rangeBlend;
	const h = Math.max(k - Math.abs(a - b), 0);
	return Math.max(a, b) + (h * h) / (4 * k);
};

/** `1 - softAbs(2n - 1)` with the crease rounded by `ridgeSoftness` (peak value 1 at n = 0.5). */
const softRidge = (n: number): number => {
	const e = TERRAIN_SHAPE.ridgeSoftness;
	const x = 2 * n - 1;
	return 1 - (Math.sqrt(x * x + e * e) - e);
};

function ridged(q0: Vec3, wavelengthKm: number, octaves: number, salt: number): number {
	let q = q0;
	let sum = 0;
	let amp = 1;
	let norm = 0;
	let freq = 1 / wavelengthKm;
	for (let i = 0; i < octaves; i++) {
		sum += amp * softRidge(terrainNoise(q, freq, salt + i));
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

/** Unit body-fixed direction of a latitude/longitude (inverse of `directionLatLon`). */
export const latLonDirection = (latitude: number, longitude: number): Vec3 =>
	vec(
		Math.cos(latitude) * Math.cos(longitude),
		Math.sin(latitude),
		-Math.cos(latitude) * Math.sin(longitude)
	);

/**
 * Latitude/longitude at which the biome map is read for the direction `n` of a body of `radius`:
 * the true one displaced by the smooth `MAP_WARP` (GLSL twin: `warpedLatLon` in `terrain.glsl.ts`).
 */
export function warpedLatLon(n: Vec3, radius: number): [number, number] {
	const [lat, lon] = directionLatLon(n);
	const q = scale(n, radius / 1000);
	const w = MAP_WARP;
	let dLat = 0;
	let dLon = 0;
	let norm = 0;
	for (let i = 0; i < 2; i++) {
		const freq = 1 / w.wavelengthsKm[i]!;
		dLat += w.weights[i]! * (2 * terrainNoise(q, freq, w.saltsLat[i]!) - 1);
		dLon += w.weights[i]! * (2 * terrainNoise(q, freq, w.saltsLon[i]!) - 1);
		norm += w.weights[i]!;
	}
	const k = w.amplitude / norm;
	return [lat + dLat * k, lon + (dLon * k) / Math.max(Math.cos(lat), 0.2)];
}

/** 0 to 1: zero within `SITE_FLAT_RADIUS` of the site, full beyond the blend ring. */
export const siteWeight = (arcMetres: number): number =>
	smoothstep(SITE_FLAT_RADIUS, SITE_FLAT_RADIUS + SITE_BLEND_WIDTH, arcMetres);

/** Raw basin potential in [0, 1] at the position `q` (km, body-fixed) on the sphere. */
export const lakePotential = (q: Vec3): number =>
	terrainNoise(q, 1 / LAKE_SHAPE.wavelengthKm, LAKE_SHAPE.salt);

/** The launch-site gate of the lake level: 0 within `siteFrom` m of arc, 1 beyond `siteTo`. */
export const lakeGate = (arc: number): number =>
	smoothstep(LAKE_SHAPE.siteFrom, LAKE_SHAPE.siteTo, arc);

/** Gated potential: the ground is under a lake where this reaches `LAKE_SHAPE.to`. */
export const lakeLevel = (potential: number, gate: number): number => potential * gate;

/** Height cap (m) that a lake level allows: 0 at the lake, rising by `slope` per metre away from it. */
export const lakeCap = (level: number): number =>
	Math.max(0, (LAKE_SHAPE.slope * (LAKE_SHAPE.to - level)) / LAKE_SHAPE.gradientBound);

/** Metres of water above the bed `inside` metres in from the shore (negative outside): linear to `depthMetres`. */
export const lakeDepthAt = (inside: number): number =>
	LAKE_SHAPE.depthMetres * clamp(inside / LAKE_SHAPE.depthRampMetres, 0, 1);

/** Gated lake level at the unit body-fixed direction `n` (the twin of what the planet pass computes). */
export function lakeLevelAt(n: Vec3, ctx: TerrainContext): number {
	const arc = ctx.radius * Math.acos(clamp(dot(n, ctx.siteDirection), -1, 1));
	return lakeLevel(lakePotential(scale(n, ctx.radius / 1000)), lakeGate(arc));
}

/** True where the ground at `n` is the flat floor of a lake (its surface is the height function's zero). */
export const isLake = (n: Vec3, ctx: TerrainContext): boolean =>
	lakeLevelAt(n, ctx) >= LAKE_SHAPE.to;

/** Height in metres above the reference sphere of the unit body-fixed direction `n`. */
export function terrainHeight(n: Vec3, ctx: TerrainContext): number {
	const s = TERRAIN_SHAPE;
	const [lat, lon] = warpedLatLon(n, ctx.radius);
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
	const range = smoothMax(smoothstep(s.rangeLow, s.rangeHigh, rangeN), backdrop);
	const ridge = ridged(q, s.ridgeWavelengthKm, s.ridgeOctaves, 31);
	const upland = smoothstep(s.uplandLow, s.uplandHigh, e);
	const mountains =
		s.mountainAmplitude * range * smoothstep(0.25, 0.8, ridge) * (0.7 + 0.3 * upland);
	const relief = land * site * (hills + mountains);
	return Math.min(relief, lakeCap(lakeLevel(lakePotential(q), lakeGate(arc))));
}

// --- the field the sim and the host pass around -----------------------------------------------

/** What `createSim({ terrain })` and the renderer's environment read: heights by direction. */
export interface TerrainField {
	/** Upper bound of `heightAt`, m: below this altitude above the sphere the ground may be closer. */
	readonly maxHeight: number;
	/** Height above the reference sphere, m, of the body-fixed unit direction `direction`. */
	heightAt(direction: Vec3): number;
}

export interface TerrainFieldOptions {
	/** Body radius, m. */
	radius: number;
	/** Launch site, rad (body-fixed); the pad stays flat. Default 0, 0 like the sim and the renderer. */
	latitude?: number;
	longitude?: number;
}

/**
 * The procedural terrain of the home planet (`terrainHeight` on the canonical biome map). The map
 * (0.3 s) is built on the first query and cached per site; creating the field costs nothing.
 */
export function createTerrainField(options: TerrainFieldOptions): TerrainField {
	const latitude = options.latitude ?? 0;
	const longitude = options.longitude ?? 0;
	let ctx: TerrainContext | undefined;
	return {
		maxHeight: TERRAIN_MAX_HEIGHT,
		heightAt(direction) {
			ctx ??= {
				radius: options.radius,
				map: cachedPlanetMap(TERRAIN_MAP_WIDTH, latitude, longitude),
				siteDirection: latLonDirection(latitude, longitude)
			};
			return terrainHeight(direction, ctx);
		}
	};
}
