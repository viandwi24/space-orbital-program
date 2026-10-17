/** Plan 090 / ADR 0115: footprints, rotation and each placement reason. */
import { describe, expect, test } from 'bun:test';
import {
	buildingDefinitionSchema,
	canPlace,
	footprint,
	type BuildingDefinition,
	type PlacementSite
} from '../src/index.ts';

const level = { cost: 0, buildDays: 0, upkeep: 0, power: 0, capacity: {} };
const shed: BuildingDefinition = {
	id: 't.shed',
	label: 'Shed',
	size: { w: 3, d: 2 },
	entrances: [{ i: 1, j: 0, side: 'south' }],
	levels: [level],
	provides: [],
	visual: { kind: 'generator', generator: 'box' }
};
const pad: BuildingDefinition = {
	...shed,
	id: 't.pad',
	label: 'Pad',
	size: { w: 3, d: 3 },
	hazardRadius: 40,
	bodies: ['home']
};
const defs = new Map([shed, pad].map((d) => [d.id, d]));
const registry = { get: (id: string) => defs.get(id) };
const empty = (extra: Partial<PlacementSite> = {}): PlacementSite => ({
	body: 'home',
	flatRadius: 500,
	buildings: [],
	roads: [],
	...extra
});
const reasons = (r: ReturnType<typeof canPlace>) => (r.ok ? [] : r.reasons.map((x) => x.code));

describe('footprint', () => {
	test('rotation 90 swaps width and depth', () => {
		expect(footprint({ w: 3, d: 2 }, { i: 0, j: 0 }, 0)).toHaveLength(6);
		const turned = footprint({ w: 3, d: 2 }, { i: 0, j: 0 }, 90);
		expect(Math.max(...turned.map((c) => c.i))).toBe(1);
		expect(Math.max(...turned.map((c) => c.j))).toBe(2);
	});
});

describe('canPlace', () => {
	test('a first building on a site without roads is ok with no road cells', () => {
		expect(canPlace(empty(), registry, 't.shed', { i: 0, j: 0 }, 0)).toEqual({
			ok: true,
			roads: []
		});
	});

	test('overlap names the other building', () => {
		const site = empty({
			buildings: [
				{ id: 'a', kind: 't.shed', cell: { i: 0, j: 0 }, rotation: 0, level: 0, state: 'active' }
			]
		});
		const r = canPlace(site, registry, 't.shed', { i: 2, j: 1 }, 0);
		expect(reasons(r)).toEqual(['overlap']);
		expect(r.ok ? '' : r.reasons[0]!.message).toContain('building a');
	});

	test('outside the flat zone', () => {
		expect(
			reasons(canPlace(empty({ flatRadius: 25 }), registry, 't.shed', { i: 2, j: 0 }, 0))
		).toEqual(['outside-zone']);
	});

	test("inside a pad's hazard clearance, either way round", () => {
		const withPad = empty({
			buildings: [
				{ id: 'p', kind: 't.pad', cell: { i: -1, j: -1 }, rotation: 0, level: 0, state: 'active' }
			]
		});
		expect(reasons(canPlace(withPad, registry, 't.shed', { i: 2, j: 2 }, 0))).toEqual(['hazard']);
		expect(canPlace(withPad, registry, 't.shed', { i: 5, j: 5 }, 0).ok).toBe(true);
		const withShed = empty({
			buildings: [
				{ id: 's', kind: 't.shed', cell: { i: 2, j: 2 }, rotation: 0, level: 0, state: 'active' }
			]
		});
		expect(reasons(canPlace(withShed, registry, 't.pad', { i: -1, j: -1 }, 0))).toEqual(['hazard']);
	});

	test('a body the building may not stand on', () => {
		expect(
			reasons(canPlace(empty({ body: 'moon' }), registry, 't.pad', { i: 0, j: 0 }, 0))
		).toEqual(['body']);
	});

	test('an entrance with no way to a road; a valid one returns the completed road cells', () => {
		// A road row at j = -5; the shed's door (south, middle) at (1, -1) faces (1, -2).
		const roads = [-2, -1, 0, 1, 2, 3].map((i) => ({ i, j: -5 }));
		const r = canPlace(empty({ roads }), registry, 't.shed', { i: 0, j: 0 }, 0);
		expect(r).toEqual({
			ok: true,
			roads: [
				{ i: 1, j: -1 },
				{ i: 1, j: -2 },
				{ i: 1, j: -3 },
				{ i: 1, j: -4 }
			]
		});
		// The same road behind a wall of buildings that closes every way round.
		const wall = Array.from({ length: 9 }, (_, k) => ({
			id: `w${k}`,
			kind: 't.shed',
			cell: { i: -12 + 3 * k, j: -4 },
			rotation: 0 as const,
			level: 0,
			state: 'active' as const
		}));
		const blocked = canPlace(
			empty({ roads, flatRadius: 60, buildings: wall }),
			registry,
			't.shed',
			{ i: 0, j: 0 },
			0
		);
		expect(reasons(blocked)).toEqual(['no-road']);
	});

	test('an entrance not on the footprint edge is a schema error', () => {
		const bad = { ...shed, entrances: [{ i: 1, j: 0, side: 'north' }] };
		expect(buildingDefinitionSchema.safeParse(bad).success).toBe(false);
		expect(buildingDefinitionSchema.safeParse(shed).success).toBe(true);
	});
});
