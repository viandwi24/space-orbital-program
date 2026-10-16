import { describe, expect, test } from 'bun:test';
import {
	eccentricToMean,
	eccentricToTrue,
	hyperbolicToMean,
	hyperbolicToTrue,
	KEPLER_MAX_NEWTON_ITERATIONS,
	KeplerError,
	meanToTrue,
	solveKeplerDetailed,
	trueToEccentric,
	trueToHyperbolic,
	trueToMean,
	wrapPi,
	wrapTwoPi
} from '../src/index.ts';

const deg = Math.PI / 180;

describe('solveKepler — elliptic', () => {
	test('e = 0.999 converges by Newton in ≤ 20 iterations for 360 mean anomalies (residual < 1e-12)', () => {
		let worst = 0;
		for (let k = 0; k < 360; k++) {
			const M = k * deg;
			const s = solveKeplerDetailed(M, 0.999);
			expect(s.usedBisection).toBe(false);
			expect(s.iterations).toBeLessThanOrEqual(KEPLER_MAX_NEWTON_ITERATIONS);
			expect(Math.abs(wrapPi(eccentricToMean(s.anomaly, 0.999) - M))).toBeLessThan(1e-12);
			worst = Math.max(worst, s.iterations);
		}
		expect(worst).toBeLessThanOrEqual(20);
	});

	test.each([0, 0.1, 0.5, 0.9, 0.99, 0.999])(
		'e = %p converges across mean anomalies incl. multi-rev',
		(e) => {
			for (let k = -720; k <= 720; k += 7) {
				const M = k * deg + 1e-3;
				const s = solveKeplerDetailed(M, e);
				expect(s.usedBisection).toBe(false);
				expect(Math.abs(eccentricToMean(s.anomaly, e) - M)).toBeLessThan(1e-11);
			}
		}
	);
});

describe('solveKepler — hyperbolic', () => {
	test('e = 5 converges by Newton in ≤ 20 iterations for M ∈ [−100, 100] (relative residual < 1e-12)', () => {
		for (let k = -400; k <= 400; k++) {
			const M = k * 0.25;
			const s = solveKeplerDetailed(M, 5);
			expect(s.usedBisection).toBe(false);
			expect(s.iterations).toBeLessThanOrEqual(KEPLER_MAX_NEWTON_ITERATIONS);
			expect(Math.abs(hyperbolicToMean(s.anomaly, 5) - M)).toBeLessThan(
				1e-12 * Math.max(1, Math.abs(M))
			);
		}
	});

	test.each([1.01, 1.5, 2, 10])('e = %p converges in ≤ 20 iterations for M ∈ [−1e4, 1e4]', (e) => {
		for (const M of [-1e4, -300, -10, -1, -1e-3, 0, 1e-6, 0.5, 3, 50, 1e3, 1e4]) {
			const s = solveKeplerDetailed(M, e);
			expect(s.usedBisection).toBe(false);
			expect(Math.abs(hyperbolicToMean(s.anomaly, e) - M)).toBeLessThan(
				1e-11 * Math.max(1, Math.abs(M))
			);
		}
	});

	test('near-parabolic e throws KeplerError', () => {
		expect(() => solveKeplerDetailed(1, 1)).toThrow(KeplerError);
		expect(() => solveKeplerDetailed(1, 1 + 1e-9)).toThrow(KeplerError);
	});
});

describe('anomaly conversions', () => {
	test('true ↔ eccentric round-trip (e < 1)', () => {
		for (const e of [0, 0.3, 0.9, 0.999]) {
			for (let k = -179; k <= 179; k += 4) {
				const nu = k * deg;
				expect(eccentricToTrue(trueToEccentric(nu, e), e)).toBeCloseTo(nu, 12);
			}
		}
	});

	test('true ↔ hyperbolic round-trip inside the asymptotes, throws beyond', () => {
		for (const e of [1.2, 3, 10]) {
			const nuMax = Math.acos(-1 / e);
			for (let f = -0.99; f <= 0.99; f += 0.03) {
				const nu = f * nuMax;
				expect(hyperbolicToTrue(trueToHyperbolic(nu, e), e)).toBeCloseTo(nu, 10);
			}
			expect(() => trueToHyperbolic(nuMax + 1e-6, e)).toThrow(KeplerError);
		}
	});

	test('mean ↔ true round-trip for elliptic and hyperbolic', () => {
		for (const e of [0.2, 0.95, 2.5]) {
			for (const M of [-2, -0.3, 0, 0.7, 3]) {
				expect(trueToMean(meanToTrue(M, e), e)).toBeCloseTo(M, 11);
			}
		}
	});

	test('circular orbit: all anomalies coincide', () => {
		expect(meanToTrue(1.234, 0)).toBeCloseTo(1.234, 15);
	});

	test('wrap helpers', () => {
		expect(wrapTwoPi(-0.5)).toBeCloseTo(2 * Math.PI - 0.5, 15);
		expect(wrapTwoPi(7 * Math.PI)).toBeCloseTo(Math.PI, 12);
		expect(wrapPi(1.5 * Math.PI)).toBeCloseTo(-0.5 * Math.PI, 15);
		expect(wrapPi(Math.PI)).toBeCloseTo(Math.PI, 15);
	});
});
