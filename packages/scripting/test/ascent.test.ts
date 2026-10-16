import type { Command } from '@orbital/core';
import { expect, test } from 'bun:test';
import { ascentScript } from '../src/index.ts';
import { newRig } from './helpers.ts';

/** Plan 010: the sample autopilot, written against the scripting API only, reaches orbit headlessly. */
test('the sample ascent script reaches a stable orbit (periapsis > 70 km, e < 0.1)', async () => {
	const started = performance.now();
	const rig = await newRig();
	const runner = await rig.runner(ascentScript);
	let maxTick = 0;
	let ticks = 0;
	rig.drive(runner);
	while (rig.sim.time < 1_200 && runner.status === 'running') {
		rig.sim.step(0.02);
		const r = rig.drive(runner);
		maxTick = Math.max(maxTick, r.elapsedMs);
		ticks++;
	}
	expect(runner.error).toBeUndefined();
	expect(runner.status).toBe('finished');

	for (let i = 0; i < 200; i++) rig.sim.step(0.02); // two idle seconds: the vessel goes on rails
	const v = rig.sim.snapshot().vessels[0]!;
	const orbit = v.orbit!;
	const periapsis = orbit.a * (1 - orbit.e) - 600_000;
	const apoapsis = orbit.a * (1 + orbit.e) - 600_000;
	console.log(
		`script orbit: apoapsis ${(apoapsis / 1000).toFixed(2)} km, periapsis ${(periapsis / 1000).toFixed(2)} km, e ${orbit.e.toFixed(4)}, sim time ${rig.sim.time.toFixed(1)} s, ` +
			`${ticks} ticks, max tick ${maxTick.toFixed(2)} ms, wall ${(performance.now() - started).toFixed(0)} ms\n` +
			runner.logs.join('\n')
	);
	expect(periapsis).toBeGreaterThan(70_000);
	expect(orbit.e).toBeLessThan(0.1);
	expect(v.mode).toBe('on-rails');
	expect(v.parts).toHaveLength(4); // the lower stage stayed behind
	// 'finished' already proves every tick stayed within the default 10 ms budget (an overrun terminates);
	// the max tick time above is logged for the journal, not asserted: wall time depends on machine load.
	rig.sim.dispose();
}, 60_000);

test('the sample ascent has no stock-vessel constants in its source', () => {
	for (const literal of ['215000', '5000', 'ISP', 'THRUST', 'TORQUE']) {
		expect(ascentScript).not.toContain(literal);
	}
	expect(ascentScript).toContain('ship.engines');
	expect(ascentScript).toContain('ship.wheels');
});

/** ADR 0031: in the web client commands come back from the script Worker a few ticks late. */
test('the sample ascent still reaches orbit when every command arrives 3 ticks late', async () => {
	const rig = await newRig();
	const runner = await rig.runner(ascentScript);
	const DELAY = 3;
	const queue: Command[][] = [];
	while (rig.sim.time < 1_200 && runner.status === 'running') {
		rig.sim.step(0.02);
		queue.push(runner.tick(rig.sim.snapshot()).commands);
		if (queue.length > DELAY) {
			for (const command of queue.shift()!) {
				const res = rig.sim.dispatch(command);
				if (!res.ok) throw new Error(`dispatch refused: ${res.reason}`);
			}
		}
	}
	expect(runner.error).toBeUndefined();
	expect(runner.status).toBe('finished');
	for (const batch of queue) for (const command of batch) rig.sim.dispatch(command);
	for (let i = 0; i < 200; i++) rig.sim.step(0.02);
	const orbit = rig.sim.snapshot().vessels[0]!.orbit!;
	expect(orbit.a * (1 - orbit.e) - 600_000).toBeGreaterThan(70_000);
	expect(orbit.e).toBeLessThan(0.1);
	rig.sim.dispose();
}, 60_000);
