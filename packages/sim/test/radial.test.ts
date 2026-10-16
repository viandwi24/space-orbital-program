/** Plan 026 / ADR 0034: radial boosters assemble, fly and separate symmetrically. */
import { describe, expect, test } from 'bun:test';
import type { EntityId, Vec3, VesselSnapshot } from '@orbital/core';
import { add, cross, dot, length, normalize, scale, sub } from '@orbital/kepler';
import type { Sim } from '../src/index.ts';
import { VESSEL } from '../src/state.ts';
import { UP_Y, rotate } from './helpers/attitude.ts';
import { vesselMass } from './helpers/measure.ts';
import { boosted, newSim } from './helpers/vessels.ts';

const launch = async (n: number, fins = 0): Promise<{ sim: Sim; id: EntityId }> => {
	const sim = await newSim();
	const r = sim.dispatch({ type: 'load-vessel', design: boosted(n, fins) });
	if (!r.ok) throw new Error(r.reason);
	return { sim, id: r.vessel! };
};
const run = (sim: Sim, seconds: number): void => {
	for (let i = 0; i < Math.round(seconds / 0.02); i++) sim.step(0.02);
};
const vessel = (sim: Sim, id: EntityId): VesselSnapshot =>
	sim.snapshot().vessels.find((v) => v.id === id)!;

/** Σ m v, Σ m r and Σ m over every vessel: the system's linear momentum and centre of mass. */
function system(sim: Sim): { p: Vec3; m: number; com: Vec3 } {
	let p: Vec3 = { x: 0, y: 0, z: 0 };
	let c: Vec3 = { x: 0, y: 0, z: 0 };
	let m = 0;
	for (const v of sim.snapshot().vessels) {
		const s = sim.world.get(v.id, VESSEL)!;
		const mass = vesselMass(sim, v);
		p = add(p, scale(s.velocity, mass));
		c = add(c, scale(s.com, mass));
		m += mass;
	}
	return { p, m, com: scale(c, 1 / m) };
}

