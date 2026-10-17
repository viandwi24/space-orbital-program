/**
 * Catalogue categories (plan 069, ADR 0146): read from the loaded `categories` registry, where stock
 * registers its nine and a mod may add its own. A part's category comes from its own
 * `catalog.category`, else from its modules (ADR 0029); a name that resolves to no registered
 * category lands in Other.
 */
import {
	categoryIdOf,
	describeModule,
	FALLBACK_CATEGORY,
	sortCategories,
	type CategoryDefinition,
	type CategoryIcon,
	type ModuleDefinition,
	type PartDefinition
} from '@orbital/core';

/** A category id (`stock.command`, `mymod.solar`). */
export type CategoryId = string;

export interface Category {
	id: CategoryId;
	label: string;
	/** A name from `ui/icons.ts`, or path data on its 24 x 24 grid. */
	icon: CategoryIcon;
}

/** The rail's categories in display order (`order` ascending, ties in registration order). */
export function categoriesOf(list: readonly CategoryDefinition[]): Category[] {
	return sortCategories(list).map(({ id, label, icon }) => ({ id, label, icon }));
}

/** The registry `categoryOf` reads module descriptors through. */
export interface ModuleLookup {
	get(id: string): ModuleDefinition | undefined;
}

/** First match wins, in this order (a pod with a battery is still a command part). */
const PRIORITY: readonly CategoryId[] = [
	'stock.command',
	'stock.propulsion',
	'stock.structural',
	'stock.aero',
	'stock.control',
	'stock.landing',
	'stock.thermal',
	'stock.tanks'
];

/**
 * The categories one module stands for, read from its descriptor (ADR 0033, plan 023): a control
 * source is a command part; an engine, a separator and a lifting plate imply theirs; otherwise the
 * descriptor's own `category`. A module without a descriptor, or whose descriptor throws, says nothing.
 */
function moduleCategories(mod: ModuleDefinition, raw: unknown): CategoryId[] {
	const out: CategoryId[] = [];
	if (mod.controlSource) out.push('stock.command');
	try {
		const info = describeModule(mod, raw);
		if (info?.engine) out.push('stock.propulsion');
		if (info?.separator) out.push('stock.structural');
		if (info?.lift) out.push('stock.aero');
		if (info?.category) out.push(categoryIdOf(info.category));
	} catch {
		// A broken mod descriptor leaves the part in the next best category, not out of the catalogue.
	}
	if (mod.store && out.length === 0) out.push('stock.tanks');
	return out;
}

const cache = new WeakMap<object, CategoryId>();

/** The category a part names or implies, before checking it is registered. */
function namedCategory(
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
		const id = categoryIdOf(own);
		cache.set(def, id);
		return id;
	}
	const found = new Set<CategoryId>();
	for (const [id, raw] of def.modules ?? []) {
		const mod = modules.get(id);
		if (mod) for (const c of moduleCategories(mod, raw)) found.add(c);
	}
	// A module that names a mod category: the first one wins after the stock priority list.
	const custom = [...found].find((c) => !PRIORITY.includes(c));
	// A part with no module that declares its own drag (a nose cone) is aerodynamic hardware.
	// A strut or fuel line has no module: it is structure (ADR 0071).
	const category =
		PRIORITY.find((c) => found.has(c)) ??
		custom ??
		(def.connector !== undefined
			? 'stock.structural'
			: def.dragCoefficient !== undefined
				? 'stock.aero'
				: FALLBACK_CATEGORY);
	cache.set(def, category);
	return category;
}

/**
 * The part's catalogue category. With `categories` (the rail), an id that is not registered lands in
 * Other, or in the last category when no Other is loaded (ADR 0146 point 5).
 */
export function categoryOf(
	def: Pick<PartDefinition, 'modules' | 'catalog'> & {
		dragCoefficient?: number;
		connector?: object;
	},
	modules: ModuleLookup,
	categories?: readonly Pick<Category, 'id'>[]
): CategoryId {
	const id = namedCategory(def, modules);
	if (!categories || categories.length === 0 || categories.some((c) => c.id === id)) return id;
	return categories.some((c) => c.id === FALLBACK_CATEGORY)
		? FALLBACK_CATEGORY
		: categories[categories.length - 1]!.id;
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
