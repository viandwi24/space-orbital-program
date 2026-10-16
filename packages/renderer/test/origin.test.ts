import { describe, expect, test } from 'bun:test';
import type { Vec3 } from '@orbital/core';
import {
	DEFAULT_ORIGIN_THRESHOLD,
	ORIGIN_GRID,
	needsRebase,
	snapToGrid,
	toRenderSpace,
	updateOrigin
} from '../src/origin.ts';

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const sub = (a: Vec3, b: Vec3): Vec3 => v(a.x - b.x, a.y - b.y, a.z - b.z);

describe('floating origin', () => {
	test('default threshold is 10 km (units-and-frames.md)', () => {
		expect(DEFAULT_ORIGIN_THRESHOLD).toBe(10_000);
	});

	test('does not shift at or inside the threshold', () => {
		const origin = v(1000, 2000, 3000);
		for (const d of [0, 1, 9_999.999, 10_000]) {
			const r = updateOrigin(origin, v(1000 + d, 2000, 3000));
			expect(r.shifted).toBe(false);
			expect(r.origin).toBe(origin);
			expect(r.shift).toEqual(v(0, 0, 0));
		}
		expect(needsRebase(origin, v(1000, 2000 + 10_000.001, 3000))).toBe(true);
	});

	test('shifts beyond the threshold, in any direction, to the snapped anchor', () => {
		const origin = v(0, 0, 0);
		const anchor = v(3_000, -9_000, 8_000); // |.| ≈ 12.4 km
		const r = updateOrigin(origin, anchor);
		expect(r.shifted).toBe(true);
		expect(r.origin).toEqual(snapToGrid(anchor));
		expect(r.origin.x % ORIGIN_GRID).toBe(0);
		expect(r.shift).toEqual(sub(r.origin, origin));
		// the anchor is now within one grid cell of the origin
		expect(needsRebase(r.origin, anchor)).toBe(false);
	});

	test('custom threshold is honoured', () => {
		expect(updateOrigin(v(0, 0, 0), v(600, 0, 0), 500).shifted).toBe(true);
		expect(updateOrigin(v(0, 0, 0), v(400, 0, 0), 500).shifted).toBe(false);
	});

	test('relative positions are preserved exactly after a shift (planetary magnitudes, < 1e-9)', () => {
		// A vessel and a nearby part 1.5e11 m from the system root (float64 ulp there is ~3e-5 m).
		const base = v(1.496e11 + 0.123456789, -2.5e10 + 0.5, 7.77e9);
		const a = v(base.x + 1234.5, base.y - 17.25, base.z + 3.125);
		const b = v(base.x - 9876.5, base.y + 4.5, base.z - 77.0625);
		const o1 = updateOrigin(v(0, 0, 0), a).origin;
		// Move 30 km: forces another shift.
		const a2 = v(a.x + 30_000, a.y, a.z);
		const b2 = v(b.x + 30_000, b.y, b.z);
		const o2 = updateOrigin(o1, a2);
		expect(o2.shifted).toBe(true);
		const within = (r: Vec3, e: Vec3): void => {
			expect(Math.abs(r.x - e.x)).toBeLessThan(1e-9);
			expect(Math.abs(r.y - e.y)).toBeLessThan(1e-9);
			expect(Math.abs(r.z - e.z)).toBeLessThan(1e-9);
		};
		const expected = sub(a, b);
		within(sub(toRenderSpace(a, o1), toRenderSpace(b, o1)), expected);
		within(sub(toRenderSpace(a, o2.origin), toRenderSpace(b, o2.origin)), expected);
		// Shifting translates every render position by exactly -shift.
		const before = toRenderSpace(a, o1);
		const after = toRenderSpace(a, o2.origin);
		expect(after.x).toBe(before.x - o2.shift.x);
		expect(after.y).toBe(before.y - o2.shift.y);
		expect(after.z).toBe(before.z - o2.shift.z);
	});

	test('does not mutate its inputs', () => {
		const origin = Object.freeze(v(0, 0, 0));
		const anchor = Object.freeze(v(50_000, 0, 0));
		expect(() => updateOrigin(origin, anchor)).not.toThrow();
		expect(origin).toEqual(v(0, 0, 0));
	});
});
