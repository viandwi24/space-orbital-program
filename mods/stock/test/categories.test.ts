/** Stock catalogue categories through the public API (plan 069, ADR 0146). */
import { describe, expect, test } from 'bun:test';
import { loadPlugins, sortCategories } from '@orbital/sdk';
import Stock, { STOCK_CATEGORIES } from '../src/index.ts';

describe('stock categories', () => {
	test('stock alone gives exactly the nine, in the rail order, Other last', () => {
		const { registries } = loadPlugins([Stock]);
		expect(sortCategories(registries.categories.list()).map((c) => c.id)).toEqual([
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
		expect(registries.categories.list()).toHaveLength(STOCK_CATEGORIES.length);
	});

	test('every stock category names an icon', () => {
		for (const c of STOCK_CATEGORIES) expect(typeof c.icon).toBe('string');
	});
});
