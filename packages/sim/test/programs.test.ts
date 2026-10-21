/** Plan 315 (ADR 0273): the player wins a control channel from a program and gives it back; scripts are saved. */
import { describe, expect, test } from 'bun:test';
import { SCRIPT_MEMORY_MAX, type EntityId } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { defineAutopilot, definePlugin } from '@orbital/sdk';
import { createSim, recordReplay } from '../src/index.ts';
import { VESSEL } from '../src/state.ts';
import { newSim, rapier, stack } from './helpers/vessels.ts';

const design = stack('Probe', ['stock.command-pod', 'stock.tank-small', 'stock.engine-lv'], []);

async function withScript() {
	const sim = await newSim();
	const r = sim.dispatch({ type: 'load-vessel', design });
	if (!r.ok) throw new Error(r.reason);
	const vessel = r.vessel! as EntityId;
	const attach = sim.dispatch({ type: 'script-attach', vessel, name: 'hold', source: 'print(1)' });
	expect(attach.ok).toBe(true);
	const state = () => sim.world.get(vessel, VESSEL)!;
	const events: string[] = [];
	sim.events.on('program:override', (e) => events.push(`override ${e.channels.join(',')}`));
	sim.events.on('program:resumed', () => events.push('resumed'));
	sim.events.on('program:stopped', (e) => events.push(`stopped ${e.reason}`));
	return { sim, vessel, state, events };
}

const attitude = (vessel: EntityId, pitch: number, yaw: number, roll = 0) =>
	({ type: 'attitude', vessel, pitch, yaw, roll }) as const;
const asScript = { source: 'script' as const };

describe('the player wins per channel (ADR 0273 point 3)', () => {
	test('a held player pitch drops the script pitch but not its yaw, and pitch returns 1 s after release', async () => {
		const { sim, vessel, state, events } = await withScript();
		expect(sim.dispatch(attitude(vessel, 0.5, 0.5), asScript).ok).toBe(true);
		expect(state().control).toMatchObject({ pitch: 0.5, yaw: 0.5 });

		sim.dispatch(attitude(vessel, 1, 0)); // the player holds pitch (and yaw at 0, not held)
		expect(events).toEqual(['override pitch']);
		const r = sim.dispatch(attitude(vessel, -0.3, 0.2), asScript);
		expect(r).toEqual({ ok: true, overridden: ['pitch'] });
		expect(state().control).toMatchObject({ pitch: 1, yaw: 0.2 });
		expect(sim.snapshot().vessels.find((v) => v.id === vessel)!.override).toEqual(['pitch']);

		sim.dispatch(attitude(vessel, 0, 0)); // the player lets go: the resume delay starts
		sim.dispatch(attitude(vessel, -0.3, 0.2), asScript);
		expect(state().control.pitch).toBe(0);
		for (let i = 0; i < 6; i++) sim.step(0.25); // 1.5 s
		expect(events).toEqual(['override pitch', 'resumed']);
		expect(sim.dispatch(attitude(vessel, -0.3, 0.2), asScript)).toEqual({ ok: true });
		expect(state().control.pitch).toBe(-0.3);
		expect(state().override).toBeUndefined();
		sim.dispose();
	});

	test('a player throttle write blocks the script throttle for 1 s', async () => {
		const { sim, vessel, state } = await withScript();
		sim.dispatch({ type: 'throttle', vessel, value: 0.2 });
		expect(sim.dispatch({ type: 'throttle', vessel, value: 1 }, asScript)).toEqual({
			ok: true,
			overridden: ['throttle']
		});
		expect(state().control.throttle).toBe(0.2);
		for (let i = 0; i < 6; i++) sim.step(0.25);
		expect(sim.dispatch({ type: 'throttle', vessel, value: 0 }, asScript).ok).toBe(true);
		expect(state().control.throttle).toBe(0);
		sim.dispose();
	});

	test('translation channels are arbitrated per axis', async () => {
		const { sim, vessel, state } = await withScript();
		sim.dispatch({ ...attitude(vessel, 0, 0), translate: { x: 1, y: 0, z: 0 } });
		const r = sim.dispatch(
			{ ...attitude(vessel, 0, 0), translate: { x: -1, y: 0.5, z: 0 } },
			asScript
		);
		expect(r).toEqual({ ok: true, overridden: ['translateX'] });
		expect(state().translate).toEqual({ x: 1, y: 0.5, z: 0 });
		sim.dispose();
	});

	test("the replay recorder keeps a script command a script's (no override, logged with its source)", async () => {
		const { sim, vessel, state } = await withScript();
		const rec = recordReplay(sim, 'test');
		expect(rec.dispatch({ type: 'throttle', vessel, value: 0.4 }, asScript).ok).toBe(true);
		expect(state().override).toBeUndefined();
		expect(rec.finish().commands.at(-1)).toMatchObject({ source: 'script' });
		sim.dispose();
	});

	test('without a program the player keeps no override', async () => {
		const sim = await newSim();
		const loaded = sim.dispatch({ type: 'load-vessel', design });
		if (!loaded.ok) throw new Error(loaded.reason);
		const vessel = loaded.vessel! as EntityId;
		sim.dispatch(attitude(vessel, 1, 0));
		sim.dispatch({ type: 'throttle', vessel, value: 0.5 });
		expect(sim.world.get(vessel, VESSEL)!.override).toBeUndefined();
		sim.dispose();
	});

	test('program-stop ends the script, clears the override and says so', async () => {
		const { sim, vessel, state, events } = await withScript();
		sim.dispatch(attitude(vessel, 1, 0));
		expect(sim.dispatch({ type: 'program-stop', vessel, reason: 'Delete key' }).ok).toBe(true);
		expect(state().script).toBeUndefined();
		expect(state().override).toBeUndefined();
		expect(events).toEqual(['override pitch', 'stopped Delete key']);
		// nothing left to stop: accepted, no second event
		expect(sim.dispatch({ type: 'program-stop', vessel }).ok).toBe(true);
		expect(events).toHaveLength(2);
		sim.dispose();
	});
});

