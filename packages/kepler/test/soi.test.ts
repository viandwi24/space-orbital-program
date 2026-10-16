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
