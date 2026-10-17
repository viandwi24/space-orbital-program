import { describe, expect, test } from 'bun:test';
import {
	API_VERSION,
	MODULE_CATEGORIES,
	parseVersion,
	partDefinitionSchema
} from '../src/index.ts';

const base = { id: 'mod.plate', title: 'Plate', mass: 10 };

describe('part catalogue placement (ADR 0082)', () => {
	test('a part with a category and an order parses', () => {
		const r = partDefinitionSchema.safeParse({
			...base,
			catalog: { category: 'structural', order: 5 }
		});
		expect(r.success).toBe(true);
		expect(r.data?.catalog).toEqual({ category: 'structural', order: 5 });
	});

	test('a part without a catalog entry stays valid, and every module category is accepted', () => {
		expect(partDefinitionSchema.safeParse(base).success).toBe(true);
		for (const category of [...MODULE_CATEGORIES, 'other'])
			expect(partDefinitionSchema.safeParse({ ...base, catalog: { category } }).success).toBe(true);
	});

	test('an unknown category and a non-finite order are refused', () => {
		for (const catalog of [
			{ category: 'science' },
			{ order: Number.NaN },
			{ order: Number.POSITIVE_INFINITY },
			{ order: '1' }
		])
			expect(partDefinitionSchema.safeParse({ ...base, catalog }).success).toBe(false);
	});

	test('the API version carries the additive bump', () => {
		expect(parseVersion(API_VERSION)![2]).toBeGreaterThanOrEqual(22);
	});
});
