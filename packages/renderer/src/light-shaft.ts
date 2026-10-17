/**
 * Light shafts (plan 054, ADR 0070): the pure twin of the maths the planet pass runs to put cloud
 * shadows into the air. The atmosphere march of ADR 0027 lights every sample with the full sun; here a
 * second, denser march along the same ray finds the samples whose sunlight the cumulus slab blocks and
 * subtracts the Mie in-scatter those samples would have added. What is left is the shafts: bright
 * where the sun reaches the haze through a gap, darker in the shadow of a cloud. Only Mie is
 * treated (the haze is where the beams show, and its forward phase confines them to the sun's side
 * of the sky); the sky's own blue keeps filling the shadows.
 */
import {
	columnDensity,
	extinction,
	hitsPlanet,
	miePhase,
	ozoneDensity,
	type Atmosphere,
	type RGB
} from './atmosphere-model.ts';
import { CLOUD_ALTITUDE } from './cloud-model.ts';
import { CLOUD_THICKNESS } from './cloud-volume.ts';
import { DEG } from './vec.ts';

/**
 * Size of the cloud map (equirectangular, two bytes per texel: 1.8 km per texel at the equator of the home body) and the octaves it bakes.
 * Red is the coverage the light shafts read (plan 054, ADR 0070), green the cloud density the ground's cloud shadows read (plan 056, ADR 0086).
 */
export const CLOUD_MAP_W = 2048;
export const CLOUD_MAP_H = 1024;
export const CLOUD_MAP_OCTAVES = 3;

/**
 * Texture coordinates in the cloud map of a unit direction in the clouds' own frame (the body-fixed direction turned by the
 * drift angle): longitude `atan2(z, x)` and latitude `asin(y)` over a full turn and a half turn. `cloudMapDirection` is its inverse.
 */
export function cloudMapUV(x: number, y: number, z: number): [number, number] {
	return [
		Math.atan2(z, x) / (2 * Math.PI) + 0.5,
		Math.asin(Math.min(1, Math.max(-1, y))) / Math.PI + 0.5
	];
}

/** The direction a texel `(u, v)` of the cloud map stands for (what the bake shader computes). */
export function cloudMapDirection(u: number, v: number): [number, number, number] {
	const lon = (u - 0.5) * 2 * Math.PI;
	const lat = (v - 0.5) * Math.PI;
	return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
}

export const SHAFT = {
	/** Artistic gain on the removed Mie in-scatter: the model's haze is thinner than the aerosol of a real dusk, where beams read plainly (ADR 0070); 1 is the physical amount. */
	gain: 1.5,
	/** The removed share of any stretch of the in-scatter never exceeds this, so a shadowed sky is dimmer, not black. */
	maxShare: 0.7,
	/** Share of the sun that gets through a thick cloud (the slab is lit through its edges). */
	leak: 0.08,
	/** Optical depth of full coverage, straight up; the slant path through the slab multiplies it by 1 / sun height. */
	tau: 2,
	/** Floor of the sun height in the slant path, so a grazing sun does not make every thin skirt opaque. */
	muMin: 0.12,
	/** Longest stretch of a view ray the second march covers, m. */
	range: 40_000,
	/** Exponent of the sample spacing (2 packs the samples near the camera, where the haze is). */
	power: 2,
	/** A cloud that casts its shadow from farther than this (m) fades out, like the cumulus itself (the planet pass masks it at 45 to 120 km). */
	fadeFrom: 45_000,
	fadeTo: 120_000,
	/** Below this sun height (sine of the local elevation) a sample's slant path is longer than the cloud field: no shadow. */
	minSunMu: 0.03,
	/** Only rays within this cosine of the sun are marched: the Mie lobe (g = 0.76) is 1 % of its peak beyond it. */
	minCosToSun: 0.25
} as const;

/**
 * Terrain-cast shafts (plan 062, ADR 0089): a sample of the second march is also in shadow where the ground between it and the sun
 * rises above its sun ray. The planet pass reads the baked terrain height at `shaftTerrain` points of the sun ray (the same height
 * the march and `terrainShadow` read) and takes the smallest clearance, softened like `terrainShadow`.
 */
