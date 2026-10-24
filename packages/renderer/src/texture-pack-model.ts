/**
 * Textures packed together so no pipeline passes WebGPU's 16 sampled textures a stage (plan 412,
 * ADR 0365): the numbers the TSL passes and the tests share. Two packs:
 * - the sky's transmittance table (256 x 64) and multiple-scattering table (32 x 64) side by side in
 *   one 288 x 64 texture, the same height so a viewport is a column range only;
 * - the terrain's fine and mid patches in one texture two patches wide, the fine one on the left.
 */
export const LUT_TRANS = { w: 256, h: 64 } as const;
export const LUT_MS = { w: 32, h: 64 } as const;
export const LUT_PACK = { w: LUT_TRANS.w + LUT_MS.w, h: LUT_TRANS.h } as const;

/** A texel-centred coordinate in a table of `size` texels: u in [0, 1] to [0.5, size - 0.5] / size. */
export const toTexel = (x: number, size: number): number => x * (1 - 1 / size) + 0.5 / size;

/** The pack's u for a table-local `u` (0 to 1 over the table's own width): the transmittance on the left, the scattering on the right. */
export const packU = (table: 'trans' | 'ms', u: number): number =>
	table === 'trans'
		? (toTexel(u, LUT_TRANS.w) * LUT_TRANS.w) / LUT_PACK.w
		: (toTexel(u, LUT_MS.w) * LUT_MS.w + LUT_TRANS.w) / LUT_PACK.w;

/** The patch pair's u for a patch-local `u` in [0, 1] and the half (0 fine, 1 mid). */
export const patchPairU = (u: number, half: 0 | 1): number => (u + half) / 2;

/**
 * Pipelines may sample at most this many textures a stage: 16 is the limit, one is kept free for the
 * next look (the probe `apps/web/scripts/probe-textures.ts --gate` fails above it).
 */
export const SAMPLED_TEXTURE_LIMIT = 16;
export const SAMPLED_TEXTURE_BUDGET = 15;
