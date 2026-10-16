import { describe, expect, test } from 'bun:test';
import {
	length,
	predictPatchedConics,
	propagateUniversal,
	soiRadius,
	sub,
	type PatchedBody
} from '../src/index.ts';

const MU_HOME = 3.5316e12;
const MU_MOON = 5.776e10;
const A_MOON = 11.8e6;
const SOI = soiRadius(A_MOON, MU_MOON, MU_HOME);
const bodies: PatchedBody[] = [
	{ id: 'home', mu: MU_HOME, soi: Infinity, radius: 600_000 },
	{
		id: 'moon',
		mu: MU_MOON,
		soi: SOI,
		radius: 190_000,
		parent: 'home',
		orbit: { a: A_MOON, e: 0, i: 0, raan: 0, argp: 0, m0: 1, epoch: 0 }
	}
];

describe('predictPatchedConics', () => {
	test('a low orbit with no body near is one segment to the horizon, equal to plain propagation', () => {
		const r = { x: 680_000, y: 0, z: 0 };
		const v = { x: 0, y: 0, z: -Math.sqrt(MU_HOME / 680_000) };
		const path = predictPatchedConics(bodies, { body: 'home', r, v, t: 0 }, 20_000);
		expect(path).toHaveLength(1);
		expect(path[0]!.end).toBe('horizon');
		const direct = propagateUniversal(r, v, MU_HOME, 20_000);
		expect(length(sub(path[0]!.exit.r, direct.r))).toBeLessThan(1e-3);
		expect(path[0]!.elements?.e).toBeLessThan(1e-9);
	});

	test('a path that falls into the surface ends in an impact there', () => {
		const r = { x: 700_000, y: 0, z: 0 };
		const v = { x: 0, y: 0, z: -1_500 }; // periapsis below the surface
		const path = predictPatchedConics(bodies, { body: 'home', r, v, t: 0 }, 20_000);
		expect(path.at(-1)!.end).toBe('impact');
		expect(length(path.at(-1)!.exit.r)).toBeLessThan(600_000 + 1);
	});

	test('a start already inside the moon sphere is put in it at once', () => {
		const path = predictPatchedConics(
			bodies,
			{
				body: 'home',
				r: { x: A_MOON * Math.cos(1) + 500_000, y: 0, z: -A_MOON * Math.sin(1) },
				v: { x: 0, y: 0, z: 0 },
				t: 0
			},
			100
		);
		expect(path[0]!.body).toBe('home');
		expect(path[0]!.end).toBe('transition');
		expect(path[0]!.next).toBe('moon');
		expect(path[0]!.t1).toBe(0);
	});

	test('rejects an unknown start body', () => {
		expect(() =>
			predictPatchedConics(
				bodies,
				{ body: 'nowhere', r: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 1, z: 0 }, t: 0 },
				1
			)
		).toThrow(RangeError);
	});
});
