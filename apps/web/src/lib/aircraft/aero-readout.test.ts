/** Aircraft read-outs (plan 063, ADR 0161 point 6). */
import { describe, expect, it } from 'vitest';
import { aeroReadout, wingStallAngle } from './aero-readout';

const R = 600_000;
const body = {
	radius: R,
	rotationPeriod: 1e12, // no spin: the air is still in the inertial frame
	atmosphere: { scaleHeight: 5_600, surfacePressure: 101_325, height: 70_000 }
} as never;
/** Nose (+Y) north (+Y at longitude 0) and +Z up (+X there). */
const LEVEL = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };

describe('aircraft read-outs (plan 063)', () => {
	it('angle of attack, indicated airspeed and glide ratio from a stated state', () => {
		// at 5 600 m (density e^-1 of sea level), level nose, flying north at 100 m/s and sinking 10
		const v = {
			position: { x: R + 5_600, y: 0, z: 0 },
			velocity: { x: -10, y: 100, z: 0 },
			orientation: LEVEL
		};
		const a = aeroReadout(v, body, 15)!;
		expect(a.aoa).toBeCloseTo((Math.atan2(10, 100) * 180) / Math.PI, 6);
		expect(a.tas).toBeCloseTo(Math.hypot(10, 100), 9);
		expect(a.ias).toBeCloseTo(a.tas * Math.exp(-0.5), 6);
		expect(a.glide).toBeCloseTo(10, 9);
		expect(a.stall).toBe(false);
	});

	it('warns within 2 degrees of the stall, and reads nothing without wings or out of the air', () => {
		const sink = Math.tan((13.5 * Math.PI) / 180) * 50;
		const steep = {
			position: { x: R + 1_000, y: 0, z: 0 },
			velocity: { x: -sink, y: 50, z: 0 },
			orientation: LEVEL
		};
		expect(aeroReadout(steep, body, 15)!.stall).toBe(true);
		expect(aeroReadout(steep, body, null)).toBeNull();
		const high = { ...steep, position: { x: R + 80_000, y: 0, z: 0 } };
		expect(aeroReadout(high, body, 15)).toBeNull();
	});

	it('the stall angle is the smallest of the wings', () => {
		const parts = new Map([
			['w', { modules: [['stock.wing', { stallAngle: 12 }]] as const }],
			['v', { modules: [['stock.wing', {}]] as const }],
			['t', { modules: [['stock.tank', {}]] as const }]
		]);
		expect(wingStallAngle(['w', 'v', 't'], parts)).toBe(12);
		expect(wingStallAngle(['t'], parts)).toBeNull();
	});
});
