import { describe, expect, test } from 'bun:test';
import {
	cross,
	dot,
	fromStateVector,
	length,
	period,
	propagate,
	propagateUniversal,
	type OrbitalElements,
	type Vec3
} from '../src/index.ts';
import { createRng, MU_EARTH, randomBoundOrbit, relErr, uniform } from './helpers.ts';

const energy = (r: Vec3, v: Vec3, mu: number) => dot(v, v) / 2 - mu / length(r);

describe('propagate (elements, analytic)', () => {
	test('one full period returns to the start r within 1e-6 relative (500 random bound orbits)', () => {
		const rng = createRng(42);
		let worst = 0;
		for (let k = 0; k < 500; k++) {
			const el = randomBoundOrbit(rng, uniform(rng, 0, 1e5));
			const t0 = el.epoch + uniform(rng, -1e4, 1e4);
			const start = propagate(el, MU_EARTH, t0);
			const end = propagate(el, MU_EARTH, t0 + period(el, MU_EARTH));
			worst = Math.max(worst, relErr(end.r, start.r));
		}
		expect(worst).toBeLessThan(1e-6);
	});

	test('specific energy v²/2 − μ/|r| is constant within 1e-9 relative over 100 samples per period', () => {
		const rng = createRng(1234);
		let worst = 0;
		for (let k = 0; k < 50; k++) {
			const el = randomBoundOrbit(rng);
			const T = period(el, MU_EARTH);
			const ref = -MU_EARTH / (2 * el.a);
			for (let s = 0; s < 100; s++) {
				const { r, v } = propagate(el, MU_EARTH, (s / 100) * T);
				worst = Math.max(worst, Math.abs((energy(r, v, MU_EARTH) - ref) / ref));
			}
		}
		expect(worst).toBeLessThan(1e-9);
	});

	test('angular momentum is conserved and fromStateVector recovers the elements along the orbit', () => {
		const el: OrbitalElements = { a: 2.4e7, e: 0.7, i: 0.4, raan: 2, argp: 4, m0: 0.1, epoch: 0 };
		const s0 = propagate(el, MU_EARTH, 0);
		const h0 = cross(s0.r, s0.v);
		for (let t = 0; t < period(el, MU_EARTH); t += 997) {
			const s = propagate(el, MU_EARTH, t);
			expect(relErr(cross(s.r, s.v), h0)).toBeLessThan(1e-12);
			const back = fromStateVector(s.r, s.v, MU_EARTH, t);
			expect(back.a).toBeCloseTo(el.a, 2);
			expect(back.e).toBeCloseTo(el.e, 12);
		}
	});

	test('hyperbolic orbit: energy conserved and the trajectory recedes', () => {
		const el: OrbitalElements = { a: -2e7, e: 1.8, i: 1, raan: 0.3, argp: 0.2, m0: 0, epoch: 0 };
		const ref = -MU_EARTH / (2 * el.a);
		let prev = 0;
		for (let t = 0; t <= 2e5; t += 1e4) {
			const { r, v } = propagate(el, MU_EARTH, t);
			expect(Math.abs((energy(r, v, MU_EARTH) - ref) / ref)).toBeLessThan(1e-9);
			expect(length(r)).toBeGreaterThanOrEqual(prev);
			prev = length(r);
		}
	});
});

