import { describe, expect, test } from 'bun:test';
import {
	DETAIL_LAYERS,
	WAVES,
	WAVE_GRAVITY,
	WAVE_PERIOD,
	detailFade,
	detailSlopeAt,
	reflectOffSea,
	seaHeight,
	waveNumber,
	waveOmega,
	waveSpeed,
	waveSteepness,
	wavesResolvedAt
} from '../src/water-model.ts';

describe('ocean waves', () => {
	test('every component obeys the deep-water dispersion relation within the rounding to a whole period', () => {
		for (const w of WAVES) {
			const exact = Math.sqrt(WAVE_GRAVITY * waveNumber(w.wavelength));
			const omega = waveOmega(w.wavelength);
			// rounding to a whole number of cycles per period moves omega by at most half a cycle (or to the minimum of one)
			const step = (2 * Math.PI) / WAVE_PERIOD;
			expect(Math.abs(omega - exact)).toBeLessThanOrEqual(step / 2 + 1e-9);
			// the phase speed is sqrt(g lambda / 2 pi) = omega / k for the exact value
			expect(waveSpeed(w.wavelength)).toBeCloseTo(exact / waveNumber(w.wavelength), 9);
		}
		// longer waves travel faster
		for (let i = 1; i < WAVES.length; i++) {
			expect(waveSpeed(WAVES[i - 1]!.wavelength)).toBeGreaterThan(waveSpeed(WAVES[i]!.wavelength));
		}
	});

	test('the summed amplitude and steepness are bounded', () => {
		const amplitude = WAVES.reduce((s, w) => s + w.amplitude, 0);
		expect(amplitude).toBeLessThan(3.5);
		let slope = 0;
		for (const w of WAVES) {
			expect(waveSteepness(w)).toBeLessThan(0.12);
			slope += waveSteepness(w);
		}
		expect(slope).toBeLessThan(0.7);
	});

	test('directions are inside half a radian-turn of the wind and wavelengths are listed largest first', () => {
		for (const w of WAVES) expect(Math.abs(w.direction)).toBeLessThan(1.2);
		for (let i = 1; i < WAVES.length; i++) {
			expect(WAVES[i]!.wavelength).toBeLessThan(WAVES[i - 1]!.wavelength);
		}
	});

	test('the sea is periodic in time and deterministic', () => {
		for (const [x, y] of [
			[0, 0],
			[13.7, -4.2],
			[250, 90]
		] as const) {
			for (const t of [0, 3.3, 41.9]) {
				expect(seaHeight(x, y, t + WAVE_PERIOD)).toBeCloseTo(seaHeight(x, y, t), 9);
				expect(seaHeight(x, y, t)).toBe(seaHeight(x, y, t));
			}
		}
		// and it actually moves
		expect(Math.abs(seaHeight(10, 5, 0) - seaHeight(10, 5, 2))).toBeGreaterThan(0.01);
	});

	test('the height never exceeds the summed amplitudes', () => {
		const max = WAVES.reduce((s, w) => s + w.amplitude, 0);
		for (let i = 0; i < 2000; i++) {
			expect(Math.abs(seaHeight(i * 1.37, i * 0.61, i * 0.13))).toBeLessThanOrEqual(max + 1e-9);
		}
	});

	test('fewer components are kept as the pixel footprint grows', () => {
		let last = WAVES.length + 1;
		for (const fp of [0.05, 0.3, 1, 4, 20, 50]) {
			const n = wavesResolvedAt(fp);
			expect(n).toBeLessThanOrEqual(last);
			last = n;
		}
		expect(wavesResolvedAt(0.05)).toBe(WAVES.length);
		expect(wavesResolvedAt(50)).toBe(0);
	});
});

describe('the sea detail and its reflection (plan 401)', () => {
	test('the detail normals fade to the analytic normal as the footprint grows', () => {
		expect(detailSlopeAt(0.05)).toBeCloseTo(
			DETAIL_LAYERS.reduce((a, d) => a + d.slope, 0),
			12
		);
		let last = Infinity;
		for (const fp of [0.05, 0.2, 0.5, 1, 2, 4, 8, 50]) {
			const s = detailSlopeAt(fp);
			expect(s).toBeLessThanOrEqual(last);
			last = s;
		}
		expect(detailSlopeAt(8)).toBe(0);
		// each layer is gone once a wavelength spans three pixels
		for (const d of DETAIL_LAYERS) {
			expect(detailFade(d.lambda, d.lambda / 3)).toBe(0);
			expect(detailFade(d.lambda, d.lambda / 6)).toBe(1);
		}
	});

	test('a ray at the horizon reflects to the horizon on a flat sea', () => {
		const up: [number, number, number] = [0, 1, 0];
		// a grazing ray down onto the sea leaves as a grazing ray up
		const r = reflectOffSea([Math.cos(0.01), -Math.sin(0.01), 0], up);
		expect(r[0]).toBeCloseTo(Math.cos(0.01), 12);
		expect(r[1]).toBeCloseTo(Math.sin(0.01), 12);
		// looking straight down reflects straight up
		expect(reflectOffSea([0, -1, 0], up)).toEqual([0, 1, 0]);
		// the length is kept
		const q = reflectOffSea([0.3, -0.5, 0.8], up);
		expect(Math.hypot(...q)).toBeCloseTo(Math.hypot(0.3, 0.5, 0.8), 12);
	});
});
