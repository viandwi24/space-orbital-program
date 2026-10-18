/**
 * Plan 080 goldens, recorded on the code before the trajectory provider existed: SOI crossing
 * times and states on rails, and the sim's node prediction. The move behind `TrajectoryProvider`
 * must leave every number identical.
 */
import { describe, expect, test } from 'bun:test';
import type { Sim } from '../src/index.ts';
import { systemOf, transferState } from './helpers/moon.ts';
import { newSim, probe } from './helpers/vessels.ts';

/**
 * Numbers rounded to 10 significant digits (and rounding noise below 1e-9 to 0) before the snapshot: the goldens were recorded on
 * Linux x86-64 and Apple arm64 differs in the last ulp of the same maths (merge of plan 080, the
 * Lead's check: on the M5 the pre-move code and the provider agree exactly).
 */
const golden = (value: unknown): unknown =>
	typeof value === 'number'
		? Math.abs(value) < 1e-9
			? 0
			: Number(value.toPrecision(10))
		: Array.isArray(value)
			? value.map(golden)
			: value !== null && typeof value === 'object'
				? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, golden(v)]))
				: value;

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
		expect(golden(crossings)).toMatchSnapshot();
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
		expect(golden(v.nodes)).toMatchSnapshot();
	});
});

describe('gravity model (plan 080)', () => {
	test('an n-body world gets the n-body provider (plan 125, ADR 0122)', async () => {
		const { createSim } = await import('../src/index.ts');
		const { legacyWorldInfo } = await import('@orbital/core');
		const Stock = (await import('@orbital/mod-stock')).default;
		const { rapier } = await import('./helpers/vessels.ts');
		const sim = await createSim({
			plugins: [Stock],
			backendFactory: rapier(),
			world: { ...legacyWorldInfo(0), gravityModel: 'n-body' }
		});
		expect(sim.save().worldInfo.gravityModel).toBe('n-body');
		sim.dispose();
	});

	test('a patched world gets the patched provider', async () => {
		const sim = await newSim();
		expect(sim.save().worldInfo.gravityModel).toBe('patched');
	});
});
