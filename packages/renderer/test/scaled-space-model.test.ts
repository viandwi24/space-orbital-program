/** The scaled-space bake's size and memory by preset (plan 403, ADR 0306, ADR 0344). */
import { describe, expect, test } from 'bun:test';
import { PRESETS } from '../src/presets.ts';
import { scaledAtlasSize, scaledSpaceBytes, scaledSpaceSize } from '../src/scaled-space-model.ts';

describe('the home planet bake', () => {
	test('faces are 512, 1024 and 2048 on low, medium and high', () => {
		expect(scaledSpaceSize(PRESETS.low)).toBe(512);
		expect(scaledSpaceSize(PRESETS.medium)).toBe(1024);
		expect(scaledSpaceSize(PRESETS.high)).toBe(2048);
	});

	test('the memory grows with the face and high stays under 300 MB for both maps', () => {
		const mb = (n: number) => n / 1_048_576;
		expect(mb(scaledSpaceBytes(512))).toBeCloseTo(16, 0);
		expect(mb(scaledSpaceBytes(2048))).toBeLessThan(300);
		expect(scaledSpaceBytes(2048)).toBeGreaterThan(scaledSpaceBytes(1024));
	});

	test('the WebGPU atlas of a 2048 face fits the 8192 texel limit every adapter has', () => {
		const a = scaledAtlasSize(2048);
		expect(a.width).toBeLessThanOrEqual(8192);
		expect(a.height).toBeLessThanOrEqual(8192);
	});
});
