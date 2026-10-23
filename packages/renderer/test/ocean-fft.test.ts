/** Plan 401: the CPU reference of the ocean's FFT. */
import { describe, expect, test } from 'bun:test';
import {
	evolve,
	expectedEnergy,
	ifft2d,
	initialSpectrum,
	oceanHeights,
	spectrumEnergy,
	type OceanParams
} from '../src/ocean-fft.ts';

const base: OceanParams = {
	n: 64,
	size: 200,
	windSpeed: 12,
	windDirection: 0.4,
	seed: 7
};

describe('ocean spectrum (plan 401)', () => {
	test('is deterministic for a seed and differs between seeds', () => {
		const a = initialSpectrum(base);
		const b = initialSpectrum(base);
		expect(Array.from(a.re.slice(0, 200))).toEqual(Array.from(b.re.slice(0, 200)));
		const c = initialSpectrum({ ...base, seed: 8 });
		expect(Array.from(c.re.slice(0, 200))).not.toEqual(Array.from(a.re.slice(0, 200)));
	});

	test('its energy matches the wind within 5 %, and grows with the wind speed', () => {
		const energy = (windSpeed: number, seed: number) => {
			const p = { ...base, windSpeed, seed };
			return { got: spectrumEnergy(initialSpectrum(p)), want: expectedEnergy(p) };
		};
		for (const [v, seed] of [
			[8, 1],
			[12, 7],
			[16, 3],
			[24, 5]
		] as const) {
			const { got, want } = energy(v, seed);
			expect(Math.abs(got / want - 1)).toBeLessThan(0.05);
		}
		expect(energy(24, 5).want).toBeGreaterThan(4 * energy(12, 5).want);
	});

	test('a 64² inverse FFT of a single mode returns that mode', () => {
		const n = 64;
		const f = { re: new Float64Array(n * n), im: new Float64Array(n * n) };
		// one mode at (kx, ky) = (3, 2): a unit complex exponential
		f.re[2 * n + 3] = 1;
		ifft2d(f, n);
		for (const [x, y] of [
			[0, 0],
			[5, 9],
			[17, 40],
			[63, 63]
		] as const) {
			const phase = (2 * Math.PI * (3 * x + 2 * y)) / n;
			expect(f.re[y * n + x]).toBeCloseTo(Math.cos(phase), 9);
			expect(f.im[y * n + x]).toBeCloseTo(Math.sin(phase), 9);
		}
	});

	test('the evolved field is real and moves with time', () => {
		const p = { ...base, n: 32 };
		const h0 = initialSpectrum(p);
		const f = ifft2d(evolve(h0, p, 3.5), p.n);
		let imag = 0;
		let real = 0;
		for (let i = 0; i < f.re.length; i++) {
			imag = Math.max(imag, Math.abs(f.im[i]!));
			real = Math.max(real, Math.abs(f.re[i]!));
		}
		expect(imag).toBeLessThan(1e-9 * Math.max(1, real));
		const a = oceanHeights(h0, p, 0);
		const b = oceanHeights(h0, p, 2);
		expect(Array.from(a.slice(0, 50))).not.toEqual(Array.from(b.slice(0, 50)));
	});
});
