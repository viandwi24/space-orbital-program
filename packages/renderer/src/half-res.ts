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
 * Side of the planet pass's target relative to the scene target's for a pixel budget (plan 252, ADR
 * 0228): the largest scale in [`HALF_PLANET_SCALE`, 1] whose area, `width * height * scale^2`, is within
 * `budget` pixels. 1 when the target already fits (and when the scale would be too close to 1 to repay
 * the upsample: above `BUDGET_FULL_ABOVE`), `HALF_PLANET_SCALE` as the floor. 1 without a budget.
 */
export const BUDGET_FULL_ABOVE = 0.9;
export function budgetScale(width: number, height: number, budget: number): number {
	if (!(budget > 0) || !(width > 0) || !(height > 0)) return 1;
	const fit = Math.sqrt(budget / (width * height));
	if (fit >= BUDGET_FULL_ABOVE) return 1;
	// steps of 0.05, rounded down so the area stays within the budget
	return Math.max(HALF_PLANET_SCALE, Math.floor(fit * 20) / 20);
}

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

/**
 * Edge pixels (plan 056, ADR 0087): where the four half-resolution texels around a full-resolution pixel disagree, the planet
 * pass is drawn again at full resolution for that pixel alone, so a ridge line and the rim of a cloud keep the sharpness of the
 * full-resolution picture instead of the 2 x 2 steps of the half-resolution one. A pixel is an edge when
 * (a) the depths of the four texels are not all within `EDGE_DEPTH_OCTAVES` octaves of the nearest texel's (ground against sky, a ridge
 * against its valley), or (b) all four are sky and their chroma (`edgeChroma`: how blue) differs by more than `EDGE_CHROMA` (the rim of a cloud:
 * sky has no depth edge; the brightness inside a cloud varies with the jitter of its march and would mark the whole cloud, and ground texture
 * would mark the whole ground, so neither is tested).
 */
export const EDGE_DEPTH_OCTAVES = 0.3;
/** Fragment depth at and above which a texel is sky (the pass writes exactly 1 there). */
export const SKY_DEPTH = 0.9999;
export const EDGE_CHROMA = 0.12;

export interface HalfTexel {
	/** The fragment depth the pass wrote (alpha of the half-resolution target). */
	depth: number;
	/** `edgeChroma` of the texel's radiance. */
	chroma: number;
}

/** How blue a radiance is, `(b - r) / (b + r)`: about 0.2 to 0.4 for the sky, near 0 for a white cloud, negative for one lit orange at sunset. */
export function edgeChroma(r: number, b: number): number {
	return (b - r) / Math.max(b + r, 1e-6);
}

/** `texels` ordered (x0 y0), (x1 y0), (x0 y1), (x1 y1) as for `upsampleWeights`; `fx`, `fy` pick the nearest as there. */
export function isEdgePixel(
	fx: number,
	fy: number,
	texels: readonly [HalfTexel, HalfTexel, HalfTexel, HalfTexel],
	far: number
): boolean {
	const nearest = (fx >= 0.5 ? 1 : 0) + (fy >= 0.5 ? 2 : 0);
	const reference = texels[nearest]!.depth;
	let allSky = true;
	let lo = Infinity;
	let hi = -Infinity;
	for (const t of texels) {
		if (depthOctaves(t.depth, reference, far) > EDGE_DEPTH_OCTAVES) return true;
		if (t.depth < SKY_DEPTH) allSky = false;
		lo = Math.min(lo, t.chroma);
		hi = Math.max(hi, t.chroma);
	}
	return allSky && hi - lo > EDGE_CHROMA;
}
