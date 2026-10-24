import { describe, expect, it } from 'vitest';
import { THUMB_HEIGHT, THUMB_WIDTH, thumbnailCrop } from './thumbnail';

describe('thumbnailCrop (plan 408)', () => {
	it('is the centred 16:9 box of a canvas, as large as fits', () => {
		const want = THUMB_WIDTH / THUMB_HEIGHT;
		for (const [w, h] of [
			[3024, 1890],
			[1920, 1080],
			[1000, 1000],
			[800, 1400]
		] as const) {
			const c = thumbnailCrop(w, h);
			expect(c.width / c.height).toBeCloseTo(want, 6);
			expect(c.x).toBeCloseTo((w - c.width) / 2, 6);
			expect(c.y).toBeCloseTo((h - c.height) / 2, 6);
			expect(c.width <= w + 1e-6 && c.height <= h + 1e-6).toBe(true);
			// as large as fits: it touches one side
			expect(Math.abs(c.width - w) < 1e-6 || Math.abs(c.height - h) < 1e-6).toBe(true);
		}
	});
});