export const SHAFT_TERRAIN = {
	/** Longest stretch of a sun ray the reads cover, m (the ray of a sample under the massif's top at a grazing sun is longer than the baked field matters). */
	maxReach: 60_000,
	/** Floor of the sun height (sine) in the reach, so a sun on the horizon does not make the reads span the whole planet. */
	minMu: 0.04,
	/**
	 * Soft edge: the visibility is the clearance of the sun ray over the ground divided by this share of the ray's own height gain
	 * (`sunMu * distance`), so flat ground, which the ray clears by all of that gain, is never shadowed at any sun height, and a
	 * ridge that rises above half of the gain starts to shade (the sun disc is far smaller; the shafts want soft edges).
	 */
	penumbra: 0.5,
	/** Floor of the sun height (sine) in the penumbra, only so that a sun on the horizon does not divide by zero. */
	minPenumbraMu: 0.002,
	/** Tallest terrain, m (`TERRAIN_MAX_HEIGHT` of core, repeated here so the twin has no GPU imports): a sun ray above it is never blocked. */
	topHeight: 4_500
} as const;

/** How far along the sun ray (m) the terrain can still block it, for a sample `altitude` m above the sea sphere and a sun whose sine at the sample is `sunMu`; 0 when the sample is above every summit. */
export function terrainReach(altitude: number, sunMu: number): number {
	const up = SHAFT_TERRAIN.topHeight - altitude;
	if (up <= 0) return 0;
	return Math.min(SHAFT_TERRAIN.maxReach, up / Math.max(sunMu, SHAFT_TERRAIN.minMu));
}

/** Distance (m) of read `k` (0-based) of `reads` along a sun ray of length `reach`: quadratic, so most reads are near the sample. */
export function terrainReadDistance(k: number, reads: number, reach: number): number {
	const f = (k + 1) / reads;
	return reach * f * f;
}

/** Visibility of the sun, 0 to 1, from the clearances (m, ray altitude minus ground height) at the read distances, for a sun of height (sine) `sunMu`. */
export function terrainVisibility(
	clearances: readonly number[],
	distances: readonly number[],
	sunMu: number
): number {
	const gain = SHAFT_TERRAIN.penumbra * Math.max(sunMu, SHAFT_TERRAIN.minPenumbraMu);
	let vis = 1;
	for (let i = 0; i < clearances.length; i++) {
		const v = clamp01(clearances[i]! / (gain * distances[i]!));
		vis = Math.min(vis, v);
	}
	return vis;
}

/** The share of the sun a sample loses when a cloud (`cloud`) and the ground (`terrain`) each block a share of it. */
export const combineOcclusion = (cloud: number, terrain: number): number =>
	1 - (1 - cloud) * (1 - terrain);

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number): number => {
	const t = clamp01((x - a) / (b - a));
	return t * t * (3 - 2 * t);
};

/**
 * Share of the sun a sample loses to the slab: `cover` is the coverage (0..1, after `coverShape`) where its sun
 * ray crosses the slab, `sunMu` the sine of the sun's elevation at the sample. 0 for clear sky, at most `1 - leak`.
 */
export function shaftOcclusion(cover: number, sunMu: number): number {
	return (
		(1 - SHAFT.leak) * (1 - Math.exp((-SHAFT.tau * clamp01(cover)) / Math.max(sunMu, SHAFT.muMin)))
	);
}

/** 1 for a sample below the slab's base (its sun ray crosses the slab), 0 above the top (it is over the clouds), smooth between. */
export const shaftHeightWeight = (altitude: number): number =>
	1 - smoothstep(CLOUD_ALTITUDE, CLOUD_ALTITUDE + CLOUD_THICKNESS, altitude);

/** Fade of a shadow cast by cloud `distance` metres from the sample along the sun ray. */
export const shaftDistanceWeight = (distance: number): number =>
	1 - smoothstep(SHAFT.fadeFrom, SHAFT.fadeTo, distance);

/**
 * 0 to 1: how much of the effect the planet pass runs. Full for a sun under 25 degrees, gone by 55 (a high sun's
 * beams stand straight and do not read), faded in over the last 3 degrees above the horizon and out in the
 * 2 degrees below it; faded out between 8 and 15 km of camera altitude (from orbit the deck is a surface, not
 * a ceiling over haze).
 */
export function shaftStrength(sunElevation: number, altitude: number): number {
	const sun =
		smoothstep(-2 * DEG, 1 * DEG, sunElevation) *
		(1 - smoothstep(25 * DEG, 55 * DEG, sunElevation));
	return sun * (1 - smoothstep(8_000, 15_000, altitude));
}

