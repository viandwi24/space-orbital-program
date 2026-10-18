/** ADR 0114 (contract request of plan 081): the world tick reads the epoch in SI days from J2000. */
import { describe, expect, test } from 'bun:test';
import { legacyWorldInfo } from '@orbital/core';
import Stock, { HomeBody, MoonBody, SunBody } from '@orbital/mod-stock';
import { createSim } from '../src/index.ts';
import { dayAt, dayStart, tickDayLength } from '../src/tick.ts';
import { rapier } from './helpers/vessels.ts';

const DAY = tickDayLength([SunBody, HomeBody, MoonBody]); // the stock calendar's solar day (plan 122)

describe('tick days from an epoch in SI days', () => {
	test('epoch 0 is unchanged: day 0 at t = 0, the first tick at one day', () => {
		const info = legacyWorldInfo(1);
		expect(dayAt(info, DAY, 0)).toBe(0);
		expect(dayStart(info, DAY, 1)).toBe(DAY);
	});

	test('an epoch of 1.5 SI days counts whole stock days; the next tick is at the next boundary', () => {
		// 129 600 s is 5.99 stock days of 21 650.8 s (plan 122: the solar day of a planet round the Sun)
		const info = { ...legacyWorldInfo(1), epoch: { day: 1, fraction: 0.5 } };
		expect(dayAt(info, DAY, 0)).toBe(5);
		expect(dayStart(info, DAY, 6)).toBeCloseTo(6 * DAY - 129_600, 6);
	});

	test('an epoch inside a day: the first tick comes at the next calendar day boundary', async () => {
		// 1.6 SI days = 138 240 s = 6.39 stock days: day 6, the next boundary 7 days minus that.
		const sim = await createSim({
			plugins: [Stock],
			backendFactory: rapier(8),
			world: { ...legacyWorldInfo(1), id: 'epoch-test', epoch: { day: 1, fraction: 0.6 } }
		});
		const ticks: Array<{ day: number; time: number }> = [];
		sim.events.on('world:tick', (e) => ticks.push(e));
		sim.dispatch({ type: 'warp-to', time: 2 * DAY, factor: 1e4 });
		while (sim.time < 2 * DAY - 1e-6) sim.step(10);
		expect(ticks.map((t) => t.day)).toEqual([7, 8]);
		expect(ticks[0]!.time).toBeCloseTo(7 * DAY - 138_240, 6);
		expect(ticks[1]!.time).toBeCloseTo(8 * DAY - 138_240, 6);
		sim.dispose();
	});
});
