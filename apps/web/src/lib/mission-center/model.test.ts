import type { BodyDefinition, BodyId, EntityId, Snapshot, VesselSnapshot } from '@orbital/core';
import { describe, expect, it } from 'vitest';
import { WARP_LEAD_S } from '../maneuver-controller';
import { bodyNodes } from '../map-path';
import {
	NOT_OURS,
	clusterLabels,
	fly,
	objectCard,
	trackingRows,
	typeCounts,
	upcomingEvents,
	warpToCommand,
	alarmCommand,
	parseDuration
} from './model';

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

	it('lists a claim in peer review, not one already judged (plan 129)', () => {
		const claim = {
			body: 'stock.home',
			fact: 'stock.polar-ice',
			value: 20,
			confidence: 0.8,
			made: 0
		};
		const withReview: Snapshot = {
			...snapshot,
			vessels: [],
			discovery: {
				facts: [
					{
						body: 'stock.home',
						fact: 'stock.polar-ice',
						label: 'Polar ice',
						unit: '%',
						tolerance: 4,
						status: 'open'
					}
				],
				data: [],
				claims: [
					{ ...claim, id: 'c1', due: 5_000 },
					{ ...claim, id: 'c2', due: 900, verdict: 'rejected', reputation: -10 }
				],
				labSlots: null,
				processing: 0
			}
		};
		const [review, ...rest] = upcomingEvents(withReview, bodies, nodes);
		expect(rest).toEqual([]);
		expect(review).toMatchObject({
			kind: 'review',
			vessel: null,
			time: 5_000,
			label: 'Peer review: Polar ice on Home',
			detail: 'Claimed at 80%'
		});
		expect(warpToCommand(review!)).toEqual({ type: 'warp-to', time: 5_000, factor: 100_000 });
	});
});

describe('Tracking and the card', () => {
	it('filters bodies and vessels; relays are the vessels of type relay (plan 223)', () => {
		expect(trackingRows(snapshot, bodies, 'all').map((r) => r.key)).toEqual([
			'body:stock.home',
			'body:stock.cinder',
			'vessel:1',
			'vessel:2'
		]);
		expect(trackingRows(snapshot, bodies, 'vessels').map((r) => r.sub)).toEqual([
			'Probe · Orbit · Cinder',
			'Probe · Orbit · Home'
		]);
		expect(trackingRows(snapshot, bodies, 'bodies')).toHaveLength(2);
		expect(trackingRows(snapshot, bodies, 'relays')).toEqual([]);
	});

	it('the fleet list filters by each type and its counts match (plan 223)', () => {
		const types = [
			'debris',
			'probe',
			'rover',
			'lander',
			'ship',
			'station',
			'base',
			'plane',
			'relay',
			'eva',
			'flag'
		] as const;
		const fleet: Snapshot = {
			...snapshot,
			vessels: types.flatMap((type, k) =>
				Array.from({ length: k + 1 }, (_, j) =>
					vessel(100 + k * 20 + j, { type, name: `${type} ${j}` })
				)
			)
		};
		const counts = typeCounts(fleet);
		expect(counts.all).toBe(fleet.vessels.length);
		types.forEach((type, k) => {
			expect(counts.byType[type]).toBe(k + 1);
			const rows = trackingRows(fleet, bodies, 'all', { type });
			expect(rows).toHaveLength(counts.byType[type]);
			expect(rows.every((r) => r.type === type)).toBe(true);
		});
		expect(trackingRows(fleet, bodies, 'relays')).toHaveLength(counts.byType.relay);
		// search and sort by distance from a point
		expect(
			trackingRows(fleet, bodies, 'vessels', { search: 'ROVER 1' }).map((r) => r.label)
		).toEqual(['rover 1']);
		const near = vessel(900, { name: 'Near', position: { x: 10, y: 0, z: 0 } });
		const far = vessel(901, { name: 'Alpha far', position: { x: 9e6, y: 0, z: 0 } });
		const two: Snapshot = { ...snapshot, vessels: [far, near] };
		expect(
			trackingRows(two, bodies, 'vessels', { sort: 'distance', from: { x: 0, y: 0, z: 0 } }).map(
				(r) => r.label
			)
		).toEqual(['Near', 'Alpha far']);
		expect(trackingRows(two, bodies, 'vessels').map((r) => r.label)).toEqual(['Alpha far', 'Near']);
	});

	it('Fly is enabled for every vessel of the player, not for an agency object (plan 221)', () => {
		const focused = objectCard('vessel:2', snapshot, bodies, 2)!;
		expect(focused.fly).toEqual({ enabled: true });
		expect(focused.facts.map((f) => f.label)).toEqual(['Altitude', 'Speed', 'Ap / Pe']);
		expect(objectCard('vessel:1', snapshot, bodies, 2)!.fly).toEqual({ enabled: true });
		const agency = {
			...snapshot,
			vessels: snapshot.vessels.map((v) => ({ ...v, owner: 'rival' }))
		};
		expect(objectCard('vessel:1', agency, bodies, 2)!.fly).toEqual({
			enabled: false,
			reason: NOT_OURS
		});
		expect(objectCard('body:stock.cinder', snapshot, bodies, 2)!.fly).toBeNull();
		expect(objectCard('vessel:9', snapshot, bodies, 2)).toBeNull();
	});
});

