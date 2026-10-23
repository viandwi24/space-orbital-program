import { loadPlugins, partId, type VesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { allBlueprints, type BlueprintCard } from '../editor/blueprints';
import { checkBlueprint, sizeMismatches } from './blueprint-check';

const { registries } = loadPlugins([Stock]);
const input = {
	editor: { parts: registries.parts, modules: registries.modules },
	lookups: {
		parts: registries.parts,
		modules: registries.modules,
		resources: registries.resources
	},
	gravity: 9.81,
	by: new Map([['acme.odd', 'acme']])
};

const design = (parts: Array<[string, number | null, string?, string?]>): VesselDesign => ({
	formatVersion: 4,
	name: 'Test',
	parts: parts.map(([part, parent, parentNode, node], index) => ({
		index,
		part: partId(part),
		parent: parent === null ? null : { index: parent, parentNode: parentNode!, node: node! }
	})),
	stages: []
});

const card = (id: string, d: VesselDesign): BlueprintCard => ({
	id,
	title: id,
	origin: 'mod',
	goal: 'orbit',
	crew: 0,
	summary: 'test',
	build: () => d
});

describe('blueprint checks for the Blueprints tab (plan 375)', () => {
	it('reports parts no loaded plugin registers', () => {
		const r = checkBlueprint(
			card('acme.odd', design([['stock.command-pod', null], ['acme.missing-tank', 0, 'bottom', 'top']])),
			input
		);
		expect(r.missing).toEqual(['acme.missing-tank']);
		expect(r.verdict).toBe('errors');
		expect(r.by).toBe('acme');
	});

	it('reports a link between nodes of different sizes', () => {
		const d = design([
			['stock.tank-small', null],
			['stock.tank-wide', 0, 'bottom', 'top']
		]);
		const sizes = sizeMismatches(d, (id) => registries.parts.get(id));
		expect(sizes).toEqual([
			expect.objectContaining({ partId: 'stock.tank-wide', size: 2.5, parentSize: 1.25 })
		]);
		const r = checkBlueprint(card('acme.wide', d), input);
		expect(r.sizes).toHaveLength(1);
		expect(r.by).toBe('game');
		expect(r.verdict).not.toBe('ok');
	});

	it('checks every built-in card without throwing', () => {
		for (const c of allBlueprints(registries.blueprints.list())) {
			const r = checkBlueprint(c, input);
			expect(r.buildError).toBeUndefined();
			expect(r.missing).toEqual([]);
			expect(r.stats?.parts).toBeGreaterThan(0);
		}
	});
});
