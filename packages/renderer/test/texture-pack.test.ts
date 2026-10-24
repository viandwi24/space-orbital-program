/** Plan 412 (ADR 0365): the packed textures keep every sample inside its own table or patch. */
import { describe, expect, test } from 'bun:test';
import {
	LUT_MS,
	LUT_PACK,
	LUT_TRANS,
	SAMPLED_TEXTURE_BUDGET,
	SAMPLED_TEXTURE_LIMIT,
	packU,
	patchPairU
} from '../src/texture-pack-model.ts';

describe('the sky tables in one texture', () => {
	test('are the same height, so a bake is a column range of the pack and nothing else', () => {
		expect(LUT_MS.h).toBe(LUT_TRANS.h);
		expect(LUT_PACK.h).toBe(LUT_TRANS.h);
		expect(LUT_PACK.w).toBe(LUT_TRANS.w + LUT_MS.w);
	});
	test('every lookup lands on a texel centre of its own table, so a linear filter never reaches the other', () => {
		const px = (u: number) => u * LUT_PACK.w;
		for (const u of [0, 0.25, 0.5, 1]) {
			expect(px(packU('trans', u))).toBeGreaterThanOrEqual(0.5);
			expect(px(packU('trans', u))).toBeLessThanOrEqual(LUT_TRANS.w - 0.5);
			expect(px(packU('ms', u))).toBeGreaterThanOrEqual(LUT_TRANS.w + 0.5);
			expect(px(packU('ms', u))).toBeLessThanOrEqual(LUT_PACK.w - 0.5);
		}
	});
});

describe('the terrain patches in one texture', () => {
	test('the fine patch is the left half and the mid patch the right', () => {
		expect(patchPairU(0, 0)).toBe(0);
		expect(patchPairU(1, 0)).toBe(0.5);
		expect(patchPairU(0, 1)).toBe(0.5);
		expect(patchPairU(1, 1)).toBe(1);
	});
});

describe('the budget', () => {
	test('keeps one texture free under the limit', () => {
		expect(SAMPLED_TEXTURE_LIMIT - SAMPLED_TEXTURE_BUDGET).toBe(1);
	});
});
