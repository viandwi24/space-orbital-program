import { propagate, type OrbitalElements } from '@orbital/kepler';
import { describe, expect, it } from 'vitest';
import { bodyMu, orbitInfo } from './orbit-info';

const MU = 3.5316e12;
const R = 600_000;
const el: OrbitalElements = { a: 800_000, e: 0.25, i: 0.4, raan: 1, argp: 2, m0: 1.3, epoch: 100 };
const radius = (t: number): number => {
	const s = propagate(el, MU, t).r;
	return Math.hypot(s.x, s.y, s.z);
};

describe('orbitInfo', () => {
	const t = 250;
	const info = orbitInfo(el, MU, t, R);
	it('apsides are altitudes of a(1 -+ e)', () => {
		expect(info.periapsis).toBeCloseTo(600_000 - R, 6);
		expect(info.apoapsis).toBeCloseTo(1_000_000 - R, 6);
	});
	it('the times to the apsides land on the apsides when propagated with the kepler package', () => {
		expect(radius(t + info.timeToPeriapsis!)).toBeCloseTo(600_000, 3);
		expect(radius(t + info.timeToApoapsis!)).toBeCloseTo(1_000_000, 3);
		expect(info.timeToPeriapsis).toBeGreaterThanOrEqual(0);
		expect(info.timeToPeriapsis).toBeLessThan(info.period!);
	});
	it('hyperbolic: periapsis ahead only before the pass, no apoapsis or period', () => {
		const hyp: OrbitalElements = { ...el, a: -900_000, e: 1.5, m0: -2, epoch: 0 };
		const before = orbitInfo(hyp, MU, 0, R);
		expect(before.escape).toBe(true);
		expect(before.apoapsis).toBeUndefined();
		expect(before.timeToPeriapsis).toBeGreaterThan(0);
		expect(orbitInfo(hyp, MU, 1e6, R).timeToPeriapsis).toBeUndefined();
	});
	it('mu is G times the body mass', () => {
		expect(bodyMu({ mass: MU / 6.6743e-11 })).toBeCloseTo(MU, 0);
	});
});
