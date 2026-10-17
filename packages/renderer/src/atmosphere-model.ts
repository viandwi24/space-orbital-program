/**
 * Single-scattering Rayleigh + Mie atmosphere: constants shared with the shaders and a TypeScript
 * twin of the ray march (ADR 0027). The GPU evaluates it per pixel; the CPU evaluates it a few
 * dozen times per update to colour the sun, the ambient light, the fog and the exposure so that
 * lit objects match the sky. Radiometric units: `sunIrradiance` is what a white Lambert surface
 * facing the sun receives (three.js `DirectionalLight.intensity`), so its radiance is
 * albedo * irradiance / PI.
 */
import { DEG, clamp } from './vec.ts';

export type RGB = [number, number, number];

export interface Atmosphere {
	/** Planet radius, m. */
	radius: number;
	/** Top of the atmosphere above the surface, m. */
	height: number;
	rayleighHeight: number;
	mieHeight: number;
	/** Rayleigh extinction at sea level, 1/m, per channel. */
	betaRayleigh: RGB;
	/** Mie extinction at sea level, 1/m (scattering is 1/1.1 of it). */
	betaMie: number;
	/** Henyey-Greenstein asymmetry. */
	mieG: number;
	sunIrradiance: number;
	/** Multiplies Rayleigh in-scatter to stand in for multiple scattering (single scattering is too dark and too blue). */
	skyBoost: number;
	/** The same for Mie in-scatter. Kept apart from `skyBoost` so haze can be tuned alone; ADR 0037 found that Rayleigh, not Mie, veiled distant land, so both are 2.2. */
	mieBoost: number;
	/** Ozone absorption at peak density, 1/m, per channel (plan 054, ADR 0069); absorbs and does not scatter. */
	betaOzone: RGB;
}

/**
 * Ozone layer (plan 054, ADR 0069): the density is 0 at `OZONE.base`, rises linearly to 1 at `OZONE.peak`
 * and falls linearly to 0 at `OZONE.top` metres above the surface (Bruneton 2017 and Hillaire 2020, which
 * use the same tent; checked 2026-10-17, research `three.md`). The layer is at absolute altitudes: it is
 * not stretched like the Rayleigh layer, so the home body (70 km of air) holds it whole.
 */
export const OZONE = { base: 10_000, peak: 25_000, top: 40_000 } as const;

/**
 * Ozone absorption per metre at density 1 for about 680, 550 and 440 nm: the Bruneton cross sections
 * (1.209e-25, 3.5e-25, 1.582e-26 m^2, the Chappuis band, peak near 600 nm) times 300 Dobson units spread over
 * the tent (5.374e18 per m^3). It matches Hillaire's (0.650, 1.881, 0.085) x 1e-6.
 */
export const OZONE_ABSORPTION: RGB = [6.5e-7, 1.881e-6, 8.5e-8];

/**
 * The home body is 600 km across, a tenth of Earth: a slant path through a layer 15 km thick is about a third
 * as long, so at sunset its ozone column is a quarter of Earth's. The layer is made this many times denser
 * so a low sun path loses as much green as on Earth (the same reasoning as `RAYLEIGH_THICKNESS`, with the
 * density rather than the height scaled); the vertical column is then 0.1 optical depth in green (Earth 0.03).
 */
export const OZONE_STRENGTH = 3.5;

/** Ozone density in [0, 1] at `altitude` metres. */
export const ozoneDensity = (altitude: number): number =>
	Math.max(
		0,
		altitude < OZONE.peak
			? (altitude - OZONE.base) / (OZONE.peak - OZONE.base)
			: (OZONE.top - altitude) / (OZONE.top - OZONE.peak)
	);

/**
 * The scattering layer is this many times thicker than the body's pressure scale height, with
 * the density at the surface divided by the same factor, so the vertical optical depth (the colour
 * of the sky) is unchanged while horizontal paths near the ground are that much clearer
 * (ADR 0037: land at 3 to 10 km looked like milk).
 */
export const RAYLEIGH_THICKNESS = 2;

/** The surface pressure the stock optical depths are for, Pa (the home planet's). */
export const REFERENCE_PRESSURE = 101_325;

