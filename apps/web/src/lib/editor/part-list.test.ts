/** Plan 316: the Hangar's list of the vessel's parts. */
import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import type { ContentLookups } from '../delta-v';
import { shellsOf } from './inside';
import { blueprintDesign } from '../blueprint-registry';
import { partRows } from './part-list';

const { registries } = loadPlugins([Stock]);
const content: ContentLookups = {
	parts: registries.parts,
	modules: registries.modules,
	resources: registries.resources
};

describe('part list (plan 316)', () => {
	it('lists every part of Kronos V once, the pod first, the lander inside the petals', () => {
		const d = blueprintDesign('stock.kronos-selene', registries.blueprints.list());
		const shells = shellsOf(d, content.parts, content);
		const rows = partRows(d, content.parts, shells);
		expect(rows).toHaveLength(d.parts.length);
		expect(new Set(rows.map((r) => r.index)).size).toBe(d.parts.length);
		expect(rows[0]).toMatchObject({ title: 'OrbitX PC-3 "Bell"', depth: 0 });
		const petals = rows.find((r) => r.title.includes('"Petal"'))!;
		expect(petals.holds).toBeGreaterThan(5);
		const lander = rows.find((r) => r.title.includes('"Hopper"'))!;
		expect(lander.inside).toBe(petals.index);
		// a child is listed below its parent, one level deeper
		const shield = rows.findIndex((r) => r.title.toLowerCase().includes('shield'));
		expect(rows[shield]!.depth).toBe(1);
	});
});
