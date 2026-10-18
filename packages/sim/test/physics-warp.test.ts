/** Plan 206 / ADR 0202 point 2: physics warp runs whole fixed steps, so it matches real time exactly. */
import { expect, test } from 'bun:test';
import Stock from '@orbital/mod-stock';
import { createSim, type Sim } from '../src/index.ts';
import { rapier, twoStage } from './helpers/vessels.ts';

async function burning(warp: number): Promise<Sim> {
	const sim = await createSim({ plugins: [Stock], backendFactory: rapier(16), seed: 1 });
	const r = sim.dispatch({ type: 'load-vessel', design: twoStage() });
	const id = Number(r.ok && r.vessel);
	sim.dispatch({ type: 'stage', vessel: id });
	sim.dispatch({ type: 'throttle', vessel: id, value: 1 });
	expect(sim.dispatch({ type: 'warp', factor: warp, vessel: id })).toMatchObject({
		ok: true,
		granted: warp
	});
	return sim;
}
const state = (sim: Sim) =>
	JSON.stringify(sim.snapshot().vessels.map((v) => [v.position, v.velocity, v.orientation]));

test('4× physics warp over 10 s matches 1× over 10 s step for step', async () => {
	// 4×: 125 host frames of 0.02 s, four fixed steps each
	const fast = await burning(4);
	for (let i = 0; i < 125; i++) fast.step(0.02);
	const t = fast.time;
	expect(t).toBeGreaterThan(9.9);
	// 1×: one fixed step per frame up to the same step
	const real = await burning(1);
	while (real.time < t - 1e-9) real.step(0.02);
	expect(real.time).toBe(t);
	expect(state(fast)).toBe(state(real));
	fast.dispose();
	real.dispose();
});
