import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import * as z from 'zod';
import {
	createWorldQuery,
	entityId,
	bodyId,
	partId,
	SIM_EVENTS,
	situationOfVessel,
	storeProblem,
	STORE_MAX_BYTES,
	type BodyDefinition,
	type Snapshot,
	type VesselSnapshot
} from '../src/index.ts';

const R = 600_000;
const home = {
	id: 'test.home',
	mass: 5.29e22,
	radius: R,
	rotationPeriod: 21_600,
	atmosphere: { height: 70_000 }
} as unknown as BodyDefinition;
const moon = {
	id: 'test.moon',
	mass: 9.76e20,
	radius: 200_000,
	rotationPeriod: 138_984,
	parent: 'test.home',
	orbit: { a: 12_000_000, e: 0, i: 0, raan: 0, argp: 0, m0: 0, epoch: 0 }
} as unknown as BodyDefinition;
const registry = { list: () => [home, moon] };

const q = { x: 0, y: 0, z: 0, w: 1 };
const vessel = (id: number, over: Partial<VesselSnapshot>): VesselSnapshot => ({
	id: entityId(id),
	name: `V${id}`,
	type: 'probe',
	mode: 'on-rails',
	soi: bodyId('test.home'),
	position: { x: R + 100_000, y: 0, z: 0 },
	velocity: { x: 0, y: 0, z: 2_250 },
	orientation: q,
	parts: [],
	launchedAt: 10,
	...over
});

const orbiting = vessel(1, {
	orbit: { a: R + 100_000, e: 0.001, i: 0, raan: 0, argp: 0, m0: 0, epoch: 0 },
	parts: [
		{
			id: entityId(11),
			definition: partId('stock.probe-core'),
			position: { x: 0, y: 0, z: 0 },
			orientation: q,
			modules: { 'stock.command': { on: true } },
			temperature: 290,
			resources: [
				{
					resource: 'stock.electric-charge',
					amount: 40,
					capacity: 50,
					rate: 0,
					timeToEmpty: null,
					locked: false
				}
			]
		}
	],
	resources: [
		{
			resource: 'stock.electric-charge',
			amount: 40,
			capacity: 50,
			rate: 0,
			timeToEmpty: null,
			locked: false
		}
	],
	crew: [{ member: 'c1', part: entityId(11), abilities: {} }]
});
const near = vessel(2, {
	name: 'Station',
	type: 'station',
	position: { x: R + 100_000, y: 0, z: 500 },
	orbit: { a: R + 100_000, e: 0.001, i: 0, raan: 0, argp: 0, m0: 0, epoch: 0 }
});
const landed = vessel(3, { type: 'lander', surface: true, position: { x: R, y: 0, z: 0 } });
const pad = vessel(4, {
	type: 'ship',
	position: { x: 0, y: R, z: 0 },
	recovery: { value: 1, factor: 1, distance: 0, credit: 1 },
	launchedAt: undefined
});
const debris = vessel(5, { type: 'debris', position: { x: R + 30_000, y: 0, z: 0 } });
const atMoon = vessel(6, {
	soi: bodyId('test.moon'),
	position: { x: 230_000, y: 0, z: 0 },
	orbit: { a: 230_000, e: 0, i: 0, raan: 0, argp: 0, m0: 0, epoch: 0 }
});
const escaping = vessel(7, {
	position: { x: R + 500_000, y: 0, z: 0 },
	orbit: { a: -2_000_000, e: 1.5, i: 0, raan: 0, argp: 0, m0: 0, epoch: 0 }
});
const suborbital = vessel(8, {
	position: { x: R + 90_000, y: 0, z: 0 },
	orbit: { a: R, e: 0.2, i: 0, raan: 0, argp: 0, m0: 0, epoch: 0 }
});

const snapshot: Snapshot = {
	t: 1234,
	vessels: [orbiting, near, landed, pad, debris, atMoon, escaping, suborbital],
	bodies: [
		{ id: bodyId('test.home'), position: { x: 0, y: 0, z: 0 }, rotation: q },
		{ id: bodyId('test.moon'), position: { x: 12_000_000, y: 0, z: 0 }, rotation: q }
	],
	rules: { 'stock.economy': false },
	stores: { 'ex.count': 3 },
	day: 2,
	crew: [
		{
			id: 'c1',
			name: 'Val',
			profession: 'pilot',
			traits: [],
			xp: 1,
			level: 0,
			status: 'assigned',
			vessel: entityId(1),
			places: []
		},
		{
			id: 'c2',
			name: 'Bob',
			profession: 'scientist',
			traits: [],
			xp: 0,
			level: 0,
			status: 'available',
			places: []
		}
	],
	economy: { enabled: true, funds: 1000, science: 5, reputation: 2 },
	sites: [
		{
			id: 'stock.ksc',
			buildings: [
				{ id: 'b', kind: 'stock.pad', cell: { i: 0, j: 0 }, rotation: 0, level: 1, state: 'active' }
			],
			roads: []
		}
	]
};

