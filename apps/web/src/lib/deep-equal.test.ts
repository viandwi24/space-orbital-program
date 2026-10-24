import { describe, expect, it } from 'vitest';
import { deepEqual } from './deep-equal';

describe('deepEqual (plan 409)', () => {
	it('compares plain data by value', () => {
		expect(deepEqual({ a: [1, { b: 2 }], c: null }, { c: null, a: [1, { b: 2 }] })).toBe(true);
		expect(deepEqual({ a: [1, 2] }, { a: [1, 3] })).toBe(false);
		expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
		expect(deepEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
		expect(deepEqual([1], { 0: 1 })).toBe(false);
		expect(deepEqual(null, undefined)).toBe(false);
		expect(deepEqual(undefined, undefined)).toBe(true);
		expect(deepEqual(NaN, NaN)).toBe(true);
	});

	it('treats an absent key and an undefined one alike, as JSON does', () => {
		expect(deepEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
	});

	it('takes the same reference without looking inside', () => {
		const big = { rows: Array.from({ length: 1000 }, (_, i) => ({ i })) };
		expect(deepEqual(big, big)).toBe(true);
	});
});
