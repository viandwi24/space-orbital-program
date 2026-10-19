/** Plan 212 (ADR 0204 points 1 and 2): air temperature curves, density and the speed of sound. */
import { describe, expect, test } from 'bun:test';
import type { BodyDefinition } from '@orbital/core';
import { HomeBody } from '@orbital/mod-stock';
import { SolEarth } from '@orbital/mod-sol';
import { ambientAt, temperatureAt } from '../src/atmosphere.ts';
import { AIR_GAS_CONSTANT, AIR_TEMPERATURE } from '../src/constants.ts';

const flat: BodyDefinition = {
	...HomeBody,
	atmosphere: { scaleHeight: 5_600, surfacePressure: 101_325, height: 70_000 }
};

describe('atmosphere temperature (plan 212)', () => {
	test('with no curve the density is the isothermal one of before, to 1e-9', () => {
		for (const h of [0, 1_000, 12_345, 40_000, 69_999]) {
			const before = (101_325 * Math.exp(-h / 5_600)) / (AIR_GAS_CONSTANT * AIR_TEMPERATURE);
			expect(Math.abs(ambientAt(flat, h).density - before)).toBeLessThan(1e-9);
		}
		expect(ambientAt(flat, 0).temperature).toBe(AIR_TEMPERATURE);
	});

	test('the stock curve: sound at 340 ± 2 m/s at sea level and 295 ± 3 m/s at 11 km', () => {
		expect(Math.abs(ambientAt(HomeBody, 0).speedOfSound! - 340)).toBeLessThanOrEqual(2);
		expect(Math.abs(ambientAt(HomeBody, 11_000).speedOfSound! - 295)).toBeLessThanOrEqual(3);
		// colder air is denser at the same pressure
		const h = 11_000;
		expect(ambientAt(HomeBody, h).density).toBeGreaterThan(ambientAt(flat, h).density);
		expect(ambientAt(HomeBody, h).pressure).toBe(ambientAt(flat, h).pressure);
	});

	test('the curve is linear between keys and held beyond them; vacuum has no sound', () => {
		const atmo = {
			temperatureCurve: [
				[0, 300],
				[1_000, 200]
			] as Array<[number, number]>
		};
		expect(temperatureAt(atmo, 500)).toBe(250);
		expect(temperatureAt(atmo, -50)).toBe(300);
		expect(temperatureAt(atmo, 5_000)).toBe(200);
		expect(ambientAt(HomeBody, 80_000).speedOfSound).toBeUndefined();
		expect(SolEarth.atmosphere!.temperatureCurve!.length).toBeGreaterThan(5);
		expect(Math.abs(ambientAt(SolEarth, 0).speedOfSound! - 340)).toBeLessThanOrEqual(2);
	});
});
