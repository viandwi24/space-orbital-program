import { describe, expect, test } from 'bun:test';
import { createRng } from '../src/index.ts';

const seq = (seed: number, n: number): number[] => {
	const r = createRng(seed);
	return Array.from({ length: n }, () => r.next());
};

describe('rng', () => {
	test('same seed yields identical 1000-number sequences', () => {
		expect(seq(12345, 1000)).toEqual(seq(12345, 1000));
	});

	test('different seeds differ', () => {
		expect(seq(1, 10)).not.toEqual(seq(2, 10));
	});

	test('mulberry32 reference value for seed 1 (pins the algorithm)', () => {
		// First output of mulberry32(1), computed from the reference implementation.
		expect(createRng(1).next()).toBeCloseTo(0.6270739405881613, 15);
	});

	test('values lie in [0, 1) with a sane mean', () => {
		const xs = seq(7, 10_000);
		expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
		expect(Math.max(...xs)).toBeLessThan(1);
		const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
		expect(Math.abs(mean - 0.5)).toBeLessThan(0.02);
	});

	test('range and int respect bounds', () => {
		const r = createRng(3);
		for (let i = 0; i < 1000; i++) {
			const x = r.range(-5, 5);
			expect(x).toBeGreaterThanOrEqual(-5);
			expect(x).toBeLessThan(5);
			const n = r.int(2, 4);
			expect([2, 3, 4]).toContain(n);
		}
		expect(() => r.int(3, 2)).toThrow(RangeError);
	});

	test('state() resumes the sequence', () => {
		const a = createRng(99);
		for (let i = 0; i < 10; i++) a.next();
		const b = createRng(a.state());
		expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
	});

	test('non-finite seed throws', () => {
		expect(() => createRng(NaN)).toThrow(RangeError);
	});
});
