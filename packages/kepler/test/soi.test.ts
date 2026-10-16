import { describe, expect, test } from 'bun:test';
import { soiRadius } from '../src/index.ts';

describe('soiRadius', () => {
	test('Earth–Sun SOI ≈ 0.924 million km (within 1%)', () => {
		const r = soiRadius(1.496e11, 5.972e24, 1.989e30);
		expect(Math.abs(r - 0.924e9) / 0.924e9).toBeLessThan(0.01);
	});

	test('rejects non-positive inputs', () => {
		expect(() => soiRadius(0, 1, 1)).toThrow(RangeError);
	});
});

import {
	findCrossing,
	fromStateVector,
	intoChildFrame,
	intoParentFrame,
	length,
	propagate,
	sub
} from '../src/index.ts';

describe('patched-conic frame change', () => {
	const moon = { r: { x: 1.18e7, y: 0, z: 0 }, v: { x: 0, y: 0, z: -1000 } };
	const ship = { r: { x: 1.18e7 + 2.28e6, y: 1e5, z: 3e4 }, v: { x: -300, y: 20, z: -650 } };

	test('entering keeps the inertial state and subtracts the body', () => {
		const rel = intoChildFrame(ship, moon);
		expect(rel.r).toEqual({ x: 2.28e6, y: 1e5, z: 3e4 });
		expect(rel.v).toEqual({ x: -300, y: 20, z: 350 });
		// continuity: adding the body back gives the parent-frame state exactly
		const back = intoParentFrame(rel, moon);
		expect(length(sub(back.r, ship.r))).toBeLessThan(1e-6);
		expect(length(sub(back.v, ship.v))).toBeLessThan(1e-9);
	});

	test('enter then leave round trips both ways within 1e-6 m and 1e-9 m/s', () => {
		const inside = intoChildFrame(ship, moon);
		const out = intoParentFrame(inside, moon);
		const again = intoChildFrame(out, moon);
		expect(length(sub(again.r, inside.r))).toBeLessThan(1e-6);
		expect(length(sub(again.v, inside.v))).toBeLessThan(1e-9);
	});
});

describe('findCrossing', () => {
	test('finds the instant a circular-orbit radius passes a boundary within 1 mm', () => {
		const mu = 3.5316e12;
		const el = fromStateVector({ x: 7e5, y: 0, z: 0 }, { x: 0, y: 0, z: -2800 }, mu, 0);
		// an eccentric orbit rising through r = 1.0e6 m
		const g = (t: number): number => length(propagate(el, mu, t).r) - 1.0e6;
		const t = findCrossing(g, 0, 1500);
		const speed = length(propagate(el, mu, t).v);
		expect(Math.abs(g(t))).toBeLessThan(speed * 1e-7 + 1e-3);
		expect(g(t)).toBeGreaterThan(0);
		expect(g(t - 1e-6)).toBeLessThanOrEqual(0.01);
	});

	test('rejects an interval with no crossing', () => {
		expect(() => findCrossing(() => -1, 0, 1)).toThrow(RangeError);
	});
});
