/**
 * Cumulus as a slab (plan 037, ADR 0059): the pure twin of the maths the planet pass runs inside the
 * cloud layer. The layer is a spherical shell of `CLOUD_THICKNESS` metres above `CLOUD_ALTITUDE`; the
 * 2D coverage field of ADR 0037 decides where there is cloud, a height profile gives the flat base and
 * the rounded, cover-dependent top, and a handful of ray-march steps integrate extinction analytically
 * with a dual-lobe phase, a multiple-scattering stand-in and a sun optical depth read off the profile.
 */
import { CLOUD_ALTITUDE } from './cloud-model.ts';

/** Thickness of the cumulus slab, m. */
export const CLOUD_THICKNESS = 1_100;
/** Altitude of the slab's top surface, m. */
export const CLOUD_TOP = CLOUD_ALTITUDE + CLOUD_THICKNESS;
/** Extinction coefficient of density 1, 1/m (an optical depth of about 3.3 straight up through a full slab, 8 to 10 along the long slant paths of a low view). */
export const CLOUD_SIGMA = 0.003;
/** Share of the profile's own optical depth the shader keeps for the sun path; the rest is one noise-detailed sample toward the sun. */
export const CLOUD_SUN_BULK = 0.9;
/** Floor of the sun's cosine against the vertical in the sun path, so a grazing sun does not turn the slab black. */
export const CLOUD_SUN_MU_MIN = 0.35;
/** The longest stretch of one ray that is marched, m. */
export const CLOUD_MAX_PATH = 3_000;
/** The most of a grazing path beyond the marched part that still adds optical depth, m: clouds are finite, a long ray leaves them for clear air. */
export const CLOUD_EXTRA_PATH = 3_000;

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number): number => {
	const t = clamp01((x - a) / (b - a));
	return t * t * (3 - 2 * t);
};

/**
 * Relative density by height in the slab (`h` 0 at the base, 1 at the top): a flat base that fades in
 * over the lowest 12 %, and a top that is lower and softer where there is little cloud (`cover` 0..1)
 * so thin clouds are flat and heavy ones tower.
 */
export function heightProfile(h: number, cover: number): number {
	const top = 0.4 + 0.6 * clamp01(cover);
	return smoothstep(0, 0.12, h) * (1 - smoothstep(top * 0.55, top, h));
}

/**
 * Density at height `h` (0..1) in a column with 2D coverage `cover` and billow noise `e` (0..1, mean 0.5):
 * the height profile is shifted by the noise so the base and top are ragged, and the noise erodes thin
 * cloud first. Unlike a remap that forces cores to 1, a core keeps varying with `e`, so the lit
 * structure inside the slab shows.
 */
export function slabDensity(cover: number, h: number, e: number): number {
	const ragged = h + (e - 0.5) * 0.7;
	const base = 1.2 * cover * heightProfile(ragged, cover);
	return clamp01(base - (1 - e) * 0.75);
}

/**
 * Shapes the 2D coverage before it enters the slab: the soft skirts of the coverage field (the
 * smoothstep of ADR 0037 widens with the pixel footprint) would, over the long slant paths of a
 * grazing ray, add up to a veil over clear sky; below 0.08 there is no cloud and above 0.55 it is full.
 */
export function coverShape(cover: number): number {
	return smoothstep(0.08, 0.55, cover);
}

/** Weights of the three erosion octaves (cells of about 210 m, 70 m and 25 m); they sum to 1. */
export const EROSION_WEIGHTS = [0.55, 0.35, 0.1] as const;
/** Pixel footprints (m) at which each octave starts to fade and is gone: it would alias past the second. */
export const EROSION_FADE: readonly (readonly [number, number])[] = [
	[250, 1200],
	[90, 400],
	[30, 130]
];

/**
 * Combines up to `octaves` samples of value noise (0..1) into one billow value: an octave a pixel is
 * too wide for contributes its mean (0.5), and the sum is stretched around 0.5 so the product reaches
 * the range 0..1 that `slabDensity` expects (a sum of independent noises is otherwise squeezed to the middle).
 */
