/** Plan 385: the ascent holds the dynamic pressure under max-Q, so a heavy stack keeps its attitude. */
import { describe, expect, test } from 'bun:test';
import type { VesselPilot } from '@orbital/sdk';
import { ASCENT_Q_EASE, ASCENT_Q_LIMIT, dynamicPressure, maxQThrottle } from '../src/autopilots.ts';

const RADIUS = 6_371_000;
/** A pilot at `altitude` moving `speed` m/s east relative to a body that does not turn. */
const pilotAt = (altitude: number, speed: number, air = true): VesselPilot =>
	({
		body: {
			id: 'x.home',
			mu: 3.986e14,
			radius: RADIUS,
			atmosphereHeight: 100_000,
			angularVelocity: { x: 0, y: 0, z: 0 },
			...(air ? { air: { surfaceDensity: 1.225, scaleHeight: 8_500 } } : {})
		},
		vessel: {
			position: { x: RADIUS + altitude, y: 0, z: 0 },
			velocity: { x: 0, y: 0, z: speed }
		}
	}) as unknown as VesselPilot;

describe('max-Q throttle (plan 385)', () => {
	test('the dynamic pressure is half the density times the speed squared, thinning with height', () => {
		expect(dynamicPressure(pilotAt(0, 100))).toBeCloseTo(0.5 * 1.225 * 100 ** 2, 3);
		const at10 = dynamicPressure(pilotAt(10_000, 400));
		expect(at10).toBeCloseTo(0.5 * 1.225 * Math.exp(-10_000 / 8_500) * 400 ** 2, 1);
		expect(dynamicPressure(pilotAt(120_000, 8_000))).toBe(0);
		expect(dynamicPressure(pilotAt(0, 100, false))).toBe(0);
	});

	test('full throttle in thin or slow air, easing from the ease line to the floor at the limit', () => {
		expect(maxQThrottle(pilotAt(0, 100))).toBe(1);
		expect(maxQThrottle(pilotAt(60_000, 3_000))).toBe(1);
		// speed for a pressure at sea level: q = 0.5 ρ v²
		const speedFor = (q: number) => Math.sqrt((2 * q) / 1.225);
		expect(maxQThrottle(pilotAt(0, speedFor(ASCENT_Q_EASE - 1)))).toBe(1);
		const mid = maxQThrottle(pilotAt(0, speedFor((ASCENT_Q_EASE + ASCENT_Q_LIMIT) / 2)));
		expect(mid).toBeGreaterThan(0.5);
		expect(mid).toBeLessThan(1);
		expect(maxQThrottle(pilotAt(0, speedFor(ASCENT_Q_LIMIT * 2)))).toBeCloseTo(0.35, 6);
	});

	test('a rescaled planet at ten kilometres: 880 m/s is far over the limit, 450 m/s is not', () => {
		const rho = 1.225 * Math.exp(-10_000 / 8_500);
		expect(0.5 * rho * 880 ** 2).toBeGreaterThan(ASCENT_Q_LIMIT);
		expect(maxQThrottle(pilotAt(10_000, 880))).toBeLessThan(0.5);
		expect(maxQThrottle(pilotAt(10_000, 450))).toBe(1);
	});
});
