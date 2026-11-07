/**
 * The far cloud shell (plan 403, ADR 0361): beyond the reach of the cumulus march (45 to 120 km from
 * the slab) the slab is drawn as one thin shell whose coverage is read from the baked cloud map, the
 * same map the shafts and the ground shadows read, so the weather of plan 397 shows from orbit and
 * the horizon keeps its clouds. The march fades out over the same distances the shell fades in, so
 * the sum of the two is steady. These are the numbers and the pure twins the shaders carry.
 */
export const CLOUD_FAR = {
	/** The shell takes over between these distances to the slab, m (where the march's mask fades out). */
	from: 45_000,
	to: 120_000,
	/** The baked density (the map's green: the density's own gradient, not the coverage's hard step) at which a cloud starts and is full (plan 416). */
	coverFrom: 0.05,
	coverTo: 0.75,
	/** The shell's greatest opacity. */
	opacity: 0.92,
	/** Share of the sun a cloud takes on its night side, the slope and the lift of the sun's height. */
	sunBase: 0.25,
	sunSlope: 1.6,
	sunLift: 0.25,
	/** The sky's ambient light on it. */
	ambient: 0.9
} as const;

/**
 * Relief of the shell (plan 416, owner's M5 test: the clouds lack detail from orbit). The coverage is read
 * from the baked map at a mip level that fits the pixel (no shimmer), a tiling detail noise of 53, 16 and
 * 5 km is added to it, and its gradient tilts the shell's normal so the sun side of a bank is brighter
 * and a bank shades the cloud behind it. Twin of the shaders' `shellHeight` and the lighting after it.
 * Lengths of the noise are in units of 16 km (`cloudDensityQ`'s lattice), so a frequency of 0.3 is 53 km.
 */
export const CLOUD_FAR_RELIEF = {
	/** Frequencies (per 16 km) and weights of the detail octaves, and how much of the coverage they move. */
	frequencies: [0.3, 1.0, 3.0] as readonly number[],
	weights: [0.5, 0.3, 0.2] as readonly number[],
	amplitude: 1.0,
	/** The detail only shapes a cloud near cloud: the map's density at this many more mip levels (a wide blur) gates it. */
	gateLods: 2,
	/** The share of the map's density in the height: the rest is the detail, so the noise shapes the edge and not only the map's steps. */
	mapShare: 0.7,
	/** The detail fades out where a pixel is wider than this (m), from `fadeFrom`: it would alias. */
	fadeFrom: 5_000,
	fadeTo: 14_000,
	/** The step (m) of the gradient taps, and the tilt a unit of coverage difference gives the normal. */
	stepM: 6_000,
	tilt: 2.5,
	/** How much the tilt's change of the sun's cosine moves the sun term, and its limits. */
	sunGain: 3.0,
	sunMin: 0.3,
	sunMax: 1.6,
	/** The shadow tap toward the sun (m) and its greatest share of the sun. */
	shadowStepM: 24_000,
	shadow: 0.7
} as const;

/** Mips softer than the pixel needs: the map's texels are 1.8 km and its edges are steps, so a finer level shows bilinear facets. */
export const CLOUD_MAP_LOD_BIAS = 2;

/** Mip level of the cloud map for a pixel of `footprintM` metres on a map whose texel is `texelM`: 0 to 6. */
export const cloudMapLod = (footprintM: number, texelM: number): number =>
	Math.min(
		6,
		Math.max(0, Math.log2(Math.max(footprintM, 1) / Math.max(texelM, 1)) + CLOUD_MAP_LOD_BIAS)
	);

/**
 * The shell's relevance gate (plan 403, owner's rule: a look draws only when the view needs it): below
 * `from` metres of camera altitude the near march is the cloud and the shell is off (the horizon keeps
 * the clouds it had before the shell); it fades in to full by `to`, where the camera is above the slab.
 */
export const CLOUD_FAR_GATE = { from: 12_000, to: 30_000 } as const;

const smooth = (a: number, b: number, x: number): number => {
	const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
	return t * t * (3 - 2 * t);
};

/** The shell's weight at a camera `altitude`, m: 0 near the ground, 1 high up and in orbit. */
export const farGate = (altitude: number): number =>
	smooth(CLOUD_FAR_GATE.from, CLOUD_FAR_GATE.to, altitude);

/** How far into the shell's range a slab at `distance` is: 0 inside the march, 1 beyond it. */
export const farBlend = (distance: number): number =>
	smooth(CLOUD_FAR.from, CLOUD_FAR.to, distance);

/** The shell's alpha for the baked `cover`, the weather `mask` (0..1) and the blend `farK`. */
export function cloudFarAlpha(cover: number, mask: number, farK: number): number {
	return smooth(CLOUD_FAR.coverFrom, CLOUD_FAR.coverTo, cover) * mask * farK * CLOUD_FAR.opacity;
}

/** The sun term of the shell's light from the sun's height over the cloud (`mu`, -1..1). */
export function cloudFarSun(mu: number): number {
	return (
		CLOUD_FAR.sunBase +
		(1 - CLOUD_FAR.sunBase) * Math.min(1, Math.max(0, mu * CLOUD_FAR.sunSlope + CLOUD_FAR.sunLift))
	);
}

/** The march's weight at `distance` times the weather mask, and the shell's: they sum to the mask. */
export function cloudWeights(distance: number, mask: number): { march: number; shell: number } {
	const k = farBlend(distance);
	return { march: mask * (1 - k), shell: mask * k };
}
