/**
 * Writes `save-v3.json`, the frozen format-3 save (plan 045): a probe on orbital rails with two
 * maneuver nodes and a warp-to under way, and the two-stage vessel on the pad. Run once with
 * `bun packages/sim/test/fixtures/make-save-v3.ts` when format 3 was current; never regenerate it
 * after that, or it stops being an old save.
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
const id = orbiting.vessel!;
for (const [time, prograde, normal] of [
	[3_000, 120, 0],
	[5_000, 0, 35]
] as const) {
	const r = sim.dispatch({ type: 'node-set', vessel: id, time, prograde, normal, radial: 0 });
	if (!r.ok) throw new Error(r.reason);
}
const pad = sim.dispatch({ type: 'load-vessel', design: twoStage() });
if (!pad.ok) throw new Error(pad.reason);
for (let i = 0; i < 50; i++) sim.step(0.02);
await Bun.write(
	new URL('./save-v3.json', import.meta.url),
	`${JSON.stringify(sim.save(), null, 1)}\n`
);
sim.dispose();
