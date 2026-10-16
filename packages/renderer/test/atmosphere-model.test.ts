import { describe, expect, test } from 'bun:test';
import {
	atmosphereFor,
	horizonColour,
	hitsPlanet,
	luminance,
	skyAmbient,
	skyRadiance,
	sunTransmittance
} from '../src/atmosphere-model.ts';
import { DEG } from '../src/vec.ts';

const atm = atmosphereFor(600_000, 70_000);

describe('atmosphere model', () => {
	test('noon zenith is blue: blue exceeds green exceeds red', () => {
		const [r, g, b] = skyRadiance(atm, 0, 85 * DEG, 60 * DEG, 0);
		expect(b).toBeGreaterThan(g);
		expect(g).toBeGreaterThan(r);
		expect(luminance([r, g, b])).toBeGreaterThan(0.05);
	});

	test('direct sun light reddens as the sun lowers (red/blue ratio rises monotonically)', () => {
		let last = 0;
		for (const e of [60, 30, 15, 8, 4, 2, 1]) {
			const [r, , b] = sunTransmittance(atm, 0, e * DEG);
			const ratio = r / b;
			expect(ratio).toBeGreaterThan(last);
			last = ratio;
		}
		expect(last).toBeGreaterThan(3); // clearly orange at 1 degree
	});

	test('sunset sky near the sun is redder than the noon zenith', () => {
		const noon = skyRadiance(atm, 0, 85 * DEG, 60 * DEG, 0);
		const dusk = skyRadiance(atm, 0, 5 * DEG, 3 * DEG, 0);
		expect(dusk[0] / dusk[2]).toBeGreaterThan(noon[0] / noon[2]);
	});

	test('transmittance is monotonic in altitude and 1 above the atmosphere', () => {
		let last = 0;
		for (const h of [0, 2_000, 8_000, 20_000, 50_000, 71_000]) {
			const t = sunTransmittance(atm, h, 20 * DEG)[2];
			expect(t).toBeGreaterThanOrEqual(last);
			last = t;
		}
		expect(last).toBeCloseTo(1, 6);
	});

	test('sky luminance at 200 km altitude looking at the horizon is below 1 % of the ground value', () => {
		const ground = luminance(skyRadiance(atm, 0, 10 * DEG, 40 * DEG, 1));
		const space = luminance(skyRadiance(atm, 200_000, 85 * DEG, 40 * DEG, 1));
		expect(space).toBeLessThan(ground * 0.01);
	});

	test('limb of the planet seen from orbit is lit on the day side and dark on the night side', () => {
		// looking just above the geometric horizon from 100 km
		const horizon = Math.acos(600_000 / 700_000); // dip below horizontal
		const day = luminance(skyRadiance(atm, 100_000, -horizon + 0.5 * DEG, 60 * DEG, Math.PI));
		const night = luminance(skyRadiance(atm, 100_000, -horizon + 0.5 * DEG, -30 * DEG, Math.PI));
		expect(day).toBeGreaterThan(night * 20);
	});

	test('a ray into the ground hits the planet, a ray up does not', () => {
		expect(hitsPlanet(atm, 600_010, -0.5)).toBe(true);
		expect(hitsPlanet(atm, 600_010, 0.5)).toBe(false);
	});

	test('ambient and horizon colours are finite and positive at noon', () => {
		for (const c of [skyAmbient(atm, 0, 50 * DEG), horizonColour(atm, 0, 50 * DEG)]) {
			for (const v of c) {
				expect(Number.isFinite(v)).toBe(true);
				expect(v).toBeGreaterThan(0);
			}
		}
	});
});
