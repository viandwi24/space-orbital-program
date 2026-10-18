/**
 * Plan 113 tool, not a test (no `.test.ts` suffix): launches the stock moon rocket to a low orbit
 * `count` times in one headless sim, ten minutes apart so the vessels spread round the orbit, and
 * writes a game save of the fleet for the Mission Center's frame-time measurement.
 * Run: `bun packages/sim/test/fleet-save.tool.ts <folder> [count=50]`.
 */
import { writeFileSync } from 'node:fs';
import type { EntityId } from '@orbital/core';
import { buildGameSave } from '../../../apps/web/src/lib/save/game-save.ts';
import { createAscent, defaultAscent } from './helpers/ascent.ts';
import { warpTo, type Mission } from './helpers/mission.ts';
import { moonShot, rapier } from './helpers/vessels.ts';
import { createSim } from '../src/index.ts';
import Stock from '@orbital/mod-stock';
import { createBodyTerrainField } from '@orbital/core';

const out = process.argv[2]!;
const count = Number(process.argv[3] ?? 50);
const sim = await createSim({
	plugins: [Stock],
	backendFactory: rapier(16),
	seed: 1,
	terrain: createBodyTerrainField
});
const design = { ...moonShot(), name: 'Fleet' };
let vessel: EntityId | null = null;
let launched = 0;
// a launch now and then is lost on the way up (debris of an earlier one); the next one replaces it
for (let attempt = 1; launched < count && attempt <= count * 2; attempt++) {
	const loaded = sim.dispatch({
		type: 'load-vessel',
		design: { ...design, name: `Fleet ${launched + 1}` }
	});
	if (!loaded.ok) throw new Error(`launch ${attempt}: ${loaded.reason}`);
	const id = loaded.vessel as EntityId;
	const m: Mission = { sim, vessel: id, log: [] };
	const ascent = createAscent(sim, id, {
		...defaultAscent,
		stageCount: 1,
		jettisonAtCut: true,
		apoapsis: 100_000 + (launched % 8) * 2_000,
		periapsis: 76_000,
		turnStart: 100,
		turnEnd: 25_000,
		turnPitch: 1.2
	});
	const start = sim.time;
	try {
		while (sim.time < start + 1_500 && ascent.phase !== 'done') {
			sim.step(0.02);
			ascent.update();
		}
	} catch (e) {
		console.log(
			`launch ${attempt} lost after ${(sim.time - start).toFixed(1)} s: ${e instanceof Error ? e.message : e}`
		);
		// clear the pad's surroundings with the last vessel in orbit as the warp's anchor
		if (vessel !== null) warpTo({ sim, vessel, log: [] }, sim.time + 600);
		continue;
	}
	if (ascent.phase !== 'done') throw new Error(`launch ${attempt} did not reach orbit`);
	for (let i = 0; i < 200; i++) sim.step(0.02);
	warpTo(m, sim.time + 600);
	vessel = id;
	launched++;
	console.log(`orbit ${launched} at t ${sim.time.toFixed(0)}`);
}
const g = buildGameSave({
	id: 'fleet',
	name: `Fleet of ${count}`,
	kind: 'manual',
	createdAt: Date.now(),
	sim: sim.save(),
	focus: Number(vessel),
	design,
	thumbnail: null,
	bodyRadius: 600_000
});
writeFileSync(`${out}/fleet.json`, JSON.stringify(g));
console.log('saved', g.name, 'vessels', sim.snapshot().vessels.length);
