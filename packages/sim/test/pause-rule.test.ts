/** Plan 205 / ADR 0201 points 4, 5 and 10: the pause command, the rule that locks it, warp-stop events. */
import { describe, expect, test } from 'bun:test';
import { legacyWorldInfo, type WorldInfo } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim } from '../src/index.ts';
import { rapier } from './helpers/vessels.ts';

const make = (preset: string) =>
	createSim({
		plugins: [Stock],
		backendFactory: rapier(16),
		world: { ...legacyWorldInfo(1), id: '0d1f6c4e-7a2b-4c8d-9e0f-1a2b3c4d5e6f', preset } as WorldInfo
	});

describe('pause', () => {
	test('a pause freezes the clock until it is lifted', async () => {
		const sim = await make('stock.career');
		sim.step(0.5);
		expect(sim.dispatch({ type: 'pause', on: true })).toEqual({ ok: true });
		const t = sim.time;
		sim.step(1);
		expect(sim.time).toBe(t);
		expect(sim.snapshot().paused).toBe(true);
		sim.dispatch({ type: 'pause', on: false });
		sim.step(0.5);
		expect(sim.time).toBeGreaterThan(t);
		expect(sim.snapshot().paused).toBeUndefined();
		sim.dispose();
	});

	test('in a Hardcore world a pause is refused with a reason; warp is accepted', async () => {
		const sim = await make('stock.career-hardcore');
		expect(sim.dispatch({ type: 'pause', on: true })).toEqual({
			ok: false,
			reason: 'this world does not allow pausing (stock.pause-allowed)'
		});
		expect(sim.dispatch({ type: 'warp', factor: 10 }).ok).toBe(true);
		const t = sim.time;
		sim.step(0.5);
		expect(sim.time).toBeGreaterThan(t);
		sim.dispose();
	});

	test('a warp-to that arrives reports that the warp stopped', async () => {
		const sim = await make('stock.sandbox');
		const reasons: string[] = [];
		sim.events.on('warp:stopped', (e) => reasons.push(e.reason));
		expect(sim.dispatch({ type: 'warp-to', time: 100, factor: 1000 }).ok).toBe(true);
		for (let i = 0; i < 20 && sim.time < 100; i++) sim.step(1);
		expect(sim.time).toBeCloseTo(100, 6);
		expect(reasons).toEqual(['the warp reached its time']);
		sim.dispose();
	});
});
