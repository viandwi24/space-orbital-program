/**
 * The economy in the sim (plan 095, ADR 0113): the ledger state, the launch debit, recovery, the
 * charges and reputation decay on the world tick, and the snapshot view. The maths is core's.
 */
import {
	clampReputation,
	contentsValue,
	decayedReputation,
	designCost,
	ECONOMY_CAUSES,
	ECONOMY_RULES,
	greatCircle,
	recoveryQuote,
	REPUTATION_DECAY_EVERY,
	chargeOn,
	type Currency,
	type EntityId,
	type LedgerEntry,
	type ModuleDefinition,
	type RecoveryQuote,
	type RuleValue,
	type SaveEconomy,
	type VesselDesign
} from '@orbital/core';
import { moduleDefOf, moduleState, partDefOf, partOf, vesselOf, type SimCore } from './core.ts';
import { normalize } from '@orbital/kepler';
import { qAboutY, qRotate } from './math.ts';

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

const costMultiplier = (core: SimCore): number => {
	const v = ruleOf(core, ECONOMY_RULES.costMultiplier);
	return typeof v === 'number' ? v : 1;
};

/** What a launch of `design` costs now (ADR 0113 point 5). */
export const launchCost = (core: SimCore, design: VesselDesign): number =>
	designCost(design, core.registries).total * costMultiplier(core);

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

/** Value of a live vessel: every part's cost plus its current contents (ADR 0113 point 2). */
export function vesselValue(core: SimCore, vesselId: EntityId): number {
	let value = 0;
	for (const id of vesselOf(core, vesselId).parts) {
		const part = partOf(core, id);
		value += partDefOf(core, part).cost ?? 0;
		const stores: Array<{ module: ModuleDefinition; config: unknown; state: unknown }> = [];
		for (const m of part.modules) {
			const module = moduleDefOf(core, m.id);
			if (module.store)
				stores.push({ module, config: m.config, state: moduleState(core, id, m.id) });
		}
		value += contentsValue(stores, core.registries.resources);
	}
	return value * costMultiplier(core);
}

/** Recovery sites as body-fixed unit directions on the root body; until 084 the launch site. */
const RECOVERY_SITES = [{ x: 1, y: 0, z: 0 }];

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

/** The vessel's position as a body-fixed unit direction, or null when not on the root body. */
function bodyFixedDirection(
	core: SimCore,
	vesselId: EntityId
): { x: number; y: number; z: number } | null {
	const vessel = vesselOf(core, vesselId);
	if (vessel.soi !== core.root.def.id) return null;
	if (vessel.rails?.kind === 'surface') return normalize(vessel.rails.r);
	return normalize(qRotate(qAboutY(-core.root.omega * core.t), vessel.com));
}

export function quoteRecovery(core: SimCore, vesselId: EntityId): RecoveryQuote {
	const dir = bodyFixedDirection(core, vesselId);
	const radius = core.root.def.radius;
	const distance =
		dir === null ? null : Math.min(...RECOVERY_SITES.map((s) => greatCircle(dir, s, radius)));
	return recoveryQuote(vesselValue(core, vesselId), distance, radius);
}

/** Credit the recovery (economy on) and return the quote; the caller removes the vessel. */
export function creditRecovery(core: SimCore, vesselId: EntityId): RecoveryQuote {
	const quote = quoteRecovery(core, vesselId);
	if (economyOn(core) && quote.credit > 0) {
		record(core, 'funds', quote.credit, ECONOMY_CAUSES.recovery, `vessel ${vesselId}`);
	}
	return quote;
}

/** Charges and reputation decay for the tick of `day` (ADR 0113 points 3 and 7). */
export function economyTick(core: SimCore, day: number): void {
	if (!economyOn(core)) return;
	const rule = (id: string) => ruleOf(core, id);
	for (const charge of core.registries.charges.list()) {
		const amount = chargeOn(charge, day, rule);
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
