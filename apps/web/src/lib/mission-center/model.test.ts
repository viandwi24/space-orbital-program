import type { BodyDefinition, BodyId, EntityId, Snapshot, VesselSnapshot } from '@orbital/core';
import { describe, expect, it } from 'vitest';
import { WARP_LEAD_S } from '../maneuver-controller';
import { bodyNodes } from '../map-path';
import { NOT_FLYABLE, fly, objectCard, trackingRows, upcomingEvents, warpToCommand } from './model';

const HOME = 'stock.home' as BodyId;
const MOON = 'stock.cinder' as BodyId;
const q0 = { x: 0, y: 0, z: 0, w: 1 };
const bodies = [
	{ id: HOME, radius: 600_000, mass: 5.29e22 },
	{
		id: MOON,
		radius: 200_000,
		mass: 9.76e20,
		parent: HOME,
		orbit: { a: 12e6, e: 0, i: 0, raan: 0, argp: 0, m0: 0, epoch: 0 }
	}
] as unknown as BodyDefinition[];

const vessel = (id: number, extra: Partial<VesselSnapshot>): VesselSnapshot => ({
	id: id as EntityId,
	name: `Ship ${id}`,
	mode: 'on-rails',
	soi: HOME,
	position: { x: 700_000, y: 0, z: 0 },
	velocity: { x: 0, y: 0, z: Math.sqrt((6.674e-11 * 5.29e22) / 700_000) },
	orientation: q0,
	parts: [],
	...extra
});
// Ship 1 leaves the moon on an escape conic; ship 2 circles home with a node in 5 000 s.
const snapshot: Snapshot = {
	t: 1_000,
	bodies: [
		{ id: HOME, position: { x: 0, y: 0, z: 0 }, rotation: q0 },
		{ id: MOON, position: { x: 12e6, y: 0, z: 0 }, rotation: q0 }
	],
	vessels: [
		vessel(1, {
			soi: MOON,
			position: { x: 400_000, y: 0, z: 0 },
			velocity: { x: 0, y: 0, z: 900 }
		}),
		vessel(2, {
			nodes: [{ id: 7, time: 6_000, prograde: 120, normal: 0, radial: 0, dv: 120 }]
		})
	]
};
const nodes = bodyNodes(bodies);

describe('Upcoming (plan 113)', () => {
	it('lists the sphere change and the node in time order, with their warp times', () => {
		const events = upcomingEvents(snapshot, bodies, nodes);
		expect(events.map((e) => e.kind)).toEqual(['soi', 'node']);
		const [soi, node] = events;
		expect(soi!.vessel).toBe(1);
		expect(soi!.label).toBe('Ship 1: leaves for Home');
		expect(soi!.time).toBeGreaterThan(snapshot.t);
		expect(soi!.time).toBeLessThan(node!.time);
		expect(warpToCommand(soi!)).toEqual({ type: 'warp-to', time: soi!.time, factor: 100_000 });
		expect(node!.time).toBe(6_000);
		expect(warpToCommand(node!)).toEqual({
			type: 'warp-to',
			time: 6_000 - WARP_LEAD_S,
			factor: 100_000
		});
	});

	it('drops what already happened', () => {
		const later = { ...snapshot, t: 7_000, vessels: [snapshot.vessels[1]!] };
		expect(upcomingEvents(later, bodies, nodes)).toEqual([]);
	});
});

describe('Tracking and the card', () => {
	it('filters bodies and vessels; relays are empty until plan 117', () => {
		expect(trackingRows(snapshot, bodies, 'all').map((r) => r.key)).toEqual([
			'body:stock.home',
			'body:stock.cinder',
			'vessel:1',
			'vessel:2'
		]);
		expect(trackingRows(snapshot, bodies, 'vessels').map((r) => r.sub)).toEqual([
			'Orbit · Cinder',
			'Orbit · Home'
		]);
		expect(trackingRows(snapshot, bodies, 'bodies')).toHaveLength(2);
		expect(trackingRows(snapshot, bodies, 'relays')).toEqual([]);
	});

	it('Fly is enabled for the save focus vessel only', () => {
		const focused = objectCard('vessel:2', snapshot, bodies, 2)!;
		expect(focused.fly).toEqual({ enabled: true });
		expect(focused.facts.map((f) => f.label)).toEqual(['Altitude', 'Speed', 'Ap / Pe']);
		expect(objectCard('vessel:1', snapshot, bodies, 2)!.fly).toEqual({
			enabled: false,
			reason: NOT_FLYABLE
		});
		expect(objectCard('body:stock.cinder', snapshot, bodies, 2)!.fly).toBeNull();
		expect(objectCard('vessel:9', snapshot, bodies, 2)).toBeNull();
	});
});

describe('Fly (ADR 0118 point 5)', () => {
	it('writes an autosave and opens the flight with it', async () => {
		const went: string[] = [];
		let saved = 0;
		const error = await fly({
			autosave: async () => {
				saved++;
				return 'auto-1';
			},
			go: (href) => went.push(href)
		});
		expect(error).toBeNull();
		expect(saved).toBe(1);
		expect(went).toEqual(['/flight?load=auto-1']);
	});

	it('does not open the flight when the save failed', async () => {
		const went: string[] = [];
		const error = await fly({ autosave: async () => null, go: (href) => went.push(href) });
		expect(error).toMatch(/could not be saved/);
		expect(went).toEqual([]);
	});
});