describe('saved scripts (ADR 0273 point 6)', () => {
	test('attach, memory and detach change the vessel record and the snapshot', async () => {
		const { sim, vessel, state } = await withScript();
		expect(sim.snapshot().vessels.find((v) => v.id === vessel)!.script).toMatchObject({
			name: 'hold',
			resumed: false
		});
		expect(sim.dispatch({ type: 'script-memory', vessel, memory: { phase: 'coast', n: 2 } }).ok).toBe(
			true
		);
		expect(state().script!.memory).toEqual({ phase: 'coast', n: 2 });
		const big = sim.dispatch({
			type: 'script-memory',
			vessel,
			memory: { s: 'x'.repeat(SCRIPT_MEMORY_MAX) }
		});
		expect(big.ok).toBe(false);
		const fn = sim.dispatch({ type: 'script-memory', vessel, memory: { n: Number.NaN } });
		expect(fn.ok).toBe(false);
		expect(sim.dispatch({ type: 'script-detach', vessel, reason: 'finished' }).ok).toBe(true);
		expect(state().script).toBeUndefined();
		expect(sim.dispatch({ type: 'script-memory', vessel, memory: {} }).ok).toBe(false);
		sim.dispose();
	});

	test('a save keeps the script with its memory; a resumed attach keeps it, a new Run starts empty', async () => {
		const { sim, vessel } = await withScript();
		sim.dispatch({ type: 'script-memory', vessel, memory: { phase: 'burn' } });
		sim.step(0.1);
		const save = sim.save();
		sim.dispose();

		const again = await createSim({
			plugins: [Stock],
			backendFactory: rapier(8),
			resume: JSON.parse(JSON.stringify(save))
		});
		expect(again.scripts()).toEqual([
			{ vessel, name: 'hold', source: 'print(1)', memory: { phase: 'burn' } }
		]);
		again.dispatch({ type: 'script-attach', vessel, name: 'hold', source: 'print(1)', resumed: true });
		expect(again.world.get(vessel, VESSEL)!.script).toMatchObject({
			memory: { phase: 'burn' },
			resumed: true
		});
		again.dispatch({ type: 'script-attach', vessel, name: 'other', source: 'print(2)' });
		expect(again.world.get(vessel, VESSEL)!.script!.memory).toEqual({});
		again.dispose();
	});
});

/** `test.burn` holds the throttle at 0.8 on every step. */
const burner = definePlugin({
	meta: { id: 'test', version: '1.0.0', api: '^0.1' },
	depends: ['stock'],
	setup(ctx) {
		ctx.autopilots.register(
			defineAutopilot<{ n: number }>({
				id: 'test.burn',
				title: 'Burner',
				start: () => ({ n: 0 }),
				step(pilot, memory) {
					memory.n++;
					pilot.throttle(0.8);
					return { phase: 'burn' };
				}
			})
		);
	}
});

describe('autopilots are programs too (ADR 0273 with ADR 0271)', () => {
	async function engaged() {
		const sim = await createSim({ plugins: [Stock, burner], backendFactory: rapier(8), seed: 3 });
		const r = sim.dispatch({ type: 'load-vessel', design });
		if (!r.ok) throw new Error(r.reason);
		const vessel = r.vessel! as EntityId;
		expect(sim.dispatch({ type: 'autopilot-engage', vessel, autopilot: 'test.burn' }).ok).toBe(true);
		const state = () => sim.world.get(vessel, VESSEL)!;
		return { sim, vessel, state };
	}

	test('the player takes the throttle from an autopilot and it takes it back after 1 s', async () => {
		const { sim, vessel, state } = await engaged();
		for (let i = 0; i < 10; i++) sim.step(0.02);
		expect(state().control.throttle).toBe(0.8);
		sim.dispatch({ type: 'throttle', vessel, value: 0 });
		for (let i = 0; i < 10; i++) sim.step(0.02);
		expect(state().control.throttle).toBe(0);
		expect(state().override).toBeDefined();
		for (let i = 0; i < 75; i++) sim.step(0.02);
		expect(state().override).toBeUndefined();
		expect(state().control.throttle).toBe(0.8);
		sim.dispose();
	});

	test('program-stop disengages the autopilot with outcome disengaged', async () => {
		const { sim, vessel, state } = await engaged();
		const ended: string[] = [];
		sim.events.on('autopilot:ended', (e) => ended.push(`${e.outcome} ${e.reason}`));
		expect(sim.dispatch({ type: 'program-stop', vessel, reason: 'Delete key' }).ok).toBe(true);
		expect(state().autopilot).toBeUndefined();
		expect(ended).toEqual(['disengaged Delete key']);
		sim.dispose();
	});
});