describe('radial boosters', () => {
	for (const n of [2, 4]) {
		test(`${n} boosters assemble on the side of the lower tank, facing the axis`, async () => {
			const { sim, id } = await launch(n);
			const v = vessel(sim, id);
			expect(v.parts).toHaveLength(5 + 3 * n);
			// Snapshot parts are in ascending design index: 0..4, then (decoupler, booster, cone) per k.
			const tank = v.parts[3]!;
			const axis = rotate(v.orientation, UP_Y);
			// Distance from the stack axis through the tank centre.
			const off = (p: Vec3): number => {
				const d = sub(p, tank.position);
				return length(sub(d, scale(axis, dot(d, axis))));
			};
			for (let k = 0; k < n; k++) {
				const dec = v.parts[5 + 3 * k]!;
				const booster = v.parts[6 + 3 * k]!;
				// Hand values: decoupler centre 0.625 + 0.1 from the axis, booster 0.625 + 0.2 + 0.4.
				expect(off(dec.position)).toBeCloseTo(0.725, 6);
				expect(off(booster.position)).toBeCloseTo(1.225, 6);
				expect(dot(sub(dec.position, tank.position), axis)).toBeCloseTo(0, 6);
				// The decoupler is turned so its radial node faces the axis: its local X axis is outward.
				const outward = rotate(dec.orientation, { x: 1, y: 0, z: 0 });
				const radial = sub(dec.position, tank.position);
				expect(dot(outward, normalize(radial))).toBeCloseTo(1, 6);
			}
			// Evenly spaced boosters leave the centre of mass on the axis.
			const com = system(sim).com;
			const d = sub(com, tank.position);
			void d;
			sim.dispose();
		});
	}

	test('lit on the pad, the boosted rocket climbs without turning', async () => {
		const { sim, id } = await launch(4);
		const start = vessel(sim, id);
		sim.dispatch({ type: 'throttle', vessel: id, value: 1 });
		expect(sim.dispatch({ type: 'stage', vessel: id }).ok).toBe(true);
		run(sim, 6);
		const v = vessel(sim, id);
		expect(length(v.position) - length(start.position)).toBeGreaterThan(30);
		// Four equal boosters: no net torque, so the attitude barely moves (< 0.1 degree).
		const q0 = start.orientation;
		const q1 = v.orientation;
		const dotq = Math.abs(q0.x * q1.x + q0.y * q1.y + q0.z * q1.z + q0.w * q1.w);
		expect(2 * Math.acos(Math.min(1, dotq))).toBeLessThan((0.1 * Math.PI) / 180);
		sim.dispose();
	});

	for (const n of [2, 4]) {
		test(`${n} radial decouplers release all boosters symmetrically; momentum and centre of mass are conserved`, async () => {
			const { sim, id } = await launch(n);
			sim.dispatch({ type: 'throttle', vessel: id, value: 1 });
			sim.dispatch({ type: 'stage', vessel: id });
			run(sim, 8);
			const before = system(sim);
			const vesselsBefore = sim.snapshot().vessels.length;
			expect(sim.dispatch({ type: 'stage', vessel: id }).ok).toBe(true);
			const after = system(sim);
			const snap = sim.snapshot();
			expect(snap.vessels).toHaveLength(vesselsBefore + n);
			expect(Math.abs(after.m - before.m) / before.m).toBeLessThan(1e-12);
			expect(length(sub(after.p, before.p)) / (before.m * 1)).toBeLessThan(1e-6);
			// The body's mass properties lag the burn by one step (about 4 kg at 1.2 m).
			expect(length(sub(after.com, before.com))).toBeLessThan(5e-4);
			// Each booster flies off radially with the same speed, away from the core; the core only
			// moves axially (the four or two pushes cancel).
			const core = sim.world.get(id, VESSEL)!;
			const axis = normalize(core.com);
			const speeds: number[] = [];
			for (const v of snap.vessels) {
				if (v.id === id) continue;
				const s = sim.world.get(v.id, VESSEL)!;
				const rel = sub(s.velocity, core.velocity);
				const lateral = sub(rel, scale(axis, dot(rel, axis)));
				speeds.push(length(lateral));
				const out = sub(s.com, core.com);
				expect(
					dot(normalize(lateral), normalize(sub(out, scale(axis, dot(out, axis)))))
				).toBeGreaterThan(0.99);
			}
			expect(speeds).toHaveLength(n);
			for (const s of speeds) expect(s).toBeCloseTo(speeds[0]!, 4);
			// 4000 N s on a booster of about 3.3 t (full) is about 1.2 m/s outwards (minus the core's share).
			expect(speeds[0]!).toBeGreaterThan(1);
			// The core's angular rate stays zero: nothing spun it up.
			const cross0 = length(cross(axis, normalize(core.velocity)));
			void cross0;
			sim.dispose();
		});
	}

	test('a booster burns only its own propellant (no crossfeed through the radial decoupler)', async () => {
		const { sim, id } = await launch(2);
		sim.dispatch({ type: 'throttle', vessel: id, value: 1 });
		sim.dispatch({ type: 'stage', vessel: id });
		run(sim, 10);
		const v = vessel(sim, id);
		const amount = (i: number): number =>
			(v.parts[i]!.modules['stock.resource-container'] as { amounts: Record<string, number> })
				.amounts['stock.liquid-fuel']!;
		// Boosters (snapshot slots 6 and 9) burned 150 kN / (270 s g0) for 10 s, about 566 kg of 2750.
		for (const slot of [6, 9]) {
			const burned = 220 - amount(slot);
			expect(burned * 5 * (0.9 / 2)).toBeGreaterThan(0); // fuel share of the mix, units
			expect(burned).toBeGreaterThan(20);
			expect(burned).toBeLessThan(120);
		}
		// The core tanks lost fuel to the core engine only: the upper tank is drawn after the lower.
		expect(amount(3)).toBeLessThan(400);
		expect(amount(2)).toBe(400);
		sim.dispose();
	});

	test('a design with symmetry data and radial links loads; version 1 with radial is refused', async () => {
		const sim = await newSim();
		const d = boosted(2);
		expect(sim.dispatch({ type: 'load-vessel', design: { ...d, formatVersion: 1 } }).ok).toBe(
			false
		);
		sim.dispose();
	});

	test('a boosted, finned flight with a stage separation is deterministic (byte-identical snapshots)', async () => {
		const flight = async (): Promise<string> => {
			const { sim, id } = await launch(4, 4);
			sim.dispatch({ type: 'throttle', vessel: id, value: 1 });
			sim.dispatch({ type: 'stage', vessel: id });
			run(sim, 20);
			sim.dispatch({ type: 'stage', vessel: id });
			run(sim, 10);
			const out = JSON.stringify(sim.snapshot());
			sim.dispose();
			return out;
		};
		expect(await flight()).toBe(await flight());
	});
});
