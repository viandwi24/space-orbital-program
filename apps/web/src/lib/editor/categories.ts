/**
 * Catalogue categories, derived from a part's module ids so the part definition stays unchanged
 * (ADR 0029). Unknown mods land in "Other".
 */
import type { PartDefinition } from '@orbital/core';
import {
	ModuleCommand,
	ModuleDecoupler,
	ModuleEngine,
	ModuleHeatShield,
	ModuleLandingLeg,
	ModuleReactionWheel,
	ModuleResourceContainer
} from '@orbital/mod-stock';

export type CategoryId =
	'command' | 'propulsion' | 'tanks' | 'structural' | 'control' | 'landing' | 'thermal' | 'other';

export interface Category {
	id: CategoryId;
	label: string;
	/** Icon name from `ui/icons.ts`. */
	icon: string;
}

/** In display order. */
export const CATEGORIES: readonly Category[] = [
	{ id: 'command', label: 'Command', icon: 'command' },
	{ id: 'tanks', label: 'Fuel tanks', icon: 'tank' },
	{ id: 'propulsion', label: 'Engines', icon: 'engine' },
	{ id: 'structural', label: 'Structural', icon: 'decoupler' },
	{ id: 'control', label: 'Control', icon: 'wheel' },
	{ id: 'landing', label: 'Landing', icon: 'legs' },
	{ id: 'thermal', label: 'Thermal', icon: 'shield' },
	{ id: 'other', label: 'Other', icon: 'part' }
];

const BY_MODULE: ReadonlyArray<readonly [string, CategoryId]> = [
	[ModuleCommand.id, 'command'],
	[ModuleEngine.id, 'propulsion'],
	[ModuleDecoupler.id, 'structural'],
	[ModuleReactionWheel.id, 'control'],
	[ModuleLandingLeg.id, 'landing'],
	[ModuleHeatShield.id, 'thermal'],
	[ModuleResourceContainer.id, 'tanks']
];

/** First match wins, in the order above (a pod with a battery is still a command part). */
export function categoryOf(def: Pick<PartDefinition, 'modules'>): CategoryId {
	const ids = new Set((def.modules ?? []).map((m) => m[0]));
	for (const [module, category] of BY_MODULE) if (ids.has(module)) return category;
	return 'other';
}

/** Case-insensitive match on title and id; an empty query matches everything. */
export function matchesQuery(def: Pick<PartDefinition, 'id' | 'title'>, query: string): boolean {
	const q = query.trim().toLowerCase();
	if (q === '') return true;
	return q.split(/\s+/).every((w) => def.title.toLowerCase().includes(w) || def.id.includes(w));
}
