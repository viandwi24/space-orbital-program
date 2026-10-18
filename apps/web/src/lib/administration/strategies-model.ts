/**
 * The Administration screen's Strategies tab (plan 101, ADR 0187; refs W5): each strategy on offer
 * with its ratios, caps, upkeep and an N-day funds projection with and without it, from
 * `Snapshot.strategies` and the charges. Pure: the page renders it and sends the commands.
 */
import {
	buildingUpkeepCharges,
	projectBalances,
	strategyMultipliers,
	strategyUpkeepCharge,
	type Balances,
	type BuildingDefinition,
	type ChargeDefinition,
	type Command,
	type Snapshot,
	type StrategyDefinition
} from '@orbital/core';
import { formatFunds } from '../format';

/** Days the projection covers. */
export const PROJECTION_DAYS = 90;

const money = (x: number): string => `${formatFunds(x)} funds`;
const signed = (x: number): string => `${x >= 0 ? '+' : '−'}${money(Math.abs(x))}`;

export interface ProjectionInput {
	snapshot: Pick<Snapshot, 'economy' | 'rules' | 'day' | 'strategies' | 'sites'>;
	charges: readonly ChargeDefinition[];
	buildings: { get(id: string): BuildingDefinition | undefined };
	strategies: { get(id: string): StrategyDefinition | undefined };
}

/**
 * Funds at the end of each of the next `days` days with the active strategies, plus `adding` when
 * given (ADR 0187 point 4): the charges, the buildings' upkeep and every strategy's upkeep, with
 * the multipliers of that set. What the sim then books, to the funds unit.
 */
export function projectFunds(
	input: ProjectionInput,
	adding: string | null,
	days = PROJECTION_DAYS
): number[] {
	const { snapshot } = input;
	if (!snapshot.economy || !snapshot.strategies) return [];
	const ids = snapshot.strategies.offered.filter((s) => s.active).map((s) => s.id);
	if (adding && !ids.includes(adding)) ids.push(adding);
	const set = ids.flatMap((id) => {
		const d = input.strategies.get(id);
		return d ? [d] : [];
	});
	const m = strategyMultipliers(set);
	const balances: Balances = {
		funds: snapshot.economy.funds,
		science: snapshot.economy.science,
		reputation: snapshot.economy.reputation
	};
	// the sites' buildings as the snapshot has them (plan 090): their upkeep is a charge too
	const sites = (snapshot.sites ?? []) as Parameters<typeof buildingUpkeepCharges>[0];
	return projectBalances(
		balances,
		input.charges,
		(id) => (snapshot.rules ?? {})[id],
		snapshot.day ?? 0,
		days,
		{
			multiplier: (k) => m[k as keyof typeof m] ?? 1,
			extra: [...buildingUpkeepCharges(sites, input.buildings), ...set.map(strategyUpkeepCharge)]
		}
	).map((b) => b.funds);
}

export interface StrategyCard {
	id: string;
	label: string;
	description: string;
	/** "Recovery value ×1.25 (cap 0.75–1.5)". */
	effects: string[];
	/** "1,500 funds every 30 days". */
	upkeep: string;
	active: boolean;
	/** Why it cannot be activated now, or null. */
	blocked: string | null;
	/** "In 90 days: 182,000 funds with it, 186,500 without (−4,500 funds)". */
	projection: string;
	action: 'activate' | 'end' | null;
}

const ratio = (x: number): string => `×${Number(x.toFixed(2))}`;

/** The cards of the Strategies tab; `day` is the world-tick day length, s. */
export function strategyCards(input: ProjectionInput, now: number, day: number): StrategyCard[] {
	const st = input.snapshot.strategies;
	if (!st) return [];
	const full = st.slots !== null && st.used >= st.slots;
	const without = projectFunds(input, null).at(-1) ?? 0;
	return st.offered.map((s) => {
		const cooling = s.coolingUntil !== null && s.coolingUntil > now;
		const blocked = s.active
			? null
			: cooling
				? `Can be activated again in ${Math.ceil((s.coolingUntil! - now) / day)} days`
				: full
					? `All ${st.slots} strategy slots are in use`
					: null;
		const withIt = s.active ? without : (projectFunds(input, s.id).at(-1) ?? 0);
		const base = s.active
			? (projectFunds(
					{
						...input,
						snapshot: {
							...input.snapshot,
							strategies: {
								...st,
								offered: st.offered.map((o) => (o.id === s.id ? { ...o, active: false } : o))
							}
						}
					},
					null
				).at(-1) ?? 0)
			: without;
		return {
			id: s.id,
			label: s.label,
			description: s.description,
			effects: s.effects.map((e) => `${e.label} ${ratio(e.factor)} (cap ${e.min}–${e.max})`),
			upkeep: `${money(s.upkeep)} every 30 days`,
			active: s.active,
			blocked,
			projection: `In ${PROJECTION_DAYS} days: ${money(withIt)} with it, ${money(base)} without (${signed(withIt - base)})`,
			action: s.active ? 'end' : blocked ? null : 'activate'
		};
	});
}

/** The agency strip's strategies line: "1 of 1 active". */
export const strategySlotsText = (st: Snapshot['strategies']): string =>
	!st ? '[—]' : st.slots === null ? `${st.used} active` : `${st.used} of ${st.slots} active`;

export function strategyCommand(action: 'activate' | 'end', id: string): Command {
	return action === 'activate'
		? { type: 'strategy-activate', strategy: id }
		: { type: 'strategy-end', strategy: id };
}
