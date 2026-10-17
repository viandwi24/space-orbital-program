/**
 * Coarse biome map of the home planet (moved from the renderer to core by plan 031, ADR 0043: the
 * terrain height function reads its elevation, so the sim needs it too): an equirectangular RGBA8 image, generated once from seeded
 * noise (no assets, ADR 0025). The ground shader reads it for continents and biomes and adds
 * fine octaves on top. R = elevation, G = moisture, B = temperature, A = rockiness, all 0..1
 * (elevation is histogram-equalised, so `SEA_LEVEL` is also the ocean fraction).
 */
import { fbm3 } from './noise.ts';

const smoothstep = (e0: number, e1: number, x: number): number => {
	const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
	return t * t * (3 - 2 * t);
};

export const SEA_LEVEL = 0.46;
export const BEACH_WIDTH = 0.018;
/** Elevation above which rock and snow take over. */
export const HIGHLAND = 0.82;
/** Seed of the map and terrain of the Legacy world (ADR 0142 point 2); other worlds use their seed. */
export const LEGACY_TERRAIN_SEED = 20261016;

export type Biome = 'ocean' | 'beach' | 'grass' | 'forest' | 'desert' | 'rock' | 'snow';

export interface PlanetMap {
	width: number;
	height: number;
	data: Uint8Array;
}

/** Longitude 0 sits in the middle of the image so the launch site never touches the wrap seam. */
export const mapUV = (latitude: number, longitude: number): [number, number] => [
	longitude / (2 * Math.PI) + 0.5,
	latitude / Math.PI + 0.5
];

/** Biome classification shared in spirit with the shader (same thresholds). */
export function classifyBiome(
	elevation: number,
	moisture: number,
	temperature: number,
	rock: number
): Biome {
	if (elevation < SEA_LEVEL) return 'ocean';
	if (temperature < 0.18 || elevation > 0.93) return 'snow';
	if (elevation < SEA_LEVEL + BEACH_WIDTH) return 'beach';
	if (elevation > HIGHLAND || rock > 0.8) return 'rock';
	if (moisture < 0.32 && temperature > 0.45) return 'desert';
	return moisture > 0.62 ? 'forest' : 'grass';
}

/** Angular radius (rad) around the launch site that is forced to low grassland, and the blend-out width. */
export const SITE_CLEAR_RADIUS = 0.08;
export const SITE_BLEND_RADIUS = 0.2;

/** Unit direction for a latitude/longitude (body-fixed, +Y north, lon 0 on +X). */
const direction = (lat: number, lon: number): [number, number, number] => [
	Math.cos(lat) * Math.cos(lon),
	Math.sin(lat),
	-Math.cos(lat) * Math.sin(lon)
];

/** What a map is generated from: the terrain seed and the sites cleared to grassland (rad). */
export interface PlanetMapOptions {
	/** Default the Legacy seed. */
	seed?: number;
	/** Sites to clear, default one at (0, 0); only their latitude and longitude matter. */
	zones?: readonly { latitude: number; longitude: number }[];
}

/**
 * Generates the map. Each zone is flattened to grass so a pad is never on a coast, a desert or a
 * mountain (the strongest clearing wins where two overlap).
 */