describe('propagateUniversal (state vector, any conic)', () => {
	test('agrees with element propagation for random elliptic and hyperbolic orbits (1e-8 relative)', () => {
		const rng = createRng(99);
		let worst = 0;
		for (let k = 0; k < 200; k++) {
			const el: OrbitalElements =
				k % 2 === 0
					? randomBoundOrbit(rng)
					: {
							a: -Math.exp(uniform(rng, Math.log(5e6), Math.log(1e8))),
							e: uniform(rng, 1.05, 6),
							i: uniform(rng, 0, Math.PI),
							raan: uniform(rng, 0, 2 * Math.PI),
							argp: uniform(rng, 0, 2 * Math.PI),
							m0: uniform(rng, -2, 2),
							epoch: 0
						};
			const dt = uniform(rng, -2e4, 2e4);
			const s0 = propagate(el, MU_EARTH, 0);
			const expected = propagate(el, MU_EARTH, dt);
			const got = propagateUniversal(s0.r, s0.v, MU_EARTH, dt);
			worst = Math.max(worst, relErr(got.r, expected.r), relErr(got.v, expected.v));
		}
		expect(worst).toBeLessThan(1e-8);
	});

	test('parabolic trajectory (e = 1 exactly) matches Barker’s equation and conserves zero energy', () => {
		const rp = 7e6;
		const p = 2 * rp;
		const r0 = { x: rp, y: 0, z: 0 };
		const v0 = { x: 0, y: 0, z: -Math.sqrt((2 * MU_EARTH) / rp) };
		for (const dt of [10, 600, 3600, 86400, -3600]) {
			const { r, v } = propagateUniversal(r0, v0, MU_EARTH, dt);
			// Barker: dt = ½ √(p³/μ) (D + D³/3), D = tan(ν/2). Closed-form cubic solution.
			const B = (3 * dt) / Math.sqrt((p * p * p) / MU_EARTH);
			const D = Math.cbrt(B + Math.sqrt(B * B + 1)) + Math.cbrt(B - Math.sqrt(B * B + 1));
			const nu = 2 * Math.atan(D);
			const rExpected = p / (1 + Math.cos(nu));
			expect(Math.abs(length(r) - rExpected) / rExpected).toBeLessThan(1e-9);
			expect(Math.abs(energy(r, v, MU_EARTH)) / (MU_EARTH / length(r))).toBeLessThan(1e-9);
		}
	});

	test('forward then backward returns to the start', () => {
		const r0 = { x: 7e6, y: 1e6, z: -2e5 };
		const v0 = { x: 100, y: 2000, z: -7900 };
		const fwd = propagateUniversal(r0, v0, MU_EARTH, 12345);
		const back = propagateUniversal(fwd.r, fwd.v, MU_EARTH, -12345);
		expect(relErr(back.r, r0)).toBeLessThan(1e-9);
		expect(relErr(back.v, v0)).toBeLessThan(1e-9);
	});

	// Plan 293: the map's maneuver editor crashed with "did not converge (dt = 50740.92485174809 s,
	// α = −6.236880549521935e-7 1/m)": an escape burn from low orbit around the home body. From the
	// periapsis the old near-circular guess √μ Δt / r0 started far above the root and Newton crawled
	// down by about 1/√(−α) per step, past the iteration cap.
	test('the escape burn of the map crash converges and agrees with element propagation', () => {
		const MU_HOME = 3.5316e12;
		const alpha = -6.236880549521935e-7;
		const dt = 50740.92485174809;
		for (const rp of [682_700, 300_000, 100_000, 10_000]) {
			const el: OrbitalElements = {
				a: 1 / alpha,
				e: 1 - rp * alpha,
				i: 0.3,
				raan: 1,
				argp: 2,
				m0: 0,
				epoch: 0
			};
			const s0 = propagate(el, MU_HOME, 0);
			expect(Math.abs(2 / length(s0.r) - dot(s0.v, s0.v) / MU_HOME - alpha)).toBeLessThan(1e-15);
			for (const step of [dt, -dt]) {
				const got = propagateUniversal(s0.r, s0.v, MU_HOME, step);
				const expected = propagate(el, MU_HOME, step);
				expect(relErr(got.r, expected.r)).toBeLessThan(1e-9);
				expect(relErr(got.v, expected.v)).toBeLessThan(1e-9);
			}
		}
	});

	test('long hyperbolic and near-parabolic steps always converge (2 000 random cases)', () => {
		const rng = createRng(293);
		let worst = 0;
		for (let k = 0; k < 2000; k++) {
			const rp = uniform(rng, 1e4, 1e8);
			const e = 1 + Math.exp(uniform(rng, Math.log(1e-6), Math.log(10)));
			const el: OrbitalElements = {
				a: rp / (1 - e),
				e,
				i: uniform(rng, 0, Math.PI),
				raan: uniform(rng, 0, 2 * Math.PI),
				argp: uniform(rng, 0, 2 * Math.PI),
				m0: uniform(rng, -10, 10),
				epoch: 0
			};
			const dt = (rng() < 0.5 ? -1 : 1) * Math.exp(uniform(rng, Math.log(10), Math.log(1e7)));
			const s0 = propagate(el, MU_EARTH, 0);
			const got = propagateUniversal(s0.r, s0.v, MU_EARTH, dt);
			expect(Number.isFinite(got.r.x) && Number.isFinite(got.v.x)).toBe(true);
			if (e > 1 + 1e-3) worst = Math.max(worst, relErr(got.r, propagate(el, MU_EARTH, dt).r));
		}
		expect(worst).toBeLessThan(1e-8);
	});
});
