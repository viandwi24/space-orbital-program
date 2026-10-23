/**
 * The economy in the sim (plan 095, ADR 0113): the ledger state, the launch debit, recovery, the
 * charges and reputation decay on the world tick, and the snapshot view. The maths is core's.
 */
import { multiplierOf, upkeepCharges } from './strategies.ts';
import { gradeSurcharge } from './reliability.ts';
import {
	clampReputation,
	decayedReputation,
	designCost,
	ECONOMY_CAUSES,
	ECONOMY_RULES,
	REPUTATION_DECAY_EVERY,
	chargeOn,
	type Currency,
	type EntityId,
	type LedgerEntry,
	type RuleValue,
	type SaveEconomy,
	type StrategyKey,
	type VesselDesign
} from '@orbital/core';
import { moduleDefOf, moduleState, partDefOf, partOf, vesselOf, type SimCore } from './core.ts';

/** A registered rule's value, or undefined. */
export const ruleOf = (core: SimCore, id: string): RuleValue | undefined =>
	core.registries.rules.has(id) ? core.info.rules[id] : undefined;

export const economyOn = (core: SimCore): boolean => ruleOf(core, ECONOMY_RULES.enabled) === true;

/** A fresh ledger: funds from the starting-funds rule (ADR 0113 point 1). */
export function freshEconomy(core: Pick<SimCore, 'registries' | 'info'>): SaveEconomy {
	const start = core.registries.rules.has(ECONOMY_RULES.startingFunds)
		? core.info.rules[ECONOMY_RULES.startingFunds]
		: undefined;
	return {
		balances: { funds: typeof start === 'number' ? start : 0, science: 0, reputation: 0 },
		entries: []
	};
}

/** Write one entry, update the balance, emit `economy:entry`. */
export function record(
	core: SimCore,
	currency: Currency,
	amount: number,
	cause: string,
	ref?: string
): void {
	const entry: LedgerEntry =
		ref === undefined
			? { time: core.t, currency, amount, cause }
			: { time: core.t, currency, amount, cause, ref };
	core.economy.entries.push(entry);
	const b = core.economy.balances;
	b[currency] =
		currency === 'reputation' ? clampReputation(b[currency] + amount) : b[currency] + amount;
	core.events.emit('economy:entry', { ...entry });
}

export const costMultiplier = (core: SimCore): number => {
	const v = ruleOf(core, ECONOMY_RULES.costMultiplier);
	return typeof v === 'number' ? v : 1;
};

/** What a launch of `design` costs now (ADR 0113 point 5). */
export const launchCost = (core: SimCore, design: VesselDesign): number =>
	// the grades bought for its part models cost extra (plan 130, ADR 0156 point 5)
	(designCost(design, core.registries).total + gradeSurcharge(core, design)) *
	costMultiplier(core) *
	multiplierOf(core, 'launch-cost'); // strategies (plan 101, ADR 0187 point 1)

/** Refusal text when the economy cannot pay for `design`, else undefined. */
export function launchRefusal(core: SimCore, design: VesselDesign): string | undefined {
	if (!economyOn(core)) return undefined;
	const cost = launchCost(core, design);
	const funds = core.economy.balances.funds;
	if (cost > funds) {
		return `Not enough funds: needs ${Math.ceil(cost)}, has ${Math.floor(funds)}`;
	}
	return undefined;
}

export function chargeLaunch(core: SimCore, design: VesselDesign): void {
	if (!economyOn(core)) return;
	const cost = launchCost(core, design);
	if (cost > 0) record(core, 'funds', -cost, ECONOMY_CAUSES.launch, design.name);
}

/**
 * What a live vessel holds (ADR 0113 point 2): its parts' cost, after the cost multiplier, and its
 * contents in units per resource. An EVA suit (a `walk` part) and a planted flag (hidden, with a
 * `keep` module) were never bought, so they hold nothing: recovering them paid funds from nothing
 * (system audit).
 */
