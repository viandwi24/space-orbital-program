/** The Launch screen's model (plan 094, ADR 0150). */
import { LEGACY_SITE, loadPlugins, type PlacedBuilding, type Site } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import {
	accepts,
	facilitiesOf,
	placementOf,
	quickLaunchPlacement,
	saveLaunchChoice,
	seatIn,
	seatsOf,
	takeLaunchChoice,
	toggleSeat
} from './launch-model';

const { registries } = loadPlugins([Stock]);
const buildings = registries.buildings;

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
		expect(placementOf(LEGACY_SITE, f[0]!)).toEqual({
			kind: 'site',
			site: 'legacy',
			at: { east: 0, north: 0 }
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

	it('with the aircraft flag, an aircraft rolls out to the runway and anything else to a pad (plan 063)', () => {
		const f = facilitiesOf(
			site([at('pad-s', 'stock.launchpad-s', -1, -1), at('runway', 'stock.runway', 10, 0)]),
			buildings
		);
		const pad = f.find((x) => x.kind === 'pad')!;
		const runway = f.find((x) => x.kind === 'runway')!;
		expect(accepts(runway, 9_000, true)).toBe(true);
		expect(accepts(runway, 9_000, false)).toBe(false);
		expect(accepts(pad, 9_000, true)).toBe(false);
		expect(accepts(pad, 9_000, false)).toBe(true);
	});

	it("a facility's spot is its footprint's centre at its site (plan 236: any site)", () => {
		const [pad] = facilitiesOf(site([at('pad-m', 'stock.launchpad-m', 4, 2, 1)]), buildings);
		expect([pad!.east, pad!.north]).toEqual([60, 40]);
		expect(pad!.massLimit).toBe(100);
		expect(placementOf({ id: 'branch-1' }, pad!)).toEqual({
			kind: 'site',
			site: 'branch-1',
			at: { east: 60, north: 40 }
		});
	});

	it('planned buildings and buildings that are not pads or runways are left out', () => {
		const planned = { ...at('p', 'stock.launchpad-s', 0, 0), state: 'planned' as const };
		expect(facilitiesOf(site([planned, at('h', 'stock.hangar', 5, 5)]), buildings)).toEqual([]);
	});
});

describe('quick launch (Shift+Launch)', () => {
	it("stands on the primary site's first working pad, the spot the Launch screen picks", () => {
		const hq: Site = {
			...site([at('h', 'stock.hangar', 5, 5), at('pad-m', 'stock.launchpad-m', 4, 2, 1)]),
			id: 'space-center',
			latitude: 0.5,
			longitude: 1.2
		};
		const pad = facilitiesOf(hq, buildings)[0]!;
		expect(quickLaunchPlacement([hq], buildings, false)).toEqual(placementOf(hq, pad));
		expect(quickLaunchPlacement([], buildings, false)).toBeUndefined();
	});

	it("an aircraft takes the runway; the running sim's buildings win over the record", () => {
		const hq = site([
			at('pad-s', 'stock.launchpad-s', -1, -1),
			at('runway', 'stock.runway', 10, 0)
		]);
		const runway = facilitiesOf(hq, buildings).find((f) => f.kind === 'runway')!;
		expect(quickLaunchPlacement([hq], buildings, true)).toEqual(placementOf(hq, runway));
		const live = [{ id: hq.id, buildings: [at('pad-m', 'stock.launchpad-m', 4, 2, 1)] }];
		expect(quickLaunchPlacement([hq], buildings, false, live)).toEqual({
			kind: 'site',
			site: hq.id,
			at: { east: 60, north: 40 }
		});
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

describe('seats (plan 108)', () => {
	const parts = {
		get: (id: string) =>
			id === 'pod'
				? { title: 'Pod', crewCapacity: 2 }
				: id === 'can'
					? { title: 'Can', crewCapacity: 1 }
					: { title: 'Tank' }
	};
	const design = {
		parts: [
			{ index: 0, part: 'pod' },
			{ index: 1, part: 'tank' },
			{ index: 2, part: 'can' }
		]
	};
	it('lists the parts with seats and fills them in design order; a second click takes a member out', () => {
		const seats = seatsOf(design, parts);
		expect(seats).toEqual([
			{ part: 0, title: 'Pod', capacity: 2 },
			{ part: 2, title: 'Can', capacity: 1 }
		]);
		let s = toggleSeat([], seats, 'c1');
		s = toggleSeat(s, seats, 'c2');
		s = toggleSeat(s, seats, 'c3');
		expect(s).toEqual([
			{ member: 'c1', part: 0 },
			{ member: 'c2', part: 0 },
			{ member: 'c3', part: 2 }
		]);
		expect(toggleSeat(s, seats, 'c4')).toEqual(s);
		expect(toggleSeat(s, seats, 'c2').map((x) => x.member)).toEqual(['c1', 'c3']);
	});
});

describe('seatIn (plan 346)', () => {
	const seats = [
		{ part: 0, title: 'Pod', capacity: 1 },
		{ part: 3, title: 'Cabin', capacity: 2 }
	];
	it('moves a member to the seat they were dropped on', () => {
		expect(seatIn([{ member: 'a', part: 0 }], seats, 'a', 3)).toEqual([{ member: 'a', part: 3 }]);
	});
	it('a full part lets its last occupant go', () => {
		expect(seatIn([{ member: 'a', part: 0 }], seats, 'b', 0)).toEqual([{ member: 'b', part: 0 }]);
	});
	it('a part that is not a seat changes nothing', () => {
		expect(seatIn([{ member: 'a', part: 0 }], seats, 'b', 9)).toEqual([{ member: 'a', part: 0 }]);
	});
});
