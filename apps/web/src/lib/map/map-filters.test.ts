import { VESSEL_TYPES } from '@orbital/core';
import { describe, expect, it } from 'vitest';
import {
	defaultFilters,
	hiddenTypes,
	hiddenVessels,
	parseFilters,
	serialiseFilters,
	shownCount,
	withLayer,
	withType
} from './map-filters';

describe('the map filters (plan 258)', () => {
	it('start with everything shown but the spheres of influence', () => {
		const f = defaultFilters();
		expect(f.orbits && f.links && f.stations && f.labels).toBe(true);
		expect(hiddenTypes(f)).toEqual([]);
		expect(Object.keys(f.types)).toEqual([...VESSEL_TYPES]);
		expect(shownCount(f)).toEqual({ on: 4 + VESSEL_TYPES.length, of: 5 + VESSEL_TYPES.length });
	});
	it('the spheres of influence are off by default, switch on, and are remembered (plan 293)', () => {
		expect(defaultFilters().soi).toBe(false);
		// a value saved before plan 293 has no `soi`: it stays off
		expect(parseFilters('{"orbits":true,"labels":false}').soi).toBe(false);
		const on = withLayer(defaultFilters(), 'soi', true);
		expect(on.soi).toBe(true);
		expect(parseFilters(serialiseFilters(on)).soi).toBe(true);
		expect(parseFilters(serialiseFilters(withLayer(on, 'soi', false))).soi).toBe(false);
	});
	it('a layer or a type switches without touching the rest, and the old value is kept', () => {
		const f = defaultFilters();
		const g = withType(withLayer(f, 'links', false), 'debris', false);
		expect(g.links).toBe(false);
		expect(g.orbits).toBe(true);
		expect(hiddenTypes(g)).toEqual(['debris']);
		expect(f.links).toBe(true);
		expect(f.types.debris).toBe(true);
		expect(shownCount(g).on).toBe(shownCount(f).on - 2);
	});
	it('round trip, and a damaged or partial value falls back per field', () => {
		const g = withType(withLayer(defaultFilters(), 'labels', false), 'flag', false);
		expect(parseFilters(serialiseFilters(g))).toEqual(g);
		expect(parseFilters(null)).toEqual(defaultFilters());
		expect(parseFilters('{nope')).toEqual(defaultFilters());
		expect(parseFilters('42')).toEqual(defaultFilters());
		const mixed = parseFilters(
			'{"orbits":false,"links":"no","types":{"debris":false,"ship":1,"warp":false}}'
		);
		expect(mixed.orbits).toBe(false);
		expect(mixed.links).toBe(true);
		expect(mixed.types.debris).toBe(false);
		expect(mixed.types.ship).toBe(true);
		expect(Object.keys(mixed.types)).toEqual([...VESSEL_TYPES]);
	});
	it('hides the vessels of an off type, never the one being flown', () => {
		const f = withType(withType(defaultFilters(), 'debris', false), 'probe', false);
		const vessels = [
			{ id: 1, type: 'ship' as const },
			{ id: 2, type: 'debris' as const },
			{ id: 3, type: 'probe' as const },
			{ id: 4 }
		];
		expect([...hiddenVessels(f, vessels, 1)].sort()).toEqual([2, 3]);
		// flying a probe with probes switched off still shows it
		expect([...hiddenVessels(f, vessels, 3)]).toEqual([2]);
		expect(hiddenVessels(defaultFilters(), vessels, null).size).toBe(0);
	});
});
