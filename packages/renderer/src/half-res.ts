/**
 * Half-resolution planet pass (plan 050, ADR 0061): the pure twin of the depth-aware upsample in
 * `shaders/upsample.glsl.ts`. The planet pass draws at half the side of the scene target into a float
 * target whose alpha holds the fragment depth (the log depth the pass writes); a full-resolution pass
 * then reads the four nearest texels of each pixel, weighs them bilinearly times a similarity of their
 * log depth to the nearest texel's, and writes the colour and the depth. The vessel, drawn afterwards
 * at full resolution, is depth-tested against that depth.
 */

/** Side of the planet pass's target relative to the scene target when the pass is on its half rung. */
export const HALF_PLANET_SCALE = 0.5;

/**
 * Two texels whose distance along the ray differs by more than about this many octaves (log2 of the
 * ratio) are not blended: 0.5 passes a ground plane seen at a grazing angle (about 0.26 per texel pair
 * ten texels under the horizon) and rejects a ridge against the valley behind it, or any ground
 * against the sky (log2 ratios of 1 and more).
 */
export const UPSAMPLE_TOLERANCE_OCTAVES = 0.5;

/**
 * The fragment depth the planet pass writes is `log2(1 + z) / log2(far + 1)`, so a difference of two
 * depths times `log2(far + 1)` is the number of octaves between their distances (up to the +1).
 */
export function depthOctaves(depthA: number, depthB: number, far: number): number {
	return Math.abs(depthA - depthB) * Math.log2(far + 1);
}

/** Weight of a texel that is `octaves` away in depth from the reference texel: 1 at 0, about 0 beyond the tolerance. */
export function depthSimilarity(octaves: number): number {
	const x = octaves / UPSAMPLE_TOLERANCE_OCTAVES;
	return Math.exp(-x * x);
}

/**
 * The four texels around a full-resolution pixel are ordered (x0 y0), (x1 y0), (x0 y1), (x1 y1);
 * `fx`, `fy` in [0, 1) are the pixel's position between texel centres. Returns weights summing to 1:
 * the bilinear weights times the similarity of each texel's depth to that of the nearest texel (the one
 * with the largest bilinear weight), so a smooth surface is filtered bilinearly and a depth edge is
 * never blended across. The nearest texel always keeps its own bilinear weight, so the sum is positive.
 */
export function upsampleWeights(
	fx: number,
	fy: number,
	depths: readonly [number, number, number, number],
	far: number
): [number, number, number, number] {
	const bilinear = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy] as const;
	const nearest = (fx >= 0.5 ? 1 : 0) + (fy >= 0.5 ? 2 : 0);
	const reference = depths[nearest]!;
	const w = bilinear.map((b, i) =>
		i === nearest ? b : b * depthSimilarity(depthOctaves(depths[i]!, reference, far))
	);
	const sum = w[0]! + w[1]! + w[2]! + w[3]!;
	return [w[0]! / sum, w[1]! / sum, w[2]! / sum, w[3]! / sum];
}
