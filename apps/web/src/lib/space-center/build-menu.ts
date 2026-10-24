/**
 * The Space Center's build menu (plan 235, ADR 0227): the buildings-scope categories in order,
 * each with its cards, and why a card cannot be built here. Pure, so vitest covers it; the sim's
 * `place-building` stays the judge.
 */
import {
	BRANCH_HQ,
	buildingCategoryOf,
	scopeOf,
	sortCategories,
	type BuildingDefinition,
	type CategoryDefinition,
	type CategoryIcon
} from '@orbital/core';

export interface BuildLevelRow {
	level: number;
	cost: number;
	days: number;
	upkeep: number;
	/** `hangar 30 · launch-pad 18`: what the level provides. */
	capacity: string;
}

export interface BuildCard {
	id: string;
	label: string;
	category: string;
	/** The generator the thumbnail draws, or null for an asset visual (the card keeps its icon). */
	generator: string | null;
	size: { w: number; d: number };
	cost: number;
	days: number;
	levels: BuildLevelRow[];
	description: string;
	/** Why it cannot be built here, in words, or null. */
	reason: string | null;
}

export interface BuildCategory {
	id: string;
	label: string;
	icon: CategoryIcon;
	cards: BuildCard[];
}

export interface BuildContext {
	/** The site is the home Space Center (not an off-world base). */
	home: boolean;
	/** The site's body id. */
	body: string;
	/** Funds with the economy on; undefined with it off. */
	funds?: number;
	/** A body's name for the reasons. */
	bodyName?: (id: string) => string;
	/** The site is a branch whose HQ is not built yet (plan 236, ADR 0229 point 3). */
	hqPending?: boolean;
	/** The site is a branch (plan 236): `hq` buildings are the home Space Center's only (ADR 0327). */
	branch?: boolean;
}

const number = (n: number): string => Math.round(n).toLocaleString('en-US');

/** The card's facts in one line: `40,000 funds · 80 × 50 m · 10 days · levels 1–3`. */
export function cardFacts(c: Pick<BuildCard, 'cost' | 'size' | 'days' | 'levels'>): string {
	const levels = c.levels.length > 1 ? `levels 1–${c.levels.length}` : 'one level';
	return `${number(c.cost)} funds · ${c.size.w * 10} × ${c.size.d * 10} m · ${c.days} day${c.days === 1 ? '' : 's'} · ${levels}`;
}

/** The first thing that stops this building here (ADR 0227 point 4), or null. */
export function buildReason(def: BuildingDefinition, ctx: BuildContext): string | null {
	if (def.provides.includes(BRANCH_HQ)) return 'Comes with a new branch';
	if (def.placement === 'home' && !ctx.home) return 'Only at the home Space Center';
	if (def.placement === 'hq' && (!ctx.home || ctx.branch)) return 'Only at the home Space Center';
	if (def.placement === 'off-world' && ctx.home) return 'Only at an off-world base';
	if (def.bodies && !def.bodies.includes(ctx.body))
		return `Cannot be built on ${ctx.bodyName?.(ctx.body) ?? ctx.body}`;
	if (ctx.hqPending) return 'The branch HQ is still under construction';
	const cost = def.levels[0]?.cost ?? 0;
	if (ctx.funds !== undefined && cost > ctx.funds)
		return `Needs ${number(cost)} funds, ${number(Math.max(0, ctx.funds))} available`;
	return null;
}

export function buildCard(def: BuildingDefinition, category: string, ctx: BuildContext): BuildCard {
	const first = def.levels[0];
	return {
		id: def.id,
		label: def.label,
		category,
		generator: def.visual.kind === 'generator' ? def.visual.generator : null,
		size: def.size,
		cost: first?.cost ?? 0,
		days: first?.buildDays ?? 0,
		levels: def.levels.map((l, i) => ({
			level: i + 1,
			cost: l.cost,
			days: l.buildDays,
			upkeep: l.upkeep,
			capacity: Object.entries(l.capacity)
				.map(([k, v]) => `${k} ${number(v)}`)
				.join(' · ')
		})),
		description: def.description ?? '',
		reason: buildReason(def, ctx)
	};
}

/**
 * The menu: the buildings-scope categories in order, each with its buildings (registration
 * order); a category with no building is left out. Buildings that can be built come first.
 */
export function buildMenu(
	defs: readonly BuildingDefinition[],
	categories: readonly CategoryDefinition[],
	ctx: BuildContext
): BuildCategory[] {
	const scoped = sortCategories(categories.filter((c) => scopeOf(c) === 'buildings'));
	const cards = defs.map((d) => buildCard(d, buildingCategoryOf(d.category, scoped), ctx));
	const out: BuildCategory[] = [];
	for (const c of scoped) {
		const mine = cards.filter((k) => k.category === c.id);
		if (mine.length === 0) continue;
		const ready = mine.filter((k) => k.reason === null);
		out.push({
			id: c.id,
			label: c.label,
			icon: c.icon,
			cards: [...ready, ...mine.filter((k) => k.reason !== null)]
		});
	}
	// no buildings-scope category registered at all (an old mod set): one Other row
	if (scoped.length === 0 && cards.length > 0)
		out.push({ id: 'stock.other-buildings', label: 'Other', icon: 'part', cards });
	return out;
}

/** The next card or category for an arrow key along a row of `count`, or `current`. */
export function stepIndex(count: number, current: number, key: string): number {
	if (count === 0) return -1;
	if (key === 'ArrowRight') return (current + 1) % count;
	if (key === 'ArrowLeft') return (current - 1 + count) % count;
	if (key === 'Home') return 0;
	if (key === 'End') return count - 1;
	return current;
}
