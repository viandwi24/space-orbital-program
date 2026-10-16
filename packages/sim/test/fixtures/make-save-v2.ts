/**
 * Writes `save-v2.json`, the frozen format-2 save the migration test loads (plan 043). Run once
 * with `bun packages/sim/test/fixtures/make-save-v2.ts` when format 2 was current; never regenerate
 * it after that, or it stops being an old save. Two vessels: a probe on orbital rails and the
 * two-stage vessel standing on the pad in flight.
 */
import Stock from '@orbital/mod-stock';
import { createSim } from '../../src/index.ts';
import { orbitState } from '../helpers/measure.ts';
import { probe, rapier, twoStage } from '../helpers/vessels.ts';

const sim = await createSim({ plugins: [Stock], backendFactory: rapier(16), seed: 7 });
const orbiting = sim.dispatch({
	type: 'load-vessel',
	design: probe(),
	placement: { kind: 'state', ...orbitState(sim, 150_000) }
});
if (!orbiting.ok) throw new Error(orbiting.reason);
const pad = sim.dispatch({ type: 'load-vessel', design: twoStage() });
if (!pad.ok) throw new Error(pad.reason);
for (let i = 0; i < 50; i++) sim.step(0.02);
await Bun.write(
	new URL('./save-v2.json', import.meta.url),
	`${JSON.stringify(sim.save(), null, 1)}\n`
);
sim.dispose();
