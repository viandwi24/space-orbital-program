/**
 * EVA v2 (plan 225, ADR 0209): the 270 N jetpack, boarding at a hatch or ladder (50 m only with the
 * Sandbox assist), the hatch probe, the suit's propellant kept and topped up, the ladder latch.
 */
import { describe, expect, test } from 'bun:test';
import {
	partId,
	type CommandResult,
	type EntityId,
	type Quat,
	type Vec3,
	type VesselDesign,
	type VesselSnapshot
} from '@orbital/core';
import { JETPACK } from '@orbital/mod-stock';
import type { Sim } from '../src/index.ts';
import { orbitState, vesselMass } from './helpers/measure.ts';
import { newSim } from './helpers/vessels.ts';

const G0 = 9.80665;
const COLD_GAS = 'stock.cold-gas';
const moon = { kind: 'surface', body: 'stock.cinder', latitude: 0.1, longitude: 0.5 };

/** A pod with a reaction wheel below; `radial` parts hang on the pod at the given angles. */
function podDesign(radial: Array<{ part: string; angle: number }> = []): VesselDesign {
	return {
		formatVersion: 3,
		name: 'Pod',
		parts: [
			{ index: 0, part: partId('stock.command-pod'), parent: null },
			{
				index: 1,
				part: partId('stock.reaction-wheel'),
				parent: { index: 0, parentNode: 'bottom', node: 'top' }
			},
			...radial.map((r, i) => ({
				index: 2 + i,
				part: partId(r.part),
				parent: {
					index: 0,
					parentNode: 'surface',
					node: 'radial',
					radial: { angle: r.angle, y: 0 }
				}
			}))
		],
		stages: []
	} as VesselDesign;
}

const made = (r: CommandResult): EntityId => {
	if (!r.ok) throw new Error(r.reason);
	return r.vessel as EntityId;
};
const ok = (r: CommandResult) => {
	if (!r.ok) throw new Error(r.reason);
};

async function crewed(placement: unknown, design = podDesign()) {
	const sim = await newSim();
	ok(sim.dispatch({ type: 'crew-hire', profession: 'pilot' }));
	const r = sim.dispatch({
		type: 'load-vessel',
		design,
		placement: placement as never,
		crew: [{ member: 'c1', part: 0 }]
	});
	if (!r.ok) throw new Error(r.reason);
	return { sim, ship: r.vessel as EntityId };
}

const vessel = (sim: Sim, id: EntityId): VesselSnapshot =>
	sim.snapshot().vessels.find((v) => v.id === id)!;
const run = (sim: Sim, seconds: number) => {
	for (let i = 0; i < Math.round(seconds / 0.02); i++) sim.step(0.02);
};
const gasIn = (v: VesselSnapshot): number => {
	const r = v.resources?.find((x) => x.resource === COLD_GAS);
	return r?.amount ?? 0;
};
const member = (sim: Sim) => sim.snapshot().crew!.find((m) => m.id === 'c1')!;
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
/** `v` turned by the inverse of `q`. */
function unrotate(q: Quat, v: Vec3): Vec3 {
	const x = -q.x;
	const y = -q.y;
	const z = -q.z;
	const w = q.w;
	const ix = w * v.x + y * v.z - z * v.y;
	const iy = w * v.y + z * v.x - x * v.z;
	const iz = w * v.z + x * v.y - y * v.x;
	const iw = -x * v.x - y * v.y - z * v.z;
	return {
		x: ix * w + iw * -x + iy * -z - iz * -y,
		y: iy * w + iw * -y + iz * -x - ix * -z,
		z: iz * w + iw * -z + ix * -y - iy * -x
	};
}
const jetpack = (sim: Sim, suit: EntityId, on: boolean) =>
	ok(
		sim.dispatch({
			type: 'action',
			vessel: suit,
			part: vessel(sim, suit).parts[0]!.id,
			module: 'stock.jetpack',
			action: 'setOn',
			args: [on]
		} as never)
	);
const push = (sim: Sim, suit: EntityId, translate: Vec3) =>
	ok(sim.dispatch({ type: 'attitude', vessel: suit, pitch: 0, yaw: 0, roll: 0, translate }));

