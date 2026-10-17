import {
	GRAVITATIONAL_CONSTANT,
	bodyId,
	entityId,
	type BodyDefinition,
	type Snapshot,
	type Vec3,
	type VesselSnapshot
} from '@orbital/core';
import { fromStateVector, propagate, type StateVector } from '@orbital/kepler';
import { describe, expect, it } from 'vitest';
import { bodyNodes } from './map-path';
import { patchedApproach } from './rendezvous-aids';
import { createTargetView } from './target-view';

const MU = 3.5316e12;
const home: BodyDefinition = {
	id: 'stock.home',
	mass: MU / GRAVITATIONAL_CONSTANT,
	radius: 600_000,
	rotationPeriod: 21_600
};
const moon: BodyDefinition = {
	id: 'stock.cinder',
	mass: 5.776e10 / GRAVITATIONAL_CONSTANT,
	radius: 190_000,
	rotationPeriod: 1e6,
	parent: 'stock.home',
	orbit: { a: 11.8e6, e: 0, i: 0, raan: 0, argp: 0, m0: 1, epoch: 0 }
};
const bodies = [home, moon];
const T = 100;

const circ = (r: number, phase: number): StateVector => {
	const v = Math.sqrt(MU / r);
	return {
		r: { x: r * Math.cos(phase), y: 0, z: -r * Math.sin(phase) },
		v: { x: -v * Math.sin(phase), y: 0, z: -v * Math.cos(phase) }
	};
};
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

function scene(target: 'vessel' | 'body' | 'none', perMetre = 1 / 1000) {
	const a = circ(750_000, 0);
	const b = circ(760_000, 0.4);
	const mk = (id: number, s: StateVector, extra: Partial<VesselSnapshot> = {}): VesselSnapshot =>
		({
			id: entityId(id),
			name: id === 1 ? 'Orbiter' : 'Target probe',
			mode: 'on-rails',
			soi: bodyId('stock.home'),
			position: s.r,
			velocity: s.v,
			orientation: { x: 0, y: 0, z: 0, w: 1 },
			parts: [],
			orbit: fromStateVector(s.r, s.v, MU, T),
			...extra
		}) as VesselSnapshot;
	const moonState = propagate(moon.orbit!, MU, T);
	const rel =
		target === 'vessel'
			? { p: sub(b.r, a.r), v: sub(b.v, a.v) }
			: { p: sub(moonState.r, a.r), v: sub(moonState.v, a.v) };
	const ref =
		target === 'vessel'
			? ({ kind: 'vessel', id: entityId(2) } as const)
			: ({ kind: 'body', id: bodyId('stock.cinder') } as const);
	const orbiter = mk(
		1,
		a,
		target === 'none'
			? {}
			: {
					target: {
						...ref,
						name: target === 'vessel' ? 'Target probe' : 'stock.cinder',
						position: rel.p,
						velocity: rel.v,
						distance: Math.hypot(rel.p.x, rel.p.y, rel.p.z),
						relativeSpeed: Math.hypot(rel.v.x, rel.v.y, rel.v.z),
						approach: null
					}
				}
	);
	const snap: Snapshot = {
		t: T,
		vessels: [orbiter, mk(2, b)],
		bodies: [
			{
				id: bodyId('stock.home'),
				position: { x: 0, y: 0, z: 0 },
				rotation: { x: 0, y: 0, z: 0, w: 1 }
			},
			{ id: bodyId('stock.cinder'), position: moonState.r, rotation: { x: 0, y: 0, z: 0, w: 1 } }
		]
	};
	const calls: Vec3[] = [];
	let mapOn = true;
	const view = createTargetView({
		bodies,
		// One pixel per kilometre about the home centre, looking down the y axis.
		project: (w) => {
			calls.push(w);
			return { x: 400 + w.x * perMetre, y: 300 + w.z * perMetre, hidden: false };
		},
		snapshot: () => snap,
		vessel: () => 1,
		mapOn: () => mapOn,
		size: () => ({ width: 800, height: 600 })
	});
	return { view, snap, calls, orbiter, a, b, setMap: (on: boolean) => (mapOn = on) };
}

