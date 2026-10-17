/** Plan 040 / ADR 0079: plasma blackout from the heating model's flux. */
import { describe, expect, test } from 'bun:test';
import {
	BLACKOUT_BADGE_LEVEL,
	BLACKOUT_FLUX_FULL,
	BLACKOUT_FLUX_START,
	PLASMA_FLUX_FULL,
	PLASMA_FLUX_START,
	PLASMA_NOSE_RADIUS,
	airDensity,
	blackoutLevel,
	blackoutLevelFromFlux,
	plasmaIntensity,
	stagnationFlux
} from '../src/effects/reentry.ts';

const AIR = { scaleHeight: 5_600, surfacePressure: 101_325, height: 70_000 };

describe('blackoutLevelFromFlux', () => {
	test('0 below the start, 1 at and above the full flux, smooth between', () => {
		expect(blackoutLevelFromFlux(0)).toBe(0);
		expect(blackoutLevelFromFlux(BLACKOUT_FLUX_START)).toBe(0);
		expect(blackoutLevelFromFlux(BLACKOUT_FLUX_FULL)).toBe(1);
		expect(blackoutLevelFromFlux(1e9)).toBe(1);
		expect(blackoutLevelFromFlux((BLACKOUT_FLUX_START + BLACKOUT_FLUX_FULL) / 2)).toBeCloseTo(
			0.5,
			9
		);
	});

	test('the signal goes after the glow starts and before the glow is full', () => {
		expect(BLACKOUT_FLUX_START).toBeGreaterThan(PLASMA_FLUX_START);
		expect(BLACKOUT_FLUX_START).toBeLessThan(BLACKOUT_FLUX_FULL);
	});
});

describe('blackoutLevel', () => {
	test('is the heating model flux (the same stagnation law the shell uses)', () => {
		const alt = 30_000;
		const speed = 2_600;
		const flux = stagnationFlux(airDensity(AIR, alt), PLASMA_NOSE_RADIUS, speed);
		expect(blackoutLevel(speed, alt, AIR)).toBe(blackoutLevelFromFlux(flux));
		// and the glow, from the same flux, is already visible where the signal starts to go
		if (blackoutLevel(speed, alt, AIR) > 0)
			expect(plasmaIntensity(speed, alt, AIR)).toBeGreaterThan(0);
	});

	test('none in vacuum or without an atmosphere, whatever the speed', () => {
		expect(blackoutLevel(11_000, 200_000, AIR)).toBe(0);
		expect(blackoutLevel(11_000, 10_000, undefined)).toBe(0);
		expect(blackoutLevel(7_800, 100_000, AIR)).toBe(0);
	});

	test('none when slow even in thick air', () => {
		expect(blackoutLevel(150, 0, AIR)).toBe(0);
		expect(blackoutLevel(800, 0, AIR)).toBe(0);
	});

	test('rises with speed at one altitude', () => {
		let last = -1;
		for (let v = 500; v <= 6_000; v += 250) {
			const l = blackoutLevel(v, 40_000, AIR);
			expect(l).toBeGreaterThanOrEqual(last);
			last = l;
		}
		expect(last).toBe(1);
	});

	test('has a window in altitude at one speed: none high up, some lower down, over the badge level in the thick of it', () => {
		const speed = 4_000;
		const levels = [90_000, 70_000, 50_000, 30_000, 10_000].map((h) =>
			blackoutLevel(speed, h, AIR)
		);
		expect(levels[0]).toBe(0);
		expect(Math.max(...levels)).toBeGreaterThan(BLACKOUT_BADGE_LEVEL);
		// monotone in density up to the cut: denser air, more flux
		for (let i = 1; i < levels.length; i++)
			expect(levels[i]!).toBeGreaterThanOrEqual(levels[i - 1]!);
	});

	test('an airspeed of zero or less, or NaN, is no blackout', () => {
		expect(blackoutLevel(0, 0, AIR)).toBe(0);
		expect(blackoutLevel(-5, 0, AIR)).toBe(0);
		expect(blackoutLevel(Number.NaN, 0, AIR)).toBe(0);
	});
});

describe('the glow at the speeds of the home body (ADR 0078)', () => {
	test('an orbital return at 2.3 km/s through 20 to 25 km glows clearly and is still visible at 30 km, and the glow starts before the signal goes', () => {
		for (const altitude of [20_000, 25_000]) {
			expect(plasmaIntensity(2_300, altitude, AIR)).toBeGreaterThan(0.4);
		}
		expect(plasmaIntensity(2_300, 30_000, AIR)).toBeGreaterThan(0.1);
		expect(PLASMA_FLUX_START).toBeLessThan(BLACKOUT_FLUX_START);
		expect(PLASMA_FLUX_FULL).toBeGreaterThan(BLACKOUT_FLUX_FULL);
		// a slow, sea-level flight does not glow
		expect(plasmaIntensity(250, 0, AIR)).toBe(0);
	});
});
