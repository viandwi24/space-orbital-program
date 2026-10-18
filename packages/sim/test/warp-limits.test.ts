/** Plan 206 / ADR 0202 points 3 and 4: the world's warp limit and the clamp with a reason. */
import { describe, expect, test } from 'bun:test';
import Stock from '@orbital/mod-stock';
import { createSim, type Sim } from '../src/index.ts';
import { warpTiers } from '../src/warp-limits.ts';
import { rapier, stack } from './helpers/vessels.ts';

const HOME = 600_000;
const burner = () =>
	stack('Burner', ['stock.command-pod', 'stock.tank-small', 'stock.engine-lv'], [[2]]);

async function make(): Promise<Sim> {
	return createSim({ plugins: [Stock], backendFactory: rapier(16) });
}
function load(sim: Sim): number {
	const r = sim.dispatch({ type: 'load-vessel', design: burner() });
	if (!r.ok) throw new Error(r.reason);
	return Number(r.vessel);
}

describe('warp limits', () => {
	test('the home tiers follow KSP: 50× above the atmosphere, then 120, 240, 480 km', async () => {
		const sim = await make();
		const tiers = warpTiers({ def: sim.registries.bodies.get('stock.home')! });
		expect(tiers.map((t) => [t.factor, t.altitude])).toEqual([
			[50, 70_000],
			[100, 120_000],
			[1_000, 240_000],
			[10_000, 480_000],
			[100_000, 600_000]
		]);
		sim.dispose();
	});

	test('at 5 km with an engine on, the max is 10× ("engine running")', async () => {
		const sim = await make();
		const id = load(sim);
		sim.dispatch({
			type: 'debug-set-location',
			vessel: id,
			location: { kind: 'air', latitude: 0, longitude: 0, altitude: 5000, speed: 200 }
		});
		sim.dispatch({ type: 'stage', vessel: id });
		sim.dispatch({ type: 'throttle', vessel: id, value: 1 });
		sim.step(0.1);
		expect(sim.snapshot().warpLimit).toEqual({ max: 10, reason: 'engine running' });
		expect(sim.dispatch({ type: 'warp', factor: 1000, vessel: id })).toEqual({
			ok: true,
			granted: 10,
			limit: 'Max 10× — engine running'
		});
		sim.dispose();
	});

	test('at 80 km coasting over the home body the max is the 80 km tier, 50×', async () => {
		const sim = await make();
		const id = load(sim);
		sim.dispatch({
			type: 'debug-set-orbit',
			vessel: id,
			orbit: { body: 'stock.home', a: HOME + 80_000, e: 0, i: 0, raan: 0, argp: 0, m0: 0 }
		});
		const r = sim.dispatch({ type: 'warp', factor: 1000, vessel: id });
		expect(r).toEqual({ ok: true, granted: 50, limit: 'Max 50× — below 120 km' });
		sim.dispose();
	});

	test('landed, rails warp is allowed', async () => {
		const sim = await make();
		const id = load(sim);
		for (let i = 0; i < 50; i++) sim.step(0.02); // settled on the pad
		const r = sim.dispatch({ type: 'warp', factor: 1000, vessel: id });
		expect(r).toEqual({ ok: true, granted: 1000 });
		const v = sim.snapshot().vessels.find((x) => x.id === id)!;
		expect(v.mode).toBe('on-rails');
		expect(v.surface).toBe(true);
		sim.dispose();
	});

	test('a 100k× request in a stock world is clamped with a reason', async () => {
		const sim = await make();
		const r = sim.dispatch({ type: 'warp', factor: 100_000 });
		expect(r).toEqual({ ok: true, granted: 10_000, limit: 'Max 10k× — the top of this world' });
		sim.dispose();
	});
});
