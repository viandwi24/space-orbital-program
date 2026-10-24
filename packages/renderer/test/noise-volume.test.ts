/** Plan 397: the baked noise volume tiles, is deterministic, and reads as value noise. */
import { describe, expect, test } from 'bun:test';
import { NOISE_CELLS, NOISE_SIZE, bakeNoiseVolume } from '../src/noise-volume.ts';

describe('bakeNoiseVolume', () => {
	const v = bakeNoiseVolume();
	const px = (x: number, y: number, z: number, c: number): number => {
		const m = (n: number): number => ((n % NOISE_SIZE) + NOISE_SIZE) % NOISE_SIZE;
		return v[((m(z) * NOISE_SIZE + m(y)) * NOISE_SIZE + m(x)) * 4 + c]!;
	};
	test('has two texels per cell and four bytes per texel', () => {
		expect(NOISE_SIZE).toBe(2 * NOISE_CELLS);
		expect(v.length).toBe(NOISE_SIZE ** 3 * 4);
	});
	test('is deterministic and each channel is spread over the range with a mean near a half', () => {
		expect(bakeNoiseVolume()[12345]).toBe(v[12345]!);
		for (let c = 0; c < 4; c++) {
			let sum = 0;
			let lo = 255;
			let hi = 0;
			for (let i = c; i < v.length; i += 4 * 97) {
				sum += v[i]!;
				lo = Math.min(lo, v[i]!);
				hi = Math.max(hi, v[i]!);
			}
			const n = Math.ceil((v.length - c) / (4 * 97));
			expect(Math.abs(sum / n / 255 - 0.5)).toBeLessThan(0.05);
			expect(lo).toBeLessThan(40);
			expect(hi).toBeGreaterThan(215);
		}
	});
	test('channels are independent', () => {
		let same = 0;
		for (let i = 0; i < 5000; i++) if (Math.abs(v[i * 4]! - v[i * 4 + 1]!) < 3) same++;
		expect(same).toBeLessThan(300);
	});
	test('the midpoint between two lattice texels is their mean, and the volume tiles', () => {
		for (const [x, y, z] of [
			[10, 4, 6],
			[0, 0, 0],
			[126, 20, 8]
		] as const) {
			const a = px(x, y, z, 1);
			const b = px(x + 2, y, z, 1);
			expect(Math.abs(px(x + 1, y, z, 1) - (a + b) / 2)).toBeLessThanOrEqual(1);
		}
		expect(px(NOISE_SIZE, 5, 7, 2)).toBe(px(0, 5, 7, 2));
		expect(px(-2, 5, 7, 2)).toBe(px(NOISE_SIZE - 2, 5, 7, 2));
	});
});

describe('the temporal cloud march (plan 397)', () => {
	test('half the steps under TAAU, all of them without it and on the first frame after a cut', async () => {
		const { cloudStepsFor } = await import('../src/tsl/planet-pass.ts');
		expect(cloudStepsFor(6, true, false)).toBe(3);
		expect(cloudStepsFor(4, true, false)).toBe(2);
		expect(cloudStepsFor(3, true, false)).toBe(2);
		expect(cloudStepsFor(2, true, false)).toBe(2);
		expect(cloudStepsFor(6, false, false)).toBe(6);
		expect(cloudStepsFor(6, true, true)).toBe(6);
	});
	test('the frame offsets cover the step evenly: every eighth of the interval is hit within 13 frames', async () => {
		const { cloudFrameOffset } = await import('../src/tsl/planet-pass.ts');
		const bins = new Set<number>();
		for (let f = 1; f <= 13; f++) bins.add(Math.floor(cloudFrameOffset(f) * 8));
		expect(bins.size).toBe(8);
	});
});
