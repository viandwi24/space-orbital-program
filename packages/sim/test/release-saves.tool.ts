/**
 * Plan 023 tool, not a test (no `.test.ts` suffix): flies the stock moon rocket headlessly with the
 * browser's terrain and writes game saves of the way (`ascent`, `orbit`, `transfer`, `moon-orbit`) for
 * `apps/web/scripts/capture-screens.ts`. Run: `bun packages/sim/test/release-saves.tool.ts <folder>` (about 2 s).
 */
import { writeFileSync } from 'node:fs';
import type { EntityId } from '@orbital/core';
import { buildGameSave } from '../../../apps/web/src/lib/save/game-save.ts';
import { createAscent, defaultAscent } from './helpers/ascent.ts';
import {
	burn,
	point,
	retroBurnAtPeriapsis,
	snapshotOf,
	transferBurnTime,
	warpTo,
	type Mission
} from './helpers/mission.ts';
import { systemOf } from './helpers/moon.ts';
import { moonShot, rapier } from './helpers/vessels.ts';
import { createSim } from '../src/index.ts';
import Stock from '@orbital/mod-stock';
import { createBodyTerrainField } from '@orbital/core';

const out = process.argv[2]!;
const SHIFT = 500_000;
const sim = await createSim({
	plugins: [Stock],
	backendFactory: rapier(16),
	seed: 1,
	terrain: createBodyTerrainField
});
const s = systemOf(sim);
const design = { ...moonShot(), name: 'Moon shot' };
const loaded = sim.dispatch({ type: 'load-vessel', design });
if (!loaded.ok) throw new Error(loaded.reason);
const vessel = loaded.vessel as EntityId;
const m: Mission = { sim, vessel, log: [] };
const save = (name: string, file: string, radius: number) => {
	const g = buildGameSave({
		id: file,
		name,
		kind: 'manual',
		createdAt: Date.now(),
		sim: sim.save(),
		focus: Number(vessel),
		design,
		thumbnail: null,
		bodyRadius: radius
	});
	writeFileSync(`${out}/${file}.json`, JSON.stringify(g));
	console.log('saved', name, 't', sim.time.toFixed(0));
};
const ascent = createAscent(sim, vessel, {
	...defaultAscent,
	stageCount: 1,
	jettisonAtCut: true,
	apoapsis: 100_000,
	periapsis: 76_000,
	turnStart: 100,
	turnEnd: 25_000,
	turnPitch: 1.2
});
// a save on the way up (about 12 km)
let up = false;
while (sim.time < 1_500 && ascent.phase !== 'done') {
	sim.step(0.02);
	ascent.update();
	const alt =
		Math.hypot(...(Object.values(snapshotOf(m).v.position) as [number, number, number])) - 600_000;
	if (!up && alt > 12_000) {
		up = true;
		save('Ascent 12 km', 'ascent', 600_000);
	}
}
for (let i = 0; i < 200; i++) sim.step(0.02);
save('Low orbit', 'orbit', 600_000);
const orbit0 = snapshotOf(m).v.orbit!;
const departure = transferBurnTime(sim, orbit0, sim.time, SHIFT);
point(m, 'prograde');
warpTo(m, departure - 12);
while (sim.time < departure - 12) sim.step(0.02);
const wanted = s.orbit.a + SHIFT;
const gap = () => {
	const o = snapshotOf(m).v.orbit;
	return o === undefined ? Infinity : wanted - o.a * (1 + o.e);
};
const taper = (g: number) => (g > 2_000_000 ? 1 : g > 300_000 ? 0.2 : 0.03);
burn(
	m,
	() => gap() <= 0,
	400,
	() => taper(gap())
);
for (let i = 0; i < 300 && snapshotOf(m).v.mode !== 'on-rails'; i++) sim.step(0.02);
save('Transfer coast', 'transfer', 600_000);
let guard = 0;
while (snapshotOf(m).v.soi !== s.moon.id && guard++ < 50) warpTo(m, sim.time + 40_000, true);
retroBurnAtPeriapsis(m, s.moonMu, 1_200_000);
for (let i = 0; i < 300 && snapshotOf(m).v.mode !== 'on-rails'; i++) sim.step(0.02);
retroBurnAtPeriapsis(m, s.moonMu, 300_000);
for (let i = 0; i < 300 && snapshotOf(m).v.mode !== 'on-rails'; i++) sim.step(0.02);
save('Moon orbit', 'moon-orbit', s.moon.radius);
sim.dispose();
