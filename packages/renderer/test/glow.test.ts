import { describe, expect, test } from 'bun:test';
import { GLOW_THRESHOLD_K, glowColour, glowEmissive } from '../src/effects/glow.ts';
import {
	AIR_GAS_CONSTANT,
	AIR_TEMPERATURE,
	airDensity,
	airVelocity,
	plasmaIntensity,
	stagnationFlux
} from '../src/effects/reentry.ts';
import { angularVelocity } from '../src/effects/transitions.ts';

const ATMO = { scaleHeight: 5600, surfacePressure: 101_325, height: 70_000 };
const max = (c: readonly number[]) => Math.max(...c);

describe('part glow', () => {
	test('exactly zero at or below the threshold and non-decreasing above', () => {
		for (const t of [0, 300, 500, GLOW_THRESHOLD_K]) expect(max(glowEmissive(t))).toBe(0);
		let last = 0;
		for (let t = 600; t <= 4500; t += 25) {
			const v = max(glowEmissive(t));
			expect(v).toBeGreaterThanOrEqual(last);
			last = v;
		}
		expect(max(glowEmissive(700))).toBeGreaterThan(0);
	});

	test('red at 900 K, nearly white at 3000 K', () => {
		const [r, g, b] = glowColour(900);
		expect(r).toBeGreaterThan(g);
		expect(g).toBeGreaterThan(b);
		const w = glowColour(3000);
		expect(Math.min(...w) / Math.max(...w)).toBeGreaterThan(0.7);
	});

	test('the brightest channel passes the bloom threshold (3) at 2000 K and not at 1000 K', () => {
		expect(max(glowEmissive(2000))).toBeGreaterThan(3);
		expect(max(glowEmissive(1000))).toBeLessThan(3);
	});

	test('non-finite temperatures do not glow', () => {
		expect(max(glowEmissive(Number.NaN))).toBe(0);
		expect(max(glowEmissive(Number.POSITIVE_INFINITY))).toBe(0);
	});
});

describe('re-entry plasma', () => {
	test('no plasma at 300 m/s at sea level, none at 7800 m/s in vacuum, strong at 7000 m/s at 45 km', () => {
		expect(plasmaIntensity(300, 0, ATMO)).toBe(0);
		expect(plasmaIntensity(7800, 120_000, ATMO)).toBe(0);
		expect(plasmaIntensity(7000, 45_000, ATMO)).toBeGreaterThan(0.5);
	});

	test('intensity does not decrease with speed', () => {
		let last = 0;
		for (let v = 0; v <= 9000; v += 250) {
			const i = plasmaIntensity(v, 50_000, ATMO);
			expect(i).toBeGreaterThanOrEqual(last);
			last = i;
		}
	});

	test('uses the same stagnation law as the simulation', () => {
		const rho = 101_325 / (AIR_GAS_CONSTANT * AIR_TEMPERATURE);
		expect(airDensity(ATMO, 0)).toBeCloseTo(rho, 9);
		expect(rho).toBeCloseTo(1.225, 3);
		expect(stagnationFlux(1.225, 0.625, 100)).toBeCloseTo(
			1.74e-4 * Math.sqrt(1.225 / 0.625) * 1e6,
			6
		);
	});

	test('airspeed subtracts the body rotation: a vessel at rest on the equator has airspeed < 1 m/s', () => {
		const omega = { x: 0, y: (2 * Math.PI) / 21_600, z: 0 };
		const r = { x: 600_000, y: 0, z: 0 };
		const inertial = { x: 0, y: 0, z: -omega.y * r.x }; // omega x r for omega along +Y
		const air = airVelocity(inertial, r, omega);
		expect(Math.hypot(air.x, air.y, air.z)).toBeLessThan(1);
		expect(Math.hypot(inertial.x, inertial.y, inertial.z)).toBeGreaterThan(100);
	});

	test('angular velocity from two orientations recovers the rotation rate', () => {
		const w = (2 * Math.PI) / 21_600;
		const q = (t: number) => ({ x: 0, y: Math.sin((w * t) / 2), z: 0, w: Math.cos((w * t) / 2) });
		const o = angularVelocity(q(100), q(101), 1);
		expect(o.y).toBeCloseTo(w, 9);
		expect(Math.abs(o.x) + Math.abs(o.z)).toBeLessThan(1e-12);
		expect(angularVelocity(q(0), q(1), 0)).toEqual({ x: 0, y: 0, z: 0 });
	});
});