/**
 * Earth's optical depths (vertical blue depth 0.27) on a layer `RAYLEIGH_THICKNESS` x the home
 * body's 5.6 km scale height, scaled by the surface pressure (plan 071, ADR 0121 point 2: a thin
 * atmosphere looks thin; the home planet's is unchanged).
 */
export const atmosphereFor = (
	radius: number,
	height: number,
	scaleHeight = 5_600,
	surfacePressure = REFERENCE_PRESSURE
): Atmosphere => {
	const k = surfacePressure / REFERENCE_PRESSURE;
	return {
		radius,
		height,
		rayleighHeight: scaleHeight * RAYLEIGH_THICKNESS,
		mieHeight: scaleHeight * 0.15,
		betaRayleigh: [
			(k * 8.3e-6 * 5_600) / (scaleHeight * RAYLEIGH_THICKNESS),
			(k * 19.3e-6 * 5_600) / (scaleHeight * RAYLEIGH_THICKNESS),
			(k * 47.3e-6 * 5_600) / (scaleHeight * RAYLEIGH_THICKNESS)
		],
		betaMie: (k * 18e-6 * 5_600) / scaleHeight,
		mieG: 0.76,
		sunIrradiance: 12,
		skyBoost: 2.2,
		mieBoost: 2.2,
		betaOzone: [
			k * OZONE_ABSORPTION[0] * OZONE_STRENGTH,
			k * OZONE_ABSORPTION[1] * OZONE_STRENGTH,
			k * OZONE_ABSORPTION[2] * OZONE_STRENGTH
		]
	};
};

const STEPS = 24;

/** Distance along a ray from radius `r0` with cosine `mu` against the vertical to a sphere of radius `rs`; null if missed. */
function sphereExit(r0: number, mu: number, rs: number): number | null {
	const disc = r0 * r0 * (mu * mu - 1) + rs * rs;
	if (disc < 0) return null;
	return -r0 * mu + Math.sqrt(disc);
}

/** True when a ray from `r0` with cosine `mu` hits the planet before leaving (r0 above the surface). */
export function hitsPlanet(atm: Atmosphere, r0: number, mu: number): boolean {
	const disc = r0 * r0 * (mu * mu - 1) + atm.radius * atm.radius;
	return disc >= 0 && -r0 * mu - Math.sqrt(disc) > 0;
}

/** Rayleigh, Mie and ozone column density (density integrals in metres) to the top of the atmosphere. */
export function columnDensity(atm: Atmosphere, r0: number, mu: number): Density3 {
	const top = sphereExit(r0, mu, atm.radius + atm.height);
	if (top === null || top <= 0) return [0, 0, 0];
	const ds = top / STEPS;
	let rayleigh = 0;
	let mie = 0;
	let ozone = 0;
	for (let i = 0; i < STEPS; i++) {
		const s = (i + 0.5) * ds;
		const r = Math.sqrt(r0 * r0 + 2 * r0 * mu * s + s * s);
		const h = Math.max(0, r - atm.radius);
		rayleigh += Math.exp(-h / atm.rayleighHeight) * ds;
		mie += Math.exp(-h / atm.mieHeight) * ds;
		ozone += ozoneDensity(h) * ds;
	}
	return [rayleigh, mie, ozone];
}

/** Rayleigh, Mie and ozone density integrals along a path, metres. */
export type Density3 = [number, number, number];

/** Transmittance of a path with the given density integrals: Rayleigh and Mie scatter, ozone only absorbs. */
export const extinction = (atm: Atmosphere, [dr, dm, dz]: Density3): RGB => [
	Math.exp(-(atm.betaRayleigh[0] * dr + atm.betaMie * 1.1 * dm + atm.betaOzone[0] * dz)),
	Math.exp(-(atm.betaRayleigh[1] * dr + atm.betaMie * 1.1 * dm + atm.betaOzone[1] * dz)),
	Math.exp(-(atm.betaRayleigh[2] * dr + atm.betaMie * 1.1 * dm + atm.betaOzone[2] * dz))
];

/** Fraction of sunlight reaching a point at `altitude` m when the sun is `sunElevation` rad above the horizon; black if the planet blocks it. */
export function sunTransmittance(atm: Atmosphere, altitude: number, sunElevation: number): RGB {
	const r0 = atm.radius + Math.max(0, altitude);
	const mu = Math.sin(sunElevation);
	if (hitsPlanet(atm, r0, mu)) return [0, 0, 0];
	return extinction(atm, columnDensity(atm, r0, mu));
}

