/** The launch site draws the buildings the player built, in Flight as in the Space Center (ADR 0117). */
import { describe, expect, it } from 'vitest';
import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { constructionOf, homeSiteDraws, siteViews } from './site-views';

const buildings = loadPlugins([Stock]).registries.buildings;

describe('construction (plan 388)', () => {
	const def = { levels: [{ buildDays: 20 }] } as never;
	it('is the share built in twentieths while building, 0 when planned, absent when standing', () => {
		expect(constructionOf({ state: 'building', readyDay: 30 }, def, 10)).toBe(0);
		expect(constructionOf({ state: 'building', readyDay: 30 }, def, 25)).toBe(0.75);
		expect(constructionOf({ state: 'building', readyDay: 30 }, def, 40)).toBe(1);
		expect(constructionOf({ state: 'planned' }, def, 25)).toBe(0);
		expect(constructionOf({ state: 'active' }, def, 25)).toBeUndefined();
		// an upgrade keeps the building standing
		expect(constructionOf({ state: 'upgrading', readyDay: 30 }, def, 25)).toBeUndefined();
	});
	it('reaches the renderer with the site', () => {
		const views = siteViews(
			{
				id: 'east',
				buildings: [
					{
						id: 'hq',
						kind: 'stock.branch-hq',
						cell: { i: 0, j: 0 },
						rotation: 0,
						level: 0,
						state: 'building',
						readyDay: 20
					}
				],
				roads: []
			} as never,
			buildings,
			10
		);
		expect(views[0]?.construction).toBeGreaterThanOrEqual(0);
		expect(views[0]?.construction).toBeLessThan(1);
	});
});

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

describe('homeSiteDraws (plan 384, ADR 0321)', () => {
	const pad = {
		id: 'pad',
		kind: 'stock.launchpad-s',
		cell: { i: 0, j: 0 },
		rotation: 0 as const,
		level: 0,
		state: 'active' as const
	};
	const sites = [
		{ id: 'space-center', body: 'stock.home', latitude: 0.1, longitude: 0.2 },
		{ id: 'branch-1', body: 'stock.home', latitude: 0.5, longitude: -1.2 },
		{ id: 'base-1', body: 'stock.cinder', latitude: 0, longitude: 0 }
	];
	const snapshot = {
		sites: [
			{ id: 'space-center', buildings: [pad], roads: [] },
			{ id: 'branch-1', buildings: [{ ...pad, id: 'pad2' }], roads: [{ i: 1, j: 1 }] },
			{ id: 'base-1', body: 'stock.cinder', buildings: [pad], roads: [] }
		]
	};

	it('draws every space center on the home body at its own place; a base elsewhere is left out', () => {
		const draws = homeSiteDraws(snapshot as never, sites, buildings, 'stock.home');
		expect(draws.map((d) => d.place)).toEqual([
			{ id: 'space-center', latitude: 0.1, longitude: 0.2 },
			{ id: 'branch-1', latitude: 0.5, longitude: -1.2 }
		]);
		expect(draws[1]!.views.map((v) => v.id)).toEqual(['pad2']);
		expect(draws[1]!.roads).toEqual([{ i: 1, j: 1 }]);
	});
});
