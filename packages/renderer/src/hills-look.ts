/**
 * What a hills body looks like from far (plan 406, ADR 0363): its biome map, the one the sim's
 * height function and the ground shader also read, coloured the way the ground shader colours it
 * (`hillsFragmentColor`) and put in an equirectangular map for the far sphere. A mod planet seen
 * from orbit then has the continents, seas and ice its ground has, from the map in its package or
 * from its seed. Pure: data in, bytes out, and the same bytes anywhere.
 */
import {
	BEACH_WIDTH,
	HIGHLAND,
	SEA_LEVEL,
	sampleMap,
	warpedLatLon,
	type PlanetMap
} from '@orbital/core';
import { texelDir } from './body-look.ts';

type RGB = readonly [number, number, number];

/** What a hills body's far colours are made from. */
export interface HillsLook {
	/** The biome map: elevation, moisture, temperature, rockiness in RGBA. */
	map: PlanetMap;
	/** The terrain's lattice shift (`terrainShift(seed)`), which warps where the map is read. */
	shift: number;
	/** The body's radius, m: the warp is in kilometres of the surface. */
	radius: number;
	/** The sea's colours, linear RGB (the stock pair, or a mod's `ocean`). */
	deep: RGB;
	shallow: RGB;
}

const smooth = (a: number, b: number, x: number): number => {
	const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
	return t * t * (3 - 2 * t);
};
const mix = (a: RGB, b: RGB, t: number): RGB => [
	a[0] + (b[0] - a[0]) * t,
	a[1] + (b[1] - a[1]) * t,
	a[2] + (b[2] - a[2]) * t
];

const GRASS: RGB = [0.07, 0.16, 0.035];
const FOREST: RGB = [0.03, 0.075, 0.026];
const DESERT: RGB = [0.5, 0.36, 0.2];
const ALPINE: RGB = [0.16, 0.17, 0.09];
const ROCK: RGB = [0.25, 0.225, 0.2];
const SAND: RGB = [0.44, 0.38, 0.26];
const SNOW: RGB = [0.78, 0.8, 0.84];

/** The linear colour of a ground whose biome map reads `e` elevation, `moist`, `temp` and `rock`. */
export function hillsColour(
	e: number,
	moist: number,
	temp: number,
	rock: number,
	deep: RGB,
	shallow: RGB
): RGB {
	const seaW = 1 - smooth(SEA_LEVEL - 0.004, SEA_LEVEL, e);
	const sea = mix(deep, shallow, smooth(SEA_LEVEL - 0.14, SEA_LEVEL, e));
	const wForest = smooth(0.55, 0.72, moist);
	const wDesert = (1 - smooth(0.26, 0.4, moist)) * smooth(0.35, 0.5, temp);
	let veg = mix(GRASS, FOREST, wForest);
	veg = mix(veg, DESERT, wDesert);
	veg = mix(veg, ALPINE, smooth(HIGHLAND - 0.1, HIGHLAND, e));
	const wRock = Math.max(smooth(HIGHLAND - 0.06, HIGHLAND + 0.05, e), smooth(0.7, 0.9, rock));
	const wSnow = Math.max(smooth(0.22, 0.12, temp), smooth(0.9, 0.97, e));
	const wBeach =
		(1 - smooth(SEA_LEVEL + BEACH_WIDTH * 0.5, SEA_LEVEL + BEACH_WIDTH * 1.6, e)) * (1 - wRock);
	let land = mix(veg, ROCK, wRock);
	land = mix(land, SAND, wBeach);
	land = mix(land, SNOW, wSnow);
	return mix(land, sea, seaW);
}

/** Linear to an sRGB byte. */
const encode = (c: number): number => {
	const v = Math.min(1, Math.max(0, c));
	return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));
};

/** Rows `j0` to `j1` (exclusive) of the far map into `out`: RGBA sRGB, rows from the south pole up, like `surfaceRows`. */
export function hillsRows(
	look: HillsLook,
	size: { width: number; height: number },
	out: Uint8Array,
	j0: number,
	j1: number
): void {
	const { width: w, height: h } = size;
	for (let j = j0; j < Math.min(j1, h); j++) {
		for (let i = 0; i < w; i++) {
			const [x, y, z] = texelDir(i, j, w, h);
			const [lat, lon] = warpedLatLon({ x, y, z }, look.radius, look.shift);
			const [e, moist, temp, rock] = sampleMap(look.map, lat, lon);
			const c = hillsColour(e, moist, temp, rock, look.deep, look.shallow);
			const o = (j * w + i) * 4;
			out[o] = encode(c[0]);
			out[o + 1] = encode(c[1]);
			out[o + 2] = encode(c[2]);
			out[o + 3] = 255;
		}
	}
}
