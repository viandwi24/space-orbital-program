/**
 * The Administration screen's Finances tab (player-journey audit Q3, ADR 0324): where the agency's
 * money comes from and goes every 30 days, the loan, and the rules the player meets (no hiring or
 * building on money it does not have). Pure: the page renders it and sends the commands.
 */
import {
	buildingUpkeepCharges,
	chargeOn,
	LOAN,
	strategyMultipliers,
	strategyUpkeepCharge,
	type BuildingDefinition,
	type ChargeDefinition,
	type Command,
	type Snapshot,
	type StrategyDefinition
} from '@orbital/core';
import { formatFunds } from '../format';

export interface FinanceLine {
	label: string;
	/** Funds every 30 days: income positive, costs negative. */
	amount: number;
}

export interface FinanceView {
	lines: FinanceLine[];
	/** The sum of the lines: what 30 quiet days do to the funds. */
	net: number;
	loan: {
		owed: number;
		limit: number;
		/** Funds of interest every 30 days on what is owed now. */
		interest: number;
		/** What Borrow and Repay move: the step, or what is left. */
		borrow: number;
		repay: number;
	};
	/** What the agency is, and how its money works, in plain words. */
	notes: string[];
}

export interface FinanceInput {
	snapshot: Pick<Snapshot, 'economy' | 'rules' | 'strategies' | 'sites'>;
	charges: readonly ChargeDefinition[];
	buildings: { get(id: string): BuildingDefinition | undefined };
	strategies: { get(id: string): StrategyDefinition | undefined };
}

const PERIOD = 30;

const AGENCY_NOTES: Record<string, string> = {
	government:
		'A government agency: its budget arrives every 30 days. Contracts pay extra for the launches they ask for.',
	hybrid:
		'A hybrid agency: a public grant every 30 days, smaller than a government budget. Contracts pay the rest.',
	company:
		'A company: no budget. Standing service contracts cover the running costs; launches are paid by contracts or a loan.'
};

/** The Finances tab, or null with the economy off. */
export function financeView(input: FinanceInput): FinanceView | null {
	const { snapshot } = input;
	const economy = snapshot.economy;
	if (!economy?.enabled) return null;
	const rule = (id: string) => (snapshot.rules ?? {})[id];
	const active = (snapshot.strategies?.offered ?? [])
		.filter((s) => s.active)
		.flatMap((s) => {
			const d = input.strategies.get(s.id);
			return d ? [d] : [];
		});
	const m = strategyMultipliers(active);
	const multiplier = (k: string) => m[k as keyof typeof m] ?? 1;
	const lines: FinanceLine[] = [];
	for (const c of input.charges) {
		if (c.currency !== 'funds' || c.everyDays !== PERIOD) continue;
		const amount = chargeOn(c, PERIOD, rule, multiplier);
		if (amount !== null && amount !== 0) lines.push({ label: c.label, amount });
	}
	const sites = (snapshot.sites ?? []) as Parameters<typeof buildingUpkeepCharges>[0];
	const upkeep = buildingUpkeepCharges(sites, input.buildings).reduce(
		(sum, c) => sum + (chargeOn(c, PERIOD, rule) ?? 0),
		0
	);
	if (upkeep !== 0) lines.push({ label: 'Building upkeep', amount: upkeep });
	for (const s of active) {
		const amount = chargeOn(strategyUpkeepCharge(s), PERIOD, rule) ?? 0;
		if (amount !== 0) lines.push({ label: `${s.label} (strategy)`, amount });
	}
	const loan = economy.loan ?? { owed: 0, limit: LOAN.limit, interest: LOAN.interest, everyDays: PERIOD };
	if (loan.owed > 0) lines.push({ label: 'Loan interest', amount: -loan.owed * loan.interest });
	const agency = String(rule('stock.agency-type') ?? '');
	return {
		lines,
		net: lines.reduce((sum, l) => sum + l.amount, 0),
		loan: {
			owed: loan.owed,
			limit: loan.limit,
			interest: loan.owed * loan.interest,
			borrow: Math.max(0, Math.min(LOAN.step, loan.limit - loan.owed)),
			repay: Math.min(LOAN.step, loan.owed)
		},
		notes: [
			...(AGENCY_NOTES[agency] ? [AGENCY_NOTES[agency]!] : []),
			'Crew are paid only while they fly; hiring costs a recruit fee.',
			'Hiring and building are paid from funds: with too little, they are refused. A loan bridges a gap, at interest.',
			'Recovering a vessel pays back its hardware, more the nearer the Space Center it comes down.'
		]
	};
}

/** "+24,000 funds", "−3,200 funds". */
export const financeAmount = (x: number): string =>
	`${x >= 0 ? '+' : '−'}${formatFunds(Math.abs(x))} funds`;

export const loanCommand = (action: 'take' | 'repay', amount: number): Command =>
	action === 'take' ? { type: 'loan-take', amount } : { type: 'loan-repay', amount };