describe('Fly (ADR 0201 point 1)', () => {
	it('opens Flight on the same sim, with no save in between', () => {
		const went: string[] = [];
		expect(fly({ focus: () => true, go: (href) => went.push(href) })).toBeNull();
		expect(went).toEqual(['/flight']);
	});

	it('does not open Flight without a vessel to fly', () => {
		const went: string[] = [];
		expect(fly({ focus: () => false, go: (href) => went.push(href) })).toMatch(/no vessel/);
		expect(went).toEqual([]);
	});
});

describe('map labels', () => {
	it('a fleet close together shares one label; a lone vessel and the bodies keep theirs', () => {
		const v = (n: number, x: number, y: number) => ({
			key: `vessel:${n}`,
			label: `Ship ${n}`,
			kind: 'vessel' as const,
			x,
			y
		});
		const out = clusterLabels([
			{ key: 'body:stock.home', label: 'Home', kind: 'body', x: 500, y: 300 },
			v(1, 500, 300),
			v(2, 510, 305),
			v(3, 520, 296),
			v(4, 900, 100)
		]);
		expect(out.map((l) => [l.key, l.label])).toEqual([
			['body:stock.home', 'Home'],
			['cluster:vessel:1', '3 vessels'],
			['vessel:4', 'Ship 4']
		]);
		expect(out[1]!.members).toEqual(['vessel:1', 'vessel:2', 'vessel:3']);
	});
});

describe('alarms in Upcoming (plan 224)', () => {
	it('lists alarms with the vessel, warps to them by id and builds the form command', () => {
		const snap: Snapshot = {
			t: 100,
			bodies: [],
			vessels: [vessel(2, {})],
			alarms: [
				{ id: 'alarm.1', name: 'Wake up', time: 400, kind: 'time' },
				{ id: 'alarm.2', name: 'Pe', time: 50, kind: 'periapsis', vessel: 2 as EntityId }
			]
		};
		const events = upcomingEvents(snap, bodies, bodyNodes(bodies)).filter(
			(e) => e.kind === 'alarm'
		);
		expect(events).toHaveLength(1); // the one in the past is not shown
		expect(events[0]).toMatchObject({ alarm: 'alarm.1', label: 'Alarm: Wake up', time: 400 });
		expect(warpToCommand(events[0]!)).toEqual({
			type: 'warp-to',
			target: { kind: 'alarm', id: 'alarm.1' },
			factor: 100_000
		});
		expect(alarmCommand({ name: ' Burn ', inSeconds: 300 }, 100)).toEqual({
			type: 'add-alarm',
			name: 'Burn',
			kind: 'time',
			time: 400
		});
		expect(alarmCommand({ id: 'alarm.1', name: '', inSeconds: 60 }, 100)).toMatchObject({
			id: 'alarm.1',
			time: 160
		});
		expect(typeof alarmCommand({ name: '', inSeconds: 0 }, 100)).toBe('string');
	});

	it('reads typed durations', () => {
		expect(parseDuration('5')).toBe(300);
		expect(parseDuration('10 min')).toBe(600);
		expect(parseDuration('1h 30m')).toBe(5_400);
		expect(parseDuration('1:30:00')).toBe(5_400);
		expect(parseDuration('1:30')).toBe(5_400);
		expect(parseDuration('2d')).toBe(172_800);
		expect(parseDuration('soon')).toBeNull();
	});
});
