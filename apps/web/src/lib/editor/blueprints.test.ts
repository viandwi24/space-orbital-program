/** The blueprint Library (plan 285, ADR 0263): every card builds, filters narrow, a mod's appears. */
import { loadPlugins, partId, resolveVesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { defineBlueprint, definePlugin } from '@orbital/sdk';
import { describe, expect, it } from 'vitest';
import type { ContentLookups } from '../delta-v';
import {
	allBlueprints,
	blueprintStats,
	filterBlueprints,
	NO_FILTER,
	resolveBlueprintId
} from './blueprints';

const Probes = definePlugin({
	meta: { id: 'acme.probes', title: 'Acme probes', version: '1.0.0', api: '^0.1' },
	depends: [Stock],
	setup(ctx) {
		ctx.blueprints.register(
			defineBlueprint({
				id: 'acme.pebble',
				title: 'Pebble probe',
				goal: 'orbit',
				crew: 0,
				summary: 'A probe core on a small tank.',
				design: {
					formatVersion: 4,
					name: 'Pebble probe',
					parts: [
						{ index: 0, part: partId('stock.probe-core'), parent: null },
						{
							index: 1,
							part: partId('stock.tank-small'),
							parent: { index: 0, parentNode: 'bottom', node: 'top' }
						}
					],
					stages: []
				}
			})
		);
	}
});

const { registries } = loadPlugins([Stock, Probes]);
const content: ContentLookups = {
	parts: registries.parts,
	modules: registries.modules,
	resources: registries.resources
};
const home = registries.bodies.get('stock.home')!;
const g = (6.6743e-11 * home.mass) / (home.radius * home.radius);
const cards = allBlueprints(registries.blueprints.list());

describe('blueprint Library (plan 285)', () => {
	it('lists the learn examples, the missions and the mod blueprint, each buildable', () => {
		expect(cards.filter((c) => c.origin === 'learn')).toHaveLength(5);
		expect(cards.filter((c) => c.origin === 'mission').length).toBeGreaterThanOrEqual(7);
		expect(cards.filter((c) => c.origin === 'mod').map((c) => c.id)).toEqual(['acme.pebble']);
		expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length);
		for (const c of cards) {
			const r = resolveVesselDesign(c.build(content), content.parts);
			expect(r.ok, c.id).toBe(true);
		}
	});

	it('filters by goal, origin, crew and words', () => {
		const moon = filterBlueprints(cards, { ...NO_FILTER, goal: 'moon' });
		expect(moon.map((c) => c.id)).toEqual([
			'stock.moon-shot',
			'stock.kronos-selene',
			'stock.moonwatch-orbiter'
		]);
		expect(filterBlueprints(cards, { ...NO_FILTER, origin: 'mod' })).toHaveLength(1);
		expect(
			filterBlueprints(cards, { ...NO_FILTER, crew: 'probe' }).every((c) => c.crew === 0)
		).toBe(true);
		expect(filterBlueprints(cards, { ...NO_FILTER, query: 'shuttle' }).map((c) => c.id)).toEqual([
			'stock.wayfarer-shuttle'
		]);
	});

	it('old ids resolve to stock\'s (ADR 0316)', () => {
		expect(resolveBlueprintId('kronos-selene', cards)).toBe('stock.kronos-selene');
		expect(resolveBlueprintId('learn.two-stage', cards)).toBe('stock.two-stage');
		expect(resolveBlueprintId('acme.pebble', cards)).toBe('acme.pebble');
		expect(resolveBlueprintId('nobody', cards)).toBeUndefined();
		const stock = cards.filter((c) => c.origin !== 'mod');
		expect(stock.every((c) => registries.blueprints.owner(c.id) === 'stock')).toBe(true);
	});

	it('card read-outs come from the Hangar stats', () => {
		const kronos = cards.find((c) => c.id === 'stock.kronos-selene')!;
		const s = blueprintStats(kronos.build(content), content, g);
		expect(s.parts).toBeGreaterThan(30);
		expect(s.mass).toBeGreaterThan(100);
		expect(s.deltaV).toBeGreaterThan(5000);
		expect(s.twr ?? 0).toBeGreaterThan(1);
	});
});
