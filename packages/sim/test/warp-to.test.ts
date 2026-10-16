/** Plan 045 / ADR 0056: `warp-to` lands the clock exactly on a time. */
import { describe, expect, test } from 'bun:test';
import type { EntityId } from '@orbital/core';
import { orbitState } from './helpers/measure.ts';
import { systemOf, transferState } from './helpers/moon.ts';
import { moonLander, newSim, twoStage } from './helpers/vessels.ts';

async function inOrbit() {
	const sim = await newSim();
	const res = sim.dispatch({
		type: 'load-vessel',
		design: moonLander(),
		placement: { kind: 'state', ...orbitState(sim, 150_000) }
	});
	if (!res.ok) throw new Error(res.reason);
	return { sim, id: res.vessel as EntityId };
}

describe('warp-to', () => {
	test('stops at the requested time within 1e-6 s at warp 1, never overshooting at 1e5x', async () => {
		const { sim } = await inOrbit();
		const target = 50_000.123;
		expect(sim.dispatch({ type: 'warp-to', time: target, factor: 1e5 }).ok).toBe(true);
		expect(sim.warp).toBe(1e5);
		let worst = 0;
		let steps = 0;
		let fastest = 1;
		while (sim.warp > 1 && steps++ < 100_000) {
			sim.step(1 / 60);
			worst = Math.max(worst, sim.time - target);
			fastest = Math.max(fastest, sim.warp);
		}
		expect(fastest).toBe(1e5);
		expect(sim.warp).toBe(1);
		expect(Math.abs(sim.time - target)).toBeLessThan(1e-6);
		expect(worst).toBeLessThan(1e-6);
		// the warp is over: further steps run at real time
		const t = sim.time;
		sim.step(1);
		expect(sim.time - t).toBeCloseTo(1, 6);
		// eased into real time over the last seconds, not cut off: about 12 s of frames for 50 000 s
		expect(steps).toBeLessThan(1_000);
		sim.dispose();
	});

	test('a new warp command or a warp of 1 cancels a warp-to', async () => {
		const { sim } = await inOrbit();
		sim.dispatch({ type: 'warp-to', time: 5_000, factor: 100 });
		sim.dispatch({ type: 'warp', factor: 1 });
		sim.step(10);
		expect(sim.time).toBeCloseTo(10, 6);
		expect(sim.save().warpTarget).toBeNull();
		sim.dispose();
	});

	test('refused in flight and for a time that has passed', async () => {
		const sim = await newSim();
		sim.dispatch({ type: 'load-vessel', design: twoStage() });
		const r = sim.dispatch({ type: 'warp-to', time: 100, factor: 10 });
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.reason).toContain('in flight');
		const past = sim.dispatch({ type: 'warp-to', time: 0, factor: 10 });
		expect(past.ok).toBe(false);
		sim.dispose();
	});

	test('is kept by a save and continues after a resume', async () => {
		const { sim } = await inOrbit();
		sim.dispatch({ type: 'warp-to', time: 20_000, factor: 1e4 });
		sim.step(0.5);
		const save = JSON.parse(JSON.stringify(sim.save()));
		expect(save.warpTarget).toBe(20_000);
		const { createSim } = await import('../src/index.ts');
		const Stock = (await import('@orbital/mod-stock')).default;
		const { rapier } = await import('./helpers/vessels.ts');
		const resumed = await createSim({ plugins: [Stock], backendFactory: rapier(16), resume: save });
		let n = 0;
		while (resumed.warp > 1 && n++ < 100_000) resumed.step(1 / 60);
		expect(Math.abs(resumed.time - 20_000)).toBeLessThan(1e-6);
		sim.dispose();
		resumed.dispose();
	});

	test('an SOI change cancels it: the warp ends at the moon, not at the target', async () => {
		const sim = await newSim();
		const s = systemOf(sim);
		const state = transferState(s, 750_000, 500_000);
		const res = sim.dispatch({
			type: 'load-vessel',
			design: moonLander(),
			placement: { kind: 'state', position: state.r, velocity: state.v }
		});
		if (!res.ok) throw new Error(res.reason);
		const target = 200_000;
		expect(sim.dispatch({ type: 'warp-to', time: target, factor: 5_000 }).ok).toBe(true);
		let n = 0;
		while (sim.warp > 1 && n++ < 100_000) sim.step(0.5);
		const v = sim.snapshot().vessels[0]!;
		expect(String(v.soi)).toBe('stock.cinder');
		expect(sim.time).toBeLessThan(target - 10_000);
		expect(sim.save().warpTarget).toBeNull();
		const t = sim.time;
		sim.step(100);
		expect(sim.time - t).toBeCloseTo(100, 6);
		sim.dispose();
	}, 30_000);
});
