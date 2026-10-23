/** The player's Brightness setting (owner, 2026-10-22): one stop either way around the balance. */
import { describe, expect, test } from 'bun:test';
import { brightnessFactor } from '../src/exposure.ts';

describe('brightness', () => {
	test('0 is the balance, -1 and 1 are one stop, beyond is clamped', () => {
		expect(brightnessFactor(0)).toBe(1);
		expect(brightnessFactor(1)).toBe(2);
		expect(brightnessFactor(-1)).toBe(0.5);
		expect(brightnessFactor(5)).toBe(2);
		expect(brightnessFactor(Number.NaN)).toBe(1);
	});
});
