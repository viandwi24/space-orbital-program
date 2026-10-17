/**
 * Catalogue categories (plan 069, ADR 0146): the groups of the editor's part catalogue, as a
 * registry. Stock registers its nine through the same API mods use; a part or a module names one by
 * id or by one of the nine short names, which mean `stock.<name>`.
 */
import * as z from 'zod';
import { DEFINITION_ID_PATTERN } from './ids.ts';

// Its own copy of the id rule: `schemas.ts` imports this file.
const definitionIdSchema = z
	.string()
	.regex(DEFINITION_ID_PATTERN, 'expected "<plugin>.<name>" in lower-case kebab-case');

/** The nine short names of ADR 0082; each means `stock.<name>`. */
export const STOCK_CATEGORY_NAMES = [
	'command',
	'propulsion',
	'tanks',
	'structural',
	'aero',
	'control',
	'landing',
	'thermal',
	'other'
] as const;
export type StockCategoryName = (typeof STOCK_CATEGORY_NAMES)[number];

/** Where an unregistered category id lands (ADR 0146 point 5). */
export const FALLBACK_CATEGORY = 'stock.other';

/** At most this many characters of SVG path data in a category icon. */
export const CATEGORY_ICON_PATH_MAX = 1024;

/**
 * A category icon: the name of an icon in the game's own set, or SVG path data on the 24 x 24
 * grid. The UI draws the path with the set's stroke (1.7, round caps and joins, no fill).
 */
export type CategoryIcon = string | { path: string };

export interface CategoryDefinition {
	/** `<plugin>.<name>`. */
	id: string;
	label: string;
	icon: CategoryIcon;
	/** Rail position, ascending; ties keep registration order. Stock uses 100 to 800, Other 10 000. */
	order: number;
	description?: string;
}

/** Path commands, numbers, separators: nothing that could leave the path attribute. */
const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]+$/;

export const categoryIconSchema = z.union([
	z.string().regex(/^[a-z][a-z0-9-]*$/, 'expected an icon name in lower-case kebab-case'),
	z.strictObject({
		path: z
			.string()
			.min(1)
			.max(CATEGORY_ICON_PATH_MAX)
			.regex(PATH_DATA, 'expected SVG path data (commands and numbers only)')
	})
]);

export const categoryDefinitionSchema = z.object({
	id: definitionIdSchema,
	label: z.string().min(1),
	icon: categoryIconSchema,
	order: z.number().finite(),
	description: z.string().optional()
});

/** What a part's `catalog.category` or a module's `category` may say: a short name or a category id. */
export const categoryRefSchema = z.union([z.enum(STOCK_CATEGORY_NAMES), definitionIdSchema]);

/** A short name to its stock id; a category id unchanged. */
export function categoryIdOf(ref: string): string {
	return (STOCK_CATEGORY_NAMES as readonly string[]).includes(ref) ? `stock.${ref}` : ref;
}

/** Categories in rail order: `order` ascending, ties in registration order. Returns a new array. */
export function sortCategories<T extends Pick<CategoryDefinition, 'order'>>(
	list: readonly T[]
): T[] {
	return list
		.map((c, i) => [c, i] as const)
		.sort((a, b) => a[0].order - b[0].order || a[1] - b[1])
		.map(([c]) => c);
}
