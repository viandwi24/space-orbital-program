/** Plan 311 (ADR 0272 point 6): a script's `memory` is saved by the host and given back with `resumed`. */
import { expect, test } from 'bun:test';
import { entityId } from '@orbital/core';
import { newRig } from './helpers.ts';

test('memory and resumed are the values the host gave; a change is reported once', async () => {
	const rig = await newRig();
	const runner = await rig.runner(
		`print(resumed, memory.phase);
		memory.phase = 'coast';
		await nextTick();
		await nextTick();
		memory.n = 2;`,
		{ memory: { phase: 'burn' }, resumed: true }
	);
	const first = rig.advance(runner);
	expect(runner.logs[0]).toBe('true burn');
	expect(first.memory).toEqual({ phase: 'coast' });
	expect(rig.advance(runner).memory).toBeUndefined(); // unchanged
	expect(rig.advance(runner).memory).toEqual({ phase: 'coast', n: 2 });
	rig.sim.dispose();
});

test('without options memory is empty and resumed false; memory cannot be replaced', async () => {
	const rig = await newRig();
	const runner = await rig.runner(`print(resumed, JSON.stringify(memory)); memory = {};`);
	rig.advance(runner);
	expect(runner.logs[0]).toBe('false {}');
	expect(runner.status).toBe('failed');
	rig.sim.dispose();
});

test('memory over the size limit is not reported, with one warning', async () => {
	const rig = await newRig();
	const runner = await rig.runner(
		`memory.big = 'x'.repeat(70000); await nextTick(); memory.g = 1;`
	);
	expect(rig.advance(runner).memory).toBeUndefined();
	expect(runner.logs.filter((l) => l.startsWith('! memory is not saved'))).toHaveLength(1);
	rig.sim.dispose();
});

test('a setpoint dropped while the player held the channel is sent again when the player lets go', async () => {
	const rig = await newRig();
	const vessel = entityId(rig.vessel);
	rig.sim.dispatch({ type: 'script-attach', vessel, name: 't', source: 's' });
	const runner = await rig.runner(`ship.throttle = 0.7; while (true) await nextTick();`);
	const tickAs = () => {
		const r = runner.tick(rig.sim.snapshot());
		for (const c of r.commands) rig.sim.dispatch(c, { source: 'script' });
		return r;
	};
	rig.sim.dispatch({ type: 'throttle', vessel, value: 0.1 }); // the player
	tickAs();
	const state = () => rig.sim.snapshot().vessels.find((v) => v.id === vessel)!;
	expect(state().override).toEqual(['throttle']);
	for (let i = 0; i < 80 && state().override; i++) {
		rig.sim.step(0.02);
		if (state().override) tickAs();
	}
	// the tick that sees the override gone sends the script's throttle again
	const resent = tickAs().commands;
	expect(resent).toContainEqual({ type: 'throttle', vessel, value: 0.7 });
	expect(runner.status).toBe('running');
	rig.sim.dispose();
});
