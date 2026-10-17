/**
 * Writes `save-v4.json`, the frozen format-4 save (plan 035): two probes on neighbouring orbits,
 * one targeting the other and one the moon, with a maneuver node on the first. Run once with
 * `bun packages/sim/test/fixtures/make-save-v4.ts` when format 4 was current; never regenerate it
 * after that, or it stops being an old save.
 */
import Stock from '@orbital/mod-stock';
import { createSim } from '../../src/index.ts';
import { orbitState } from '../helpers/measure.ts';
import { probe, rapier } from '../helpers/vessels.ts';

const sim = await createSim({ plugins: [Stock], backendFactory: rapier(16), seed: 11 });
const place = (alt: number, phase: number) => {
	const s = orbitState(sim, alt);
	const c = Math.cos(phase);
	const n = Math.sin(phase);
	const rot = (v: { x: number; y: number; z: number }) => ({
		x: v.x * c + v.z * n,
		y: v.y,
		z: -v.x * n + v.z * c
	});
	const res = sim.dispatch({
		type: 'load-vessel',
		design: probe(),
		placement: { kind: 'state', position: rot(s.position), velocity: rot(s.velocity) }
	});
	if (!res.ok) throw new Error(res.reason);
	return res.vessel!;
};
const first = place(150_000, 0);
const second = place(165_000, 0.4);
const check = (r: { ok: boolean; reason?: string }) => {
	if (!r.ok) throw new Error(r.reason);
};
check(sim.dispatch({ type: 'target-set', vessel: first, target: { kind: 'vessel', id: second } }));
check(
	sim.dispatch({
		type: 'target-set',
		vessel: second,
		target: { kind: 'body', id: 'stock.cinder' as never }
	})
);
check(
	sim.dispatch({ type: 'node-set', vessel: first, time: 3_000, prograde: 90, normal: 0, radial: 0 })
);
for (let i = 0; i < 50; i++) sim.step(0.02);
await Bun.write(
	new URL('./save-v4.json', import.meta.url),
	`${JSON.stringify(sim.save(), null, 1)}\n`
);
sim.dispose();
