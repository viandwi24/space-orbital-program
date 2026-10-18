/** Plan 096 / ADR 0123 points 3 and 7: stock building levels, a site's capacity, the upgrade that lifts a need. */
import { describe, expect, test } from 'bun:test';
import Stock from '@orbital/mod-stock';
import {
	CAPACITY_KEYS,
	FLIGHT_TOOLS,
	LEGACY_LAYOUT,
	capacityUpgrade,
	loadPlugins,
	siteCapacity,
	upkeepOf,
	type PlacedBuilding
} from '@orbital/core';

const { registries } = loadPlugins([Stock]);
const buildings = registries.buildings;
const norm = (k: string) => k.toLowerCase().replace(/[^a-z]/g, '');

describe('stock building levels (ADR 0123 point 7)', () => {
	test('no stock building capacity is a flight tool or an unknown key', () => {
		const tools = new Set(FLIGHT_TOOLS.map(norm));
		for (const key of CAPACITY_KEYS) expect(tools.has(norm(key))).toBe(false);
		for (const def of buildings.list())
			for (const level of def.levels)
				for (const key of Object.keys(level.capacity)) {
					expect(CAPACITY_KEYS as string[]).toContain(key);
					expect(tools.has(norm(key))).toBe(false);
				}
	});

	test('every stock building has three levels with a cost, build time and upkeep', () => {
		for (const def of buildings.list()) {
			expect(def.levels.length).toBe(3);
			for (const level of def.levels) {
				expect(level.cost).toBeGreaterThan(0);
				expect(level.buildDays).toBeGreaterThan(0);
				expect(level.upkeep).toBe(Math.round(level.cost * 0.01));
			}
		}
	});
});

describe('a site capacity', () => {
	const site = { buildings: LEGACY_LAYOUT.buildings };
	test('the Legacy layout: 30 parts, an 18 t pad, no crew limit', () => {
		expect(siteCapacity(site, buildings, 'hangar')).toBe(30);
		expect(siteCapacity(site, buildings, 'launch-pad')).toBe(18);
		expect(siteCapacity(site, buildings, 'crew')).toBeNull();
	});
	test('a building under construction gives nothing; an upgrading one works at its level', () => {
		const more = (state: PlacedBuilding['state'], level: number): PlacedBuilding => ({
			id: 'h2',
			kind: 'stock.hangar',
			cell: { i: 30, j: 30 },
			rotation: 0,
			level,
			state
		});
		expect(siteCapacity({ buildings: [more('building', 0)] }, buildings, 'hangar')).toBeNull();
		expect(siteCapacity({ buildings: [more('upgrading', 1)] }, buildings, 'hangar')).toBe(120);
		expect(siteCapacity({ buildings: [...site.buildings, more('active', 2)] }, buildings, 'hangar')).toBe(255);
		expect(upkeepOf([{ buildings: [more('building', 0)] }], buildings)).toEqual([]);
	});
	test('the upgrade that lifts a need is the cheapest level that meets it', () => {
		expect(capacityUpgrade(buildings, 'hangar', 40)?.text).toBe('Hangar level 2: 120 parts');
		expect(capacityUpgrade(buildings, 'launch-pad', 25)?.text).toBe('Launchpad S level 2: 30 t');
		expect(capacityUpgrade(buildings, 'launch-pad', 50)?.text).toBe('Launchpad M level 1: 60 t');
		expect(capacityUpgrade(buildings, 'hangar', 1_000)).toBeNull();
	});
});
