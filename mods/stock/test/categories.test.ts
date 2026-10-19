/** Stock catalogue categories through the public API (plan 069, ADR 0146). */
import { describe, expect, test } from 'bun:test';
import { loadPlugins, scopeOf, sortCategories } from '@orbital/sdk';
import Stock, { STOCK_CATEGORIES } from '../src/index.ts';
import { STOCK_BUILDING_CATEGORIES } from '../src/categories.ts';

describe('stock categories', () => {
	test('stock alone gives exactly the nine part categories, in the rail order, Other last', () => {
		const { registries } = loadPlugins([Stock]);
		const parts = registries.categories.list().filter((c) => scopeOf(c) === 'parts');
		expect(sortCategories(parts).map((c) => c.id)).toEqual([
			'stock.command',
			'stock.tanks',
			'stock.propulsion',
			'stock.structural',
			'stock.aero',
			'stock.control',
			'stock.landing',
			'stock.thermal',
			'stock.other'
		]);
		expect(parts).toHaveLength(STOCK_CATEGORIES.length);
	});

	test('the build menu categories (plan 235, ADR 0227): eight, Other last, every stock building in one', () => {
		const { registries } = loadPlugins([Stock]);
		const scoped = sortCategories(
			registries.categories.list().filter((c) => scopeOf(c) === 'buildings')
		);
		expect(scoped.map((c) => c.label)).toEqual([
			'Launch',
			'Comms',
			'Science',
			'Crew',
			'Administration',
			'Production',
			'Infrastructure',
			'Other'
		]);
		expect(scoped).toHaveLength(STOCK_BUILDING_CATEGORIES.length);
		const ids = new Set(scoped.map((c) => c.id));
		for (const b of registries.buildings.list()) expect(ids.has(b.category ?? ''), b.id).toBe(true);
	});

	test('every stock category names an icon', () => {
		for (const c of STOCK_CATEGORIES) expect(typeof c.icon).toBe('string');
	});
});
