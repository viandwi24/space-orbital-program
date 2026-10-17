import { describe, expect, test } from 'bun:test';
import {
	bodyStateAt,
	closestApproach,
	add,
	length,
	period,
	propagate,
	sub,
	type OrbitalElements
} from '../src/index.ts';
import { MU_EARTH } from './helpers.ts';

const circular = (a: number, m0: number): OrbitalElements => ({
	a,
	e: 0,
	i: 0,
	raan: 0,
	argp: 0,
	m0,
	epoch: 0
});

describe('closestApproach', () => {
	test('two coplanar circular orbits: the gap closes to the difference of the radii when aligned', () => {
		const a = circular(7e6, 0);
		const b = circular(7.5e6, 1.2);
		const n = (el: OrbitalElements) => (2 * Math.PI) / period(el, MU_EARTH);
		// The inner body gains 1.2 rad on the outer one at (n_a - n_b) per second.
		const expected = 1.2 / (n(a) - n(b));
		const found = closestApproach(
			(t) => propagate(a, MU_EARTH, t),
			(t) => propagate(b, MU_EARTH, t),
			0,
			2 * expected
		);
		expect(found.distance).toBeCloseTo(0.5e6, -1);
		expect(Math.abs(found.t - expected)).toBeLessThan(0.5);
		expect(found.relativeSpeed).toBeGreaterThan(0);
	});

	test('agrees with a brute-force scan of an eccentric pair within a metre', () => {
		const a: OrbitalElements = { a: 8e6, e: 0.2, i: 0.3, raan: 0.4, argp: 0.5, m0: 0.1, epoch: 0 };
		const b: OrbitalElements = { a: 1.2e7, e: 0.4, i: 0.1, raan: 0.2, argp: 2.5, m0: 3, epoch: 0 };
		const from = (t: number) => propagate(a, MU_EARTH, t);
		const to = (t: number) => propagate(b, MU_EARTH, t);
		const span = period(a, MU_EARTH);
		const found = closestApproach(from, to, 0, span);
		let brute = Infinity;
		for (let i = 0; i <= 200_000; i++) {
			const t = (i / 200_000) * span;
			brute = Math.min(brute, length(sub(to(t).r, from(t).r)));
		}
		expect(found.distance).toBeLessThanOrEqual(brute + 1e-6);
		expect(brute - found.distance).toBeLessThan(1);
	});

	test('a minimum at the edge of the window is returned as the edge', () => {
		const origin = { r: { x: 0, y: 0, z: 0 }, v: { x: 0, y: 0, z: 0 } };
		const diverging = closestApproach(
			() => origin,
			(t) => ({ r: { x: 10 + t, y: 0, z: 0 }, v: { x: 1, y: 0, z: 0 } }),
			0,
			100
		);
		expect(diverging.t).toBe(0);
		expect(diverging.distance).toBe(10);
		expect(diverging.relativeSpeed).toBe(1);
		const empty = closestApproach(
			() => origin,
			() => origin,
			3,
			3
		);
		expect(empty.t).toBe(3);
	});

	test('rejects a reversed window', () => {
		const z = () => ({ r: { x: 0, y: 0, z: 0 }, v: { x: 0, y: 0, z: 0 } });
		expect(() => closestApproach(z, z, 5, 1)).toThrow(RangeError);
	});
});

describe('bodyStateAt', () => {
	const home = { id: 'h', mu: MU_EARTH, soi: Infinity };
	const planet = { id: 'p', mu: 1e14, soi: 1e9, parent: 'h', orbit: circular(1e9, 0.3) };
	const moon = { id: 'm', mu: 1e12, soi: 1e7, parent: 'p', orbit: circular(1e8, 1) };
	const all = [home, planet, moon];

	test('the root rests at the origin; a child is its orbit around the parent', () => {
		expect(bodyStateAt(all, 'h', 100)).toEqual({
			r: { x: 0, y: 0, z: 0 },
			v: { x: 0, y: 0, z: 0 }
		});
		expect(bodyStateAt(all, 'p', 5_000)).toEqual(propagate(planet.orbit, MU_EARTH, 5_000));
	});

	test('the system frame adds the parents along the chain, positions and velocities', () => {
		const t = 12_345;
		const inParent = bodyStateAt(all, 'm', t);
		const parent = bodyStateAt(all, 'p', t);
		const system = bodyStateAt(all, 'm', t, 'system');
		expect(length(sub(system.r, add(inParent.r, parent.r)))).toBeLessThan(1e-6);
		expect(length(sub(system.v, add(inParent.v, parent.v)))).toBeLessThan(1e-9);
	});

	test('rejects an unknown body, a bad time and a bad frame', () => {
		expect(() => bodyStateAt([home], 'x', 0)).toThrow(/unknown body "x"/);
		expect(() => bodyStateAt([home, planet], 'p', Number.NaN)).toThrow(RangeError);
		expect(() => bodyStateAt([home, planet], 'p', 0, 'sun' as never)).toThrow(RangeError);
		expect(() => bodyStateAt([planet], 'p', 0)).toThrow(/unknown parent "h"/);
	});
});