export function erosion(noise: readonly number[], footprint: number, octaves = 3): number {
	let e = 0;
	for (let i = 0; i < EROSION_WEIGHTS.length; i++) {
		const [from, to] = EROSION_FADE[i]!;
		const w = i < octaves ? 1 - smoothstep(from, to, footprint) : 0;
		e += EROSION_WEIGHTS[i]! * (0.5 + w * ((noise[i] ?? 0.5) - 0.5));
	}
	return clamp01((e - 0.5) * 2 + 0.5);
}

/** Henyey-Greenstein phase function (integrates to 1 over the sphere). */
export function henyeyGreenstein(cosTheta: number, g: number): number {
	const g2 = g * g;
	return (1 / (4 * Math.PI)) * ((1 - g2) / Math.pow(1 + g2 - 2 * g * cosTheta, 1.5));
}

/** Silver lining forward, a soft back lobe: the two-lobe fit used for cumulus by Schneider's cloud system. */
export const CLOUD_PHASE = { forward: 0.5, back: -0.28, weight: 0.65 } as const;

/** Dual-lobe Henyey-Greenstein, 1/sr. */
export function cloudPhase(cosTheta: number): number {
	const { forward, back, weight } = CLOUD_PHASE;
	return (
		weight * henyeyGreenstein(cosTheta, forward) + (1 - weight) * henyeyGreenstein(cosTheta, back)
	);
}

/**
 * Multiple scattering stand-in (Wrenninge): three octaves in which each bounce keeps half the energy,
 * half the anisotropy and sees half the extinction, so a deep cloud interior is grey and not black.
 * `tau` is the optical depth toward the sun; the result is phase times transmittance, 1/sr.
 */
export function multiScatter(tau: number, cosTheta: number): number {
	const { forward, back, weight } = CLOUD_PHASE;
	let sum = 0;
	let a = 1;
	let b = 1;
	let c = 1;
	for (let n = 0; n < 3; n++) {
		const phase =
			weight * henyeyGreenstein(cosTheta, forward * b) +
			(1 - weight) * henyeyGreenstein(cosTheta, back * b);
		sum += a * phase * Math.exp(-tau * c);
		a *= 0.5;
		b *= 0.5;
		c *= 0.5;
	}
	return sum;
}

/** Radiance of a deep cloud interior in units of a white Lambert surface lit by the sun (multiple scattering makes thick cloud near-isotropic). */
export const CLOUD_FILL = 0.22;

/**
 * Diffuse fill from multiple scattering, in the same units: `CLOUD_FILL` at the sunlit top, falling to
 * 60 % of that where the beam toward the sun is fully spent (`tau` large), and a little brighter high in
 * the slab where more of the cloud sees the sky (`h` 0..1).
 */
export function cloudFill(tau: number, h: number): number {
	return CLOUD_FILL * (0.7 + 0.3 * clamp01(h)) * (0.6 + 0.4 * Math.exp(-0.35 * tau));
}

/** The sun-ward peak of the phase function is capped (in units of an isotropic phase): above it the cloud edges around the sun would bloom over the whole frame. */
export const CLOUD_GAIN_CAP = 1.6;

/** `4 pi * multiScatter`, capped: 1 is what an isotropic cloud would send. */
export const scatterGain = (tau: number, cosTheta: number): number =>
	Math.min(4 * Math.PI * multiScatter(tau, cosTheta), CLOUD_GAIN_CAP);

/** Radiance (white-Lambert units times the sun's irradiance) at which a cloud's brightness is rolled off, so a sun-lit top near the sun does not bloom over the frame. */
export const CLOUD_RADIANCE_KNEE = 3;

/** Soft roll-off x / (1 + x / knee): linear near 0, never above the knee. */
export const rollOff = (x: number, knee = CLOUD_RADIANCE_KNEE): number => x / (1 + x / knee);

/**
 * Ambient-occlusion stand-in for the billows: a sample where the noise is low sits in a cavity between
 * puffs and sees less sky and less sun, one where it is high sits on a bulge. Multiplies the light of a sample.
 */
export function billowShade(e: number): number {
	return 0.6 + 0.4 * smoothstep(0.2, 0.8, e);
}

/** The extra brightness of thin edges seen away from the sun (Schneider's "powder"), 0..1 where 1 = none. */
export function powder(localTau: number, cosTheta: number): number {
	const p = 1 - Math.exp(-2 * localTau);
	// facing the sun the effect fades out: the edges there are bright, not dark
	return 1 + (p - 1) * 0.6 * (0.5 - 0.5 * cosTheta);
}

