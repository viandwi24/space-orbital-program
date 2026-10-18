/** Strategies (plan 101, ADR 0187): bounds, activation, slots, cooldown, upkeep, the projection, the save. */
import { describe, expect, test } from 'bun:test';
import {
	STRATEGY_KEYS,
	buildingUpkeepCharges,
	legacyWorldInfo,
	loadPlugins,
	sitesOf,
	projectBalances,
	strategyUpkeepCharge,
	type Plugin,
	type WorldInfo
} from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { definePlugin, defineStrategy } from '@orbital/sdk';
import { createSim, type Sim } from '../src/index.ts';
import { tickDayLength } from '../src/tick.ts';
import { openTree } from './helpers/tech.ts';
import { rapier, twoStage } from './helpers/vessels.ts';

const world = (agency = 'government', seed = 3): WorldInfo => {
	const base = legacyWorldInfo(seed);
	return {
		...base,
		id: `strategies-${agency}-${seed}`,
		preset: 'stock.career',
		rules: { ...base.rules, 'stock.agency-type': agency }
	};
};
const make = (agency?: string, extra: Plugin[] = [], resume?: unknown) =>
	createSim({
		plugins: [Stock, openTree, ...extra],
		backendFactory: rapier(8),
		world: world(agency),
		...(resume ? { resume } : {})
	});
const day = (sim: Sim) => tickDayLength(sim.registries.bodies.list());

function warpDays(sim: Sim, n: number): void {
	const to = sim.time + n * day(sim);
	const r = sim.dispatch({ type: 'warp-to', time: to, factor: 1e4 });
	if (!r.ok) throw new Error(r.reason);
	for (let g = 0; (sim.time < to - 1e-6 || sim.warp !== 1) && g < 1e5; g++) sim.step(10);
}

/** Two strategies that both cut launch costs to the floor of the key, and both lift reputation. */
const doubled = definePlugin({
	meta: { id: 'test-doubled', version: '1.0.0', api: '^0.1' },
	depends: ['stock'],
	setup(ctx) {
		for (const n of [1, 2])
			ctx.strategies.register(
				defineStrategy({
					id: `test-doubled.cheap-${n}`,
					label: `Cheap ${n}`,
					description: '',
					effects: [
						{ key: 'launch-cost', factor: STRATEGY_KEYS['launch-cost'].min },
						{ key: 'reputation', factor: STRATEGY_KEYS.reputation.max }
					],
					upkeep: 0
				})
			);
	}
});

const funds = (sim: Sim) => sim.snapshot().economy!.funds;

