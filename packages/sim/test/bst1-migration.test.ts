/** Plan 210: the format 10 migration gives a flying BST-1 exactly the stock part's solid configs. */
import { expect, test } from 'bun:test';
import { BST1_SOLID } from '@orbital/core';
import { engineConfigSchema, PartBooster } from '@orbital/mod-stock';

test('the migration BST-1 matches stock.booster', () => {
	const engine = PartBooster.modules!.find(([m]) => m === 'stock.engine')![1];
	expect(engineConfigSchema.parse(engine)).toEqual(engineConfigSchema.parse(BST1_SOLID.engine));
	const container = PartBooster.modules!.find(([m]) => m === 'stock.resource-container')![1];
	expect(container).toEqual({ contents: { 'stock.solid-fuel': { capacity: BST1_SOLID.fuel } } });
});
