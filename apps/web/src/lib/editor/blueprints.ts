/**
 * The Hangar's blueprint Library (plan 285, ADR 0263): the learn examples, the famous missions and
 * the blueprints mods register, as one list of cards with filters. Pure: the dialog draws it.
 */
import type { BlueprintDefinition, BlueprintGoal, VesselDesign } from '@orbital/core';
import type { ContentLookups } from '../delta-v';
import type { Content } from './state';
import { designStats } from './stats';

export type BlueprintOrigin = 'learn' | 'mission' | 'mod';

export interface BlueprintCard {
	id: string;
	title: string;
	inspiredBy?: string;
	origin: BlueprintOrigin;
	goal: BlueprintGoal;
	crew: number;
	summary: string;
	build(content: Content): VesselDesign;
}

export const ORIGIN_LABELS: Record<BlueprintOrigin, string> = {
	learn: 'Learn',
	mission: 'Famous missions',
	mod: 'Mod'
};

export const GOAL_LABELS: Record<BlueprintCard['goal'], string> = {
	orbit: 'Orbit',
	moon: 'Moon',
	planet: 'Planet',
	'deep-space': 'Deep space',
	station: 'Station',
	surface: 'Surface'
};

/**
 * Every card, from the registered blueprints (ADR 0316: stock registers the learn examples and the
 * famous missions; a mod's go under "Mod" unless they name a `collection`).
 */
export function allBlueprints(defs: readonly BlueprintDefinition[] = []): BlueprintCard[] {
	const origin = (d: BlueprintDefinition): BlueprintOrigin =>
		d.collection === 'learn' ? 'learn' : d.collection === 'missions' ? 'mission' : 'mod';
	const rank: Record<BlueprintOrigin, number> = { learn: 0, mission: 1, mod: 2 };
	return defs
		.map((b): BlueprintCard => ({
			id: b.id,
			title: b.title,
			...(b.inspiredBy ? { inspiredBy: b.inspiredBy } : {}),
			origin: origin(b),
			goal: b.goal,
			crew: b.crew,
			summary: b.summary,
			build: () => b.design
		}))
		.sort((a, c) => rank[a.origin] - rank[c.origin]);
}

/**
 * The registered id for `id`, or undefined. Ids from before ADR 0316 still resolve: a famous
 * mission's bare id (`kronos-selene`) and a learn card's `learn.<name>` are stock's now.
 */
export function resolveBlueprintId(
	id: string,
	cards: readonly { id: string }[]
): string | undefined {
	const has = (x: string): boolean => cards.some((c) => c.id === x);
	if (has(id)) return id;
	const bare = id.startsWith('learn.') ? id.slice('learn.'.length) : id;
	return has(`stock.${bare}`) ? `stock.${bare}` : undefined;
}

export interface BlueprintFilter {
	origin: BlueprintOrigin | 'all';
	goal: BlueprintCard['goal'] | 'all';
	/** Crewed, probes, or both. */
	crew: 'all' | 'crewed' | 'probe';
	query: string;
}

export const NO_FILTER: BlueprintFilter = { origin: 'all', goal: 'all', crew: 'all', query: '' };

export function filterBlueprints(
	cards: readonly BlueprintCard[],
	f: BlueprintFilter
): BlueprintCard[] {
	const q = f.query.trim().toLowerCase();
	return cards.filter(
		(c) =>
			(f.origin === 'all' || c.origin === f.origin) &&
			(f.goal === 'all' || c.goal === f.goal) &&
			(f.crew === 'all' || (f.crew === 'crewed' ? c.crew > 0 : c.crew === 0)) &&
			(q === '' ||
				[c.title, c.inspiredBy ?? '', c.summary, GOAL_LABELS[c.goal]].some((t) =>
					t.toLowerCase().includes(q)
				))
	);
}

export interface BlueprintStats {
	parts: number;
	/** Wet mass, t. */
	mass: number;
	/** Vacuum Δv, m/s. */
	deltaV: number;
	/** Liftoff TWR at sea level; null without an engine stage. */
	twr: number | null;
}

/** Card read-outs, from the Hangar's own stats (`designStats`). */
export function blueprintStats(
	design: VesselDesign,
	content: ContentLookups,
	gravity: number
): BlueprintStats {
	const vacuum = designStats(design, content, 'vacuum', gravity);
	const sea = designStats(design, content, 'sea-level', gravity);
	return {
		parts: design.parts.length,
		mass: vacuum.wetMass / 1000,
		deltaV: vacuum.totalDv,
		twr: sea.liftoffTwr
	};
}
