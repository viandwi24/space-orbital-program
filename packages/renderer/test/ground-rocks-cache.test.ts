/** Plan 408: the rock cell cache drops its oldest cells, not all of them. */
import { describe, expect, test } from 'bun:test';
import { evictOldest } from '../src/ground-rocks.ts';

describe('evictOldest', () => {
	test('keeps the newest `keep` entries in order', () => {
		const m = new Map<number, string>();
		for (let i = 0; i < 100; i++) m.set(i, `v${i}`);
		expect(evictOldest(m, 75)).toBe(25);
		expect(m.size).toBe(75);
		expect(m.has(24)).toBe(false);
		expect(m.has(25)).toBe(true);
		expect([...m.keys()][0]).toBe(25);
		expect(evictOldest(m, 200)).toBe(0);
	});
});
