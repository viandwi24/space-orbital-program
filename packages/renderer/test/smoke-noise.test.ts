import { describe, expect, test } from 'bun:test';
import {
	SMOKE_NOISE_CELLS,
	SMOKE_NOISE_SIZE,
	bakeSmokeNoise,
	latticeHash,
	valueNoise
} from '../src/effects/smoke-noise.ts';

describe('smoke noise texture', () => {
	const texels = bakeSmokeNoise();
	const at = (i: number, j: number, c: number): number => {
		const n = SMOKE_NOISE_SIZE;
		return texels[((((j % n) + n) % n) * n + (((i % n) + n) % n)) * 4 + c]!;
	};

	test('the lattice repeats every SMOKE_NOISE_CELLS cells, so the texture tiles without a seam', () => {
		for (let k = 0; k < 20; k++) {
			expect(latticeHash(k, 3 * k)).toBe(
				latticeHash(k + SMOKE_NOISE_CELLS, 3 * k - SMOKE_NOISE_CELLS)
			);
		}
		expect(valueNoise(2.3, 5.7)).toBeCloseTo(valueNoise(2.3 + SMOKE_NOISE_CELLS, 5.7), 12);
		expect(valueNoise(2.3, 5.7)).toBeCloseTo(valueNoise(2.3, 5.7 - SMOKE_NOISE_CELLS), 12);
	});

	test('the hashes and the noise stay in 0 to 1, and the noise is the lattice value at lattice points', () => {
		for (let i = 0; i < SMOKE_NOISE_CELLS; i++) {
			for (let j = 0; j < SMOKE_NOISE_CELLS; j++) {
				const h = latticeHash(i, j);
				expect(h).toBeGreaterThanOrEqual(0);
				expect(h).toBeLessThan(1);
				expect(valueNoise(i, j)).toBeCloseTo(h, 12);
			}
		}
	});

	test('the hashes are spread (a flat lattice would make a flat puff)', () => {
		let sum = 0;
		let sq = 0;
		const n = SMOKE_NOISE_CELLS * SMOKE_NOISE_CELLS;
		for (let i = 0; i < SMOKE_NOISE_CELLS; i++)
			for (let j = 0; j < SMOKE_NOISE_CELLS; j++) {
				const h = latticeHash(i, j);
				sum += h;
				sq += h * h;
			}
		const mean = sum / n;
		expect(mean).toBeGreaterThan(0.35);
		expect(mean).toBeLessThan(0.65);
		expect(Math.sqrt(sq / n - mean * mean)).toBeGreaterThan(0.2);
	});

	test('a bilinear read of the baked texels matches the analytic noise within 0.02 (the shader reads texels, not the formula)', () => {
		const size = SMOKE_NOISE_SIZE;
		const scale = SMOKE_NOISE_CELLS / size;
		let worst = 0;
		for (let k = 0; k < 400; k++) {
			const x = ((k * 7.31) % SMOKE_NOISE_CELLS) + 0.013 * k;
			const y = ((k * 3.77) % SMOKE_NOISE_CELLS) + 0.007 * k;
			// texel centres sit at (i + 0.5) * scale; bilinear between the four around the point
			const u = x / scale - 0.5;
			const v = y / scale - 0.5;
			const i = Math.floor(u);
			const j = Math.floor(v);
			const fx = u - i;
			const fy = v - j;
			const bil =
				(at(i, j, 0) * (1 - fx) + at(i + 1, j, 0) * fx) * (1 - fy) +
				(at(i, j + 1, 0) * (1 - fx) + at(i + 1, j + 1, 0) * fx) * fy;
			const exact = valueNoise(x, y) * 255;
			worst = Math.max(worst, Math.abs(bil - exact) / 255);
		}
		expect(worst).toBeLessThan(0.02);
	});

	test('the three channels are different fields and alpha is opaque', () => {
		let diff = 0;
		for (let k = 0; k < 500; k++) {
			const o = k * 131 * 4;
			diff += Math.abs(texels[o]! - texels[o + 1]!) + Math.abs(texels[o + 1]! - texels[o + 2]!);
			expect(texels[o + 3]).toBe(255);
		}
		expect(diff / 500).toBeGreaterThan(30);
	});
});
