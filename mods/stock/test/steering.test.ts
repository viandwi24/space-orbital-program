/** Plan 033 / ADR 0045, 0046: the mixer, the gimbal, the control surface and the fin damping, without a sim. */
import { describe, expect, test } from 'bun:test';
import {
	ModuleControlSurface,
	ModuleEngine,
	ModuleFin,
	controlSurfaceForce,
	finDampingForce,
	finNormalForce
} from '../src/index.ts';
import { cross, gimbalDirection, gimbalTarget, mixFraction, slew } from '../src/steering.ts';
import { contextFor, fakeVessel } from './helpers.ts';

const DEG = Math.PI / 180;
const engine = {
	thrust: 215_000,
	ispVacuum: 300,
	ispSeaLevel: 280,
	propellants: [{ resource: 'stock.liquid-fuel', ratio: 1 }],
	gimbal: { range: 3, rate: 20 }
};

describe('mixer (ADR 0045)', () => {
	test('the demand fraction is the deflection fraction; the sign follows the lever', () => {
		const t = { x: 4, y: 0, z: 0 };
		expect(mixFraction({ x: 1, y: 0, z: 0 }, t)).toBe(1);
		expect(mixFraction({ x: 0.3, y: 0, z: 0 }, t)).toBeCloseTo(0.3, 12);
		expect(mixFraction({ x: -0.3, y: 0, z: 0 }, t)).toBeCloseTo(-0.3, 12);
		expect(mixFraction({ x: 1, y: 0, z: 0 }, { x: -4, y: 0, z: 0 })).toBe(-1);
		expect(mixFraction({ x: 0, y: 1, z: 0 }, t)).toBe(0);
	});

	test('a lever under 1 m has proportionally less authority; none has none', () => {
		expect(mixFraction({ x: 1, y: 0, z: 0 }, { x: 0.4, y: 0, z: 0 })).toBeCloseTo(0.4, 12);
		expect(mixFraction({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })).toBe(0);
	});

	test('slew moves by at most the step', () => {
		expect(slew(0, 1, 0.25)).toBe(0.25);
		expect(slew(0.9, 1, 0.25)).toBe(1);
		expect(slew(0, -1, 0.25)).toBe(-0.25);
	});

	test('gimbal direction is a unit vector', () => {
		const d = gimbalDirection(0.05, -0.04);
		expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 12);
		expect(d.x).toBeCloseTo(Math.sin(0.05), 12);
	});
});

