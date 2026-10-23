/** Plan 400: the controllers and the template's scales on the plume's shape. */
import { describe, expect, test } from 'bun:test';
import {
	DEFAULT_COLOURS,
	DENSITY_EXPONENT,
	chamberLength,
	densityController,
	ignition,
	remap,
	resolveTemplate,
	templateLook
} from '../src/effects/plume-template.ts';
import { plumeShape } from '../src/effects/plume.ts';

const base = {
	ignited: true,
	flameout: false,
	exitPressure: 90_000,
	baseLength: 7,
	exitRadius: 0.46
};

describe('plume controllers (plan 400)', () => {
	test('the density controller is density to the power 0.5128 by default', () => {
		expect(DENSITY_EXPONENT).toBe(0.5128);
		for (const ratio of [0.01, 0.1, 0.5, 0.9]) {
			expect(densityController(101_325 * ratio, 101_325)).toBeCloseTo(ratio ** 0.5128, 12);
		}
		expect(densityController(0, 101_325)).toBe(0);
		expect(densityController(300_000, 101_325)).toBe(1);
		expect(densityController(50_000, 101_325, 1)).toBeCloseTo(50_000 / 101_325, 12);
	});

	test('remap curves clamp at their ends and are linear between', () => {
		const curve = [
			[0.2, 0],
			[0.6, 1],
			[1, 0.5]
		] as const;
		expect(remap(curve, -5)).toBe(0);
		expect(remap(curve, 0.2)).toBe(0);
		expect(remap(curve, 0.4)).toBeCloseTo(0.5, 12);
		expect(remap(curve, 0.8)).toBeCloseTo(0.75, 12);
		expect(remap(curve, 9)).toBe(0.5);
		expect(remap([], 0.3)).toBe(0.3);
	});

	test('ignition ramps from 0 to 1 over the template time', () => {
		expect(ignition(0, 0.5)).toBe(0);
		expect(ignition(0.25, 0.5)).toBeCloseTo(0.5, 12);
		expect(ignition(0.5, 0.5)).toBe(1);
		expect(ignition(3, 0.5)).toBe(1);
		expect(ignition(-1, 0.5)).toBe(0);
	});
});

describe('the template on the shape (plan 400)', () => {
	test('the default template changes nothing of the plume as it was', () => {
		const t = resolveTemplate(undefined);
		for (const pa of [0, 5_000, 60_000, 101_325]) {
			for (const throttle of [0.2, 0.7, 1]) {
				const s = plumeShape({ ...base, throttle, ambientPressure: pa });
				const look = templateLook(s, t);
				expect(look.length).toBeCloseTo(s.length, 12);
				expect(look.maxRadius).toBeCloseTo(s.maxRadius, 12);
				expect(look.brightness).toBeCloseTo(s.brightness, 12);
				expect(look.diamonds).toBeCloseTo(s.diamonds, 12);
				expect(look.core).toBe(1);
			}
		}
		expect(t.colours.inner).toEqual(DEFAULT_COLOURS.inner);
	});

	test('length grows with throttle and with chamber pressure; width grows as the air thins', () => {
		const at = (throttle: number, pa: number, bar?: number) => {
			const t = resolveTemplate({
				propellant: 'kerolox',
				...(bar ? { chamberPressure: bar } : {})
			});
			return templateLook(plumeShape({ ...base, throttle, ambientPressure: pa }), t);
		};
		expect(at(1, 90_000).length).toBeGreaterThan(at(0.4, 90_000).length);
		expect(at(1, 90_000, 150).length).toBeGreaterThan(at(1, 90_000, 60).length);
		expect(at(1, 90_000, 150).length).toBeGreaterThan(at(1, 90_000, 30).length);
		expect(chamberLength(60)).toBeCloseTo(1, 12);
		expect(at(1, 0).maxRadius).toBeGreaterThan(at(1, 101_325).maxRadius);
		expect(at(1, 10_000).maxRadius).toBeGreaterThan(at(1, 90_000).maxRadius);
	});

	test('an engine scales its own length and width', () => {
		const s = plumeShape({ ...base, throttle: 1, ambientPressure: 90_000 });
		const plain = templateLook(s, resolveTemplate({ propellant: 'kerolox' }));
		const long = templateLook(
			s,
			resolveTemplate({ propellant: 'kerolox', lengthScale: 2, widthScale: 0.5 })
		);
		expect(long.length).toBeCloseTo(2 * plain.length, 12);
		expect(long.maxRadius).toBeCloseTo(0.5 * plain.maxRadius, 12);
	});

	test('the old colour override still sets the outer flame', () => {
		expect(resolveTemplate(undefined, '#ff0000').colours.outer).toEqual([1, 0, 0]);
		expect(resolveTemplate({ propellant: 'hydrolox' }, '#ff0000').colours.outer).toEqual([1, 0, 0]);
		expect(
			resolveTemplate({ propellant: 'hydrolox', color: '#00ff00' }, '#ff0000').colours.outer
		).toEqual([0, 1, 0]);
	});
});
