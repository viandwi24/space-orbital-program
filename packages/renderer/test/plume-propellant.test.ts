/** Plan 400: each propellant base resolves to its colour family. */
import { describe, expect, test } from 'bun:test';
import { PLUME_PROPELLANTS } from '@orbital/core';
import { PROPELLANT_BASES, resolveTemplate, templateLook } from '../src/effects/plume-template.ts';
import { plumeShape } from '../src/effects/plume.ts';
import type { Rgb } from '../src/effects/look.ts';

function hue([r, g, b]: Rgb): number {
	const max = Math.max(r, g, b);
	const d = max - Math.min(r, g, b);
	if (d === 0) return 0;
	let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
	h *= 60;
	return h < 0 ? h + 360 : h;
}

const shape = (pa: number) =>
	plumeShape({
		throttle: 1,
		ignited: true,
		flameout: false,
		ambientPressure: pa,
		exitPressure: 90_000,
		baseLength: 7,
		exitRadius: 0.46
	});

describe('propellant bases (plan 400)', () => {
	test('every propellant has a base', () => {
		for (const p of PLUME_PROPELLANTS) expect(PROPELLANT_BASES[p].id).toBe(p);
	});

	test('each resolves to its colour family', () => {
		const outer = (p: (typeof PLUME_PROPELLANTS)[number]) =>
			resolveTemplate({ propellant: p }).colours.outer;
		// kerolox orange-yellow, hypergolic orange-red, solid white-yellow
		expect(hue(outer('kerolox'))).toBeGreaterThan(15);
		expect(hue(outer('kerolox'))).toBeLessThan(40);
		expect(hue(outer('hypergolic'))).toBeLessThan(hue(outer('kerolox')));
		expect(hue(outer('solid'))).toBeGreaterThan(30);
		expect(hue(outer('solid'))).toBeLessThan(55);
		// hydrolox blue-white, methalox blue-purple, ion blue
		expect(hue(outer('hydrolox'))).toBeGreaterThan(200);
		expect(hue(outer('hydrolox'))).toBeLessThan(230);
		expect(hue(outer('methalox'))).toBeGreaterThan(235);
		expect(hue(outer('methalox'))).toBeLessThan(260);
		expect(hue(outer('ion'))).toBeGreaterThan(210);
		expect(hue(outer('ion'))).toBeLessThan(235);
		// the solid's core is nearly white
		expect(Math.min(...PROPELLANT_BASES.solid.core)).toBeGreaterThan(0.85);
	});

	test('hydrolox is faint at sea level while its diamonds stay visible', () => {
		const t = resolveTemplate({ propellant: 'hydrolox' });
		const sea = templateLook(shape(90_000), t);
		const vac = templateLook(shape(0), t);
		expect(sea.core).toBeLessThan(0.3);
		expect(vac.core).toBeGreaterThan(0.99);
		expect(sea.diamonds).toBeGreaterThan(0.3);
		expect(sea.diamonds).toBeGreaterThan(
			templateLook(shape(90_000), resolveTemplate({ propellant: 'kerolox' })).diamonds
		);
		// kerolox shows its whole core everywhere
		expect(templateLook(shape(90_000), resolveTemplate({ propellant: 'kerolox' })).core).toBe(1);
	});

	test('the solid is the brightest and the ion the faintest', () => {
		const all = PLUME_PROPELLANTS.map((p) => [p, PROPELLANT_BASES[p].brightness] as const);
		expect(all.reduce((a, b) => (b[1] > a[1] ? b : a))[0]).toBe('solid');
		expect(all.reduce((a, b) => (b[1] < a[1] ? b : a))[0]).toBe('ion');
		expect(PROPELLANT_BASES.solid.smoke).toBe(true);
		expect(PROPELLANT_BASES.ion.width).toBeLessThan(0.5);
	});
});
