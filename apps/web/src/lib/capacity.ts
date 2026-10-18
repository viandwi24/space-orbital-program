/**
 * Capacity limits on the page (plan 096, ADR 0123 point 4): whether a world's limits apply, the
 * Hangar's part limit with the upgrade that lifts it, and the upgrade for a launch mass.
 */
import {
	capacityUpgrade,
	ECONOMY_RULES,
	resolveRules,
	siteCapacity,
	type BuildingDefinition,
	type PlacedBuilding,
	type PresetDefinition,
	type RuleDefinition,
	type WorldInfo
} from '@orbital/core';

interface Lookup<T> {
	get(id: string): T | undefined;
	list(): T[];
}

export interface BuildingRegistry {
	get(id: string): BuildingDefinition | undefined;
	list(): readonly BuildingDefinition[];
}

/** Limits apply in a world whose economy rule is on (Career); not in Sandbox or the Legacy world. */
export function limitsOn(
	info: Pick<WorldInfo, 'rules' | 'preset'> | undefined,
	registries: { rules: Lookup<RuleDefinition>; presets: Lookup<PresetDefinition> }
): boolean {
	if (!info) return false;
	const { values } = resolveRules(info.rules, info.preset, registries.rules, registries.presets);
	return values[ECONOMY_RULES.enabled] === true;
}

export interface PartsLimit {
	limit: number;
	/** "Hangar level 2: 120 parts", or null when no level lifts the need. */
	upgrade: string | null;
}

/** The Hangar's part limit for a design of `parts` parts, or null when nothing limits it. */
export function partsLimit(
	site: { buildings?: readonly PlacedBuilding[] } | undefined,
	buildings: BuildingRegistry,
	on: boolean,
	parts: number
): PartsLimit | null {
	if (!on || !site) return null;
	const limit = siteCapacity(site, buildings, 'hangar');
	if (limit === null) return null;
	return { limit, upgrade: capacityUpgrade(buildings, 'hangar', parts)?.text ?? null };
}

/** The upgrade that takes a launch of `wetMassKg`, or null. */
export const massUpgrade = (buildings: BuildingRegistry, wetMassKg: number): string | null =>
	capacityUpgrade(buildings, 'launch-pad', wetMassKg / 1000)?.text ?? null;
