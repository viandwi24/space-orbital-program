/** The Finances tab (player-journey audit Q3, ADR 0324). */
import { LEGACY_LAYOUT, loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { financeView } from './finances-model';

const { registries } = loadPlugins([Stock]);
const input = (agency: string, owed = 0) => ({
	snapshot: {
		economy: {
			enabled: true,
			funds: 100_000,
			science: 0,
			reputation: 0,
			loan: { owed, limit: 100_000, interest: 0.02, everyDays: 30 }
		},
		rules: { 'stock.agency-type': agency, 'stock.funds-multiplier': 1, 'stock.cost-multiplier': 1 },
		sites: [{ id: 'legacy', buildings: LEGACY_LAYOUT.buildings, roads: [] }]
	} as never,
	charges: registries.charges.list(),
	buildings: registries.buildings,
	strategies: registries.strategies
});

describe('the Finances tab', () => {
	it('a company: its service contracts, operations and upkeep; the net of 30 quiet days', () => {
		const v = financeView(input('company'))!;
		expect(v.lines.map((l) => [l.label, l.amount])).toEqual([
			['Service contracts', 6_000],
			['Space Center operations', -3_200],
			['Building upkeep', -1_200]
		]);
		expect(v.net).toBe(1_600);
		expect(v.notes[0]).toContain('A company: no budget');
	});

	it('a government: its budget; a loan adds its interest and the buttons follow what is owed', () => {
		const v = financeView(input('government', 40_000))!;
		expect(v.lines[0]).toEqual({ label: 'Government budget', amount: 24_000 });
		expect(v.lines.at(-1)).toEqual({ label: 'Loan interest', amount: -800 });
		expect(v.loan).toMatchObject({ owed: 40_000, borrow: 25_000, repay: 25_000 });
		expect(financeView(input('government', 90_000))!.loan.borrow).toBe(10_000);
	});

	it('no economy, no tab', () => {
		expect(
			financeView({ ...input('company'), snapshot: { economy: { enabled: false } } as never })
		).toBeNull();
	});
});