export const rayleighPhase = (c: number): number => (3 / (16 * Math.PI)) * (1 + c * c);
export const miePhase = (c: number, g: number): number =>
	(1 / (4 * Math.PI)) * ((1 - g * g) / Math.pow(1 + g * g - 2 * g * c, 1.5));

interface PathIntegral {
	/** Rayleigh and Mie in-scatter per channel before the boosts and the sun irradiance. */
	rayleigh: RGB;
	mie: RGB;
	/** Rayleigh and Mie optical depth of the path. */
	depth: Density3;
}

/** Integrates the single-scattered light along a view path of at most `maxDistance` metres (to the surface or the atmosphere top when omitted). */
function integratePath(
	atm: Atmosphere,
	altitude: number,
	viewElevation: number,
	sunElevation: number,
	relAzimuth: number,
	maxDistance = Number.POSITIVE_INFINITY
): PathIntegral | null {
	const r0 = atm.radius + Math.max(0, altitude);
	const mu = Math.sin(viewElevation);
	const top = sphereExit(r0, mu, atm.radius + atm.height);
	if (top === null || top <= 0) return null;
	let end = top;
	if (hitsPlanet(atm, r0, mu)) {
		const disc = r0 * r0 * (mu * mu - 1) + atm.radius * atm.radius;
		end = -r0 * mu - Math.sqrt(disc);
	}
	end = Math.min(end, maxDistance);
	const cv = Math.cos(viewElevation);
	const cs = Math.cos(sunElevation);
	const sinS = Math.sin(sunElevation);
	const cosView = cv * cs * Math.cos(relAzimuth) + mu * sinS;
	const pr = rayleighPhase(cosView);
	const pm = miePhase(cosView, atm.mieG);
	const ds = end / STEPS;
	const rayleigh: RGB = [0, 0, 0];
	const mie: RGB = [0, 0, 0];
	let odR = 0;
	let odM = 0;
	let odZ = 0;
	for (let i = 0; i < STEPS; i++) {
		const s = (i + 0.5) * ds;
		const r = Math.sqrt(r0 * r0 + 2 * r0 * mu * s + s * s);
		const h = Math.max(0, r - atm.radius);
		const dR = Math.exp(-h / atm.rayleighHeight) * ds;
		const dM = Math.exp(-h / atm.mieHeight) * ds;
		odR += dR;
		odM += dM;
		odZ += ozoneDensity(h) * ds;
		// Sun direction against the local vertical at the sample: P = O + v s with O on +y.
		const px = cv * s;
		const py = r0 + mu * s;
		const pz = 0;
		const sunDotUp =
			(px * cs * Math.cos(relAzimuth) + py * sinS + pz * cs * Math.sin(relAzimuth)) / r;
		if (hitsPlanet(atm, r, sunDotUp)) continue;
		const viewT = extinction(atm, [odR, odM, odZ]);
		const sunT = extinction(atm, columnDensity(atm, r, sunDotUp));
		for (let c = 0; c < 3; c++) {
			const att = viewT[c]! * sunT[c]!;
			rayleigh[c]! += atm.betaRayleigh[c]! * dR * pr * att;
			mie[c]! += (atm.betaMie / 1.1) * dM * pm * att;
		}
	}
	return { rayleigh, mie, depth: [odR, odM, odZ] };
}

const boosted = (atm: Atmosphere, p: PathIntegral): RGB => [
	(p.rayleigh[0] * atm.skyBoost + p.mie[0] * atm.mieBoost) * atm.sunIrradiance,
	(p.rayleigh[1] * atm.skyBoost + p.mie[1] * atm.mieBoost) * atm.sunIrradiance,
	(p.rayleigh[2] * atm.skyBoost + p.mie[2] * atm.mieBoost) * atm.sunIrradiance
];

/**
 * In-scattered radiance toward a viewer at `altitude`, looking `viewElevation` rad above the local
 * horizon, with the sun `sunElevation` above it and `relAzimuth` rad between their azimuths.
 */
export function skyRadiance(
	atm: Atmosphere,
	altitude: number,
	viewElevation: number,
	sunElevation: number,
	relAzimuth: number
): RGB {
	const p = integratePath(atm, altitude, viewElevation, sunElevation, relAzimuth);
	return p ? boosted(atm, p) : [0, 0, 0];
}

