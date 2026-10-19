/** Catalogue categories as a registry (plan 069, ADR 0146). */
import { describe, expect, test } from 'bun:test';
import {
	buildingCategoryOf,
	buildingDefinitionSchema,
	CATEGORY_ICON_PATH_MAX,
	categoryDefinitionSchema,
	FALLBACK_BUILDING_CATEGORY,
	scopeOf,
	categoryIdOf,
	loadPlugins,
	moduleInfoSchema,
	partDefinitionSchema,
	sortCategories,
	type Plugin
} from '../src/index.ts';

const cat = { id: 'mod.solar', label: 'Solar', icon: 'sun', order: 350 };

describe('category definitions', () => {
	test('a named icon and path data on the grid parse', () => {
		expect(categoryDefinitionSchema.safeParse(cat).success).toBe(true);
		expect(
			categoryDefinitionSchema.safeParse({ ...cat, icon: { path: 'M4 4h16v16H4Z M12 4v16' } })
				.success
		).toBe(true);
	});

	test('a bad id, an empty label, a non-finite order and unsafe or long path data are refused', () => {
		for (const bad of [
			{ ...cat, id: 'solar' },
			{ ...cat, id: 'Mod.Solar' },
			{ ...cat, label: '' },
			{ ...cat, order: Number.NaN },
			{ ...cat, order: Number.POSITIVE_INFINITY },
			{ ...cat, icon: 'Sun Icon' },
			{ ...cat, icon: { path: 'M4 4"/><script>' } },
			{ ...cat, icon: { path: 'M4 4 url(#x)' } },
			{ ...cat, icon: { path: '' } },
			{ ...cat, icon: { path: 'M1 1'.repeat(CATEGORY_ICON_PATH_MAX) } },
			{ ...cat, icon: { path: 'M1 1', fill: 'red' } }
		])
			expect(categoryDefinitionSchema.safeParse(bad).success).toBe(false);
	});

	test('a part and a module name a category by id or by a short name', () => {
		const part = { id: 'mod.panel', title: 'Panel', mass: 10 };
		for (const category of ['structural', 'other', 'mod.solar'])
			expect(partDefinitionSchema.safeParse({ ...part, catalog: { category } }).success).toBe(true);
		expect(
			partDefinitionSchema.safeParse({ ...part, catalog: { category: 'solar' } }).success
		).toBe(false);
		expect(moduleInfoSchema.safeParse({ category: 'mod.solar' }).success).toBe(true);
		expect(moduleInfoSchema.safeParse({ category: 'landing' }).success).toBe(true);
	});

	test('short names mean stock ids; ids stay', () => {
		expect(categoryIdOf('command')).toBe('stock.command');
		expect(categoryIdOf('other')).toBe('stock.other');
		expect(categoryIdOf('mod.solar')).toBe('mod.solar');
	});

	test('rail order: ascending, ties in registration order', () => {
		const list = [
			{ id: 'a.x', order: 2 },
			{ id: 'a.y', order: 1 },
			{ id: 'a.z', order: 2 },
			{ id: 'a.w', order: -1 }
		];
		expect(sortCategories(list).map((c) => c.id)).toEqual(['a.w', 'a.y', 'a.x', 'a.z']);
	});
});

describe('the categories registry', () => {
	const owner: Plugin = {
		meta: { id: 'stock', version: '1.0.0', api: '^0.1' },
		depends: [],
		optional: [],
		setup(ctx) {
			ctx.categories.register({
				id: 'stock.command',
				label: 'Command',
				icon: 'command',
				order: 100
			});
		}
	};

	test('a plugin registers a category; the report lists it', () => {
		const { registries, report } = loadPlugins([owner]);
		expect(registries.categories.get('stock.command')?.label).toBe('Command');
		expect(report.registered.category).toEqual([{ id: 'stock.command', by: 'stock' }]);
	});

	test('definePatch relabels another plugin category', () => {
		const patcher: Plugin = {
			meta: { id: 'relabel', version: '1.0.0', api: '^0.1' },
			depends: ['stock'],
			optional: [],
			setup(ctx) {
				ctx.patches.register({
					id: 'relabel.command',
					target: 'category',
					select: { id: 'stock.command' },
					ops: [{ op: 'set', path: 'label', value: 'Crew and probes' }]
				});
			}
		};
		const { registries, report } = loadPlugins([owner, patcher]);
		expect(registries.categories.get('stock.command')?.label).toBe('Crew and probes');
		expect(report.provenance.category['stock.command']!['label']).toEqual(['stock', 'relabel']);
	});

	test('a patch that breaks the schema is disabled, the category unchanged', () => {
		const patcher: Plugin = {
			meta: { id: 'bad', version: '1.0.0', api: '^0.1' },
			depends: ['stock'],
			optional: [],
			setup(ctx) {
				ctx.patches.register({
					id: 'bad.order',
					target: 'category',
					select: { id: 'stock.command' },
					ops: [{ op: 'set', path: 'order', value: 'first' }]
				});
			}
		};
		const { registries, report } = loadPlugins([owner, patcher]);
		expect(registries.categories.get('stock.command')?.order).toBe(100);
		expect(report.patches[0]!.disabled).toBeDefined();
	});
});

describe('building categories (plan 235, ADR 0227)', () => {
	const cat = (id: string, scope?: 'parts' | 'buildings') => ({
		id,
		label: id,
		icon: 'part',
		order: 1,
		...(scope ? { scope } : {})
	});

	test('a category may name the buildings scope; anything else is refused', () => {
		expect(categoryDefinitionSchema.safeParse(cat('stock.comms', 'buildings')).success).toBe(true);
		expect(
			categoryDefinitionSchema.safeParse({ ...cat('stock.comms'), scope: 'roads' }).success
		).toBe(false);
		expect(scopeOf(cat('stock.command'))).toBe('parts');
		expect(scopeOf(cat('stock.comms', 'buildings'))).toBe('buildings');
	});

	test('a building names a buildings-scope category; a part category or an unknown id is Other', () => {
		const list = [cat('stock.comms', 'buildings'), cat('stock.command')];
		expect(buildingCategoryOf('stock.comms', list)).toBe('stock.comms');
		expect(buildingCategoryOf('stock.command', list)).toBe(FALLBACK_BUILDING_CATEGORY);
		expect(buildingCategoryOf('mymod.none', list)).toBe(FALLBACK_BUILDING_CATEGORY);
		expect(buildingCategoryOf(undefined, list)).toBe(FALLBACK_BUILDING_CATEGORY);
	});

	test('the building schema takes an optional category id and description', () => {
		const base = {
			id: 'mymod.solar-farm',
			label: 'Solar farm',
			size: { w: 2, d: 2 },
			entrances: [{ i: 1, j: 0, side: 'south' }],
			levels: [{ cost: 1, buildDays: 1, upkeep: 0, power: -50, capacity: {} }],
			provides: [],
			visual: { kind: 'generator', generator: 'tanks' }
		};
		expect(buildingDefinitionSchema.safeParse(base).success).toBe(true);
		expect(
			buildingDefinitionSchema.safeParse({
				...base,
				category: 'mymod.power',
				description: 'Power.'
			}).success
		).toBe(true);
		expect(buildingDefinitionSchema.safeParse({ ...base, category: 'Power' }).success).toBe(false);
	});
});