describe('EVA v2 (plan 225)', () => {
	test('the jetpack gives 300–600 m/s and measures its rocket-equation Δv in orbit', async () => {
		const sim0 = await newSim();
		// high, so the tide between suit and pod over the 2.5 min burn stays far below 1 %
		const st = orbitState(sim0, 2_000_000);
		sim0.dispose();
		const { sim, ship } = await crewed({
			kind: 'state',
			position: st.position,
			velocity: st.velocity
		});
		const suit = made(sim.dispatch({ type: 'crew-eva', vessel: ship, member: 'c1' }));
		sim.step(0.02);
		const s0 = vessel(sim, suit);
		const m0 = vesselMass(sim, s0);
		const planned = JETPACK.isp * G0 * Math.log(m0 / (m0 - JETPACK.propellant));
		expect(planned).toBeGreaterThan(300);
		expect(planned).toBeLessThan(600);
		const v0 = sub(s0.velocity, vessel(sim, ship).velocity);
		jetpack(sim, suit, true);
		push(sim, suit, { x: 0, y: 1, z: 0 });
		run(sim, (JETPACK.propellant * JETPACK.isp * G0) / JETPACK.thrust + 2);
		const s1 = vessel(sim, suit);
		expect(gasIn(s1)).toBeLessThan(1e-6);
		const dv = len(sub(sub(s1.velocity, vessel(sim, ship).velocity), v0));
		expect(Math.abs(dv - planned) / planned).toBeLessThan(0.01);
		sim.dispose();
	}, 180_000);

	test('on Cinder the suit lifts off on the jetpack', async () => {
		const { sim, ship } = await crewed(moon);
		run(sim, 3);
		const suit = made(sim.dispatch({ type: 'crew-eva', vessel: ship, member: 'c1' }));
		run(sim, 3);
		const r0 = len(vessel(sim, suit).position);
		jetpack(sim, suit, true);
		push(sim, suit, { x: 0, y: 1, z: 0 });
		run(sim, 3);
		expect(len(vessel(sim, suit).position) - r0).toBeGreaterThan(2);
		sim.dispose();
	}, 60_000);

	test('boarding: at the hatch yes; from 10 m only with the Sandbox assist', async () => {
		const { sim, ship } = await crewed(moon);
		// the test world is a legacy (Sandbox) one: turn the assist off as outside Sandbox
		ok(sim.dispatch({ type: 'set-rule', rule: 'stock.eva-board-assist', value: false }));
		run(sim, 3);
		let suit = made(sim.dispatch({ type: 'crew-eva', vessel: ship, member: 'c1' }));
		run(sim, 2);
		// right at the hatch: boards
		ok(sim.dispatch({ type: 'crew-board', suit, vessel: ship }));
		expect(member(sim).vessel).toBe(ship);
		// 10 m away: refused without the assist, accepted with it
		suit = made(sim.dispatch({ type: 'crew-eva', vessel: ship, member: 'c1' }));
		run(sim, 2);
		ok(sim.dispatch({ type: 'crew-walk', vessel: suit, heading: 0, speed: 1.5 }));
		run(sim, 7);
		ok(sim.dispatch({ type: 'crew-walk', vessel: suit, heading: 0, speed: 0 }));
		run(sim, 1);
		expect(len(sub(vessel(sim, suit).position, vessel(sim, ship).position))).toBeGreaterThan(8);
		const refused = sim.dispatch({ type: 'crew-board', suit, vessel: ship });
		expect(refused.ok).toBe(false);
		if (!refused.ok) expect(refused.reason).toContain('hatch');
		ok(sim.dispatch({ type: 'set-rule', rule: 'stock.eva-board-assist', value: true }));
		ok(sim.dispatch({ type: 'crew-board', suit, vessel: ship }));
		expect(member(sim).vessel).toBe(ship);
		sim.dispose();
	}, 60_000);

	test('a part in front of the hatch keeps the crew in: "Hatch blocked by"', async () => {
		const { sim, ship } = await crewed(
			moon,
			podDesign([{ part: 'stock.rcs-cold-gas', angle: -Math.PI / 2 }])
		);
		run(sim, 2);
		const r = sim.dispatch({ type: 'crew-eva', vessel: ship, member: 'c1' });
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.reason).toMatch(/^Hatch blocked by /);
		sim.dispose();
	}, 60_000);

	test("boarding tops the suit up from the vessel's cold gas and drains it by as much", async () => {
		const sim0 = await newSim();
		const st = orbitState(sim0, 150_000);
		sim0.dispose();
		// the cold-gas tank on the far side from the hatch
		const { sim, ship } = await crewed(
			{ kind: 'state', position: st.position, velocity: st.velocity },
			podDesign([{ part: 'stock.rcs-cold-gas', angle: Math.PI / 2 }])
		);
		ok(sim.dispatch({ type: 'set-rule', rule: 'stock.eva-board-assist', value: true }));
		sim.step(0.02);
		const shipGas0 = gasIn(vessel(sim, ship));
		expect(shipGas0).toBeGreaterThan(0);
		let suit = made(sim.dispatch({ type: 'crew-eva', vessel: ship, member: 'c1' }));
		sim.step(0.02);
		expect(gasIn(vessel(sim, suit))).toBeCloseTo(JETPACK.propellant, 6);
		jetpack(sim, suit, true);
		// out and back: 3 s each way, so it ends at rest beside the pod
		push(sim, suit, { x: 0, y: 1, z: 0 });
		run(sim, 3);
		push(sim, suit, { x: 0, y: -1, z: 0 });
		run(sim, 3);
		push(sim, suit, { x: 0, y: 0, z: 0 });
		sim.step(0.02);
		const used = JETPACK.propellant - gasIn(vessel(sim, suit));
		expect(used).toBeGreaterThan(0.5);
		ok(sim.dispatch({ type: 'crew-board', suit, vessel: ship }));
		sim.step(0.02);
		const drained = shipGas0 - gasIn(vessel(sim, ship));
		expect(drained).toBeCloseTo(Math.min(used, shipGas0), 6);
		// the next EVA starts with what the member kept: what was left plus the top-up
		suit = made(sim.dispatch({ type: 'crew-eva', vessel: ship, member: 'c1' }));
		sim.step(0.02);
		expect(gasIn(vessel(sim, suit))).toBeCloseTo(JETPACK.propellant - used + drained, 6);
		sim.dispose();
	}, 60_000);

	test('a latched suit keeps its offset to the vessel within 1 cm while the vessel turns', async () => {
		const sim0 = await newSim();
		const st = orbitState(sim0, 150_000);
		sim0.dispose();
		const { sim, ship } = await crewed({
			kind: 'state',
			position: st.position,
			velocity: st.velocity
		});
		// spin the pod up while its pilot is aboard; it keeps turning after they step out
		ok(sim.dispatch({ type: 'attitude', vessel: ship, pitch: 1, yaw: 0.5, roll: 0 }));
		run(sim, 3);
		const suit = made(sim.dispatch({ type: 'crew-eva', vessel: ship, member: 'c1' }));
		ok(sim.dispatch({ type: 'crew-grab', suit }));
		sim.step(0.02);
		const offset = () => {
			const s = vessel(sim, suit);
			const v = vessel(sim, ship);
			return unrotate(v.orientation, sub(s.position, v.position));
		};
		const before = offset();
		const q0 = vessel(sim, ship).orientation;
		let worst = 0;
		for (let i = 0; i < 250; i++) {
			sim.step(0.02);
			worst = Math.max(worst, len(sub(offset(), before)));
		}
		// it really turned (more than 10 degrees)
		const q1 = vessel(sim, ship).orientation;
		const dotq = Math.abs(q0.x * q1.x + q0.y * q1.y + q0.z * q1.z + q0.w * q1.w);
		expect(2 * Math.acos(Math.min(1, dotq))).toBeGreaterThan(0.17);
		expect(worst).toBeLessThan(0.01);
		// climbing moves it along the ladder; letting go frees it
		ok(sim.dispatch({ type: 'crew-climb', suit, rate: 1 }));
		run(sim, 0.5);
		expect(len(sub(offset(), before))).toBeGreaterThan(0.1);
		ok(sim.dispatch({ type: 'crew-grab', suit, release: true }));
		expect(sim.dispatch({ type: 'crew-climb', suit, rate: 1 }).ok).toBe(false);
		sim.dispose();
	}, 60_000);

	test('a suit resting on the ground still grabs the ladder beside the hatch', async () => {
		const { sim, ship } = await crewed(moon);
		run(sim, 3);
		const suit = made(sim.dispatch({ type: 'crew-eva', vessel: ship, member: 'c1' }));
		// long enough for both to rest on surface rails
		run(sim, 6);
		ok(sim.dispatch({ type: 'crew-grab', suit }));
		run(sim, 5);
		ok(sim.dispatch({ type: 'crew-climb', suit, rate: 1 }));
		ok(sim.dispatch({ type: 'crew-board', suit, vessel: ship }));
		expect(member(sim).vessel).toBe(ship);
		sim.dispose();
	}, 60_000);

	test('a scripted EVA run twice gives identical snapshots', async () => {
		const once = async () => {
			const { sim, ship } = await crewed(moon);
			run(sim, 2);
			const suit = made(sim.dispatch({ type: 'crew-eva', vessel: ship, member: 'c1' }));
			run(sim, 1);
			ok(sim.dispatch({ type: 'crew-walk', vessel: suit, heading: 1, speed: 3 }));
			run(sim, 1);
			ok(sim.dispatch({ type: 'crew-walk', vessel: suit, heading: 1, speed: 0 }));
			run(sim, 0.5);
			ok(sim.dispatch({ type: 'crew-jump', suit }));
			run(sim, 2);
			jetpack(sim, suit, true);
			push(sim, suit, { x: 0.3, y: 1, z: 0 });
			run(sim, 1);
			const snap = JSON.stringify(sim.snapshot().vessels);
			sim.dispose();
			return snap;
		};
		expect(await once()).toBe(await once());
	}, 60_000);
});
