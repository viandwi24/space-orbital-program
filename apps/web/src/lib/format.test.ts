import { describe, expect, it } from 'vitest';
import { formatDistance, formatSpeed } from './format';

describe('format', () => {
	it('picks a unit by magnitude', () => {
		expect(formatDistance(42)).toBe('42 m');
		expect(formatDistance(12_345)).toBe('12.35 km');
		expect(formatDistance(7_000_000)).toBe('7.00 Mm');
	});
	it('formats speed', () => {
		expect(formatSpeed(2301.26)).toBe('2301.3 m/s');
	});
});