/**
 * Mie in-scatter, in the units of the atmosphere march before the boost (so times `mieBoost * sunIrradiance` it is radiance),
 * that the cloud shadows remove from a view ray: the CPU twin of the planet pass's shaft loop. `occlusion(s, altitude)`
 * is the share of the sun lost at distance `s` along the ray (the shader's cover lookup at the sample's sun ray);
 * `steps` samples are spread with `SHAFT.power` over `min(range, SHAFT.range)`, at their middles.
 */
export function shaftDeficit(
	atm: Atmosphere,
	altitude: number,
	viewElevation: number,
	sunElevation: number,
	relAzimuth: number,
	occlusion: (distance: number, altitude: number) => number,
	steps: number,
	range: number = SHAFT.range
): RGB {
	const out: RGB = [0, 0, 0];
	const r0 = atm.radius + Math.max(0, altitude);
	const mu = Math.sin(viewElevation);
	const cv = Math.cos(viewElevation);
	const cs = Math.cos(sunElevation);
	const sinS = Math.sin(sunElevation);
	const cosView = cv * cs * Math.cos(relAzimuth) + mu * sinS;
	const pm = miePhase(cosView, atm.mieG);
	const top = atm.radius + atm.height;
	const disc = r0 * r0 * (mu * mu - 1) + top * top;
	if (disc < 0) return out;
	let end = Math.min(-r0 * mu + Math.sqrt(disc), range);
	if (hitsPlanet(atm, r0, mu)) {
		const d = r0 * r0 * (mu * mu - 1) + atm.radius * atm.radius;
		end = Math.min(end, -r0 * mu - Math.sqrt(d));
	}
	let odR = 0;
	let odM = 0;
	let odZ = 0;
	let prev = 0;
	for (let i = 0; i < steps; i++) {
		const u = (i + 0.5) / steps;
		const s = end * Math.pow(u, SHAFT.power);
		// the view path's optical depth accumulates over the stretch since the last sample
		const ds = end * Math.pow((i + 1) / steps, SHAFT.power) - prev;
		prev += ds;
		const r = Math.sqrt(r0 * r0 + 2 * r0 * mu * s + s * s);
		const h = Math.max(0, r - atm.radius);
		odR += Math.exp(-h / atm.rayleighHeight) * ds;
		const dM = Math.exp(-h / atm.mieHeight) * ds;
		odM += dM;
		odZ += ozoneDensity(h) * ds;
		const px = cv * s;
		const py = r0 + mu * s;
		const sunDotUp = (px * cs + py * sinS) / r;
		if (hitsPlanet(atm, r, sunDotUp)) continue;
		const occ = occlusion(s, h);
		if (occ <= 0) continue;
		const att = extinction(atm, [odR, odM, odZ]);
		const sun = extinction(atm, columnDensity(atm, r, sunDotUp));
		for (let c = 0; c < 3; c++) out[c]! += (atm.betaMie / 1.1) * dM * pm * att[c]! * sun[c]! * occ;
	}
	return out;
}

/** In-scatter of one channel at the two cloud-layer snapshots and over the whole path (`a <= b <= all`). */
export interface Snapshots {
	a: number;
	b: number;
	all: number;
}

/**
 * The planet pass's application of the shaft loss (`loss` in the units of `shaftDeficit`, `k` = strength * mieBoost *
 * sunIrradiance * `SHAFT.gain`): segment by segment, each at most `SHAFT.maxShare` of its own in-scatter, so the snapshots
 * stay ordered (the cloud composite subtracts neighbouring snapshots and a negative stretch would paint black).
 */
export function applyShaftLoss(ins: Snapshots, loss: Snapshots, k: number): Snapshots {
	const dA = Math.min(loss.a * k, ins.a * SHAFT.maxShare);
	const dB = Math.min(Math.max(loss.b - loss.a, 0) * k, (ins.b - ins.a) * SHAFT.maxShare);
	const dC = Math.min(Math.max(loss.all - loss.b, 0) * k, (ins.all - ins.b) * SHAFT.maxShare);
	return { a: ins.a - dA, b: ins.b - dA - dB, all: ins.all - dA - dB - dC };
}