export function generatePlanetMap(width: number, options: PlanetMapOptions = {}): PlanetMap {
	const seed = options.seed ?? LEGACY_TERRAIN_SEED;
	const zones = options.zones ?? [{ latitude: 0, longitude: 0 }];
	const height = Math.max(1, Math.floor(width / 2));
	const n = width * height;
	const elev = new Float32Array(n);
	const moist = new Float32Array(n);
	const temp = new Float32Array(n);
	const rock = new Float32Array(n);
	const sites = zones.map((z) => direction(z.latitude, z.longitude));
	/** Angle to the nearest site, rad (the clearing falls with it). */
	const siteAngle = new Float32Array(n);
	for (let j = 0; j < height; j++) {
		const lat = ((j + 0.5) / height - 0.5) * Math.PI;
		for (let i = 0; i < width; i++) {
			const lon = ((i + 0.5) / width - 0.5) * 2 * Math.PI;
			const [x, y, z] = direction(lat, lon);
			const k = j * width + i;
			elev[k] =
				0.8 * fbm3(x * 1.7, y * 1.7, z * 1.7, 6, seed) +
				0.2 * fbm3(x * 7, y * 7, z * 7, 4, seed + 3);
			moist[k] = fbm3(x * 2.3 + 11, y * 2.3, z * 2.3, 5, seed + 7);
			const climate = 1 - Math.abs(lat) / (Math.PI / 2);
			temp[k] = Math.min(
				1,
				Math.max(0, climate * 1.15 - 0.1 + (fbm3(x * 3, y * 3, z * 3, 3, seed + 11) - 0.5) * 0.25)
			);
			rock[k] = fbm3(x * 5 + 3, y * 5, z * 5, 4, seed + 13);
			let near = Infinity;
			for (const site of sites) {
				const angle = Math.acos(Math.min(1, Math.max(-1, x * site[0] + y * site[1] + z * site[2])));
				if (angle < near) near = angle;
			}
			siteAngle[k] = near;
		}
	}
	// Histogram equalisation (area weighted) so that elevation < SEA_LEVEL is exactly the ocean share.
	const order = Array.from({ length: n }, (_, k) => k).sort((a, b) => elev[a]! - elev[b]!);
	const weights = new Float64Array(n);
	let total = 0;
	for (let j = 0; j < height; j++) {
		const w = Math.cos(((j + 0.5) / height - 0.5) * Math.PI);
		for (let i = 0; i < width; i++) {
			weights[j * width + i] = w;
			total += w;
		}
	}
	const ranked = new Float32Array(n);
	let acc = 0;
	for (const k of order) {
		acc += weights[k]!;
		ranked[k] = acc / total;
	}
	const data = new Uint8Array(n * 4);
	for (let k = 0; k < n; k++) {
		const w = 1 - smoothstep(SITE_CLEAR_RADIUS, SITE_BLEND_RADIUS, siteAngle[k]!);
		const e = ranked[k]! + (0.6 - ranked[k]!) * w;
		const m = moist[k]! + (0.5 - moist[k]!) * w;
		const t = temp[k]! + (0.7 - temp[k]!) * w;
		const r = rock[k]! * (1 - w);
		data[k * 4] = Math.round(e * 255);
		data[k * 4 + 1] = Math.round(Math.min(1, Math.max(0, m)) * 255);
		data[k * 4 + 2] = Math.round(Math.min(1, Math.max(0, t)) * 255);
		data[k * 4 + 3] = Math.round(Math.min(1, Math.max(0, r)) * 255);
	}
	return { width, height, data };
}

/** Bilinear read of the map at a latitude/longitude, returning [elevation, moisture, temperature, rock] in 0..1. */
export function sampleMap(
	map: PlanetMap,
	latitude: number,
	longitude: number
): [number, number, number, number] {
	const [u, v] = mapUV(latitude, longitude);
	const fx = u * map.width - 0.5;
	const fy = Math.min(map.height - 1, Math.max(0, v * map.height - 0.5));
	const x0 = Math.floor(fx);
	const y0 = Math.floor(fy);
	const tx = fx - x0;
	const ty = fy - y0;
	const px = (x: number) => ((x % map.width) + map.width) % map.width;
	const py = (y: number) => Math.min(map.height - 1, Math.max(0, y));
	const out: [number, number, number, number] = [0, 0, 0, 0];
	for (let c = 0; c < 4; c++) {
		const at = (x: number, y: number) => map.data[(py(y) * map.width + px(x)) * 4 + c]! / 255;
		const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
		const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
		out[c] = top * (1 - ty) + bottom * ty;
	}
	return out;
}

const cache = new Map<string, PlanetMap>();

/** `generatePlanetMap` memoised per size, seed and sites (deterministic, treated as read-only). */
export function cachedPlanetMap(width: number, options: PlanetMapOptions = {}): PlanetMap {
	const seed = options.seed ?? LEGACY_TERRAIN_SEED;
	const sites = (options.zones ?? [{ latitude: 0, longitude: 0 }])
		.map((z) => `${z.latitude},${z.longitude}`)
		.join(';');
	const key = `${width}|${seed}|${sites}`;
	let map = cache.get(key);
	if (!map) {
		map = generatePlanetMap(width, options);
		cache.set(key, map);
	}
	return map;
}