describe('strategies', () => {
	test("two strategies on one key never take it past the key's bounds", async () => {
		const sim = await make('government', [doubled]);
		// the stock Administration (level 1) has one slot: a level 2 has three
		const fullPrice = (() => {
			const before = funds(sim);
			const r = sim.dispatch({ type: 'load-vessel', design: twoStage() });
			expect(r.ok).toBe(true);
			return before - funds(sim);
		})();
		expect(sim.dispatch({ type: 'strategy-activate', strategy: 'test-doubled.cheap-1' }).ok).toBe(
			true
		);
		const second = sim.dispatch({ type: 'strategy-activate', strategy: 'test-doubled.cheap-2' });
		expect(second.ok).toBe(false);
		expect((second as { reason: string }).reason).toMatch(
			/All 1 strategy slots are in use; Administration level 2/
		);
		// with Administration at level 2 (three slots) both run: the product is clamped at the bound
		const info = world('government', 4);
		const sites = sitesOf(info).map((site) => ({
			...site,
			buildings: (site.buildings ?? []).map((b) =>
				b.kind === 'stock.administration' ? { ...b, level: 1 } : b
			)
		}));
		const free = await createSim({
			plugins: [Stock, openTree, doubled],
			backendFactory: rapier(8),
			world: { ...info, sites }
		});
		for (const n of [1, 2])
			expect(
				free.dispatch({ type: 'strategy-activate', strategy: `test-doubled.cheap-${n}` }).ok
			).toBe(true);
		const m = free.snapshot().strategies!.multipliers;
		expect(m['launch-cost']).toBe(STRATEGY_KEYS['launch-cost'].min);
		expect(m.reputation).toBe(STRATEGY_KEYS.reputation.max);
		const before = funds(free);
		expect(free.dispatch({ type: 'load-vessel', design: twoStage() }).ok).toBe(true);
		expect(before - funds(free)).toBeCloseTo(fullPrice * STRATEGY_KEYS['launch-cost'].min, 6);
		sim.dispose();
		free.dispose();
	});

	test('a factor outside its key bounds fails at load', () => {
		const bad = definePlugin({
			meta: { id: 'test-bad', version: '1.0.0', api: '^0.1' },
			depends: ['stock'],
			setup(ctx) {
				ctx.strategies.register(
					defineStrategy({
						id: 'test-bad.greedy',
						label: 'Greedy',
						description: '',
						effects: [{ key: 'recovery', factor: 3 }],
						upkeep: 0
					})
				);
			}
		});
		expect(() => loadPlugins([Stock, bad])).toThrow(/outside recovery's bounds 0.75..1.5/);
	});

	test('the agency type decides what is offered; end starts the cooldown', async () => {
		const gov = await make('government');
		const offered = gov.snapshot().strategies!.offered.map((s) => s.id);
		expect(offered).toContain('stock.budget-lobbying');
		expect(offered).not.toContain('stock.lean-operations');
		const r = gov.dispatch({ type: 'strategy-activate', strategy: 'stock.lean-operations' });
		expect((r as { reason: string }).reason).toMatch(/not offered to a government agency/);
		expect(gov.dispatch({ type: 'strategy-activate', strategy: 'stock.reuse-first' }).ok).toBe(
			true
		);
		expect(gov.dispatch({ type: 'strategy-end', strategy: 'stock.reuse-first' }).ok).toBe(true);
		const again = gov.dispatch({ type: 'strategy-activate', strategy: 'stock.reuse-first' });
		expect((again as { reason: string }).reason).toMatch(/can be activated again in 30 days/);
		warpDays(gov, 31);
		expect(gov.dispatch({ type: 'strategy-activate', strategy: 'stock.reuse-first' }).ok).toBe(
			true
		);
		gov.dispose();
		const company = await make('company');
		const ids = company.snapshot().strategies!.offered.map((s) => s.id);
		expect(ids).toContain('stock.lean-operations');
		expect(ids).not.toContain('stock.budget-lobbying');
		company.dispose();
	});

	test('upkeep and the budget follow the projection to the funds unit; a save keeps them', async () => {
		const sim = await make('government');
		const start = sim.snapshot();
		const strategy = sim.registries.strategies.get('stock.budget-lobbying')!;
		const today = start.day ?? 0;
		const rules = (id: string) => (start.rules ?? {})[id];
		const projected = projectBalances(
			start.economy!,
			sim.registries.charges.list(),
			rules,
			today,
			90,
			{
				multiplier: (k) => (k === 'budget' ? 1.1 : 1),
				// the buildings' upkeep is a charge too (plan 096): the screen projects with it
				extra: [
					...buildingUpkeepCharges(sitesOf(sim.worldInfo), sim.registries.buildings),
					strategyUpkeepCharge(strategy)
				]
			}
		);
		expect(sim.dispatch({ type: 'strategy-activate', strategy: strategy.id }).ok).toBe(true);
		const daily: number[] = [];
		sim.events.on('world:tick', () => daily.push(funds(sim)));
		warpDays(sim, 45);
		const resumed = await make('government', [], sim.save());
		resumed.events.on('world:tick', () => daily.push(funds(resumed)));
		warpDays(resumed, 45);
		expect(daily).toHaveLength(90);
		daily.forEach((f, i) => expect(Math.abs(f - projected[i]!.funds)).toBeLessThan(1));
		const upkeep = resumed.save().economy!.entries.filter((e) => e.cause === strategy.id);
		expect(upkeep.map((e) => e.amount)).toEqual([-1_000, -1_000, -1_000]);
		sim.dispose();
		resumed.dispose();
	});

	test('without the economy there are no strategies', async () => {
		const sim = await createSim({ plugins: [Stock], backendFactory: rapier(8) });
		const r = sim.dispatch({ type: 'strategy-activate', strategy: 'stock.reuse-first' });
		expect(r.ok).toBe(false);
		expect(sim.snapshot().strategies).toBeUndefined();
		sim.dispose();
	});

	test('a contract advance follows the contract-funds multiplier (plan 099 meets 101)', async () => {
		const sim = await make('hybrid');
		expect(
			sim.dispatch({ type: 'strategy-activate', strategy: 'stock.commercial-contracts' }).ok
		).toBe(true);
		let offer = sim.snapshot().contracts?.offers[0];
		for (let i = 0; !offer && i < 30; i++) {
			warpDays(sim, 1);
			offer = sim.snapshot().contracts?.offers[0];
		}
		const before = funds(sim);
		expect(sim.dispatch({ type: 'contract-accept', offer: offer!.id }).ok).toBe(true);
		expect(funds(sim) - before).toBeCloseTo(offer!.advance[0]!.amount * 1.2, 6);
		sim.dispose();
	});
});