describe('gimbal torque by hand (ADR 0045)', () => {
	/** Run the engine until its angles settle and return the last force and the torque about the centre of mass. */
	function settle(
		com: { x: number; y: number; z: number },
		demand: { x: number; y: number; z: number }
	) {
		const vessel = fakeVessel({ 'stock.liquid-fuel': 1e9 });
		vessel.centre = com;
		vessel.demand = demand;
		vessel.control.throttle = 1;
		const ctx = contextFor(ModuleEngine, engine, vessel);
		ModuleEngine.onStage?.(ctx);
		for (let i = 0; i < 20; i++) {
			vessel.forces.length = 0;
			ModuleEngine.update?.(ctx, 0.02);
		}
		const force = vessel.forces[0]!.force;
		const torque = cross({ x: -com.x, y: -com.y, z: -com.z }, force);
		return { force, torque, state: ctx.state };
	}

	test('engine 6 m below the centre of mass, full pitch: torque = T sin(3 deg) * 6 about +X', () => {
		const { force, torque } = settle({ x: 0, y: 6, z: 0 }, { x: 1, y: 0, z: 0 });
		const lateral = 215_000 * Math.sin(3 * DEG);
		expect(force.z).toBeCloseTo(-lateral, 6);
		expect(torque.x).toBeCloseTo(lateral * 6, 3);
		expect(torque.x).toBeCloseTo(215_000 * 0.052336 * 6, -1); // 11 252 N * 6 m = 67.5 kN m
		expect(Math.hypot(force.x, force.y, force.z)).toBeCloseTo(215_000, 6);
	});

	test('the same engine above the centre of mass steers the other way for the same demand', () => {
		const { force, torque } = settle({ x: 0, y: -3, z: 0 }, { x: 1, y: 0, z: 0 });
		expect(force.z).toBeGreaterThan(0);
		expect(torque.x).toBeGreaterThan(0);
	});

	test('yaw demand tilts towards X and gives torque about +Z', () => {
		const { torque } = settle({ x: 0, y: 6, z: 0 }, { x: 0, y: 0, z: 1 });
		expect(torque.z).toBeCloseTo(215_000 * Math.sin(3 * DEG) * 6, 3);
		expect(torque.x).toBeCloseTo(0, 6);
	});

	test('half the demand, half the angle; no demand, no side force at all', () => {
		const half = settle({ x: 0, y: 6, z: 0 }, { x: 0.5, y: 0, z: 0 });
		expect(half.state.gimbal[1]).toBeCloseTo(-0.5 * 3 * DEG, 12);
		const none = settle({ x: 0, y: 6, z: 0 }, { x: 0, y: 0, z: 0 });
		expect(none.force.x).toBe(0);
		expect(none.force.z).toBe(0);
		expect(none.force.y).toBeCloseTo(215_000, 6);
	});

	test('target angles come from the lever arm: engine at the centre of mass cannot steer', () => {
		expect(gimbalTarget({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, 0.05)).toEqual([0, 0]);
	});
});

describe('control surface by hand (ADR 0045)', () => {
	const config = {
		area: 1.2,
		liftSlope: 2,
		crossflow: 1.2,
		centre: [0, -0.1, 0] as [number, number, number],
		maxDeflection: 25,
		deflectionRate: 60,
		damping: 0
	};

	test('25 degrees at 1 km/s in 0.09 kg/m3: normal force 52 940 N, moment 47 978 N * arm', () => {
		const vessel = fakeVessel();
		vessel.air = { x: 0, y: -1_000, z: 0 };
		vessel.ambient.density = 0.09;
		vessel.centre = { x: 0, y: 3.5, z: 0 }; // 3.6 m between the centre of pressure and the centre of mass
		vessel.demand = { x: 1, y: 0, z: 0 };
		const ctx = contextFor(ModuleControlSurface, config, vessel);
		for (let i = 0; i < 40; i++) {
			vessel.forces.length = 0;
			ModuleControlSurface.update?.(ctx, 0.02);
		}
		expect(ctx.state.deflection).toBeCloseTo(25 * DEG, 12);
		const { force, point } = vessel.forces[0]!;
		// Hand numbers: sin 25 = 0.422618, cos 25 = 0.906308; (2 * 0.422618 * 0.906308 + 1.2 * 0.178606) = 0.98037
		const normal = 0.5 * 0.09 * 1_000 ** 2 * 1.2 * 0.98037;
		expect(Math.abs(force.z)).toBeGreaterThan(normal * 0.906308 * 0.95);
		expect(Math.abs(force.z)).toBeLessThan(normal * 0.906308 * 1.05);
		expect(force.z).toBeLessThan(0); // positive pitch demand, positive deflection: force towards -Z
		const arm = cross({ x: 0, y: -0.1 - 3.5, z: 0 }, force);
		expect(point).toEqual({ x: 0, y: -0.1, z: 0 });
		expect(arm.x).toBeCloseTo(-3.6 * force.z, 6);
		expect(arm.x).toBeGreaterThan(0); // the pitch the demand asked for
	});

	test('the opposite demand deflects the other way; the force at zero deflection is the plain fin law', () => {
		const vessel = fakeVessel();
		vessel.air = { x: 0, y: -1_000, z: 0 };
		vessel.ambient.density = 0.09;
		vessel.centre = { x: 0, y: 3.5, z: 0 };
		vessel.demand = { x: -1, y: 0, z: 0 };
		const ctx = contextFor(ModuleControlSurface, config, vessel);
		ModuleControlSurface.update?.(ctx, 0.02);
		expect(ctx.state.deflection).toBeLessThan(0);
		const v = { x: 100, y: -900, z: 40 };
		const f = controlSurfaceForce(ModuleControlSurface.config!.parse(config), v, 0.09, 0);
		expect(f.z).toBeCloseTo(finNormalForce(ModuleFin.config!.parse(config), v, 0.09), 9);
		expect(f.y).toBeCloseTo(0, 9);
	});

	test('backward flow reverses the sign of the deflection', () => {
		const vessel = fakeVessel();
		vessel.air = { x: 0, y: 800, z: 0 };
		vessel.ambient.density = 0.09;
		vessel.centre = { x: 0, y: 3.5, z: 0 };
		vessel.demand = { x: 1, y: 0, z: 0 };
		const ctx = contextFor(ModuleControlSurface, config, vessel);
		ModuleControlSurface.update?.(ctx, 0.02);
		expect(ctx.state.deflection).toBeLessThan(0); // forward flow gave a positive deflection for this demand
	});
});

describe('fin damping (ADR 0046)', () => {
	test('damping 0 is the plan-026 force exactly; a rotating fin gets extra force against its motion', () => {
		const base = { area: 1.5, liftSlope: 2, crossflow: 1.2, centre: [0, -0.15, 0] };
		const plain = ModuleFin.config!.parse({ ...base, damping: 0 });
		expect(finDampingForce(plain, 1_500, 0.09, 3)).toBeCloseTo(0, 12);
		const damped = ModuleFin.config!.parse(base);
		expect(damped.damping).toBe(60);
		// w = +2 m/s of rotational flow along +Z: force opposes it.
		const f = finDampingForce(damped, 1_500, 0.09, 2);
		expect(f).toBeCloseTo(-0.5 * 0.09 * 1_500 * 1.5 * 2 * 60 * 2, 6);
	});

	test('the module applies the plain force when nothing rotates, and adds the damping when the point moves relative to the centre of mass', () => {
		const vessel = fakeVessel();
		vessel.ambient.density = 0.09;
		vessel.centre = { x: 0, y: 3, z: 0 };
		vessel.airAt = (p) => (p.y === 3 ? { x: 0, y: -1_000, z: 0 } : { x: 0, y: -1_000, z: 2 });
		const ctx = contextFor(ModuleFin, { area: 1.5, centre: [0, -0.15, 0] }, vessel);
		ModuleFin.update?.(ctx, 0.02);
		const f = vessel.forces[0]!.force.z;
		const v = { x: 0, y: -1_000, z: 2 };
		const plain = finNormalForce(ctx.config, v, 0.09);
		expect(f).toBeLessThan(plain); // extra force opposes the +2 m/s rotational flow
	});
});
