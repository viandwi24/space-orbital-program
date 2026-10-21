/** The launch site draws the buildings the player built, in Flight as in the Space Center (ADR 0117). */
import { describe, expect, it } from 'vitest';
import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { siteViews } from './site-views';

const buildings = loadPlugins([Stock]).registries.buildings;

describe('siteViews', () => {
	it('lists every placed building with its generator, including a deep-space dish built later', () => {
		const views = siteViews(
			{
				id: 'hq',
				body: 'stock.home',
				buildings: [
					{ id: 'pad', kind: 'stock.launchpad-s', cell: { i: 0, j: 0 }, rotation: 0, level: 0 },
					{
						id: 'dsn',
						kind: 'stock.deep-space-dish',
						cell: { i: 20, j: 20 },
						rotation: 90,
						level: 0
					}
				],
				roads: []
			} as never,
			buildings
		);
		expect(views.map((v) => v.id)).toEqual(['pad', 'dsn']);
		expect(views[1]).toMatchObject({
			generator: 'deep-space-dish',
			size: { w: 8, d: 8 },
			rotation: 90
		});
	});

	it('draws nothing without a site, and skips kinds no loaded mod defines', () => {
		expect(siteViews(undefined, buildings)).toEqual([]);
		expect(
			siteViews(
				{
					id: 'hq',
					body: 'stock.home',
					buildings: [
						{ id: 'x', kind: 'gone.mod-building', cell: { i: 0, j: 0 }, rotation: 0, level: 0 }
					],
					roads: []
				} as never,
				buildings
			)
		).toEqual([]);
	});
});
