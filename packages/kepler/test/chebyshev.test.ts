/** Plan 125 / ADR 0122 point 1: Chebyshev records, against an orbit they were fitted to. */
import { describe, expect, test } from 'bun:test';
import { chebyshevState, fitChebyshev, propagate, recordAt } from '../src/index.ts';

const MU = 1.32712440018e20;
const el = { a: 1.4959787e11, e: 0.0167, i: 0.4, raan: 0.3, argp: 1.9, m0: 0.7, epoch: 0 };
const DAY = 86_400;

describe('Chebyshev records', () => {
	test('a 32-day record of 13 coefficients gives the orbit within 1 m and 1e-6 m/s', () => {
		const rec = fitChebyshev((t) => propagate(el, MU, t).r, 0, 32 * DAY, 13);
		for (let k = 0; k <= 64; k++) {
			const t = (k / 64) * 32 * DAY;
			const want = propagate(el, MU, t);
			const got = chebyshevState(rec, t);
			expect(Math.hypot(got.r.x - want.r.x, got.r.y - want.r.y, got.r.z - want.r.z)).toBeLessThan(
				1
			);
			expect(Math.hypot(got.v.x - want.v.x, got.v.y - want.v.y, got.v.z - want.v.z)).toBeLessThan(
				1e-6
			);
		}
	});
	test('the record of a time is found by binary search', () => {
		const recs = [0, 1, 2, 3].map((k) =>
			fitChebyshev((t) => propagate(el, MU, t).r, k * 10 * DAY, (k + 1) * 10 * DAY, 9)
		);
		expect(recordAt(recs, 25 * DAY)).toBe(recs[2]!);
		expect(recordAt(recs, 0)).toBe(recs[0]!);
		expect(recordAt(recs, 1e12)).toBe(recs[3]!);
	});
});