describe('World Query (plan 343, ADR 0292)', () => {
	const w = createWorldQuery(snapshot, { bodies: registry });

	test('every vessel, with the coarse situation', () => {
		expect(w.vessels().map((v) => [Number(v.id), v.situation])).toEqual([
			[1, 'orbiting'],
			[2, 'orbiting'],
			[3, 'landed'],
			[4, 'prelaunch'],
			[5, 'flying'],
			[6, 'orbiting'],
			[7, 'escaping'],
			[8, 'sub-orbital']
		]);
	});

	test('filters by type, situation, SOI, distance and debris', () => {
		expect(w.vessels({ type: 'station' }).map((v) => v.name)).toEqual(['Station']);
		expect(w.vessels({ situation: ['landed', 'prelaunch'] }).map((v) => Number(v.id))).toEqual([
			3, 4
		]);
		expect(w.vessels({ soi: 'test.moon' }).map((v) => Number(v.id))).toEqual([6]);
		expect(
			w
				.vessels({ near: { of: entityId(1), within: 1_000 }, except: entityId(1) })
				.map((v) => Number(v.id))
		).toEqual([2]);
		expect(w.vessels({ noDebris: true }).some((v) => v.type === 'debris')).toBe(false);
		expect(w.nearest(entityId(1))?.id).toBe(entityId(2));
		expect(w.distance(entityId(1), entityId(2))).toBeCloseTo(500, 6);
		// across SOIs: the moon's offset counts
		expect(w.distance(entityId(1), entityId(6))).toBeCloseTo(
			12_000_000 + 230_000 - (R + 100_000),
			0
		);
		expect(w.findVessel('Station')?.id).toBe(entityId(2));
	});

	test('parts, resources, crew, orbit and altitudes', () => {
		const v = w.vessel(entityId(1))!;
		expect(v.altitude).toBe(100_000);
		expect(v.periapsis).toBeCloseTo(100_000 - 700.1, 0);
		expect(v.crew).toBe(1);
		const [p] = w.parts(entityId(1));
		expect(p?.definition).toBe('stock.probe-core');
		expect(p?.modules['stock.command']).toEqual({ on: true });
		expect(w.amount(entityId(1), 'stock.electric-charge')).toBe(40);
		expect(w.amount(entityId(1), 'stock.liquid-fuel')).toBe(0);
		expect(w.crewOf(entityId(1)).map((c) => c.name)).toEqual(['Val']);
		expect(w.orbit(entityId(7))?.e).toBe(1.5);
		expect(w.vessel(entityId(99))).toBeNull();
	});

	test('bodies joined with their facts, and the world state', () => {
		const m = w.body('test.moon')!;
		expect(m.parent).toBe('test.home');
		expect(m.soi).toBeGreaterThan(1e6);
		expect(m.mu).toBeCloseTo(6.6743e-11 * 9.76e20, 0);
		expect(w.body('test.home')!.atmosphereHeight).toBe(70_000);
		expect(w.time).toBe(1234);
		expect(w.day).toBe(2);
		expect(w.economy().funds).toBe(1000);
		expect(w.crew().map((c) => c.status)).toEqual(['assigned', 'available']);
		expect(w.sites()[0]?.buildings[0]?.kind).toBe('stock.pad');
		expect(w.rule('stock.economy')).toBe(false);
		expect(w.store('ex.count')).toBe(3);
	});

	test('without body facts a vessel off the ground is flying until it has an orbit', () => {
		const bare = createWorldQuery(snapshot);
		expect(bare.vessel(entityId(5))?.situation).toBe('flying');
		expect(bare.vessel(entityId(1))?.situation).toBe('orbiting');
		expect(situationOfVessel({ ...landed, splashed: true }, undefined)).toBe('splashed');
	});
});

describe('stores (ADR 0292 point 4)', () => {
	const def = { id: 'ex.count', schema: z.object({ n: z.int().min(0) }), initial: { n: 0 } };
	test('the schema and the size limit', () => {
		expect(storeProblem(def, { n: 2 })).toBeUndefined();
		expect(storeProblem(def, { n: -1 })).toContain('n:');
		const big = { id: 'ex.big', schema: z.string(), initial: '' };
		expect(storeProblem(big, 'x'.repeat(STORE_MAX_BYTES))).toContain('byte limit');
	});
});

describe('events catalogue (ADR 0292 point 5)', () => {
	test('every EventMap key has an entry, once', () => {
		const source = readFileSync(new URL('../src/events.ts', import.meta.url), 'utf8');
		const body = source.slice(
			source.indexOf('export interface EventMap'),
			source.indexOf('export type EventHandler')
		);
		const keys = [...body.matchAll(/^\t'([a-z-]+:[a-z-]+)':/gm)].map((m) => m[1]);
		const names = SIM_EVENTS.map((e) => e.name);
		expect(keys.length).toBeGreaterThan(50);
		for (const k of keys) expect(names).toContain(k!);
		expect(new Set(names).size).toBe(names.length);
	});
});
