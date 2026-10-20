/** Plan 245 (ADR 0233): the Abort group is the design's custom slot 0; yaw and roll trim join the pitch trim. */
import { describe, expect, test } from 'bun:test';
import { ABORT_SLOT, customGroupId, type EntityId, type VesselDesign } from '@orbital/core';
import { effectiveControl, type VesselState } from '../src/state.ts';
import { newSim, stack } from './helpers/vessels.ts';

// 0 pod, 1 tank, 2 upper engine, 3 decoupler, 4 tank, 5 lower engine
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
	return { sim, vessel: r.vessel! as EntityId };
}
const snapOf = (sim: Awaited<ReturnType<typeof newSim>>, id: EntityId) =>
	sim.snapshot().vessels.find((v) => v.id === id)!;

describe('the Abort group (slot 0)', () => {
	test('the slot is 0 and its group id is custom.0', () => {
		expect(ABORT_SLOT).toBe(0);
		expect(customGroupId(ABORT_SLOT)).toBe('custom.0');
	});

	test('a design with an Abort group fires it; one without refuses with a reason the HUD can read', async () => {
		const abort = [
			{
				slot: 0,
				label: 'Abort',
				members: [
					{ part: 2, module: 'stock.engine', action: 'setActive' },
					{ part: 5, module: 'stock.engine', action: 'setActive' }
				]
			}
		];
		const { sim, vessel } = await loaded(twoEngines(abort));
		expect(sim.dispatch({ type: 'action-group', vessel, group: 'custom.0' }).ok).toBe(true);
		const group = snapOf(sim, vessel).actions!.groups.find((g) => g.id === 'custom.0');
		expect(group).toEqual({ id: 'custom.0', state: 'on', parts: 2 });
		sim.dispose();

		const plain = await loaded(twoEngines());
		const r = plain.sim.dispatch({ type: 'action-group', vessel: plain.vessel, group: 'custom.0' });
		expect(r.ok).toBe(false);
		// the flight loop tells an empty Abort group from other refusals by this text
		expect(r.ok ? '' : r.reason).toMatch(/no part|unknown action group/);
		plain.sim.dispose();
	});
});

describe('trim on three axes', () => {
	test('an omitted axis keeps its value, 0 clears it, and the snapshot shows the trim only while one is set', async () => {
		const { sim, vessel } = await loaded(twoEngines());
		expect(snapOf(sim, vessel).trim).toBeUndefined();
		expect(sim.dispatch({ type: 'trim', vessel, yaw: 0.3 }).ok).toBe(true);
		expect(snapOf(sim, vessel).trim).toEqual({ pitch: 0, yaw: 0.3, roll: 0 });
		expect(sim.dispatch({ type: 'trim', vessel, roll: -0.2 }).ok).toBe(true);
		expect(sim.dispatch({ type: 'trim', vessel, pitch: 0.1 }).ok).toBe(true);
		expect(snapOf(sim, vessel).trim).toEqual({ pitch: 0.1, yaw: 0.3, roll: -0.2 });
		expect(sim.dispatch({ type: 'trim', vessel, yaw: 0 }).ok).toBe(true);
		expect(snapOf(sim, vessel).trim).toEqual({ pitch: 0.1, yaw: 0, roll: -0.2 });
		// the reset key sends all three zeros
		expect(sim.dispatch({ type: 'trim', vessel, pitch: 0, yaw: 0, roll: 0 }).ok).toBe(true);
		expect(snapOf(sim, vessel).trim).toBeUndefined();
		sim.dispose();
	});

	test('each trim offsets its own axis of the demand, with or without SAS, and stays within -1..1', () => {
		const vessel = (over: Partial<VesselState>): VesselState =>
			({
				control: { throttle: 0.5, pitch: 0.2, yaw: -0.1, roll: 0.9 },
				sas: { active: false, demand: { x: 0, y: 0, z: 0 } },
				...over
			}) as unknown as VesselState;
		const free = effectiveControl(vessel({ trim: 0.1, trimYaw: 0.3, trimRoll: 0.4 }));
		expect(free.throttle).toBe(0.5);
		expect(free.pitch).toBeCloseTo(0.3, 9);
		expect(free.yaw).toBeCloseTo(0.2, 9);
		expect(free.roll).toBe(1); // 0.9 + 0.4 is clamped
		const assisted = effectiveControl(
			vessel({
				trimYaw: -0.25,
				trimRoll: 0.5,
				sas: { active: true, demand: { x: 0.1, y: 0.2, z: 0.3 } } as VesselState['sas']
			})
		);
		expect(assisted.pitch).toBeCloseTo(0.1, 9);
		expect(assisted.roll).toBeCloseTo(0.7, 9);
		expect(assisted.yaw).toBeCloseTo(0.05, 9);
		// no trim at all hands back the player's own control object
		const plain = vessel({});
		expect(effectiveControl(plain)).toBe(plain.control);
	});
});
