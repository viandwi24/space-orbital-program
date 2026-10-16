import { expect, test } from 'bun:test';
import type { Command, EntityId } from '@orbital/core';
import { newSim, twoStage } from './helpers/vessels.ts';

/** The same command script, by step number, against a fresh sim; returns the state at t = 100 s. */
async function run(): Promise<{ snapshot: string; world: string; time: number }> {
	const sim = await newSim();
	const loaded = sim.dispatch({ type: 'load-vessel', design: twoStage() });
	if (!loaded.ok) throw new Error(loaded.reason);
	const vessel: EntityId = loaded.vessel!;
	const script = new Map<number, Command[]>([
		[
			0,
			[
				{ type: 'throttle', vessel, value: 1 },
				{ type: 'stage', vessel }
			]
		],
		// A small demand: the engine gimbals (ADR 0045), and a held demand turns the rocket over.
		[500, [{ type: 'attitude', vessel, pitch: 0.002, yaw: -0.001, roll: 0 }]],
		[1_000, [{ type: 'attitude', vessel, pitch: 0, yaw: 0, roll: 0.3 }]],
		[2_000, [{ type: 'throttle', vessel, value: 0.9 }]],
		[3_000, [{ type: 'stage', vessel }]], // fires the decoupler: a second vessel appears
		[3_500, [{ type: 'throttle', vessel, value: 1 }]]
	]);
	for (let i = 0; i < 5_000; i++) {
		for (const c of script.get(i) ?? []) {
			const r = sim.dispatch(c);
			if (!r.ok) throw new Error(`step ${i}: ${r.reason}`);
		}
		sim.step(0.02);
	}
	return {
		snapshot: JSON.stringify(sim.snapshot()),
		world: JSON.stringify(sim.world.serialize()),
		time: sim.time
	};
}

test('two runs of the same command script give byte-identical snapshots at t = 100 s', async () => {
	const a = await run();
	const b = await run();
	expect(a.time).toBeCloseTo(100, 6);
	expect(JSON.parse(a.snapshot).vessels.length).toBeGreaterThanOrEqual(2); // the split happened
	expect(b.snapshot).toBe(a.snapshot);
	expect(b.world).toBe(a.world);
});
