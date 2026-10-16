import { describe, expect, test } from 'bun:test';
import { plumeShape, ambientPressureAt, type PlumeInput } from '../src/effects/plume.ts';

const base: PlumeInput = {
	throttle: 1,
	ignited: true,
	flameout: false,
	ambientPressure: 101_325,
	exitPressure: 90_000,
	baseLength: 7,
	exitRadius: 0.46
};
const at = (patch: Partial<PlumeInput>) => plumeShape({ ...base, ...patch });

describe('plume shape (plan 020)', () => {
	test('no plume at zero throttle, unlit or flamed out', () => {
		expect(at({ throttle: 0 }).visible).toBe(false);
		expect(at({ ignited: false }).visible).toBe(false);
		expect(at({ flameout: true }).visible).toBe(false);
		expect(at({ throttle: 0 }).length).toBe(0);
	});

	test('length and brightness do not decrease with throttle', () => {
		let length = 0;
		let brightness = 0;
		for (let t = 0.05; t <= 1.0001; t += 0.05) {
			const s = at({ throttle: t });
			expect(s.length).toBeGreaterThanOrEqual(length);
			expect(s.brightness).toBeGreaterThanOrEqual(brightness);
			length = s.length;
			brightness = s.brightness;
		}
	});

	test('the far plume is at least 2.5x wider in vacuum than at sea level', () => {
		const sea = at({});
		const vac = at({ ambientPressure: 0 });
		expect(vac.maxRadius / sea.maxRadius).toBeGreaterThanOrEqual(2.5);
		expect(sea.expansion).toBeLessThanOrEqual(1);
	});

	test('width grows monotonically as the air thins from 101 kPa to vacuum', () => {
		let width = 0;
		for (let p = 101_325; p >= 0; p -= 5_000) {
			const w = at({ ambientPressure: p }).maxRadius;
			expect(w).toBeGreaterThanOrEqual(width - 1e-12);
			width = w;
		}
		expect(at({ ambientPressure: 0 }).maxRadius).toBeGreaterThanOrEqual(width - 1e-12);
	});

	test('the vacuum plume is between 0.45 and 0.8 of the sea-level length', () => {
		const ratio = at({ ambientPressure: 0 }).length / at({}).length;
		expect(ratio).toBeGreaterThan(0.45);
		expect(ratio).toBeLessThan(0.8);
	});

	test('shock diamonds only while the ambient pressure is within 0.3 to 1.2 of the exit pressure', () => {
		const pe = 90_000;
		expect(at({ ambientPressure: 0.2 * pe }).diamonds).toBe(0);
		expect(at({ ambientPressure: 1.3 * pe }).diamonds).toBe(0);
		expect(at({ ambientPressure: 0.75 * pe }).diamonds).toBeGreaterThan(0.5);
		expect(at({ ambientPressure: 1.1 * pe }).diamonds).toBeGreaterThan(0);
	});

	test('non-finite inputs give a finite shape', () => {
		const s = plumeShape({
			throttle: Number.NaN,
			ignited: true,
			flameout: false,
			ambientPressure: Number.POSITIVE_INFINITY,
			exitPressure: Number.NaN,
			baseLength: Number.NaN,
			exitRadius: Number.NaN
		});
		for (const v of Object.values(s))
			if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
		const t = at({ ambientPressure: Number.NaN, exitPressure: -5 });
		for (const v of Object.values(t))
			if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
	});

	test('ambient pressure follows the exponential atmosphere and is zero above its top', () => {
		const atmo = { scaleHeight: 5600, surfacePressure: 101_325, height: 70_000 };
		expect(ambientPressureAt(atmo, 0)).toBe(101_325);
		expect(ambientPressureAt(atmo, 5600)).toBeCloseTo(101_325 / Math.E, 6);
		expect(ambientPressureAt(atmo, 70_000)).toBe(0);
		expect(ambientPressureAt(undefined, 10)).toBe(0);
	});
});
