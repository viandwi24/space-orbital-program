import { describe, expect, test } from 'bun:test';
import { DETAIL_SIZE, DETAIL_TILE, detailImage, detailTexel } from '../src/detail-textures.ts';

describe('ground detail maps (plan 364)', () => {
	test('every channel averages one half, so the mip tail leaves the albedo as it is', () => {
		const img = detailImage();
		expect(img.length).toBe(DETAIL_SIZE * DETAIL_SIZE * 4);
		const mean = [0, 0, 0, 0];
		for (let i = 0; i < img.length; i++) mean[i & 3]! += img[i]! / 255 / (DETAIL_SIZE * DETAIL_SIZE);
		for (const m of mean) expect(Math.abs(m - 0.5)).toBeLessThan(0.01);
	});

	test('the maps tile: opposite edges meet', () => {
		for (let k = 0; k < 64; k++) {
			const t = (k + 0.5) / 64;
			const a = detailTexel(0, t);
			const b = detailTexel(1, t);
			const c = detailTexel(t, 0);
			const d = detailTexel(t, 1);
			for (let ch = 0; ch < 4; ch++) {
				expect(a[ch]!).toBeCloseTo(b[ch]!, 5);
				expect(c[ch]!).toBeCloseTo(d[ch]!, 5);
			}
		}
	});

	test('deterministic, and each tile divides the noise anchor cell (1,024 m)', () => {
		expect(detailTexel(0.37, 0.81)).toEqual(detailTexel(0.37, 0.81));
		for (const m of Object.values(DETAIL_TILE)) expect(1024 % m).toBe(0);
	});
});
