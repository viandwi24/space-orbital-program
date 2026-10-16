import { describe, expect, test } from 'bun:test';
import {
	cross,
	fromStateVector,
	KeplerError,
	period,
	toStateVector,
	type OrbitalElements,
	type Vec3
} from '../src/index.ts';
import { createRng, MU_EARTH, randomBoundOrbit, relErr, uniform } from './helpers.ts';

const ROUND_TRIP_REL = 1e-9;

function roundTrip(r: Vec3, v: Vec3, mu: number, t: number) {
	const el = fromStateVector(r, v, mu, t);
	const back = toStateVector(el, mu, t);
	return { el, rErr: relErr(back.r, r), vErr: relErr(back.v, v) };
}

describe('fromStateVector / toStateVector round-trip', () => {
	test(`1 000 random bound orbits (e ∈ [0, 0.95], i ∈ [0, π]) reproduce r and v within relative ${ROUND_TRIP_REL}`, () => {
		const rng = createRng(20261016);
		let worst = 0;
		for (let k = 0; k < 1000; k++) {
			const t = uniform(rng, -1e6, 1e6);
			const { r, v } = toStateVector(randomBoundOrbit(rng, uniform(rng, -1e6, 1e6)), MU_EARTH, t);
			const { rErr, vErr } = roundTrip(r, v, MU_EARTH, t);
			worst = Math.max(worst, rErr, vErr);
		}
		expect(worst).toBeLessThan(ROUND_TRIP_REL);
	});

	test('200 random hyperbolic orbits (e ∈ [1.05, 10]) round-trip within relative 1e-9', () => {
		const rng = createRng(7);
		let worst = 0;
		for (let k = 0; k < 200; k++) {
			const e = uniform(rng, 1.05, 10);
			const el: OrbitalElements = {
				a: -Math.exp(uniform(rng, Math.log(1e6), Math.log(1e9))),
				e,
				i: uniform(rng, 0, Math.PI),
				raan: uniform(rng, 0, 2 * Math.PI),
				argp: uniform(rng, 0, 2 * Math.PI),
				m0: uniform(rng, -20, 20),
				epoch: 0
			};
			const { r, v } = toStateVector(el, MU_EARTH, 0);
			const { el: back, rErr, vErr } = roundTrip(r, v, MU_EARTH, 0);
			expect(back.a).toBeLessThan(0);
			expect(back.e).toBeCloseTo(e, 9);
			worst = Math.max(worst, rErr, vErr);
		}
		expect(worst).toBeLessThan(1e-9);
	});
});

describe('known orbits', () => {
	test('circular equatorial r = 7 000 km, μ = 3.986e14 → e < 1e-12, i < 1e-12, period ≈ 5828.52 s (±0.01 s; plan text said 5828.5, see plan 002 Log)', () => {
		const R = 7_000_000;
		const vc = Math.sqrt(MU_EARTH / R);
		// Prograde about +Y: x̂ × (−ẑ) = +ŷ.
		const el = fromStateVector({ x: R, y: 0, z: 0 }, { x: 0, y: 0, z: -vc }, MU_EARTH, 0);
		expect(el.e).toBeLessThan(1e-12);
		expect(el.i).toBeLessThan(1e-12);
		expect(Math.abs(period(el, MU_EARTH) - 5828.52)).toBeLessThan(0.01);
		expect(el.a).toBeCloseTo(R, 3);
	});

	test('inclination is measured from +Y: retrograde equatorial → π, polar → π/2', () => {
		const R = 7e6;
		const vc = Math.sqrt(MU_EARTH / R);
		const retro = fromStateVector({ x: R, y: 0, z: 0 }, { x: 0, y: 0, z: vc }, MU_EARTH, 0);
		expect(retro.i).toBeCloseTo(Math.PI, 12);
		const polar = fromStateVector({ x: R, y: 0, z: 0 }, { x: 0, y: vc, z: 0 }, MU_EARTH, 0);
		expect(polar.i).toBeCloseTo(Math.PI / 2, 12);
	});

	test('RAAN is right-handed about +Y from +X: raan = π/2 puts the ascending node on −Z', () => {
		const R = 7e6;
		const el: OrbitalElements = {
			a: R,
			e: 0,
			i: Math.PI / 2,
			raan: Math.PI / 2,
			argp: 0,
			m0: 0,
			epoch: 0
		};
		const { r, v } = toStateVector(el, MU_EARTH, 0);
		expect(r.x / R).toBeCloseTo(0, 12);
		expect(r.y / R).toBeCloseTo(0, 12);
		expect(r.z / R).toBeCloseTo(-1, 12);
		expect(v.y).toBeGreaterThan(0); // ascending: moving toward +Y (north)
	});

	test('prograde equatorial orbit has h = r × v along +Y', () => {
		const el: OrbitalElements = { a: 8e6, e: 0.3, i: 0, raan: 0, argp: 1, m0: 2, epoch: 0 };
		const { r, v } = toStateVector(el, MU_EARTH, 0);
		const h = cross(r, v);
		expect(h.y).toBeGreaterThan(0);
		expect(Math.hypot(h.x, h.z) / h.y).toBeLessThan(1e-12);
	});
});

