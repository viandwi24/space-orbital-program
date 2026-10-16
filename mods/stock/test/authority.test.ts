/** Plan 042 / ADR 0049: what each steering module reports as its control authority. */
import { describe, expect, test } from 'bun:test';
import { ModuleControlSurface, ModuleEngine, ModuleReactionWheel } from '../src/index.ts';
import { gimbalAuthority, surfaceAuthority } from '../src/steering.ts';
import { contextFor, fakeVessel } from './helpers.ts';

const DEG = Math.PI / 180;
const ZERO = { x: 0, y: 0, z: 0 };

describe('reaction wheel', () => {
	const config = { torque: 5_000, chargeRate: 0.6 };

	test('its torque on every axis while powered and enabled', () => {
		const vessel = fakeVessel({ 'stock.electric-charge': 10 });
		const ctx = contextFor(ModuleReactionWheel, config, vessel);
		expect(ModuleReactionWheel.controlAuthority?.(ctx)).toEqual({ x: 5_000, y: 5_000, z: 5_000 });
	});

	test('nothing without charge or when disabled; a wheel that draws no charge always works', () => {
		const empty = contextFor(ModuleReactionWheel, config, fakeVessel());
		expect(ModuleReactionWheel.controlAuthority?.(empty)).toEqual(ZERO);
		const off = contextFor(
			ModuleReactionWheel,
			config,
			fakeVessel({ 'stock.electric-charge': 10 })
		);
		off.state.enabled = false;
		expect(ModuleReactionWheel.controlAuthority?.(off)).toEqual(ZERO);
		const free = contextFor(ModuleReactionWheel, { torque: 100 }, fakeVessel());
		expect(ModuleReactionWheel.controlAuthority?.(free)).toEqual({ x: 100, y: 100, z: 100 });
	});
});

describe('gimbal engine', () => {
	const engine = {
		thrust: 215_000,
		ispVacuum: 300,
		ispSeaLevel: 280,
		propellants: [{ resource: 'stock.liquid-fuel', ratio: 1 }],
		gimbal: { range: 3, rate: 20 }
	};

	test('lit, 6 m below the centre of mass: T sin(3 deg) * 6 about pitch and about yaw', () => {
		const vessel = fakeVessel({ 'stock.liquid-fuel': 1e9 });
		vessel.centre = { x: 0, y: 6, z: 0 };
		const ctx = contextFor(ModuleEngine, engine, vessel);
		ctx.state.ignited = true;
		ctx.state.throttle = 1;
		const a = ModuleEngine.controlAuthority?.(ctx)!;
		const expected = 215_000 * Math.sin(3 * DEG) * 6;
		expect(a.x).toBeCloseTo(expected, 3);
		expect(a.z).toBeCloseTo(expected, 3);
		expect(a.y).toBeCloseTo(0, 9);
	});

	test('the lever sign does not matter; a short lever has proportionally less', () => {
		expect(gimbalAuthority({ x: 0, y: -6, z: 0 }, 1000, 0.05).x).toBeCloseTo(
			gimbalAuthority({ x: 0, y: 6, z: 0 }, 1000, 0.05).x,
			9
		);
		const near = gimbalAuthority({ x: 0, y: 0.5, z: 0 }, 1000, 0.05);
		expect(near.x).toBeCloseTo(1000 * Math.sin(0.05) * 0.5 * 0.5, 9);
	});

	test('cold, flamed out, throttled down to nothing or without a range: nothing', () => {
		const vessel = fakeVessel({ 'stock.liquid-fuel': 1e9 });
		vessel.centre = { x: 0, y: 6, z: 0 };
		const cold = contextFor(ModuleEngine, engine, vessel);
		expect(ModuleEngine.controlAuthority?.(cold)).toEqual(ZERO);
		const fixed = contextFor(ModuleEngine, { ...engine, gimbal: { range: 0, rate: 20 } }, vessel);
		fixed.state.ignited = true;
		fixed.state.throttle = 1;
		expect(ModuleEngine.controlAuthority?.(fixed)).toEqual(ZERO);
		const out = contextFor(ModuleEngine, engine, vessel);
		out.state.ignited = true;
		out.state.flameout = true;
		out.state.throttle = 1;
		expect(ModuleEngine.controlAuthority?.(out)).toEqual(ZERO);
	});
});

describe('control surface', () => {
	const config = {
		area: 1.2,
		liftSlope: 2,
		crossflow: 1.2,
		centre: [0, -0.1, 0] as [number, number, number],
		maxDeflection: 25,
		deflectionRate: 60,
		damping: 0
	};

	test('none in vacuum', () => {
		const vessel = fakeVessel();
		vessel.centre = { x: 0, y: 3.5, z: 0 };
		const ctx = contextFor(ModuleControlSurface, config, vessel);
		expect(ModuleControlSurface.controlAuthority?.(ctx)).toEqual(ZERO);
	});

	test('in air: the force change over the range times the lever, about pitch', () => {
		const vessel = fakeVessel();
		vessel.air = { x: 0, y: -1_000, z: 0 };
		vessel.ambient.density = 0.09;
		vessel.centre = { x: 0, y: 3.5, z: 0 };
		const ctx = contextFor(ModuleControlSurface, config, vessel);
		const a = ModuleControlSurface.controlAuthority?.(ctx)!;
		// 25 degrees at 1 km/s in 0.09 kg/m3 gives a normal force of about 52 940 N (steering.test.ts),
		// 3.6 m from the centre of mass.
		expect(a.x).toBeGreaterThan(0.9 * 52_940 * 0.9063 * 3.6);
		expect(a.x).toBeLessThan(1.1 * 52_940 * 0.9063 * 3.6);
		expect(a.y).toBeCloseTo(0, 6);
	});

	test('a surface at the centre of mass has none', () => {
		expect(
			surfaceAuthority({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 5 })
		).toEqual(ZERO);
	});
});
