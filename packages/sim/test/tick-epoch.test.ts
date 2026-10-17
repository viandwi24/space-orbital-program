/** ADR 0114 (contract request of plan 081): the world tick reads the epoch in SI days from J2000. */
import { describe, expect, test } from 'bun:test';
import { legacyWorldInfo } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim } from '../src/index.ts';
import { dayAt, dayStart } from '../src/tick.ts';
import { rapier } from './helpers/vessels.ts';

const DAY = 21_600; // the stock calendar's day

describe('tick days from an epoch in SI days', () => {
	test('epoch 0 is unchanged: day 0 at t = 0, the first tick at one day', () => {
		const info = legacyWorldInfo(1);
		expect(dayAt(info, DAY, 0)).toBe(0);
		expect(dayStart(info, DAY, 1)).toBe(DAY);
	});

	test('an epoch of 1.5 SI days is 6 stock days: the next tick is day 7 at one stock day', () => {
		const info = { ...legacyWorldInfo(1), epoch: { day: 1, fraction: 0.5 } };
		expect(dayAt(info, DAY, 0)).toBe(6);
		expect(dayStart(info, DAY, 7)).toBe(DAY);
	});

	test('an epoch inside a day: the first tick comes at the next calendar day boundary', async () => {
		// 1.6 SI days = 138 240 s = 6.4 stock days: day 6, next boundary 0.6 days (12 960 s) later.
		const sim = await createSim({
			plugins: [Stock],
			backendFactory: rapier(8),
			world: { ...legacyWorldInfo(1), id: 'epoch-test', epoch: { day: 1, fraction: 0.6 } }
		});
		const ticks: Array<{ day: number; time: number }> = [];
		sim.events.on('world:tick', (e) => ticks.push(e));
		sim.dispatch({ type: 'warp-to', time: 2 * DAY, factor: 1e5 });
		while (sim.time < 2 * DAY - 1e-6) sim.step(10);
		expect(ticks.map((t) => t.day)).toEqual([7, 8]);
		expect(ticks[0]!.time).toBeCloseTo(0.6 * DAY, 6);
		expect(ticks[1]!.time).toBeCloseTo(1.6 * DAY, 6);
		sim.dispose();
	});
});
