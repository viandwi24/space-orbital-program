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
}

/**
 * The scattering layer is this many times thicker than the body's pressure scale height, with
 * the density at the surface divided by the same factor, so the vertical optical depth (the colour
 * of the sky) is unchanged while horizontal paths near the ground are that much clearer
 * (ADR 0037: land at 3 to 10 km looked like milk).
 */
export const RAYLEIGH_THICKNESS = 2;

/** Earth's optical depths (vertical blue depth 0.27) on a layer `RAYLEIGH_THICKNESS` x the home body's 5.6 km scale height. */
export const atmosphereFor = (radius: number, height: number, scaleHeight = 5_600): Atmosphere => ({
	radius,
	height,
	rayleighHeight: scaleHeight * RAYLEIGH_THICKNESS,
	mieHeight: scaleHeight * 0.15,
	betaRayleigh: [
		(8.3e-6 * 5_600) / (scaleHeight * RAYLEIGH_THICKNESS),
		(19.3e-6 * 5_600) / (scaleHeight * RAYLEIGH_THICKNESS),
		(47.3e-6 * 5_600) / (scaleHeight * RAYLEIGH_THICKNESS)
	],
	betaMie: (18e-6 * 5_600) / scaleHeight,
	mieG: 0.76,
	sunIrradiance: 12,
	skyBoost: 2.2,
	mieBoost: 2.2
});

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

/** Rayleigh and Mie optical depth (dimensionless density integrals in metres) to the top of the atmosphere. */
export function columnDensity(atm: Atmosphere, r0: number, mu: number): [number, number] {
	const top = sphereExit(r0, mu, atm.radius + atm.height);
	if (top === null || top <= 0) return [0, 0];
	const ds = top / STEPS;
	let rayleigh = 0;
	let mie = 0;
	for (let i = 0; i < STEPS; i++) {
		const s = (i + 0.5) * ds;
		const r = Math.sqrt(r0 * r0 + 2 * r0 * mu * s + s * s);
		const h = Math.max(0, r - atm.radius);
		rayleigh += Math.exp(-h / atm.rayleighHeight) * ds;
		mie += Math.exp(-h / atm.mieHeight) * ds;
	}
	return [rayleigh, mie];
}

const extinction = (atm: Atmosphere, [dr, dm]: [number, number]): RGB => [
	Math.exp(-(atm.betaRayleigh[0] * dr + atm.betaMie * 1.1 * dm)),
	Math.exp(-(atm.betaRayleigh[1] * dr + atm.betaMie * 1.1 * dm)),
	Math.exp(-(atm.betaRayleigh[2] * dr + atm.betaMie * 1.1 * dm))
];

/** Fraction of sunlight reaching a point at `altitude` m when the sun is `sunElevation` rad above the horizon; black if the planet blocks it. */
export function sunTransmittance(atm: Atmosphere, altitude: number, sunElevation: number): RGB {
	const r0 = atm.radius + Math.max(0, altitude);
	const mu = Math.sin(sunElevation);
	if (hitsPlanet(atm, r0, mu)) return [0, 0, 0];
	return extinction(atm, columnDensity(atm, r0, mu));
}

const rayleighPhase = (c: number): number => (3 / (16 * Math.PI)) * (1 + c * c);
const miePhase = (c: number, g: number): number =>
	(1 / (4 * Math.PI)) * ((1 - g * g) / Math.pow(1 + g * g - 2 * g * c, 1.5));

interface PathIntegral {
	/** Rayleigh and Mie in-scatter per channel before the boosts and the sun irradiance. */
	rayleigh: RGB;
	mie: RGB;
	/** Rayleigh and Mie optical depth of the path. */
	depth: [number, number];
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
	for (let i = 0; i < STEPS; i++) {
		const s = (i + 0.5) * ds;
		const r = Math.sqrt(r0 * r0 + 2 * r0 * mu * s + s * s);
		const h = Math.max(0, r - atm.radius);
		const dR = Math.exp(-h / atm.rayleighHeight) * ds;
		const dM = Math.exp(-h / atm.mieHeight) * ds;
		odR += dR;
		odM += dM;
		// Sun direction against the local vertical at the sample: P = O + v s with O on +y.
		const px = cv * s;
		const py = r0 + mu * s;
		const pz = 0;
		const sunDotUp =
			(px * cs * Math.cos(relAzimuth) + py * sinS + pz * cs * Math.sin(relAzimuth)) / r;
		if (hitsPlanet(atm, r, sunDotUp)) continue;
		const viewT = extinction(atm, [odR, odM]);
		const sunT = extinction(atm, columnDensity(atm, r, sunDotUp));
		for (let c = 0; c < 3; c++) {
			const att = viewT[c]! * sunT[c]!;
			rayleigh[c]! += atm.betaRayleigh[c]! * dR * pr * att;
			mie[c]! += (atm.betaMie / 1.1) * dM * pm * att;
		}
	}
	return { rayleigh, mie, depth: [odR, odM] };
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

/** 0 on the ground, 1 above the atmosphere. */
export const spaceFraction = (atm: Atmosphere, altitude: number): number =>
	clamp(altitude / atm.height, 0, 1);
