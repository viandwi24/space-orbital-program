/** EVA (plan 109, ADR 0120): stepping out, walking, the jetpack, the flag and the sample. */
import { describe, expect, test } from 'bun:test';
import type { CommandResult, EntityId, VesselSnapshot } from '@orbital/core';
import type { Sim } from '../src/index.ts';
import { vesselMass } from './helpers/measure.ts';
import { newSim, stack } from './helpers/vessels.ts';

const pod = () => stack('Pod', ['stock.command-pod'], []);
/** The vessel a command made; throws with its reason when it was refused. */
const made = (r: CommandResult): EntityId => {
	if (!r.ok) throw new Error(r.reason);
	return r.vessel as EntityId;
};

async function crewed(placement: unknown) {
	const sim = await newSim();
	expect(sim.dispatch({ type: 'crew-hire', profession: 'pilot' }).ok).toBe(true);
	const r = sim.dispatch({
		type: 'load-vessel',
		design: pod(),
		placement: placement as never,
		crew: [{ member: 'c1', part: 0 }]
	});
	if (!r.ok) throw new Error(r.reason);
	return { sim, ship: r.vessel as EntityId };
}

const vessel = (sim: Sim, id: EntityId): VesselSnapshot | undefined =>
	sim.snapshot().vessels.find((v) => v.id === id);
const run = (sim: Sim, seconds: number) => {
	for (let i = 0; i < Math.round(seconds / 0.02); i++) sim.step(0.02);
};
const memberVessel = (sim: Sim) => sim.snapshot().crew!.find((m) => m.id === 'c1')!.vessel;
const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
	Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const moon = { kind: 'surface', body: 'stock.cinder', latitude: 0.1, longitude: 0.5 };

describe('EVA (plan 109)', () => {
	test('exit then board returns the member to a seat with the vessel mass restored', async () => {
		const { sim, ship } = await crewed({ kind: 'surface' });
		run(sim, 3);
		const before = vesselMass(sim, vessel(sim, ship)!);
		const out = sim.dispatch({ type: 'crew-eva', vessel: ship, member: 'c1' });
		expect(out.ok).toBe(true);
		const suit = made(out);
		expect(memberVessel(sim)).toBe(suit);
		expect(vessel(sim, suit)!.crew!.map((c) => c.member)).toEqual(['c1']);
		expect(vessel(sim, ship)!.crew ?? []).toEqual([]);
		run(sim, 2);
		expect(sim.dispatch({ type: 'crew-board', suit, vessel: ship })).toEqual({ ok: true });
		expect(vessel(sim, suit)).toBeUndefined();
		expect(memberVessel(sim)).toBe(ship);
		expect(sim.snapshot().crew![0]!.status).toBe('assigned');
		expect(vesselMass(sim, vessel(sim, ship)!)).toBeCloseTo(before, 9);
		// the first step outside at home is a world first
		expect(sim.snapshot().milestones!.map((m) => m.id)).toContain('crewed-eva:stock.home');
		sim.dispose();
	}, 60_000);

	test('a suit on the moon walks 10 m and stays on the ground', async () => {
		const { sim, ship } = await crewed(moon);
		run(sim, 3);
		const suit = made(sim.dispatch({ type: 'crew-eva', vessel: ship, member: 'c1' }));
		run(sim, 3);
		const start = vessel(sim, suit)!.position;
		expect(sim.dispatch({ type: 'crew-walk', vessel: suit, heading: 0, speed: 1 }).ok).toBe(true);
		let low = Infinity;
		let high = -Infinity;
		for (let i = 0; i < 600; i++) {
			sim.step(0.02);
			const v = vessel(sim, suit)!;
			const h =
				Math.hypot(v.position.x, v.position.y, v.position.z) - 190_000 - (v.terrainHeight ?? 0);
			low = Math.min(low, h);
			high = Math.max(high, h);
		}
		const end = vessel(sim, suit)!;
		expect(dist(end.position, start)).toBeGreaterThan(10);
		expect(String(end.soi)).toBe('stock.cinder');
		// it walked on the ground: never more than a step above it, never below it
		expect(high).toBeLessThan(2);
		expect(low).toBeGreaterThan(-0.5);
		expect(sim.dispatch({ type: 'crew-walk', vessel: suit, heading: 0, speed: 5 }).ok).toBe(false);
		expect(sim.dispatch({ type: 'crew-walk', vessel: ship, heading: 0, speed: 1 }).ok).toBe(false);
		sim.dispose();
	}, 60_000);

	// the jetpack's rocket-equation test moved to eva-v2.test.ts (plan 225: 270 N on translation)

	test('a planted flag is still there after 60 s; a sample from the suit is credited when its vessel is recovered', async () => {
		const { sim, ship } = await crewed(moon);
		run(sim, 3);
		const suit = made(sim.dispatch({ type: 'crew-eva', vessel: ship, member: 'c1' }));
		run(sim, 3);
		const flag = sim.dispatch({ type: 'plant-flag', vessel: suit });
		expect(flag.ok).toBe(true);
		// the surface sample, in the suit
		const part = vessel(sim, suit)!.parts[0]!.id;
		expect(
			sim.dispatch({
				type: 'action',
				vessel: suit,
				part,
				module: 'stock.experiment',
				action: 'run'
			}).ok
		).toBe(true);
		run(sim, 60);
		expect(vessel(sim, made(flag))).toBeDefined();
		const held = vessel(sim, suit)!.science!.experiments[0]!;
		expect(held.reason).toBe('holds a sample'); // the run finished and the suit carries it
		expect(sim.dispatch({ type: 'crew-board', suit, vessel: ship }).ok).toBe(true);
		const before = sim.snapshot().science?.reduce((a, s) => a + s.credited, 0) ?? 0;
		for (let i = 0; i < 200 && !sim.dispatch({ type: 'recover-vessel', vessel: ship }).ok; i++)
			sim.step(0.02);
		const after = sim.snapshot().science!.reduce((a, s) => a + s.credited, 0);
		expect(after).toBeGreaterThan(before);
		sim.dispose();
	}, 120_000);
});
