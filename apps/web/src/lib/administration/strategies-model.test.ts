/** Plan 101 (ADR 0187): the Strategies tab, and its projection against the sim itself. */
import { describe, expect, it } from 'vitest';
import { calendarOf, legacyWorldInfo } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim, type Sim } from '@orbital/sim';
import {
	PROJECTION_DAYS,
	projectFunds,
	strategyCards,
	strategyCommand,
	type ProjectionInput
} from './strategies-model';

const make = (agency: string) => {
	const base = legacyWorldInfo(5);
	return createSim({
		plugins: [Stock],
		backendFactory: () => createRapierBackend({ solverIterations: 8 }),
		world: {
			...base,
			id: `strategies-web-${agency}`,
			preset: 'stock.career',
			rules: { ...base.rules, 'stock.agency-type': agency }
		}
	});
};
const input = (sim: Sim): ProjectionInput => ({
	snapshot: sim.snapshot(),
	charges: sim.registries.charges.list(),
	buildings: sim.registries.buildings,
	strategies: sim.registries.strategies
});
const DAY = 21_650.8;
/** The world-tick day: the calendar's solar day (plan 122). */
const dayOf = (sim: Sim): number => {
	const c = calendarOf(sim.registries.bodies.list());
	return c.kind === 'fictional' ? c.dayLength : 86_400;
};

describe('Administration strategies (plan 101)', () => {
	it('the projection shown before activation is what the sim books after it, to the funds unit', async () => {
		for (const [agency, strategy] of [
			['government', 'stock.budget-lobbying'],
			['company', 'stock.lean-operations']
		] as const) {
			const sim = await make(agency);
			const day = dayOf(sim);
			const shown = projectFunds(input(sim), strategy);
			expect(shown).toHaveLength(PROJECTION_DAYS);
			expect(sim.dispatch(strategyCommand('activate', strategy)).ok).toBe(true);
			const booked: number[] = [];
			sim.events.on('world:tick', () => booked.push(sim.snapshot().economy!.funds));
			const to = PROJECTION_DAYS * day + 1;
			sim.dispatch({ type: 'warp-to', time: to, factor: 1e6 });
			for (let g = 0; (sim.time < to - 1e-6 || sim.warp !== 1) && g < 1e5; g++) sim.step(10);
			expect(booked).toHaveLength(PROJECTION_DAYS);
			booked.forEach((f, i) => expect(Math.abs(f - shown[i]!)).toBeLessThan(1));
			sim.dispose();
		}
	}, 60_000);

	it('cards show ratios, caps, upkeep and the projection; a full board blocks the rest', async () => {
		const sim = await make('government');
		const cards = strategyCards(input(sim), sim.time, DAY);
		const lobby = cards.find((c) => c.id === 'stock.budget-lobbying')!;
		expect(lobby.effects).toEqual([
			'Budget ×1.1 (cap 0.8–1.2)',
			'Reputation gains ×0.9 (cap 0.5–1.5)'
		]);
		expect(lobby.upkeep).toBe('1,000 funds every 30 days');
		expect(lobby.action).toBe('activate');
		// three budgets ×1.1 (+2 400 each on 24 000) against three upkeeps (−1 000 each) in 90 days
		expect(lobby.projection).toMatch(/In 90 days: .* with it, .* without \(\+4,200 funds\)/);
		expect(cards.some((c) => c.id === 'stock.lean-operations')).toBe(false);
		sim.dispatch(strategyCommand('activate', 'stock.budget-lobbying'));
		const after = strategyCards(input(sim), sim.time, DAY);
		expect(after.find((c) => c.id === 'stock.budget-lobbying')).toMatchObject({
			active: true,
			action: 'end'
		});
		expect(after.find((c) => c.id === 'stock.reuse-first')).toMatchObject({
			action: null,
			blocked: 'All 1 strategy slots are in use'
		});
		sim.dispose();
	});
});

describe('the Strategies tab rendered (plan 101)', () => {
	it('shows each card with its ratios, upkeep, projection and action', async () => {
		const { render } = await import('svelte/server');
		const { default: StrategiesTab } = await import('./StrategiesTab.svelte');
		const sim = await make('government');
		const html = render(StrategiesTab, {
			props: { cards: strategyCards(input(sim), sim.time, DAY), onaction: () => {} }
		}).body;
		expect(html).toContain('Budget lobbying');
		expect(html).toContain('Budget ×1.1 (cap 0.8–1.2)');
		expect(html).toContain('Upkeep: 1,000 funds every 30 days');
		expect(html).toContain('data-testid="strategy-activate-stock.budget-lobbying"');
		expect(html).toContain('In 90 days:');
		sim.dispose();
	});
});