/** The Mie part of `skyRadiance` along a path of at most `maxDistance` metres: the haze that light shafts modulate (plan 054). */
export function mieRadiance(
	atm: Atmosphere,
	altitude: number,
	viewElevation: number,
	sunElevation: number,
	relAzimuth: number,
	maxDistance = Number.POSITIVE_INFINITY
): RGB {
	const p = integratePath(atm, altitude, viewElevation, sunElevation, relAzimuth, maxDistance);
	if (!p) return [0, 0, 0];
	return [
		p.mie[0] * atm.mieBoost * atm.sunIrradiance,
		p.mie[1] * atm.mieBoost * atm.sunIrradiance,
		p.mie[2] * atm.mieBoost * atm.sunIrradiance
	];
}

/**
 * Aerial perspective of a surface `distance` metres away along a view ray: the haze radiance added
 * on the way and the fraction of the surface's own light that survives. The planet pass applies
 * the same two numbers per pixel (ADR 0037).
 */
export function aerialPerspective(
	atm: Atmosphere,
	altitude: number,
	viewElevation: number,
	distance: number,
	sunElevation: number,
	relAzimuth: number
): { inscatter: RGB; transmittance: RGB } {
	const p = integratePath(atm, altitude, viewElevation, sunElevation, relAzimuth, distance);
	if (!p) return { inscatter: [0, 0, 0], transmittance: [1, 1, 1] };
	return { inscatter: boosted(atm, p), transmittance: extinction(atm, p.depth) };
}

export const luminance = ([r, g, b]: RGB): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Cosine-weighted mean sky radiance over the upper hemisphere: the ambient colour a surface facing up sees. */
export function skyAmbient(atm: Atmosphere, altitude: number, sunElevation: number): RGB {
	const elevations = [15, 45, 75].map((d) => d * DEG);
	const azimuths = [0, 120, 240].map((d) => d * DEG);
	const acc: RGB = [0, 0, 0];
	let wsum = 0;
	for (const e of elevations) {
		const w = Math.sin(e) * Math.cos(e);
		for (const a of azimuths) {
			const l = skyRadiance(atm, altitude, e, sunElevation, a);
			for (let c = 0; c < 3; c++) acc[c]! += l[c]! * w;
			wsum += w;
		}
	}
	return [acc[0]! / wsum, acc[1]! / wsum, acc[2]! / wsum];
}

/** Sky radiance just above the horizon, away from the sun: the colour distant objects fade into. */
export const horizonColour = (atm: Atmosphere, altitude: number, sunElevation: number): RGB =>
	skyRadiance(atm, altitude, 2 * DEG, sunElevation, Math.PI / 2);

/**
 * Terrain seen through the air reads through a thinner veil than the single-scattering model gives
 * (plan 039, ADR 0053): the model's multiple-scattering stand-in (`skyBoost`) is tuned for the sky, and
 * over ground paths of 10 to 40 km it left mountains a pale sheet with no relief. The planet pass scales
 * the in-scattered radiance of a ray that ends on terrain by this factor, `TERRAIN_VEIL.near` up to
 * `TERRAIN_VEIL.fadeFrom` metres away and back to 1 by `TERRAIN_VEIL.fadeTo`, so the far sea and the
 * horizon still meet the sky. `aerialPerspective` is the model without it (the ADR 0037 bound holds
 * for the model; with this factor the on-screen veil is at most `near` of it).
 */
export const TERRAIN_VEIL = { near: 0.45, fadeFrom: 20_000, fadeTo: 90_000 } as const;

/** The factor on the in-scattered radiance of a ray that ends on terrain `distance` metres away. */
export const terrainVeil = (distance: number): number => {
	const t = clamp(
		(distance - TERRAIN_VEIL.fadeFrom) / (TERRAIN_VEIL.fadeTo - TERRAIN_VEIL.fadeFrom),
		0,
		1
	);
	return TERRAIN_VEIL.near + (1 - TERRAIN_VEIL.near) * t * t * (3 - 2 * t);
};

/** 0 on the ground, 1 above the atmosphere. */
export const spaceFraction = (atm: Atmosphere, altitude: number): number =>
	clamp(altitude / atm.height, 0, 1);
