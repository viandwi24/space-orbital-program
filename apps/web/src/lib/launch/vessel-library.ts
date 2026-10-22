/**
 * The Launch page's vessel library (plan 346, ADR 0295 point 6): the Hangar's design and the
 * library records as one list a player can manage. Copies of one design are merged (the newest
 * shown, the rest counted), different designs under one name are numbered variants, and the list
 * is searched, filtered and sorted. Pure: the records go in, the groups come out.
 */
import type { VesselDesign } from '@orbital/core';
import { serialiseDesign } from '../design';

export interface VesselItem {
	/** 'hangar' for the Hangar's design, otherwise the library record id. */
	key: string;
	name: string;
	from: 'hangar' | 'library';
	design: VesselDesign;
	/** Wet mass, kg. */
	wet: number;
	cost: number;
	seats: number;
	parts: number;
	/** Last edit, ms; the Hangar's design counts as now. */
	updatedAt: number;
	thumbnail: string | null;
}

export interface ShownVessel extends VesselItem {
	/** Ids of the other records that hold the same design (deleted with it when asked). */
	copies: readonly string[];
	/** 1 for the oldest design of this name, 2 for the next ...; null when the name has one design. */
	variant: number | null;
	/** The same design is in the Hangar now. */
	inHangar: boolean;
}

export type VesselFilter = 'all' | 'rocket' | 'aircraft' | 'crewed';
export type VesselSort = 'recent' | 'name' | 'mass' | 'cost';

export const FILTER_LABELS: Record<VesselFilter, string> = {
	all: 'All',
	rocket: 'Rockets',
	aircraft: 'Aircraft',
	crewed: 'Crewed'
};
export const SORT_LABELS: Record<VesselSort, string> = {
	recent: 'Recently edited',
	name: 'Name',
	mass: 'Mass',
	cost: 'Cost'
};

/** A design apart from its name (the name is compared on its own, case-insensitively). */
export const designKey = (design: VesselDesign): string => serialiseDesign({ ...design, name: '' });

const nameKey = (name: string): string => name.trim().toLowerCase();

/**
 * Merges copies and numbers variants. The Hangar's design comes first; a library record with the
 * same design is folded into it (`inHangar` on it, the record in `copies`).
 */
export function mergeLibrary(items: readonly VesselItem[]): ShownVessel[] {
	const byDesign = new Map<string, ShownVessel>();
	const order = [...items].sort(
		(a, b) =>
			(a.from === 'hangar' ? -1 : 0) - (b.from === 'hangar' ? -1 : 0) || b.updatedAt - a.updatedAt
	);
	for (const it of order) {
		// a copy has the same name and design; a renamed one is the player's own entry
		const k = `${nameKey(it.name)}\n${designKey(it.design)}`;
		const kept = byDesign.get(k);
		if (kept) {
			// a copy: the kept one is the Hangar's or the newer record
			byDesign.set(k, {
				...kept,
				copies: it.from === 'library' ? [...kept.copies, it.key] : kept.copies
			});
			continue;
		}
		byDesign.set(k, { ...it, copies: [], variant: null, inHangar: it.from === 'hangar' });
	}
	const shown = [...byDesign.values()];
	// variants: designs that differ under one name, numbered oldest first
	const byName = new Map<string, ShownVessel[]>();
	for (const v of shown) byName.set(nameKey(v.name), [...(byName.get(nameKey(v.name)) ?? []), v]);
	const numbered = new Map<ShownVessel, number>();
	for (const group of byName.values()) {
		if (group.length < 2) continue;
		[...group].sort((a, b) => a.updatedAt - b.updatedAt).forEach((v, i) => numbered.set(v, i + 1));
	}
	return shown.map((v) => ({ ...v, variant: numbered.get(v) ?? null }));
}

export function matches(v: VesselItem, query: string, filter: VesselFilter): boolean {
	const q = query.trim().toLowerCase();
	if (q && !v.name.toLowerCase().includes(q)) return false;
	if (filter === 'aircraft') return v.design.aircraft === true;
	if (filter === 'rocket') return v.design.aircraft !== true;
	if (filter === 'crewed') return v.seats > 0;
	return true;
}

/**
 * The list as shown: the Hangar's design on its own, then the library filtered and sorted. The
 * variants of a name stay together, newest first, where the group's best member sorts.
 */
export function shownLibrary(
	items: readonly VesselItem[],
	opts: { query: string; filter: VesselFilter; sort: VesselSort }
): { hangar: ShownVessel | null; library: ShownVessel[] } {
	const merged = mergeLibrary(items);
	const hangar = merged.find((v) => v.from === 'hangar') ?? null;
	const rest = merged.filter((v) => v.from === 'library' && matches(v, opts.query, opts.filter));
	const groups = new Map<string, ShownVessel[]>();
	for (const v of rest) groups.set(nameKey(v.name), [...(groups.get(nameKey(v.name)) ?? []), v]);
	const value = (v: ShownVessel): number | string =>
		opts.sort === 'name'
			? nameKey(v.name)
			: opts.sort === 'mass'
				? v.wet
				: opts.sort === 'cost'
					? v.cost
					: -v.updatedAt;
	const head = (g: ShownVessel[]): ShownVessel =>
		[...g].sort((a, b) => compare(value(a), value(b)))[0]!;
	const sorted = [...groups.values()]
		.map((g) => [...g].sort((a, b) => b.updatedAt - a.updatedAt))
		.sort(
			(a, b) =>
				compare(value(head(a)), value(head(b))) || compare(nameKey(a[0]!.name), nameKey(b[0]!.name))
		);
	return {
		hangar: hangar && matches(hangar, opts.query, opts.filter) ? hangar : null,
		library: sorted.flat()
	};
}

const compare = (a: number | string, b: number | string): number =>
	typeof a === 'string' && typeof b === 'string'
		? a.localeCompare(b)
		: (a as number) - (b as number);

/** "2 h ago", "3 days ago", or the date. */
export function editedText(at: number, now: number): string {
	const s = Math.max(0, (now - at) / 1000);
	if (s < 60) return 'just now';
	if (s < 3600) return `${Math.floor(s / 60)} min ago`;
	if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
	if (s < 7 * 86400) {
		const d = Math.floor(s / 86400);
		return `${d} day${d === 1 ? '' : 's'} ago`;
	}
	return new Date(at).toISOString().slice(0, 10);
}
