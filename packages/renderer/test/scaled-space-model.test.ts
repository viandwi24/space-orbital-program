/** The scaled-space bake's size and memory by preset (plan 403, ADR 0306, ADR 0344). */
import { describe, expect, test } from 'bun:test';
import { PRESETS } from '../src/presets.ts';
import { tierOf } from '../src/device-tier.ts';
import {
	scaledAtlasSize,
	scaledCapFor,
	scaledSpaceBytes,
	scaledSpaceCap,
	scaledSpaceSize,
	setScaledSpaceCap
} from '../src/scaled-space-model.ts';

describe('the home planet bake', () => {
	test('faces are 512, 1024 and 1536 on low, medium and high until the machine is known to pay for 2048', () => {
		expect(scaledSpaceCap()).toBe(1536);
		expect(scaledSpaceSize(PRESETS.low)).toBe(512);
		expect(scaledSpaceSize(PRESETS.medium)).toBe(1024);
		expect(scaledSpaceSize(PRESETS.high)).toBe(1536);
	});

	test('2048 is only for the M5-class tiers: not the base M2, a mid card or an integrated GPU', () => {
		const cap = (gpu: string, hz = 60) => scaledCapFor(tierOf(gpu), hz);
		expect(cap('apple m5 pro', 120)).toBe(2048);
		expect(cap('NVIDIA GeForce RTX 4070', 120)).toBe(2048);
		expect(cap('apple', 120)).toBe(2048); // Chrome hides the chip: a 120 Hz Mac
		expect(cap('apple', 60)).toBe(1536);
		expect(cap('apple m2')).toBe(1536);
		expect(cap('NVIDIA GeForce GTX 1650')).toBe(1536);
		expect(cap('Intel(R) Iris(R) Xe Graphics')).toBe(1536);
		setScaledSpaceCap(2048);
		expect(scaledSpaceSize(PRESETS.high)).toBe(2048);
		expect(scaledSpaceSize(PRESETS.medium)).toBe(1024);
		setScaledSpaceCap(1536);
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
