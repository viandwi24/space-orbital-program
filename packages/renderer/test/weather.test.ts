/** Plan 397 (ADR 0341): the weather cover is deterministic, bounded, moves over a day, and rebakes rarely. */
import { describe, expect, test } from 'bun:test';
import {
	COVER_STEP,
	WEATHER_MEAN,
	quantizeCover,
	stepCover,
	weatherCover
} from '../src/weather.ts';

describe('weatherCover', () => {
	test('is the same for the same seed and time, and differs between worlds', () => {
		expect(weatherCover(1, 12345)).toBe(weatherCover(1, 12345));
		expect(weatherCover(1, 50_000)).not.toBe(weatherCover(2, 50_000));
	});
	test('stays inside its bounds and moves across a day', () => {
		let lo = 1;
		let hi = 0;
		for (let t = 0; t < 86_400 * 3; t += 600) {
			const c = weatherCover(7, t);
			expect(c).toBeGreaterThanOrEqual(0.05);
			expect(c).toBeLessThanOrEqual(0.9);
			lo = Math.min(lo, c);
			hi = Math.max(hi, c);
		}
		expect(hi - lo).toBeGreaterThan(0.15);
		expect(Math.abs((lo + hi) / 2 - WEATHER_MEAN)).toBeLessThan(0.15);
	});
	test('is continuous: ten minutes never move it by a step of the map', () => {
		for (let t = 0; t < 86_400; t += 600)
			expect(Math.abs(weatherCover(3, t + 600) - weatherCover(3, t))).toBeLessThan(COVER_STEP);
	});
});

describe('stepCover', () => {
	test('moves one step at a time, no more often than the hold, and stops at the target', () => {
		let state = { cover: 0.42, wait: 0 };
		const moves: number[] = [];
		for (let i = 0; i < 240; i++) {
			const next = stepCover(state.cover, 0.6, state.wait, 0.5);
			if (next.cover !== state.cover) moves.push(next.cover);
			state = next;
		}
		expect(moves.length).toBeGreaterThan(5);
		for (let i = 1; i < moves.length; i++)
			expect(Math.abs(moves[i]! - moves[i - 1]!)).toBeLessThanOrEqual(COVER_STEP + 1e-9);
		expect(state.cover).toBeCloseTo(0.6, 5);
		// 240 frames of 0.5 s = 120 s: at most one rebake per 8 s (each is a full-sphere noise bake)
		expect(moves.length).toBeLessThanOrEqual(16);
	});
	test('does not move for a target within half a step', () => {
		expect(stepCover(0.42, 0.425, 0, 1).cover).toBe(0.42);
		expect(quantizeCover(0.4249)).toBeCloseTo(0.42, 9);
	});
});

describe("weatherCover with a body's own look (plan 405)", () => {
	test('a higher mean is cloudier, a zero span is steady, and the bounds still hold', () => {
		expect(weatherCover(3, 99_000, { mean: 0.8, span: 0.1 })).toBeGreaterThan(
			weatherCover(3, 99_000, { mean: 0.2, span: 0.1 })
		);
		expect(weatherCover(3, 1, { mean: 0.5, span: 0 })).toBe(
			weatherCover(3, 777_777, { mean: 0.5, span: 0 })
		);
		for (let t = 0; t < 86_400 * 3; t += 3_600) {
			const c = weatherCover(5, t, { mean: 0.88, span: 0.4 });
			expect(c).toBeLessThanOrEqual(0.9);
			expect(c).toBeGreaterThanOrEqual(0.05);
		}
	});
});
