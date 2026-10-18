/** Replays (plan 131, ADR 0159): a recorded headless ascent re-simulates to its checkpoints. */
import { describe, expect, test } from 'bun:test';
import { readReplay, type ReplayFile } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim, recordReplay, verifyReplay, type Sim } from '../src/index.ts';
import { createAscent, defaultAscent } from './helpers/ascent.ts';
import { rapier, twoStage } from './helpers/vessels.ts';

const make = (resume?: unknown) =>
	createSim({
		plugins: [Stock],
		backendFactory: rapier(),
		seed: 1,
		...(resume ? { resume } : {})
	} as never);

async function recordAscent(seconds: number): Promise<ReplayFile> {
	const sim = await make();
	const r = sim.dispatch({ type: 'load-vessel', design: twoStage() });
	if (!r.ok) throw new Error(r.reason);
	const recorder = recordReplay(sim, 'Two-stage ascent');
	// the ascent talks to the sim only through dispatch: give it the recorder's
	const proxy = new Proxy(sim, {
		get: (target, key) => (key === 'dispatch' ? recorder.dispatch : Reflect.get(target, key))
	}) as Sim;
	const ascent = createAscent(proxy, r.vessel!, defaultAscent);
	while (sim.time < seconds && ascent.phase !== 'done') {
		sim.step(0.02);
		recorder.tick();
		ascent.update();
	}
	const replay = recorder.finish();
	sim.dispose();
	return replay;
}

describe('replays (plan 131)', () => {
	test('a recorded headless ascent re-simulates to its checkpoints within the ADR 0050 bound', async () => {
		const replay = await recordAscent(240);
		expect(replay.commands.length).toBeGreaterThan(3);
		expect(replay.checkpoints.length).toBeGreaterThan(20);
		// it survives the trip through a file
		const text = JSON.stringify(replay);
		const read = readReplay(text);
		if (!read.ok) throw new Error(read.reason);
		const verdict = await verifyReplay(make, read.replay);
		expect(verdict).toEqual({
			ok: true,
			checkpoints: replay.checkpoints.length,
			commands: replay.commands.length
		});
		console.log(
			`replay: ${(text.length / 1024).toFixed(1)} kB, ${replay.commands.length} commands, ${replay.checkpoints.length} checkpoints`
		);
	}, 300_000);

	test('a replay whose final state was edited is rejected with the value', async () => {
		const replay = await recordAscent(60);
		const last = replay.checkpoints.at(-1)!;
		last.vessels[0]!.position[0] += 500;
		const verdict = await verifyReplay(make, replay);
		expect(verdict.ok).toBe(false);
		expect(verdict.ok ? '' : verdict.reason).toContain('position x');
	}, 300_000);
});
