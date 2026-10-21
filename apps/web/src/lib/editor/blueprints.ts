/**
 * The Hangar's blueprint Library (plan 285, ADR 0263): the learn examples, the famous missions and
 * the blueprints mods register, as one list of cards with filters. Pure: the dialog draws it.
 */
import type { BlueprintDefinition, BlueprintGoal, VesselDesign } from '@orbital/core';
import { starterRocket } from '../design';
import type { ContentLookups } from '../delta-v';
import { asparagusRocket, boosterRocket, glider, moonShot } from './examples';
import { MISSION_BLUEPRINTS } from './missions';
import type { Content } from './state';
import { designStats } from './stats';

export type BlueprintOrigin = 'learn' | 'mission' | 'mod';

export interface BlueprintCard {
	id: string;
	title: string;
	inspiredBy?: string;
	origin: BlueprintOrigin;
	goal: BlueprintGoal | 'deep-space';
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

/** The five examples the empty Hangar used to offer as text buttons. */
const LEARN: readonly BlueprintCard[] = [
	{
		id: 'learn.two-stage',
		title: 'Two-stage starter',
		origin: 'learn',
		goal: 'orbit',
		crew: 1,
		summary: 'A pod with a parachute on two stages: the first rocket to fly, and to bring home.',
		build: () => starterRocket()
	},
	{
		id: 'learn.boosters',
		title: 'Booster rocket',
		origin: 'learn',
		goal: 'orbit',
		crew: 1,
		summary: 'A core with four solid boosters and four fins: staging boosters away.',
		build: (content) => boosterRocket(content)
	},
	{
		id: 'learn.asparagus',
		title: 'Asparagus rocket',
		origin: 'learn',
		goal: 'orbit',
		crew: 1,
		summary: 'Four boosters feed the core through fuel lines and drop in pairs.',
		build: (content) => asparagusRocket(content)
	},
	{
		id: 'learn.moon-shot',
		title: 'Moon shot',
		origin: 'learn',
		goal: 'moon',
		crew: 1,
		summary: 'A core with four boosters under a lander with legs: to the moon in one go.',
		build: () => moonShot()
	},
	{
		id: 'learn.glider',
		title: 'Glider',
		origin: 'learn',
		goal: 'surface',
		crew: 1,
		summary: 'A pod and a tank with wings and a tail: it glides, it has no engine.',
		build: (content) => glider(content)
	}
];

/** Every card: learn, the famous missions, then the mods' blueprints. */
export function allBlueprints(mods: readonly BlueprintDefinition[] = []): BlueprintCard[] {
	return [
		...LEARN,
		...MISSION_BLUEPRINTS.map((m): BlueprintCard => ({
			id: m.id,
			title: m.title,
			inspiredBy: m.inspiredBy,
			origin: 'mission',
			goal: m.goal,
			crew: m.crew,
			summary: m.summary,
			build: (content) => m.build(content)
		})),
		...mods.map((b): BlueprintCard => ({
			id: b.id,
			title: b.title,
			...(b.inspiredBy ? { inspiredBy: b.inspiredBy } : {}),
			origin: 'mod',
			goal: b.goal,
			crew: b.crew,
			summary: b.summary,
			build: () => b.design
		}))
	];
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
