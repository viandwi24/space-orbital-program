/**
 * Catalogue categories, derived from a part's module ids so the part definition stays unchanged
 * (ADR 0029). Unknown mods land in "Other".
 */
import { describeModule, type ModuleDefinition, type PartDefinition } from '@orbital/core';

export type CategoryId =
	| 'command'
	| 'propulsion'
	| 'tanks'
	| 'structural'
	| 'aero'
	| 'control'
	| 'landing'
	| 'thermal'
	| 'other';

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
	{ id: 'aero', label: 'Aerodynamics', icon: 'fin' },
	{ id: 'control', label: 'Control', icon: 'wheel' },
	{ id: 'landing', label: 'Landing', icon: 'legs' },
	{ id: 'thermal', label: 'Thermal', icon: 'shield' },
	{ id: 'other', label: 'Other', icon: 'part' }
];

/** The registry `categoryOf` reads module descriptors through. */
export interface ModuleLookup {
	get(id: string): ModuleDefinition | undefined;
}

/** First match wins, in this order (a pod with a battery is still a command part). */
const PRIORITY: readonly CategoryId[] = [
	'command',
	'propulsion',
	'structural',
	'aero',
	'control',
	'landing',
	'thermal',
	'tanks'
];

/**
 * The categories one module stands for, read from its descriptor (ADR 0033, plan 023): a control
 * source is a command part; an engine, a separator and a lifting plate imply theirs; otherwise the
 * descriptor's own `category`. A module without a descriptor, or whose descriptor throws, says nothing.
 */
function categoriesOf(mod: ModuleDefinition, raw: unknown): CategoryId[] {
	const out: CategoryId[] = [];
	if (mod.controlSource) out.push('command');
	try {
		const info = describeModule(mod, raw);
		if (info?.engine) out.push('propulsion');
		if (info?.separator) out.push('structural');
		if (info?.lift) out.push('aero');
		if (info?.category) out.push(info.category);
	} catch {
		// A broken mod descriptor leaves the part in the next best category, not out of the catalogue.
	}
	if (mod.store && out.length === 0) out.push('tanks');
	return out;
}

const cache = new WeakMap<object, CategoryId>();

export function categoryOf(
	def: Pick<PartDefinition, 'modules' | 'catalog'> & {
		dragCoefficient?: number;
		connector?: object;
	},
	modules: ModuleLookup
): CategoryId {
	const hit = cache.get(def);
	if (hit !== undefined) return hit;
	// The part's own placement wins over everything its modules imply (ADR 0082).
	const own = def.catalog?.category;
	if (own !== undefined) {
		cache.set(def, own);
		return own;
	}
	const found = new Set<CategoryId>();
	for (const [id, raw] of def.modules ?? []) {
		const mod = modules.get(id);
		if (mod) for (const c of categoriesOf(mod, raw)) found.add(c);
	}
	// A part with no module that declares its own drag (a nose cone) is aerodynamic hardware.
	// A strut or fuel line has no module: it is structure (ADR 0071).
	const category =
		PRIORITY.find((c) => found.has(c)) ??
		(def.connector !== undefined
			? 'structural'
			: def.dragCoefficient !== undefined
				? 'aero'
				: 'other');
	cache.set(def, category);
	return category;
}

/**
 * Catalogue order (ADR 0082): by `catalog.order` ascending (default 0); parts with the same order
 * keep the order they were given in, which is registration order. Returns a new array.
 */
export function sortParts<T extends Pick<PartDefinition, 'catalog'>>(parts: readonly T[]): T[] {
	return parts
		.map((p, i) => [p, i] as const)
		.sort((a, b) => (a[0].catalog?.order ?? 0) - (b[0].catalog?.order ?? 0) || a[1] - b[1])
		.map(([p]) => p);
}

/** Case-insensitive match on title and id; an empty query matches everything. */
export function matchesQuery(def: Pick<PartDefinition, 'id' | 'title'>, query: string): boolean {
	const q = query.trim().toLowerCase();
	if (q === '') return true;
	return q.split(/\s+/).every((w) => def.title.toLowerCase().includes(w) || def.id.includes(w));
}
