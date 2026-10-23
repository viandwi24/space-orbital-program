/** Plan 399: condensation and the vapour cone, gated by Mach and faded by air density. */
import { describe, expect, test } from 'bun:test';
import { CONDENSATION_MACH, condensationOpacity } from '../src/effects/plasma-palette.ts';

const SEA = 1.225;

describe('condensation (plan 399)', () => {
	test('is zero below Mach 0.8 and above 1.25', () => {
		for (const m of [0, 0.3, 0.79, 0.8]) expect(condensationOpacity(m, SEA)).toBe(0);
		for (const m of [1.25, 1.4, 3, 8]) expect(condensationOpacity(m, SEA)).toBe(0);
	});

	test('peaks inside Mach 0.85 to 1.2', () => {
		const peak = Math.max(
			...[0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.2].map((m) => condensationOpacity(m, SEA))
		);
		expect(peak).toBeGreaterThan(0.95);
		expect(condensationOpacity(CONDENSATION_MACH.full, SEA)).toBeGreaterThan(0.95);
		expect(condensationOpacity(1, SEA)).toBeGreaterThan(condensationOpacity(0.82, SEA));
		expect(condensationOpacity(1, SEA)).toBeGreaterThan(condensationOpacity(1.22, SEA));
	});

	test('falls to nothing as the air thins', () => {
		let last = 2;
		for (const rho of [1.225, 0.6, 0.3, 0.1, 0.05, 0.01, 0]) {
			const o = condensationOpacity(1, rho);
			expect(o).toBeLessThanOrEqual(last);
			last = o;
		}
		expect(condensationOpacity(1, 0)).toBe(0);
		expect(condensationOpacity(1, 0.02)).toBe(0);
	});
});
