/**
 * City lights of the home planet seen from orbit (plan 403, ADR 0342): a density in [0, 1] baked
 * with the scaled-space normal map (its alpha channel) from the surface function's own inputs, and
 * shown on the night side only. The reference here is the CPU twin of the GLSL and TSL bakes: one
 * formula, written three times, over `terrainNoise` (core) / `noiseT` (the shaders).
 */
import { terrainNoise, type Vec3 } from '@orbital/core';

/** Wavelengths (km) and salts of the three scales: regions, towns, cities. */
export const LIGHTS_REGION = { km: 700, salt: 311 } as const;
export const LIGHTS_TOWN = { km: 70, salt: 313 } as const;
export const LIGHTS_CITY = { km: 9, salt: 317 } as const;

/** Latitude (rad) where settlement thins out and is gone: the ice. */
export const LIGHTS_LATITUDE = [(55 * Math.PI) / 180, (68 * Math.PI) / 180] as const;
/** Height (m) of the lowland where people live: full below the first, none above the second. */
export const LIGHTS_HEIGHT = [60, 700] as const;
/** The ground must rise this far above the sea (m) to be land with lights. */
export const LIGHTS_SHORE = 4;
/** Colour of a city's light (warm sodium white), and the radiance of the brightest one: a few times the lit night ground (`NIGHT_SKY`). */
export const LIGHTS_RADIANCE = [1.0, 0.72, 0.42] as const;
export const LIGHTS_GAIN = 0.12;

const smooth = (a: number, b: number, x: number): number => {
	const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
	return t * t * (3 - 2 * t);
};

/**
 * The light density at a place: `qKm` the unit body-fixed direction times the radius in km,
 * `shift` the seed's lattice shift, `height` m above the sea, `latitude` rad, `water` whether it is
 * sea or lake.
 */
export function nightLights(
	qKm: Vec3,
	shift: number,
	height: number,
	latitude: number,
	water: boolean
): number {
	if (water) return 0;
	const land = smooth(LIGHTS_SHORE, LIGHTS_SHORE * 6, height);
	const lowland = 1 - smooth(LIGHTS_HEIGHT[0], LIGHTS_HEIGHT[1], height);
	const climate = 1 - smooth(LIGHTS_LATITUDE[0], LIGHTS_LATITUDE[1], Math.abs(latitude));
	const n = (w: { km: number; salt: number }) => terrainNoise(qKm, 1 / w.km, w.salt, shift);
	const region = smooth(0.52, 0.72, n(LIGHTS_REGION));
	const town = smooth(0.55, 0.75, n(LIGHTS_TOWN));
	const city = smooth(0.62, 0.82, n(LIGHTS_CITY));
	return Math.min(1, land * lowland * climate * region * (0.3 * town + 0.9 * town * city));
}

/** How much of the night side's lights show at a point whose geometric sun elevation is `geo` (the dot of the vertical and the sun). */
export const nightFactor = (geo: number): number => 1 - smooth(-0.12, 0.05, geo);

/** The GLSL of `nightLights` over `noiseT` (`uR` the body radius): the bake's twin of the function above. */
export const nightLightsGLSL = /* glsl */ `
float smoothLights(float a, float b, float x) { return smoothstep(a, b, x); }
float nightLightsAt(vec3 n, float height, bool water) {
	if (water) return 0.0;
	vec3 q = n * (uR / 1000.0);
	float lat = asin(clamp(n.y, -1.0, 1.0));
	float land = smoothstep(${LIGHTS_SHORE.toFixed(1)}, ${(LIGHTS_SHORE * 6).toFixed(1)}, height);
	float lowland = 1.0 - smoothstep(${LIGHTS_HEIGHT[0].toFixed(1)}, ${LIGHTS_HEIGHT[1].toFixed(1)}, height);
	float climate = 1.0 - smoothstep(${LIGHTS_LATITUDE[0].toFixed(6)}, ${LIGHTS_LATITUDE[1].toFixed(6)}, abs(lat));
	float region = smoothstep(0.52, 0.72, noiseT(q, ${(1 / LIGHTS_REGION.km).toFixed(8)}, ${LIGHTS_REGION.salt}));
	float town = smoothstep(0.55, 0.75, noiseT(q, ${(1 / LIGHTS_TOWN.km).toFixed(8)}, ${LIGHTS_TOWN.salt}));
	float city = smoothstep(0.62, 0.82, noiseT(q, ${(1 / LIGHTS_CITY.km).toFixed(8)}, ${LIGHTS_CITY.salt}));
	return min(1.0, land * lowland * climate * region * (0.3 * town + 0.9 * town * city));
}
`;

/** The GLSL of `nightFactor` for the expression `geo`. */
export const nightFactorGLSL = (geo: string): string => `(1.0 - smoothstep(-0.12, 0.05, ${geo}))`;

/**
 * The TSL of `nightLights` (the same formula): `noise(freq km, salt)` is the terrain's lattice noise at
 * the point, `n` the unit body-fixed direction node, `lat` the latitude node, `height` m, `water` a 0/1 node.
 */
export function nightLightsTSL(
	T: any,
	n: any,
	radius: any,
	height: any,
	water: any,
	noise: (q: any, freq: number, salt: number) => any
): any {
	const { asin, clamp, abs, float, min, smoothstep, select } = T;
	const q = n.mul(radius.div(1000.0));
	const lat = asin(clamp(n.y, -1.0, 1.0));
	const land = smoothstep(LIGHTS_SHORE, LIGHTS_SHORE * 6, height);
	const lowland = smoothstep(LIGHTS_HEIGHT[0], LIGHTS_HEIGHT[1], height).oneMinus();
	const climate = smoothstep(LIGHTS_LATITUDE[0], LIGHTS_LATITUDE[1], abs(lat)).oneMinus();
	const region = smoothstep(0.52, 0.72, noise(q, 1 / LIGHTS_REGION.km, LIGHTS_REGION.salt));
	const town = smoothstep(0.55, 0.75, noise(q, 1 / LIGHTS_TOWN.km, LIGHTS_TOWN.salt));
	const city = smoothstep(0.62, 0.82, noise(q, 1 / LIGHTS_CITY.km, LIGHTS_CITY.salt));
	const v = min(
		float(1.0),
		land
			.mul(lowland)
			.mul(climate)
			.mul(region)
			.mul(town.mul(0.3).add(town.mul(city).mul(0.9)))
	);
	return select(water.greaterThan(0.5), float(0.0), v);
}
