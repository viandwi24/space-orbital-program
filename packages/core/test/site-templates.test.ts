/** Site consequences (plan 092, ADR 0177 point 4). */
import { describe, expect, test } from 'bun:test';
import { siteConsequences, siteDistance } from '../src/index.ts';

const HOME = { radius: 600_000, rotationPeriod: 21_600 };
const SEED = 20261016;

describe('site consequences', () => {
	test('rotation boost is ω R cos φ within 1e-9 and the lowest inclination is |φ|', () => {
		const omega = (2 * Math.PI) / HOME.rotationPeriod;
		for (const lat of [0, 0.3, -0.7, 1.2]) {
			const c = siteConsequences({ latitude: lat, longitude: 0.1 }, HOME, SEED);
			expect(Math.abs(c.rotationBoost - omega * HOME.radius * Math.cos(lat))).toBeLessThan(1e-9);
			expect(c.minInclination).toBe(Math.abs(lat));
		}
		expect(siteConsequences({ latitude: 0, longitude: 0 }, HOME, SEED).rotationBoost).toBeCloseTo(
			174.53,
			2
		);
	});

	test('nearest other site and downrange classes', () => {
		const a = { latitude: 0, longitude: 0 };
		const b = { latitude: 0, longitude: 0.5 };
		expect(siteConsequences(a, HOME, SEED).nearestSite).toBeNull();
		expect(siteConsequences(a, HOME, SEED, [b]).nearestSite).toBeCloseTo(0.5 * HOME.radius, 6);
		expect(siteDistance(a, b, HOME.radius)).toBeCloseTo(300_000, 6);
		expect(['sea', 'land', 'mixed']).toContain(siteConsequences(a, HOME, SEED).downrange);
	});
});
