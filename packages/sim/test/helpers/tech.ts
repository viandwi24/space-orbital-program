/**
 * Tests that fly parts a tech tree locks (plan 105, ADR 0154): a free node that opens every stock
 * part, so a Science or Career world keeps its tree (and its science credit) without research.
 */
import { loadPlugins, type Plugin } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { definePlugin, defineTechNode } from '@orbital/sdk';

const ALL = loadPlugins([Stock])
	.registries.parts.list()
	.map((p) => p.id);

export const openTree: Plugin = definePlugin({
	meta: { id: 'test-open-tree', version: '1.0.0', api: '^0.1' },
	depends: ['stock'],
	setup(ctx) {
		ctx.techNodes.register(
			defineTechNode({ id: 'test-open-tree.all', label: 'All', tier: 0, cost: 0, unlocks: ALL })
		);
	}
});