/**
 * Optical depth from height `h` (0..1 in the slab) toward the sun along the vertical slant `1 / mu`,
 * from three samples of the profile (the same three the shader takes). `mu` is the sun's cosine against the
 * local vertical and is floored so a grazing sun does not turn the slab black.
 */
export function sunOpticalDepth(h: number, cover: number, mu: number): number {
	const m = Math.max(mu, CLOUD_SUN_MU_MIN);
	let sum = 0;
	for (let i = 1; i <= 3; i++) sum += heightProfile(h + ((1 - h) * i) / 3.5, cover);
	return (CLOUD_SUN_BULK * CLOUD_SIGMA * cover * (CLOUD_THICKNESS * (1 - h)) * sum) / (3 * m);
}

export interface Interval {
	t0: number;
	t1: number;
}

/** Near and far roots of a ray from radius `r0` with cosine `mu` against the radial and a sphere `rs`, or null. */
function sphereRoots(r0: number, mu: number, rs: number): Interval | null {
	const b = r0 * mu;
	const disc = b * b - r0 * r0 + rs * rs;
	if (disc < 0) return null;
	const s = Math.sqrt(disc);
	return { t0: -b - s, t1: -b + s };
}

/**
 * The stretch of a ray inside the slab between radii `rBase` and `rTop` (`r0` the camera radius, `mu`
 * the ray's cosine against the radial), clipped to `tMax` (a ground hit) and to the camera, or null.
 * Of the up to two stretches a ray can have (it dips out of the slab through the empty air of a
 * horizon-grazing path) the nearer is returned.
 */
export function slabInterval(
	r0: number,
	mu: number,
	rBase: number,
	rTop: number,
	tMax = Number.POSITIVE_INFINITY
): Interval | null {
	const outer = sphereRoots(r0, mu, rTop);
	if (!outer || outer.t1 <= 0) return null;
	const inner = sphereRoots(r0, mu, rBase);
	let t0 = Math.max(outer.t0, 0);
	let t1 = outer.t1;
	if (inner && inner.t1 > 0) {
		if (r0 <= rBase) {
			// below the slab: it begins where the ray leaves the base sphere
			t0 = Math.max(inner.t1, 0);
		} else if (inner.t0 > t0) {
			// above the base sphere: the slab ends where the ray enters it (the far stretch is not marched)
			t1 = Math.min(t1, inner.t0);
		} else {
			// inside the base sphere's shadow cone but entering from above: nothing nearer than the far wall
			t0 = Math.max(t0, inner.t1);
		}
	}
	t1 = Math.min(t1, tMax);
	return t1 > t0 ? { t0, t1 } : null;
}

/** One marched sample: density (0..1), the radiance scattered toward the camera per unit of in-scatter. */
export interface SlabSample {
	density: number;
	/** Radiance the sample sends to the camera when fully lit (before its own extinction), W/m2/sr-ish units of the pass. */
	light: number;
}

/**
 * Analytic integration of the samples along a ray (Toft et al.: the transmittance and the light of a
 * step are integrated over the step, so the result does not depend on the step length). `dt` is the
 * length of each step in metres and `extra` an optical depth added after the last step (the rest of
 * a grazing path). Returns the opacity and the premultiplied radiance.
 */
export function marchSlab(
	samples: readonly SlabSample[],
	dt: number,
	extra = 0
): { alpha: number; radiance: number } {
	let transmittance = 1;
	let radiance = 0;
	for (const s of samples) {
		const tau = s.density * CLOUD_SIGMA * dt;
		const step = 1 - Math.exp(-tau);
		radiance += transmittance * s.light * step;
		transmittance *= 1 - step;
	}
	transmittance *= Math.exp(-extra);
	return { alpha: 1 - transmittance, radiance };
}

/** Width of the start jitter in steps: the offset spans a quarter step either side of the step centre (half a step of noise, which the eye and the bloom average out). */
export const JITTER_SPAN = 0.5;

/**
 * Fraction (0..1) of the step added to a ray's start so neighbouring pixels sample different depths;
 * `u` is interleaved gradient noise in 0..1; the offset is centred, so the average over `u` is the
 * unjittered march.
 */
export const startOffset = (u: number, dt: number): number => (clamp01(u) - 0.5) * JITTER_SPAN * dt;
