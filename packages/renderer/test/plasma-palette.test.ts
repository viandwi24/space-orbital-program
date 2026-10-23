/** Plan 399: a palette per body, HDR colours as rgb × 2^intensity, and the fallback ramp. */
import { describe, expect, test } from 'bun:test';
import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import {
	AIR_PALETTE,
	CO2_PALETTE,
	HYDROGEN_PALETTE,
	gasOf,
	gradientAt,
	hdr,
	heatingOf,
	paletteFor,
	rampColour
} from '../src/effects/plasma-palette.ts';
import { ionisationColour } from '../src/effects/look.ts';

const bodies = loadPlugins([Stock]).registries.bodies.list();

describe('plasma palettes (plan 399)', () => {
	test('every stock body with air resolves a palette with at least four gradient stops', () => {
		const withAir = bodies.filter((b) => b.atmosphere);
		expect(withAir.length).toBeGreaterThanOrEqual(4);
		for (const b of withAir) {
			const p = paletteFor(b.id, b.atmosphere);
			expect(p.gradient.length).toBeGreaterThanOrEqual(4);
			expect(p.trail).toHaveLength(3);
			for (let i = 1; i < p.gradient.length; i++) {
				expect(p.gradient[i]!.at).toBeGreaterThan(p.gradient[i - 1]!.at);
			}
		}
	});

	test('bodies with different gases get different palettes', () => {
		const by = (id: string) => {
			const b = bodies.find((x) => x.id === id)!;
			return paletteFor(b.id, b.atmosphere);
		};
		expect(by('stock.home')).toBe(AIR_PALETTE);
		expect(by('stock.vesper')).toBe(CO2_PALETTE);
		expect(by('stock.tempest')).toBe(HYDROGEN_PALETTE);
		expect(
			new Set(bodies.filter((b) => b.atmosphere).map((b) => paletteFor(b.id, b.atmosphere).id)).size
		).toBeGreaterThanOrEqual(3);
	});

	test('a body that is not listed is picked by its gas', () => {
		expect(paletteFor('mod.unknown', undefined)).toBe(AIR_PALETTE);
		expect(paletteFor('mod.unknown', { gasConstant: 190 })).toBe(CO2_PALETTE);
		expect(paletteFor('mod.unknown', { gasConstant: 3_600 })).toBe(HYDROGEN_PALETTE);
		expect(gasOf(296.8)).toBe('nitrogen');
		expect(gasOf(287.05)).toBe('air');
	});

	test('the HDR colour is rgb × 2^intensity', () => {
		expect(hdr({ rgb: [0.5, 0.25, 1], intensity: 2 })).toEqual([2, 1, 4]);
		expect(hdr({ rgb: [1, 1, 1], intensity: -1 })).toEqual([0.5, 0.5, 0.5]);
		expect(hdr({ rgb: [0.3, 0.3, 0.3], intensity: 0 })).toEqual([0.3, 0.3, 0.3]);
	});

	test('the heating read from the flux rises monotonically from 0 to 1', () => {
		let last = -1;
		for (const flux of [0, 5e4, 1e5, 3e5, 6e5, 1.5e6, 2.5e6, 1e7]) {
			const h = heatingOf(flux);
			expect(h).toBeGreaterThanOrEqual(last);
			last = h;
		}
		expect(heatingOf(0)).toBe(0);
		expect(heatingOf(1e9)).toBe(1);
		// an ordinary orbital return stays below the blue-white end
		expect(heatingOf(3e5)).toBeLessThan(0.45);
	});

	test('the gradient passes from the first stop to the last', () => {
		const g = AIR_PALETTE.gradient;
		expect(gradientAt(g, 0)).toEqual(g[0]!.rgb);
		expect(gradientAt(g, 1)).toEqual(g[g.length - 1]!.rgb);
		expect(gradientAt(g, -3)).toEqual(g[0]!.rgb);
		expect(gradientAt(g, 9)).toEqual(g[g.length - 1]!.rgb);
	});

	test('the fallback ramp is the speed ramp of before', () => {
		for (const v of [0, 3_000, 5_500, 7_800, 9_500, 12_000]) {
			expect(rampColour(v)).toEqual(ionisationColour(v));
		}
	});
});
