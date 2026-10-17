import { describe, expect, test } from 'bun:test';
import {
	BEACH_SLOPE,
	BREAKER_INDEX,
	SHORE_PERIOD,
	SHORE_WAVE_HEIGHT,
	breakDistance,
	crestProfile,
	crestSpacing,
	shoreOmega,
	surfFoam,
	surfPhase,
	swashOffset
} from '../src/shore-wave.ts';
import { WAVE_PERIOD } from '../src/water-model.ts';

describe('shore waves (plan 038)', () => {
	test('the breaker distance is height / (0.78 slope)', () => {
		expect(BREAKER_INDEX).toBe(0.78);
		expect(breakDistance(1)).toBeCloseTo(1 / (0.78 * BEACH_SLOPE), 12);
		expect(breakDistance(2, 0.05)).toBeCloseTo(2 / (0.78 * 0.05), 12);
		// a flatter beach breaks the same wave farther out
		expect(breakDistance(1, 0.02)).toBeGreaterThan(breakDistance(1, 0.04));
	});

	test('the swell period divides the clock the shader wraps at', () => {
		expect(WAVE_PERIOD / SHORE_PERIOD).toBeCloseTo(Math.round(WAVE_PERIOD / SHORE_PERIOD), 9);
		const a = surfPhase(40, 3);
		expect(surfPhase(40, 3 + WAVE_PERIOD) - a).toBeCloseTo(shoreOmega() * WAVE_PERIOD, 6);
		// the crest pattern repeats after one period
		expect(crestProfile(surfPhase(40, 3 + SHORE_PERIOD))).toBeCloseTo(crestProfile(a), 9);
	});

	test('the phase grows monotonically with distance and its crests crowd toward the shore', () => {
		let last = surfPhase(0.5, 0);
		for (let x = 1; x <= 400; x += 1) {
			const p = surfPhase(x, 0);
			expect(p).toBeGreaterThan(last);
			last = p;
		}
		// spacing shrinks toward the shore
		expect(crestSpacing(5)).toBeLessThan(crestSpacing(20));
		expect(crestSpacing(20)).toBeLessThan(crestSpacing(80));
		// spacing is the inverse of the phase gradient
		for (const x of [10, 40, 120]) {
			const dx = 0.01;
			const gradient = (surfPhase(x + dx, 0) - surfPhase(x - dx, 0)) / (2 * dx);
			expect(crestSpacing(x)).toBeCloseTo((2 * Math.PI) / gradient, 3);
		}
	});

	test('crests move shoreward in time: the crest at x moves to smaller x', () => {
		// find a crest near 60 m at t = 0 (phase a multiple of 2 pi) and follow it
		let x0 = 60;
		for (let i = 0; i < 200; i++) {
			const p = surfPhase(x0, 0);
			const k = Math.round(p / (2 * Math.PI)) * 2 * Math.PI;
			x0 -= (p - k) / 0.2;
			if (Math.abs(p - k) < 1e-9) break;
		}
		let x = x0;
		const crestPhase = surfPhase(x0, 0);
		for (let t = 0.1; t <= 3; t += 0.1) {
			// the same crest keeps its phase value, so it sits where phase(x, t) equals it again
			let lo = 0.6;
			let hi = x + 5;
			for (let i = 0; i < 60; i++) {
				const mid = (lo + hi) / 2;
				if (surfPhase(mid, t) < crestPhase) lo = mid;
				else hi = mid;
			}
			expect(lo).toBeLessThan(x + 1e-9);
			x = lo;
		}
		expect(x).toBeLessThan(x0 - 1);
	});

	test('swash stays within its amplitude and the crest profile is in 0..1 with a peak at 0', () => {
		const amplitude = (0.12 * SHORE_WAVE_HEIGHT) / BEACH_SLOPE;
		let reach = 0;
		for (let t = 0; t < SHORE_PERIOD * 3; t += 0.01)
			reach = Math.max(reach, Math.abs(swashOffset(t)));
		expect(reach).toBeLessThanOrEqual(amplitude * 1.35 + 1e-9);
		expect(reach).toBeGreaterThan(amplitude * 0.8);
		expect(crestProfile(0)).toBe(1);
		expect(crestProfile(Math.PI)).toBeCloseTo(0, 12);
		for (let p = -7; p < 7; p += 0.1) {
			expect(crestProfile(p)).toBeGreaterThanOrEqual(0);
			expect(crestProfile(p)).toBeLessThanOrEqual(1);
		}
	});

	test('surf foam: strong inside the breaker line, faint outside it, none without waves, and it moves', () => {
		const xb = breakDistance(SHORE_WAVE_HEIGHT);
		const inside: number[] = [];
		const outside: number[] = [];
		for (let t = 0; t < SHORE_PERIOD; t += 0.2) {
			for (let x = 2; x < xb * 0.8; x += 2) inside.push(surfFoam(x, t));
			for (let x = xb * 2; x < xb * 3; x += 2) outside.push(surfFoam(x, t));
		}
		const mean = (a: number[]): number => a.reduce((s, v) => s + v, 0) / a.length;
		expect(mean(inside)).toBeGreaterThan(3 * mean(outside));
		expect(Math.max(...outside)).toBeLessThan(0.2);
		expect(Math.max(...inside)).toBeGreaterThan(0.9);
		expect(surfFoam(10, 3, 0)).toBe(0);
		// the pattern changes with time
		expect(Math.abs(surfFoam(15, 0) - surfFoam(15, 0.9))).toBeGreaterThan(0.01);
		for (let x = -3; x < 200; x += 3) {
			const f = surfFoam(x, 1.3);
			expect(f).toBeGreaterThanOrEqual(0);
			expect(f).toBeLessThanOrEqual(1.0001);
		}
	});
});
