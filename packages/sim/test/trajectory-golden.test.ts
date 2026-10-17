/**
 * Plan 080 goldens, recorded on the code before the trajectory provider existed: SOI crossing
 * times and states on rails, and the sim's node prediction. The move behind `TrajectoryProvider`
 * must leave every number identical.
 */
import { describe, expect, test } from 'bun:test';
import type { Sim } from '../src/index.ts';
import { systemOf, transferState } from './helpers/moon.ts';
import { newSim, probe } from './helpers/vessels.ts';

function warpUntil(sim: Sim, done: () => boolean, limit = 100_000): void {
	for (let i = 0; i < 20_000 && !done() && sim.time < limit; i++) {
		if (sim.warp === 1) sim.dispatch({ type: 'warp', factor: 1000 });
		sim.step(0.01);
	}
}

describe('trajectory goldens (plan 080)', () => {
	test('SOI crossings of a moon flyby on rails', async () => {
		const sim = await newSim();
		const s = systemOf(sim);
		const st = transferState(s, 680_000, 800_000);
		const placed = sim.dispatch({
			type: 'load-vessel',
			design: probe(),
			placement: { kind: 'state', position: st.r, velocity: st.v }
		});
		if (!placed.ok) throw new Error(placed.reason);
		const crossings: unknown[] = [];
		sim.events.on('vessel:soi-changed', (e) => {
			const v = sim.snapshot().vessels.find((x) => x.id === e.vessel)!;
			crossings.push({
				t: sim.time,
				from: e.from,
				to: e.to,
				position: v.position,
				velocity: v.velocity
			});
		});
		warpUntil(sim, () => crossings.length >= 2);
		expect(crossings).toHaveLength(2);
		expect(crossings).toMatchSnapshot();
	});

	test('node prediction of the sim (snapshot nodes) for a node on a low orbit', async () => {
		const sim = await newSim();
		const s = systemOf(sim);
		const st = transferState(s, 680_000, 800_000);
		const placed = sim.dispatch({
			type: 'load-vessel',
			design: probe(),
			placement: { kind: 'state', position: st.r, velocity: st.v }
		});
		if (!placed.ok) throw new Error(placed.reason);
		const id = placed.vessel!;
		for (const node of [
			{ time: 120, prograde: 40, normal: 5, radial: -3 },
			{ time: 3_000, prograde: -25, normal: 0, radial: 10 }
		]) {
			const r = sim.dispatch({ type: 'node-set', vessel: id, ...node });
			if (!r.ok) throw new Error(r.reason);
		}
		sim.step(0.02);
		const v = sim.snapshot().vessels.find((x) => x.id === id)!;
		expect(v.nodes).toMatchSnapshot();
	});
});