describe('degenerate cases', () => {
	const R = 7e6;
	const vc = Math.sqrt(MU_EARTH / R);

	test('circular inclined: argp = 0, m0 is the argument of latitude', () => {
		const el0: OrbitalElements = { a: R, e: 0, i: 0.7, raan: 1.1, argp: 0, m0: 0.4, epoch: 0 };
		const { r, v } = toStateVector(el0, MU_EARTH, 0);
		const { el, rErr, vErr } = roundTrip(r, v, MU_EARTH, 0);
		expect(el.argp).toBe(0);
		expect(el.raan).toBeCloseTo(1.1, 10);
		expect(el.m0).toBeCloseTo(0.4, 10);
		expect(Math.max(rErr, vErr)).toBeLessThan(1e-12);
	});

	test('elliptic equatorial: raan = 0, argp is the longitude of periapsis (prograde and retrograde)', () => {
		for (const i of [0, Math.PI]) {
			const el0: OrbitalElements = { a: 9e6, e: 0.4, i, raan: 0, argp: 2.2, m0: 0.9, epoch: 0 };
			const { r, v } = toStateVector(el0, MU_EARTH, 0);
			const { el, rErr, vErr } = roundTrip(r, v, MU_EARTH, 0);
			expect(el.raan).toBe(0);
			expect(el.argp).toBeCloseTo(2.2, 10);
			expect(el.m0).toBeCloseTo(0.9, 10);
			expect(Math.max(rErr, vErr)).toBeLessThan(1e-12);
		}
	});

	test('circular equatorial: raan = argp = 0, m0 is the true longitude', () => {
		const phi = 2.5;
		// Position at true longitude φ (right-handed about +Y from +X) and prograde velocity.
		const r = { x: R * Math.cos(phi), y: 0, z: -R * Math.sin(phi) };
		const v = { x: -vc * Math.sin(phi), y: 0, z: -vc * Math.cos(phi) };
		const { el, rErr, vErr } = roundTrip(r, v, MU_EARTH, 0);
		expect(el.raan).toBe(0);
		expect(el.argp).toBe(0);
		expect(el.m0).toBeCloseTo(phi, 12);
		expect(Math.max(rErr, vErr)).toBeLessThan(1e-12);
	});

	test('near-parabolic state (|e − 1| < 1e-8) throws KeplerError pointing at propagateUniversal', () => {
		const vEsc = Math.sqrt((2 * MU_EARTH) / R);
		expect(() =>
			fromStateVector({ x: R, y: 0, z: 0 }, { x: 0, y: 0, z: -vEsc }, MU_EARTH, 0)
		).toThrow(/propagateUniversal/);
		expect(() =>
			toStateVector({ a: -1e7, e: 1 + 1e-9, i: 0, raan: 0, argp: 0, m0: 0, epoch: 0 }, MU_EARTH, 0)
		).toThrow(KeplerError);
	});

	test('radial trajectory (h = 0) throws KeplerError', () => {
		expect(() =>
			fromStateVector({ x: R, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, MU_EARTH, 0)
		).toThrow(KeplerError);
	});

	test('inconsistent a/e sign throws', () => {
		expect(() =>
			toStateVector({ a: -1e7, e: 0.5, i: 0, raan: 0, argp: 0, m0: 0, epoch: 0 }, MU_EARTH, 0)
		).toThrow(KeplerError);
	});
});
