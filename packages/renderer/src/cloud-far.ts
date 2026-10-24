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
	/** The baked coverage at which a cloud starts and is full. */
	coverFrom: 0.12,
	coverTo: 0.62,
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