describe('target view on the map', () => {
	it('places the target at body centre + vessel + relative position (Renderer.project inputs)', () => {
		const { view, calls, b } = scene('vessel');
		view.update(0);
		calls.length = 0;
		const f = view.frame().map!;
		expect(f.target).not.toBeNull();
		const expected = b.r;
		expect(
			calls.some((c) => Math.hypot(c.x - expected.x, c.y - expected.y, c.z - expected.z) < 1e-6)
		).toBe(true);
		expect(f.target!.point.x).toBeCloseTo(400 + b.r.x / 1000, 9);
		expect(f.target!.name).toBe('Target probe');
	});

	it('places the closest-approach pair at the propagated positions and labels the distance', () => {
		const { view, snap, orbiter } = scene('vessel');
		view.update(0);
		const info = view.info!;
		expect(info.approach).not.toBeNull();
		const ap = patchedApproach(snap, orbiter, bodyNodes(bodies))!;
		const f = view.frame().map!.approach!;
		expect(f.vessel!.x).toBeCloseTo(400 + ap.vessel.x / 1000, 9);
		expect(f.target!.y).toBeCloseTo(300 + ap.target.z / 1000, 9);
		// The pair really is at the closest approach: the propagated vessel and target positions.
		const v = propagate(orbiter.orbit!, MU, ap.time);
		expect(Math.hypot(v.r.x - ap.vessel.x, v.r.y - ap.vessel.y, v.r.z - ap.vessel.z)).toBeLessThan(
			1
		);
		expect(f.text).toMatch(/ in /);
	});

	it('draws the target orbit as projected points on its circle', () => {
		const { view, calls } = scene('vessel');
		view.update(0);
		calls.length = 0;
		const f = view.frame().map!;
		expect(f.orbit.length).toBeGreaterThan(0);
		const onCircle = calls.filter((c) => Math.abs(Math.hypot(c.x, c.y, c.z) - 760_000) < 1);
		expect(onCircle.length).toBeGreaterThanOrEqual(120);
	});

	it('a body target: marker at the moon, its orbit about the planet', () => {
		const { view, snap } = scene('body');
		view.update(0);
		const f = view.frame().map!;
		const m = snap.bodies[1]!.position;
		expect(f.target!.point.x).toBeCloseTo(400 + m.x / 1000, 6);
		expect(f.orbit.length).toBeGreaterThan(0);
		expect(f.target!.name).toBe('Cinder');
	});

	it('picks the vessel dot, the moon disc and the moon orbit line, never the sphere it is in', () => {
		const { view, snap, b } = scene('vessel');
		expect(view.pick(400 + b.r.x / 1000, 300 + b.r.z / 1000)).toBe('vessel:2');
		const m = snap.bodies[1]!.position;
		expect(view.pick(400 + m.x / 1000, 300 + m.z / 1000)).toBe('body:stock.cinder');
		// A point on the moon's orbit, far from the moon: the line picks the moon.
		const away = { x: -11_800_000, z: 0 };
		expect(view.pick(400 + away.x / 1000, 300 + away.z / 1000 + 3)).toBe('body:stock.cinder');
		// On the home disc (its own sphere): nothing.
		expect(view.pick(400 + 100, 300 + 100)).toBeNull();
	});

	it('shows the aids and the approach in the info, and the aid command is a node-set', () => {
		const { view } = scene('vessel');
		view.update(0);
		expect(view.info!.aids).toHaveLength(5);
		expect(view.aidCommand('match')).toMatchObject({ type: 'node-set', vessel: 1 });
	});

	it('nothing without a target', () => {
		const { view } = scene('none');
		view.update(0);
		expect(view.info).toBeNull();
		const f = view.frame().map!;
		expect(f.target).toBeNull();
		expect(f.others).toHaveLength(1);
	});
});

describe('target view in the flight view', () => {
	it('a label while the target is on screen, with its name and distance', () => {
		const { view, setMap } = scene('vessel', 1 / 10_000);
		setMap(false);
		const f = view.frame().flight!;
		expect(f.name).toBe('Target probe');
		expect(f.distance).toBeGreaterThan(0);
		expect(f.indicator.kind).toBe('label');
		expect(view.frame().map).toBeNull();
	});

	it('an edge arrow when it is outside the box', () => {
		const { view, setMap } = scene('vessel');
		setMap(false);
		const f = view.frame().flight!;
		expect(f.indicator.kind).toBe('arrow');
	});
});