export function vesselHoldings(
	core: SimCore,
	vesselId: EntityId
): { hardware: number; contents: Map<string, number> } {
	let hardware = 0;
	const contents = new Map<string, number>();
	for (const id of vesselOf(core, vesselId).parts) {
		const part = partOf(core, id);
		const def = partDefOf(core, part);
		const planted =
			def.catalog?.hidden === true && part.modules.some((m) => moduleDefOf(core, m.id).keep);
		if (def.walk !== undefined || planted) continue;
		hardware += def.cost ?? 0;
		for (const m of part.modules) {
			const module = moduleDefOf(core, m.id);
			if (!module.store) continue;
			const state = moduleState(core, id, m.id);
			for (const r of module.store.resources(m.config, state)) {
				const amount = module.store.amount(m.config, state, r);
				if (amount > 0) contents.set(r, (contents.get(r) ?? 0) + amount);
			}
		}
	}
	return { hardware: hardware * costMultiplier(core), contents };
}

/** The static price of `amount` units of `resource`, after the cost multiplier. */
export const contentsPrice = (core: SimCore, resource: string, amount: number): number =>
	amount * (core.registries.resources.get(resource)?.price ?? 0) * costMultiplier(core);

/** Value of a live vessel: its parts' cost plus its contents at their static prices. */
export function vesselValue(core: SimCore, vesselId: EntityId): number {
	const { hardware, contents } = vesselHoldings(core, vesselId);
	let value = hardware;
	for (const [r, amount] of contents) value += contentsPrice(core, r, amount);
	return value;
}

/** Recovery sites as body-fixed unit directions on the root body; until 084 the launch site. */
export const RECOVERY_SITES = [{ x: 1, y: 0, z: 0 }];

/** Why the vessel cannot be recovered, or undefined. */
export function recoveryBlocker(core: SimCore, vesselId: EntityId): string | undefined {
	const vessel = vesselOf(core, vesselId);
	if (vessel.rails?.kind === 'surface') return undefined;
	// `rest` counts the seconds landed, force-free and at rest relative to the ground (ADR 0024).
	if (vessel.mode === 'flight' && vessel.landed) {
		return vessel.rest > 0 ? undefined : 'the vessel is still moving';
	}
	return 'only a landed or splashed vessel at rest can be recovered';
}

/**
 * A recovery strategy's factor (plan 101; system audit D1): above 1 it shrinks only the loss for
 * distance, `1 − (1 − f) / m`, so a recovery never pays more than the vessel is worth (Reuse first
 * at ×1.25 paid 125 % on the pad, more than the launch cost); below 1 it scales the factor.
 */
export const strategyFactor = (factor: number, multiplier: number): number =>
	multiplier >= 1 ? 1 - (1 - factor) / multiplier : factor * Math.max(0, multiplier);

/** Charges and reputation decay for the tick of `day` (ADR 0113 points 3 and 7). */
export function economyTick(core: SimCore, day: number): void {
	if (!economyOn(core)) return;
	const rule = (id: string) => ruleOf(core, id);
	const multiplier = (key: string) => multiplierOf(core, key as StrategyKey);
	// the registered charges, then the active strategies' upkeep (plan 101, ADR 0187 point 4)
	for (const charge of [...core.registries.charges.list(), ...upkeepCharges(core)]) {
		const amount = chargeOn(charge, day, rule, multiplier);
		if (amount !== null && amount !== 0) record(core, charge.currency, amount, charge.id);
	}
	if (day > 0 && day % REPUTATION_DECAY_EVERY === 0) {
		const r = core.economy.balances.reputation;
		const change = decayedReputation(r) - r;
		if (change !== 0) record(core, 'reputation', change, ECONOMY_CAUSES.reputationDecay);
	}
}

export function economySnapshot(core: SimCore): {
	enabled: boolean;
	funds: number;
	science: number;
	reputation: number;
} {
	return { enabled: economyOn(core), ...core.economy.balances };
}
