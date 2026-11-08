/** The sky light colours kept while the sun and the camera barely move (plan 418). */
import { describe, expect, test } from 'bun:test';
import {
	atmosphereFor,
	horizonColour,
	skyAmbient,
	sunTransmittance
} from '../src/atmosphere-model.ts';
import {
	SKY_LIGHT_ALTITUDE_TOLERANCE,
	SKY_LIGHT_ELEVATION_TOLERANCE,
	SkyLightCache
} from '../src/sky-light-cache.ts';

const atm = atmosphereFor(600_000, 70_000);
const DEG = Math.PI / 180;

describe('SkyLightCache', () => {
	test('gives what the model gives', () => {
		const c = new SkyLightCache();
		const l = c.get(atm, 120, 0.3);
		expect(l.sunT).toEqual(sunTransmittance(atm, 120, 0.3));
		expect(l.ambient).toEqual(skyAmbient(atm, 120, 0.3));
		expect(l.horizon).toEqual(horizonColour(atm, 120, 0.3));
	});

	test('works the colours out once while the sun and the camera barely move', () => {
		const c = new SkyLightCache();
		const first = c.get(atm, 100, 0.3);
		for (let i = 0; i < 100; i++) {
			// real time: the sun moves 7e-5 rad a second, at 120 frames a second
			expect(c.get(atm, 100.1, 0.3 + (i * 7e-5) / 120)).toBe(first);
		}
		expect(c.computed).toBe(1);
	});

	test('works them out again when the sun, the altitude or the atmosphere changes', () => {
		const c = new SkyLightCache();
		c.get(atm, 100, 0.3);
		c.get(atm, 100, 0.3 + 2 * SKY_LIGHT_ELEVATION_TOLERANCE);
		expect(c.computed).toBe(2);
		c.get(atm, 100 + 2 * SKY_LIGHT_ALTITUDE_TOLERANCE, 0.3 + 2 * SKY_LIGHT_ELEVATION_TOLERANCE);
		expect(c.computed).toBe(3);
		c.get(
			atmosphereFor(300_000, 20_000),
			100 + 2 * SKY_LIGHT_ALTITUDE_TOLERANCE,
			0.3 + 2 * SKY_LIGHT_ELEVATION_TOLERANCE
		);
		expect(c.computed).toBe(4);
	});

	test('under time warp every frame is worked out, as before', () => {
		const c = new SkyLightCache();
		for (let i = 0; i < 10; i++) c.get(atm, 100, i * 0.05);
		expect(c.computed).toBe(10);
	});

	test('the tolerance is below what a colour step would show: the transmittance at dusk moves under 1 % of its span', () => {
		const a = sunTransmittance(atm, 0, 0 * DEG);
		const b = sunTransmittance(atm, 0, SKY_LIGHT_ELEVATION_TOLERANCE);
		for (let k = 0; k < 3; k++) expect(Math.abs(a[k]! - b[k]!)).toBeLessThan(0.01);
	});
});
