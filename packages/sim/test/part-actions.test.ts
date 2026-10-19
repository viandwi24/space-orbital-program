/** Part action descriptors and action groups (plan 110, ADR 0174). */
import { describe, expect, test } from 'bun:test';
import { partId, type EntityId, type VesselDesign } from '@orbital/core';
import type { Sim } from '../src/index.ts';
import { newSim, stack } from './helpers/vessels.ts';

// 0 pod, 1 tank, 2 upper engine, 3 decoupler, 4 tank, 5 lower engine; stage 0 fires the decoupler.
const twoEngines = (groups?: VesselDesign['groups']): VesselDesign => ({
	...stack(
		'Two engines',
		[
			'stock.command-pod',
			'stock.tank-small',
			'stock.engine-lv',
			'stock.decoupler',
			'stock.tank-small',
			'stock.engine-lv'
		],
		[[3]]
	),
	...(groups ? { groups } : {})
});

async function loaded(design: VesselDesign) {
	const sim = await newSim();
	const r = sim.dispatch({ type: 'load-vessel', design });
	if (!r.ok) throw new Error(r.reason);
	return { sim, vessel: r.vessel! };
}

const vesselSnap = (sim: Sim, id: EntityId) => sim.snapshot().vessels.find((v) => v.id === id)!;
const engineParts = (sim: Sim, id: EntityId) =>
	vesselSnap(sim, id)
		.parts.filter((p) => p.definition === 'stock.engine-lv')
		.map((p) => p.id);
const engineOn = (sim: Sim, id: EntityId) =>
	vesselSnap(sim, id)
		.actions!.states.filter(
			([, module, action]) => module === 'stock.engine' && action === 'setActive'
		)
		.map(([part, , , value]) => [part as number, value]);
const groupOf = (sim: Sim, id: EntityId, group: string) =>
	vesselSnap(sim, id).actions!.groups.find((g) => g.id === group);

describe('action groups', () => {
	test('"engines off" turns every engine off in the same dispatch; mixed when one is on', async () => {
		const { sim, vessel } = await loaded(twoEngines());
		const [upper, lower] = engineParts(sim, vessel) as [EntityId, EntityId];
		expect(groupOf(sim, vessel, 'stock.engines')).toEqual({
			id: 'stock.engines',
			state: 'off',
			parts: 2
		});
		expect(
			sim.dispatch({ type: 'action-group', vessel, group: 'stock.engines', value: true }).ok
		).toBe(true);
		expect(engineOn(sim, vessel)).toEqual([
			[upper, true],
			[lower, true]
		]);
		expect(groupOf(sim, vessel, 'stock.engines')!.state).toBe('on');
		expect(
			sim.dispatch({
				type: 'action',
				vessel,
				part: lower!,
				module: 'stock.engine',
				action: 'setActive',
				args: false
			}).ok
		).toBe(true);
		expect(groupOf(sim, vessel, 'stock.engines')!.state).toBe('mixed');
		// No step between the command and the snapshot: the change is in the same tick.
		expect(
			sim.dispatch({ type: 'action-group', vessel, group: 'stock.engines', value: false }).ok
		).toBe(true);
		expect(engineOn(sim, vessel)).toEqual([
			[upper, false],
			[lower, false]
		]);
		expect(groupOf(sim, vessel, 'stock.engines')!.state).toBe('off');
		// Without a value the toggles go on (the group is not all on).
		expect(sim.dispatch({ type: 'action-group', vessel, group: 'stock.engines' }).ok).toBe(true);
		expect(groupOf(sim, vessel, 'stock.engines')!.state).toBe('on');
	});

	test('unknown groups and groups with no part on the vessel are refused', async () => {
		const { sim, vessel } = await loaded(twoEngines());
		expect(
			sim.dispatch({ type: 'action-group', vessel, group: 'nope.group', value: true })
		).toEqual({
			ok: false,
			reason: expect.stringContaining('unknown action group')
		});
		expect(
			sim.dispatch({ type: 'action-group', vessel, group: 'stock.parachutes', value: true }).ok
		).toBe(false);
		expect(sim.dispatch({ type: 'action-group', vessel, group: 'custom.4', value: true }).ok).toBe(
			false
		);
	});

	test('a custom group from the design applies its members; a member staged away is skipped', async () => {
		const groups = [
			{
				slot: 1,
				label: 'Both engines',
				members: [
					{ part: 2, module: 'stock.engine', action: 'setActive' },
					{ part: 5, module: 'stock.engine', action: 'setActive' }
				]
			}
		];
		const { sim, vessel } = await loaded(twoEngines(groups));
		const [upper, lower] = engineParts(sim, vessel) as [EntityId, EntityId];
		expect(sim.dispatch({ type: 'action-group', vessel, group: 'custom.1', value: true }).ok).toBe(
			true
		);
		expect(engineOn(sim, vessel)).toEqual([
			[upper, true],
			[lower, true]
		]);
		expect(groupOf(sim, vessel, 'custom.1')).toEqual({ id: 'custom.1', state: 'on', parts: 2 });
		expect(sim.dispatch({ type: 'stage', vessel }).ok).toBe(true);
		sim.step(0.02);
		expect(engineParts(sim, vessel)).toEqual([upper]);
		const debris = sim.snapshot().vessels.find((v) => v.id !== vessel)!;
		expect(sim.dispatch({ type: 'action-group', vessel, group: 'custom.1', value: false }).ok).toBe(
			true
		);
		expect(engineOn(sim, vessel)).toEqual([[upper, false]]);
		expect(groupOf(sim, vessel, 'custom.1')!.parts).toBe(1);
		const lowerOn = debris.actions!.states.find(([part]) => part === lower)!;
		expect(lowerOn[3]).toBe(true); // the separated engine was not touched
	});

	test('a fired decoupler is a disabled trigger with a reason (in its descriptor)', async () => {
		const { sim, vessel } = await loaded(twoEngines());
		// After staging the decoupler may ride on either piece: look on every vessel in flight.
		const decouplerState = () =>
			sim
				.snapshot()
				.vessels.flatMap((v) => v.actions?.states ?? [])
				.find(([, module]) => module === 'stock.decoupler');
		expect(decouplerState()![4]).toBe(true);
		expect(sim.dispatch({ type: 'stage', vessel }).ok).toBe(true);
		sim.step(0.02);
		expect(decouplerState()![4]).toBe(false);
	});

	test('snapshot actions of a 100-part vessel stay under 8 kB', async () => {
		const parts = ['stock.command-pod'];
		while (parts.length < 100)
			parts.push(['stock.reaction-wheel', 'stock.decoupler', 'stock.engine-lv'][parts.length % 3]!);
		const design: VesselDesign = {
			formatVersion: 1,
			name: 'Hundred',
			parts: parts.map((p, index) => ({
				index,
				part: partId(p),
				parent: index === 0 ? null : { index: index - 1, parentNode: 'bottom', node: 'top' }
			})),
			stages: []
		};
		const { sim, vessel } = await loaded(design);
		const actions = vesselSnap(sim, vessel).actions!;
		// 33 engines carry a thrust limiter and a gimbal limit too (plan 210)
		// and the pod's container a lock per resource and the two transfer triggers (plan 213)
		expect(actions.states).toHaveLength(99 + 33 * 2 + 4);
		const bytes = JSON.stringify(actions).length;
		console.log(`snapshot actions of a 100-part vessel: ${bytes} bytes`);
		expect(bytes).toBeLessThan(8_192);
	});
});
