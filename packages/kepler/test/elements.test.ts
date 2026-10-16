import { describe, expect, test } from 'bun:test';
import { apoapsis, isHyperbolic, periapsis, period, type OrbitalElements } from '../src/index.ts';
import { MU_EARTH } from './helpers.ts';

const base: OrbitalElements = { a: 1e7, e: 0.2, i: 0, raan: 0, argp: 0, m0: 0, epoch: 0 };

describe('element helpers', () => {
	test('apsides and period of an ellipse', () => {
		expect(periapsis(base)).toBeCloseTo(8e6, 6);
		expect(apoapsis(base)).toBeCloseTo(1.2e7, 6);
		expect(period(base, MU_EARTH)).toBeCloseTo(2 * Math.PI * Math.sqrt(1e21 / MU_EARTH), 9);
		expect(isHyperbolic(base)).toBe(false);
	});

	test('hyperbola: a < 0, finite periapsis, infinite apoapsis and period', () => {
		const h = { ...base, a: -1e7, e: 1.5 };
		expect(isHyperbolic(h)).toBe(true);
		expect(periapsis(h)).toBeCloseTo(5e6, 6);
		expect(apoapsis(h)).toBe(Infinity);
		expect(period(h, MU_EARTH)).toBe(Infinity);
	});
});
