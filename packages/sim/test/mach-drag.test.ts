/** Plan 212 (ADR 0204 point 3): the transonic drag rise. */
import { describe, expect, test } from 'bun:test';
import { machDragFactor } from '../src/atmosphere.ts';

describe('Mach drag factor (plan 212)', () => {
	test('peaks near Mach 1.1, above subsonic and above Mach 3', () => {
		expect(machDragFactor(1.1)).toBeGreaterThan(machDragFactor(0.6));
		expect(machDragFactor(1.1)).toBeGreaterThan(machDragFactor(3));
		expect(machDragFactor(0)).toBe(1);
		expect(machDragFactor(0.6)).toBe(1);
		expect(machDragFactor(1.05)).toBe(2.5);
		expect(machDragFactor(3)).toBe(1.6);
		expect(machDragFactor(10)).toBe(1.6);
	});

	test('continuous: no step anywhere along the curve', () => {
		let last = machDragFactor(0);
		for (let m = 0.01; m < 4; m += 0.01) {
			const f = machDragFactor(m);
			expect(Math.abs(f - last)).toBeLessThan(0.07);
			last = f;
		}
	});
});
