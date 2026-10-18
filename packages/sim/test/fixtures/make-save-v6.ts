/**
 * Writes `save-v6.json`, the frozen format-6 save (plan 117): a career world with comms on, a probe
 * in low orbit with a dish and one more probe. Run once with
 * `bun packages/sim/test/fixtures/make-save-v6.ts` while format 6 was current; never regenerate it
 * after that, or it stops being an old save.
 */
import { legacyWorldInfo } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim } from '../../src/index.ts';
import { orbitState } from '../helpers/measure.ts';
import { openTree } from '../helpers/tech.ts';
import { rapier, stack } from '../helpers/vessels.ts';

const sim = await createSim({
	plugins: [Stock, openTree],
	backendFactory: rapier(16),
	world: { ...legacyWorldInfo(12), id: 'save-v6', preset: 'stock.career' }
});
for (const [altitude, parts] of [
	[120_000, ['stock.probe-core', 'stock.dish-antenna']],
	[300_000, ['stock.probe-core']]
] as const) {
	const s = orbitState(sim, altitude);
	const res = sim.dispatch({
		type: 'load-vessel',
		design: stack('Probe', [...parts], []),
		placement: { kind: 'state', position: s.position, velocity: s.velocity }
	});
	if (!res.ok) throw new Error(res.reason);
}
for (let i = 0; i < 50; i++) sim.step(0.02);
await Bun.write(
	new URL('./save-v6.json', import.meta.url),
	`${JSON.stringify(sim.save(), null, 1)}\n`
);
sim.dispose();
