/**
 * Writes `save-v5.json`, the frozen format-5 save (plan 122): the stock system rooted at the home
 * planet (before the Sun), a probe in low orbit and one on the pad's longitude 2 km up. Run once with
 * `bun packages/sim/test/fixtures/make-save-v5.ts` when format 5 was current; never regenerate it
 * after that, or it stops being an old save.
 */
import Stock from '@orbital/mod-stock';
import { createSim } from '../../src/index.ts';
import { orbitState } from '../helpers/measure.ts';
import { probe, rapier } from '../helpers/vessels.ts';

const sim = await createSim({ plugins: [Stock], backendFactory: rapier(16), seed: 12 });
const s = orbitState(sim, 120_000);
const res = sim.dispatch({
	type: 'load-vessel',
	design: probe(),
	placement: { kind: 'state', position: s.position, velocity: s.velocity }
});
if (!res.ok) throw new Error(res.reason);
for (let i = 0; i < 50; i++) sim.step(0.02);
await Bun.write(
	new URL('./save-v5.json', import.meta.url),
	`${JSON.stringify(sim.save(), null, 1)}\n`
);
sim.dispose();
