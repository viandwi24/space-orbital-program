/**
 * A company's way out of debt (player-journey audit Q3, ADR 0324): its standing service income, a
 * loan with interest, and no hiring on money the agency does not have.
 */
import { describe, expect, test } from 'bun:test';
import { legacyWorldInfo, LOAN, type WorldInfo } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim, type Sim } from '../src/index.ts';
import { tickDayLength } from '../src/tick.ts';
import { rapier } from './helpers/vessels.ts';

const world = (agency: string): WorldInfo => {
	const base = legacyWorldInfo(5);
	return {
		...base,
		id: `loan-${agency}`,
		preset: 'stock.career',
		rules: { ...base.rules, 'stock.agency-type': agency }
	};
};
const make = (agency = 'company', resume?: unknown) =>
	createSim({
		plugins: [Stock],
		backendFactory: rapier(8),
		...(resume ? { resume } : { world: world(agency) })
	});
const funds = (sim: Sim) => sim.snapshot().economy!.funds;
const entries = (sim: Sim, cause: string) =>
	sim
		.save()
		.economy!.entries.filter((e) => e.cause === cause)
		.map((e) => e.amount);
function days(sim: Sim, n: number): void {
	const day = tickDayLength(sim.registries.bodies.list());
	sim.dispatch({ type: 'warp', factor: 1e4 });
	const to = (Math.floor(sim.time / day) + n) * day + 1;
	while (sim.time < to) sim.step(Math.min(1, (to - sim.time) / 1e4));
	sim.dispatch({ type: 'warp', factor: 1 });
}

describe('a company agency', () => {
	test('earns its standing service contracts each month, and stays out of debt idle', async () => {
		const sim = await make();
		days(sim, 30);
		expect(entries(sim, 'stock.company-services')).toEqual([6_000]);
		expect(funds(sim)).toBeGreaterThan(100_000);
		sim.dispose();
	});
});

describe('the loan', () => {
	test('borrowed funds come at once, interest every 30 days, a save keeps it, and repaying ends it', async () => {
		const sim = await make();
		const f0 = funds(sim);
		expect(sim.dispatch({ type: 'loan-take', amount: 50_000 }).ok).toBe(true);
		expect(funds(sim)).toBe(f0 + 50_000);
		expect(sim.snapshot().economy!.loan).toEqual({
			owed: 50_000,
			limit: LOAN.limit,
			interest: LOAN.interest,
			everyDays: LOAN.everyDays
		});
		days(sim, 30);
		expect(entries(sim, 'economy.interest')).toEqual([-50_000 * LOAN.interest]);
		const resumed = await make('company', sim.save());
		expect(resumed.snapshot().economy!.loan!.owed).toBe(50_000);
		expect(resumed.dispatch({ type: 'loan-repay', amount: 80_000 }).ok).toBe(true);
		expect(resumed.snapshot().economy!.loan!.owed).toBe(0);
		expect(resumed.dispatch({ type: 'loan-repay', amount: 1 }).ok).toBe(false);
		sim.dispose();
		resumed.dispose();
	});

	test('no more than the limit can be owed', async () => {
		const sim = await make();
		expect(sim.dispatch({ type: 'loan-take', amount: LOAN.limit }).ok).toBe(true);
		const more = sim.dispatch({ type: 'loan-take', amount: 1 });
		expect(more.ok ? '' : more.reason).toContain('at most 100000');
		sim.dispose();
	});
});

describe('no spending past zero', () => {
	test('hiring is refused when the recruit fee is more than the funds', async () => {
		const base = world('company');
		const sim = await createSim({
			plugins: [Stock],
			backendFactory: rapier(8),
			world: { ...base, rules: { ...base.rules, 'stock.starting-funds': 5_000 } }
		});
		const refused = sim.dispatch({ type: 'crew-hire', profession: 'pilot' });
		expect(refused.ok ? '' : refused.reason).toBe('Not enough funds: needs 8000, has 5000');
		expect(funds(sim)).toBe(5_000);
		// a loan pays for it
		expect(sim.dispatch({ type: 'loan-take', amount: 25_000 }).ok).toBe(true);
		expect(sim.dispatch({ type: 'crew-hire', profession: 'pilot' }).ok).toBe(true);
		sim.dispose();
	});
});
