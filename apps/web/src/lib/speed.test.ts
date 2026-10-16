import { describe, expect, it } from 'vitest';
import {
	autoSpeedMode,
	nextSpeedMode,
	speedModeLimit,
	speedReadout,
	spin,
	surfaceVelocity
} from './speed';

const body = {
	rotationPeriod: 21_600,
	atmosphere: { scaleHeight: 5_600, surfacePressure: 101_325, height: 70_000 }
};
const airless: { rotationPeriod: number; atmosphere?: undefined } = { rotationPeriod: 21_600 };
const R = 600_000;
const omega = spin(body);

describe('surface velocity', () => {
	it('is zero for a point fixed to the rotating ground (snapshot v = omega x r)', () => {
		const p = { x: R, y: 0, z: 0 };
		const v = { x: 0, y: 0, z: -omega * R }; // omega(+Y) x (R,0,0) = (0,0,-omega R)
		const s = surfaceVelocity(p, v, omega);
		expect(Math.hypot(s.x, s.y, s.z)).toBeLessThan(1e-9);
		const r = speedReadout({ position: p, velocity: v, altitude: 0, body, preference: 'auto' });
		expect(r.mode).toBe('surface');
		expect(r.speed).toBeLessThan(0.01);
		expect(r.vertical).toBeCloseTo(0, 9);
	});
	it('is the inertial speed minus the rotation otherwise (inertial in orbit mode)', () => {
		const p = { x: R + 100_000, y: 0, z: 0 };
		const v = { x: 0, y: 0, z: -2_300 };
		const orbit = speedReadout({
			position: p,
			velocity: v,
			altitude: 100_000,
			body,
			preference: 'orbit'
		});
		expect(orbit.speed).toBeCloseTo(2_300, 9);
		const surf = speedReadout({
			position: p,
			velocity: v,
			altitude: 100_000,
			body,
			preference: 'surface'
		});
		expect(surf.speed).toBeCloseTo(2_300 - omega * p.x, 9);
	});
	it('reports vertical speed along the local up', () => {
		const r = speedReadout({
			position: { x: R, y: 0, z: 0 },
			velocity: { x: 50, y: 0, z: -omega * R },
			altitude: 0,
			body,
			preference: 'surface'
		});
		expect(r.vertical).toBeCloseTo(50, 9);
	});
});

describe('auto speed mode', () => {
	it('switches at the top of the atmosphere (10 km without one)', () => {
		expect(speedModeLimit(body)).toBe(70_000);
		expect(speedModeLimit(airless)).toBe(10_000);
		expect(autoSpeedMode(69_999, body)).toBe('surface');
		expect(autoSpeedMode(70_000, body)).toBe('orbit');
		expect(autoSpeedMode(9_999, airless)).toBe('surface');
	});
	it('has hysteresis when coming back down', () => {
		expect(autoSpeedMode(68_000, body, 'orbit')).toBe('orbit');
		expect(autoSpeedMode(66_000, body, 'orbit')).toBe('surface');
		expect(autoSpeedMode(68_000, body, 'surface')).toBe('surface');
	});
	it('V cycles auto, surface, orbit', () => {
		expect(nextSpeedMode('auto')).toBe('surface');
		expect(nextSpeedMode('surface')).toBe('orbit');
		expect(nextSpeedMode('orbit')).toBe('auto');
	});
});
