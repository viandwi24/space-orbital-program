/** The Launch screen's model (plan 094, ADR 0150). */
import { LEGACY_SITE, loadPlugins, type PlacedBuilding, type Site } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import {
	accepts,
	facilitiesOf,
	placementOf,
	saveLaunchChoice,
	takeLaunchChoice
} from './launch-model';

const { registries } = loadPlugins([Stock]);
const buildings = registries.buildings;
const R = 600_000;

const site = (placed: PlacedBuilding[]): Site => ({ ...LEGACY_SITE, buildings: placed });
const at = (id: string, kind: string, i: number, j: number, level = 0): PlacedBuilding => ({
	id,
	kind,
	cell: { i, j },
	rotation: 0,
	level,
	state: 'active'
});

describe('launch facilities', () => {
	it('the Legacy site lists its pad, centred on the site origin', () => {
		const f = facilitiesOf(LEGACY_SITE, buildings);
		expect(f.map((x) => [x.kind, x.east, x.north])).toEqual([['pad', 0, 0]]);
		expect(placementOf(LEGACY_SITE, f[0]!, R)).toEqual({
			kind: 'surface',
			body: 'stock.home',
			latitude: 0,
			longitude: 0
		});
	});

	it('a small pad lists only designs under its mass limit; the runway takes every design', () => {
		const f = facilitiesOf(
			site([at('pad-s', 'stock.launchpad-s', -1, -1), at('runway', 'stock.runway', 10, 0)]),
			buildings
		);
		const pad = f.find((x) => x.kind === 'pad')!;
		const runway = f.find((x) => x.kind === 'runway')!;
		expect(pad.massLimit).toBe(18);
		const designs = [
			{ name: 'light', wet: 12_890 },
			{ name: 'heavy', wet: 40_000 }
		];
		expect(designs.filter((d) => accepts(pad, d.wet)).map((d) => d.name)).toEqual(['light']);
		expect(designs.filter((d) => accepts(runway, d.wet)).map((d) => d.name)).toEqual([
			'light',
			'heavy'
		]);
	});

	it("a facility's spot is its footprint's centre, east and north turned into latitude and longitude", () => {
		const [pad] = facilitiesOf(site([at('pad-m', 'stock.launchpad-m', 4, 2, 1)]), buildings);
		expect([pad!.east, pad!.north]).toEqual([60, 40]);
		expect(pad!.massLimit).toBe(100);
		const p = placementOf(LEGACY_SITE, pad!, R);
		expect(p).toMatchObject({ kind: 'surface', body: 'stock.home' });
		if (p.kind !== 'surface') throw new Error('surface');
		expect(p.latitude! * R).toBeCloseTo(40, 6);
		expect(p.longitude! * R).toBeCloseTo(60, 6);
	});

	it('planned buildings and buildings that are not pads or runways are left out', () => {
		const planned = { ...at('p', 'stock.launchpad-s', 0, 0), state: 'planned' as const };
		expect(facilitiesOf(site([planned, at('h', 'stock.hangar', 5, 5)]), buildings)).toEqual([]);
	});
});

describe('the launch choice', () => {
	it('travels once: the flight reads it and it is gone', () => {
		const store = new Map<string, string>();
		const storage = {
			setItem: (k: string, v: string) => void store.set(k, v),
			getItem: (k: string) => store.get(k) ?? null,
			removeItem: (k: string) => void store.delete(k)
		};
		saveLaunchChoice(
			{ facility: 'legacy-pad', placement: { kind: 'surface', latitude: 0, longitude: 0 } },
			storage
		);
		expect(takeLaunchChoice(storage)?.facility).toBe('legacy-pad');
		expect(takeLaunchChoice(storage)).toBeNull();
	});
});
