/**
 * EVA helmet and personal parachute (plan 249, ADR 0237): the helmet comes off only in breathable
 * air and goes back on by itself when the air stops being so; the suit's chute brings it down slow
 * enough to land.
 */
import { describe, expect, test } from 'bun:test';
import { partId, type CommandResult, type EntityId, type VesselDesign } from '@orbital/core';
import { length } from '@orbital/kepler';
import { helmetMayComeOff, PERSONAL_CHUTE } from '@orbital/mod-stock';
import type { Sim } from '../src/index.ts';
import { newSim } from './helpers/vessels.ts';

const R = 600_000;
const ok = (r: CommandResult) => {
	if (!r.ok) throw new Error(r.reason);
};
const pod: VesselDesign = {
	formatVersion: 3,
	name: 'Pod',
	parts: [{ index: 0, part: partId('stock.command-pod'), parent: null }],
	stages: []
} as VesselDesign;

async function suitAt(placement: unknown) {
	const sim = await newSim();
	ok(sim.dispatch({ type: 'crew-hire', profession: 'pilot' }));
	const r = sim.dispatch({
		type: 'load-vessel',
		design: pod,
		placement: placement as never,
		crew: [{ member: 'c1', part: 0 }]
	});
	if (!r.ok) throw new Error(r.reason);
	const e = sim.dispatch({ type: 'crew-eva', vessel: r.vessel as EntityId, member: 'c1' });
	if (!e.ok) throw new Error(e.reason);
	sim.step(0.02);
	return { sim, suit: e.vessel as EntityId };
}
const suitOf = (sim: Sim, id: EntityId) => sim.snapshot().vessels.find((v) => v.id === id)!;
const act = (sim: Sim, suit: EntityId, module: string, action: string, ...args: unknown[]) =>
	sim.dispatch({
		type: 'action',
		vessel: suit,
		part: suitOf(sim, suit).parts[0]!.id,
		module,
		action,
		args
	} as never);
const helmet = (sim: Sim, suit: EntityId) =>
	suitOf(sim, suit).parts[0]!.modules['stock.helmet'] as { on: boolean; breathable: boolean };
const run = (sim: Sim, seconds: number) => {
	for (let i = 0; i < Math.round(seconds / 0.02); i++) sim.step(0.02);
};

describe('the helmet rule', () => {
	test('breathable air only: body flag, pressure and temperature', () => {
		const air = { breathable: true, pressure: 101_325, temperature: 288 };
		expect(helmetMayComeOff(air)).toBe(true);
		expect(helmetMayComeOff({ ...air, breathable: false })).toBe(false);
		expect(helmetMayComeOff({ ...air, pressure: 20_000 })).toBe(false);
		expect(helmetMayComeOff({ ...air, temperature: 200 })).toBe(false);
		expect(helmetMayComeOff({ ...air, temperature: 340 })).toBe(false);
	});

	test('on the ground at Home the helmet comes off and goes on; on Cinder it stays on', async () => {
		const home = await suitAt({
			kind: 'surface',
			body: 'stock.home',
			latitude: 0.1,
			longitude: 0.5
		});
		expect(helmet(home.sim, home.suit).on).toBe(true);
		ok(act(home.sim, home.suit, 'stock.helmet', 'setOn', false));
		expect(helmet(home.sim, home.suit).on).toBe(false);
		ok(act(home.sim, home.suit, 'stock.helmet', 'setOn', true));
		expect(helmet(home.sim, home.suit).on).toBe(true);
		home.sim.dispose();

		const moon = await suitAt({
			kind: 'surface',
			body: 'stock.cinder',
			latitude: 0.1,
			longitude: 0.5
		});
		act(moon.sim, moon.suit, 'stock.helmet', 'setOn', false);
		expect(helmet(moon.sim, moon.suit).on).toBe(true);
		moon.sim.dispose();
	});

	test('high in thin air it stays on, and a helmet off at low altitude goes back on above', async () => {
		const high = await suitAt({
			kind: 'state',
			body: 'stock.home',
			position: { x: 0, y: R + 30_000, z: 0 },
			velocity: { x: 0, y: 0, z: 0 }
		});
		act(high.sim, high.suit, 'stock.helmet', 'setOn', false);
		expect(helmet(high.sim, high.suit).on).toBe(true);
		high.sim.dispose();
	});
});

describe('the personal parachute', () => {
	test('a suit dropped at 3 km opens its chute and lands below 8 m/s, undamaged', async () => {
		const { sim, suit } = await suitAt({
			kind: 'state',
			body: 'stock.home',
			position: { x: 0, y: R + 3_000, z: 0 },
			velocity: { x: 0, y: 0, z: 0 }
		});
		const status = () =>
			(suitOf(sim, suit).parts[0]!.modules['stock.parachute'] as { status: string }).status;
		expect(status()).toBe('stowed');
		ok(act(sim, suit, 'stock.parachute', 'deploy'));
		expect(status()).toBe('armed');
		const damaged: string[] = [];
		// the empty pod that stepped out falls too: only the suit counts
		sim.events.on('part:damaged', (e) => {
			if (e.definition === 'stock.eva-suit') damaged.push(e.definition);
		});
		let touchdown: number | null = null;
		for (let i = 0; i < 300 / 0.02 && touchdown === null; i++) {
			const before = suitOf(sim, suit);
			sim.step(0.02);
			const v = sim.snapshot().vessels.find((x) => x.id === suit);
			if (!v) break;
			if (length(v.position) - R - (v.terrainHeight ?? 0) < 2) touchdown = length(before.velocity);
		}
		expect(status()).toBe('full');
		expect(touchdown).not.toBeNull();
		expect(touchdown!).toBeLessThan(8);
		expect(damaged).toEqual([]);
		sim.dispose();
	}, 120_000);

	test('cutting the canopy lets go of it, and the figures are those of a suit', async () => {
		expect(PERSONAL_CHUTE.fullDragArea).toBeLessThan(100);
		const { sim, suit } = await suitAt({
			kind: 'state',
			body: 'stock.home',
			position: { x: 0, y: R + 3_000, z: 0 },
			velocity: { x: 0, y: 0, z: 0 }
		});
		ok(act(sim, suit, 'stock.parachute', 'forceDeploy'));
		run(sim, 6);
		const m = () =>
			suitOf(sim, suit).parts[0]!.modules['stock.parachute'] as { status: string; open: boolean };
		expect(m().open).toBe(true);
		ok(act(sim, suit, 'stock.parachute', 'cut'));
		expect(m().status).toBe('cut');
		sim.dispose();
	}, 60_000);
});
