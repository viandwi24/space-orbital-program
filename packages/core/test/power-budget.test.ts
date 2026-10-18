/** The power budget (plan 208, ADR 0213): producers and consumers by day and by night. */
import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { powerBudget, type ModuleDefinition, type PartDefinition } from '../src/index.ts';

const modules = new Map<string, ModuleDefinition>(
	(
		[
			{
				id: 'm.battery',
				config: z.object({ ec: z.number() }),
				power: (c: { ec: number }) => ({ capacity: c.ec })
			},
			{ id: 'm.rtg', power: () => ({ rate: 0.75 }) },
			{
				id: 'm.solar',
				config: z.object({ rate: z.number() }),
				power: (c: { rate: number }) => ({ rate: c.rate, sun: true })
			},
			{ id: 'm.core', power: () => ({ rate: -0.025 }) },
			{ id: 'm.inert' }
		] as ModuleDefinition[]
	).map((m) => [m.id, m])
);
const part = (id: string, mods: Array<[string, unknown]>): PartDefinition =>
	({ id, title: id, mass: 1, modules: mods }) as PartDefinition;
const parts = new Map(
	[
		part('p.battery', [['m.battery', { ec: 400 }]]),
		part('p.rtg', [['m.rtg', undefined]]),
		part('p.solar', [['m.solar', { rate: 1.5 }]]),
		part('p.core', [
			['m.core', undefined],
			['m.inert', undefined]
		])
	].map((p) => [p.id, p])
);
const lookup = { parts, modules };

describe('powerBudget', () => {
	test('two batteries, one RTG and one probe core: day and night net rates', () => {
		const b = powerBudget(['p.battery', 'p.battery', 'p.rtg', 'p.core'], lookup);
		expect(b.day).toBeCloseTo(0.725, 12);
		expect(b.night).toBeCloseTo(0.725, 12);
		expect(b.capacity).toBe(800);
		expect(b.drawn).toBeCloseTo(0.025, 12);
		expect(b.nightReserve).toBeNull();
	});

	test('a solar panel counts by day only; a negative night lasts as long as the stores', () => {
		const b = powerBudget(['p.battery', 'p.solar', 'p.core'], lookup);
		expect(b.day).toBeCloseTo(1.475, 12);
		expect(b.night).toBeCloseTo(-0.025, 12);
		expect(b.produced).toEqual({ day: 1.5, night: 0 });
		expect(b.nightReserve).toBeCloseTo(400 / 0.025, 6);
	});
});
