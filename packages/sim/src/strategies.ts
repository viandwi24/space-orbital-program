/**
 * Strategies in the sim (plan 101, ADR 0187): activation and end with agency type, slots and
 * cooldown; the multipliers the economy reads; upkeep as charges on the world tick; the snapshot.
 */
import {
	AGENCY_TYPE_RULE,
	STRATEGY_COOLDOWN_DAYS,
	STRATEGY_KEYS,
	capacityUpgrade,
	offeredTo,
	siteCapacity,
	sitesOf,
	strategyMultipliers,
	strategyUpkeepCharge,
	type ChargeDefinition,
	type CommandResult,
	type SaveStrategies,
	type StrategiesSnapshot,
	type StrategyDefinition,
	type StrategyKey
} from '@orbital/core';
import type { SimCore } from './core.ts';
import { economyOn, ruleOf } from './economy.ts';
import { dayLength } from './tick.ts';

export const freshStrategies = (): SaveStrategies => ({ active: [], cooldowns: [] });

/** Whether there is anything to save. */
export const strategiesTouched = (core: Pick<SimCore, 'strategies'>): boolean =>
	core.strategies.active.length > 0 || core.strategies.cooldowns.length > 0;

/** The definitions of the active strategies whose plugin is loaded. */
function activeDefinitions(core: SimCore): StrategyDefinition[] {
	return core.strategies.active.flatMap((a) => {
		const def = core.registries.strategies.get(a.id);
		return def ? [def] : [];
	});
}

/** A key's multiplier now: 1 with the economy off (ADR 0187 point 3). */
export function multiplierOf(core: SimCore, key: StrategyKey): number {
	if (!economyOn(core) || core.strategies.active.length === 0) return 1;
	return strategyMultipliers(activeDefinitions(core))[key];
}

/** The upkeep charges of the active strategies (ADR 0187 point 4). */
export const upkeepCharges = (core: SimCore): ChargeDefinition[] =>
	activeDefinitions(core).map(strategyUpkeepCharge);

/** Strategy slots of the primary site's `admin` capacity; null = no limit (ADR 0187 point 5). */
export function strategySlots(core: SimCore): number | null {
	const site = sitesOf(core.info)[0];
	return site ? siteCapacity(site, core.registries.buildings, 'admin') : null;
}

const refuse = (reason: string): CommandResult => ({ ok: false, reason });

/** `strategy-activate` (ADR 0187 point 6). */
export function activateStrategy(core: SimCore, id: string): CommandResult {
	if (!economyOn(core)) return refuse('Strategies need the economy');
	const def = core.registries.strategies.get(id);
	if (!def) return refuse(`no strategy "${id}"`);
	const agency = ruleOf(core, AGENCY_TYPE_RULE);
	if (!offeredTo(def, agency))
		return refuse(`"${def.label}" is not offered to a ${String(agency)} agency`);
	const s = core.strategies;
	if (s.active.some((a) => a.id === id)) return refuse(`"${def.label}" is already active`);
	s.cooldowns = s.cooldowns.filter((c) => c.until > core.t);
	const cooling = s.cooldowns.find((c) => c.id === id);
	if (cooling) {
		const days = Math.ceil((cooling.until - core.t) / dayLength(core));
		return refuse(`"${def.label}" can be activated again in ${days} day${days === 1 ? '' : 's'}`);
	}
	const slots = strategySlots(core);
	if (slots !== null && s.active.length >= slots) {
		const lift = capacityUpgrade(core.registries.buildings, 'admin', s.active.length + 1);
		return refuse(`All ${slots} strategy slots are in use${lift ? `; ${lift.text}` : ''}`);
	}
	s.active.push({ id, since: core.t });
	return { ok: true };
}

/** `strategy-end`: it stops, and its cooldown starts. */
export function endStrategy(core: SimCore, id: string): CommandResult {
	const s = core.strategies;
	if (!s.active.some((a) => a.id === id)) return refuse(`no active strategy "${id}"`);
	s.active = s.active.filter((a) => a.id !== id);
	const days = core.registries.strategies.get(id)?.cooldownDays ?? STRATEGY_COOLDOWN_DAYS;
	s.cooldowns = s.cooldowns.filter((c) => c.id !== id);
	if (days > 0) s.cooldowns.push({ id, until: core.t + days * dayLength(core) });
	return { ok: true };
}

/** `Snapshot.strategies`, with the economy on. */
export function strategiesSnapshot(core: SimCore): StrategiesSnapshot | undefined {
	if (!economyOn(core)) return undefined;
	const s = core.strategies;
	const agency = ruleOf(core, AGENCY_TYPE_RULE);
	return {
		slots: strategySlots(core),
		used: s.active.length,
		multipliers: strategyMultipliers(activeDefinitions(core)),
		offered: core.registries.strategies
			.list()
			.filter((d) => offeredTo(d, agency))
			.map((d) => {
				const cooling = s.cooldowns.find((c) => c.id === d.id && c.until > core.t);
				return {
					id: d.id,
					label: d.label,
					description: d.description,
					effects: d.effects.map((e) => ({
						key: e.key,
						label: STRATEGY_KEYS[e.key].label,
						factor: e.factor,
						min: STRATEGY_KEYS[e.key].min,
						max: STRATEGY_KEYS[e.key].max
					})),
					upkeep: d.upkeep,
					active: s.active.some((a) => a.id === d.id),
					coolingUntil: cooling ? cooling.until : null
				};
			})
	};
}
