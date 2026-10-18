/** The replay verifier (plan 131): accepts a recorded flight, rejects one whose final state was edited. */
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { VesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim, recordReplay } from '@orbital/sim';

const VERIFY = join(import.meta.dir, '../verify.ts');

/** A pod on a tank and an engine: lit for 20 s, then coasting (the web host's settings). */
async function hop() {
	const sim = await createSim({
		plugins: [Stock],
		backendFactory: () => createRapierBackend({ solverIterations: 16 }),
		seed: 3
	});
	const design: VesselDesign = {
		formatVersion: 1,
		name: 'Hopper',
		parts: [
			{ index: 0, part: 'stock.command-pod' as never, parent: null },
			{
				index: 1,
				part: 'stock.tank-small' as never,
				parent: { index: 0, parentNode: 'bottom', node: 'top' }
			},
			{
				index: 2,
				part: 'stock.engine-lv' as never,
				parent: { index: 1, parentNode: 'bottom', node: 'top' }
			}
		],
		stages: [[2]]
	};
	const r = sim.dispatch({ type: 'load-vessel', design });
	if (!r.ok) throw new Error(r.reason);
	const rec = recordReplay(sim, 'Hop');
	rec.dispatch({ type: 'throttle', vessel: r.vessel!, value: 1 });
	rec.dispatch({ type: 'stage', vessel: r.vessel! });
	for (let i = 0; i < 2_000; i++) {
		sim.step(0.02);
		rec.tick();
		if (i === 1_000) rec.dispatch({ type: 'throttle', vessel: r.vessel!, value: 0 });
	}
	const replay = rec.finish();
	sim.dispose();
	return replay;
}

const run = (file: string) => {
	const p = Bun.spawnSync(['bun', VERIFY, file], { stdout: 'pipe', stderr: 'pipe' });
	return { code: p.exitCode, out: `${p.stdout.toString()}${p.stderr.toString()}` };
};

describe('replay verifier', () => {
	test('accepts a recorded flight and rejects one whose final state was edited', async () => {
		const replay = await hop();
		const dir = mkdtempSync(join(tmpdir(), 'replay-'));
		const good = join(dir, 'hop.orbital-replay.json');
		writeFileSync(good, JSON.stringify(replay));
		const ok = run(good);
		expect(ok.out).toContain('match');
		expect(ok.code).toBe(0);

		const edited = structuredClone(replay);
		edited.checkpoints.at(-1)!.vessels[0]!.velocity[1] += 3;
		const bad = join(dir, 'edited.orbital-replay.json');
		writeFileSync(bad, JSON.stringify(edited));
		const no = run(bad);
		expect(no.code).toBe(1);
		expect(no.out).toContain('rejected: at t = 40.00 s, vessel');
		expect(no.out).toContain('velocity y');

		const junk = join(dir, 'junk.json');
		writeFileSync(junk, '{"hello":1}');
		expect(run(junk)).toMatchObject({ code: 2 });
	}, 120_000);
});
