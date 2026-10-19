import { describe, expect, test } from 'bun:test';
import type { BodyId, EntityId, PartId, Snapshot, VesselSnapshot } from '@orbital/core';
import { BoxGeometry, CylinderGeometry, Mesh } from 'three';
import { SceneModel, partCentre, type PartShape } from '../src/scene.ts';
import { Vector3 } from 'three';

/** Where the flight camera looks: the vessel group plus the middle of its parts. */
const lookAt = (group: Vector3, v: VesselSnapshot): Vector3 => {
	const c = partCentre(v.parts);
	return new Vector3(group.x + c.x, group.y + c.y, group.z + c.z);
};

const id = (n: number): EntityId => n as EntityId;
const BODY = 'stock.home' as BodyId;
const POD = 'stock.pod' as PartId;
const TANK = 'stock.tank' as PartId;
const R = 600_000;
const ROOT = { x: 1.5e11, y: 0, z: 0 };
const q0 = { x: 0, y: 0, z: 0, w: 1 };

const deepFreeze = <T>(o: T): T => {
	if (o && typeof o === 'object') {
		Object.freeze(o);
		for (const v of Object.values(o)) deepFreeze(v);
	}
	return o;
};

const vessel = (n: number, x: number, y: number, z: number, orbit = true): VesselSnapshot => ({
	id: id(n),
	mode: 'flight',
	soi: BODY,
	position: { x, y, z },
	velocity: { x: 0, y: 0, z: 0 },
	orientation: q0,
	parts: [
		{
			id: id(n * 100 + 1),
			definition: POD,
			position: { x: 0, y: 0, z: 0 },
			orientation: q0,
			modules: {}
		},
		{
			id: id(n * 100 + 2),
			definition: TANK,
			position: { x: 0, y: -2, z: 0 },
			orientation: q0,
			modules: {}
		}
	],
	...(orbit ? { orbit: { a: 7e6, e: 0.01, i: 0.2, raan: 0, argp: 0, m0: 0, epoch: 0 } } : {})
});

const snap = (t: number, ...vessels: VesselSnapshot[]): Snapshot => ({
	t,
	bodies: [{ id: BODY, position: ROOT, rotation: q0 }],
	vessels
});

const shapes = new Map<string, PartShape>([
	[POD, { kind: 'box', size: { x: 1, y: 2, z: 3 } }],
	[TANK, { kind: 'cylinder', radius: 0.5, height: 4 }]
]);

const make = () => new SceneModel({ bodies: [{ id: BODY, radius: R }], partShapes: shapes });

describe('SceneModel', () => {
	test('places body and vessel in render space near zero despite a 1.5e11 m world offset', () => {
		const m = make();
		const s = deepFreeze(snap(0, vessel(1, R + 100, 0, 0)));
		m.sync(s); // frozen deep: any mutation would throw in strict mode
		const group = m.scene.children.find((c) => c.type === 'Group')!;
		const body = m.bodyObject(BODY)!;
		// origin snapped to the 1024 m grid near the vessel, so everything is small
		expect(Math.abs(group.position.x)).toBeLessThan(1024);
		expect(group.position.x - body.position.x).toBeCloseTo(R + 100, 6);
		// the camera looks at the middle of the vessel's parts, not at its root (plan 023)
		expect(m.camera.position.distanceTo(lookAt(group.position, s.vessels[0]!))).toBeCloseTo(25, 6);
	});

	test('view insets draw the vessel in the middle of the free area (plan 023)', () => {
		const m = make();
		m.resize(800, 600);
		const s = snap(0, vessel(1, R + 100, 0, 0));
		m.sync(s);
		const c = partCentre(s.vessels[0]!.parts);
		const world = { x: ROOT.x + R + 100 + c.x, y: ROOT.y + c.y, z: ROOT.z + c.z };
		const before = m.project(world)!;
		expect(before.y).toBeCloseTo(300, 0);
		m.setViewInsets({ top: 0, right: 200, bottom: 200, left: 0 });
		m.sync(s);
		const after = m.project(world)!;
		expect(after.y).toBeCloseTo(200, 0); // centre of the 400 px left free above the bottom panel
		expect(after.x).toBeCloseTo(300, 0); // centre of the 600 px left of the right panel
		m.setViewInsets({ top: 0, right: 0, bottom: 0, left: 0 });
		expect(m.project(world)!.y).toBeCloseTo(300, 0);
	});

	test('an animated inset change eases over 250 ms (plan 215, ADR 0205 point 7)', () => {
		const m = make();
		m.resize(800, 600);
		const s = snap(0, vessel(1, R + 100, 0, 0));
		m.sync(s);
		const c = partCentre(s.vessels[0]!.parts);
		const world = { x: ROOT.x + R + 100 + c.x, y: ROOT.y + c.y, z: ROOT.z + c.z };
		m.setViewInsets({ top: 0, right: 0, bottom: 200, left: 0 }, { animate: true });
		expect(m.project(world)!.y).toBeCloseTo(300, 0); // nothing moves at once
		m.prepareFrame(0.125);
		const half = m.project(world)!.y;
		expect(half).toBeLessThan(299);
		expect(half).toBeGreaterThan(201);
		m.prepareFrame(0.2);
		expect(m.project(world)!.y).toBeCloseTo(200, 0);
	});

	test('partAt finds the active vessel part under a screen point (plan 214)', () => {
		const m = make();
		m.resize(800, 600);
		const s = snap(0, vessel(1, R + 100, 0, 0));
		m.setActiveVessel(id(1));
		m.sync(s);
		m.prepareFrame(0.016);
		for (const p of s.vessels[0]!.parts) {
			const at = m.project({
				x: ROOT.x + R + 100 + p.position.x,
				y: ROOT.y + p.position.y,
				z: ROOT.z + p.position.z
			})!;
			expect(m.partAt(at.x, at.y)).toBe(p.id);
		}
		expect(m.partAt(5, 5)).toBeNull(); // the sky
	});

	test('partCentre is the middle of the parts bounding box', () => {
		expect(partCentre([])).toEqual({ x: 0, y: 0, z: 0 });
		expect(
			partCentre([
				{ position: { x: 0, y: 0, z: 0 } },
				{ position: { x: 2, y: -8, z: 1 } },
				{ position: { x: 1, y: -3, z: 0 } }
			])
		).toEqual({ x: 1, y: -4, z: 0.5 });
	});

	test('flight camera is upright relative to the SOI body, map camera keeps +Y up', () => {
		const m = make();
		m.sync(snap(0, vessel(1, 0, 0, R + 100)));
		expect(m.camera.up.z).toBeCloseTo(1, 9);
		const target = m.scene.children.find((c) => c.type === 'Group')!.position;
		// the camera sits on the outside of the vessel, not below the surface
		expect(m.camera.position.z).toBeGreaterThan(target.z);
		m.setMapView(true);
		m.sync(snap(0, vessel(1, 0, 0, R + 100)));
		expect(m.camera.up.y).toBeCloseTo(1, 9);
	});

	test('part meshes use host shapes; unknown ids fall back to a 1 m box', () => {
		const m = new SceneModel({
			bodies: [{ id: BODY, radius: R }],
			partShapes: new Map([[POD, shapes.get(POD)!]])
		});
		m.sync(snap(0, vessel(1, R + 100, 0, 0)));
		const group = m.scene.children.find((c) => c.type === 'Group')!;
		const [pod, tank] = group.children as Mesh[];
		expect(pod!.geometry).toBeInstanceOf(BoxGeometry);
		expect((pod!.geometry as BoxGeometry).parameters).toMatchObject({
			width: 1,
			height: 2,
			depth: 3
		});
		expect((tank!.geometry as BoxGeometry).parameters).toMatchObject({
			width: 1,
			height: 1,
			depth: 1
		});
		const m2 = make();
		m2.sync(snap(0, vessel(1, R + 100, 0, 0)));
		const tank2 = m2.scene.children.find((c) => c.type === 'Group')!.children[1] as Mesh;
		expect(tank2.geometry).toBeInstanceOf(CylinderGeometry);
		expect(tank2.position.y).toBe(-2);
	});

	test('origin only moves after the vessel travels beyond 10 km', () => {
		const m = make();
		m.sync(snap(0, vessel(1, R, 0, 0)));
		const o1 = m.originPosition;
		m.sync(snap(1, vessel(1, R + 9_000, 0, 0)));
		expect(m.originPosition).toBe(o1);
		m.sync(snap(2, vessel(1, R + 20_000, 0, 0)));
		expect(m.originPosition).not.toBe(o1);
		const group = m.scene.children.find((c) => c.type === 'Group')!;
		expect(Math.abs(group.position.x)).toBeLessThan(1024);
	});

	test('map view hides parts, shows marker and orbit line, and follows the SOI body', () => {
		const m = make();
		m.sync(snap(0, vessel(1, R + 100, 0, 0), vessel(2, R + 200, 0, 0, false)));
		const group = () => m.scene.children.filter((c) => c.type === 'Group');
		expect(group().every((g) => g.visible)).toBe(true);
		expect(m.toggleMapView()).toBe(true);
		m.sync(snap(0, vessel(1, R + 100, 0, 0), vessel(2, R + 200, 0, 0, false)));
		expect(group().every((g) => !g.visible)).toBe(true);
		const lines = m.scene.children.filter((c) => c.type === 'Line2');
		expect(lines.map((l) => l.visible)).toEqual([true, false]); // vessel 2 has no orbit
		const body = m.bodyObject(BODY)!;
		expect(m.camera.position.distanceTo(body.position)).toBeCloseTo(4 * R, 3); // default map distance
		m.orbitCamera({ zoomFactor: 2 });
		m.sync(snap(0, vessel(1, R + 100, 0, 0)));
		expect(m.camera.position.distanceTo(body.position)).toBeCloseTo(8 * R, 3);
	});

	test('removes vessels that vanish from the snapshot and throws on an unknown SOI', () => {
		const m = make();
		m.sync(snap(0, vessel(1, R, 0, 0), vessel(2, R, 50, 0)));
		expect(m.scene.children.filter((c) => c.type === 'Group').length).toBe(2);
		m.sync(snap(1, vessel(2, R, 50, 0)));
		expect(m.scene.children.filter((c) => c.type === 'Group').length).toBe(1);
		const bad = { ...vessel(3, 0, 0, 0), soi: 'stock.nowhere' as BodyId };
		expect(() => m.sync(snap(2, bad))).toThrow(/unknown SOI body "stock.nowhere"/);
	});

	test('active vessel selection drives the camera target', () => {
		const m = make();
		const s = snap(0, vessel(1, R, 0, 0), vessel(2, R + 5_000, 0, 0));
		m.setActiveVessel(id(2));
		m.sync(s);
		const groups = m.scene.children.filter((c) => c.type === 'Group');
		expect(m.camera.position.distanceTo(lookAt(groups[1]!.position, s.vessels[1]!))).toBeCloseTo(
			25,
			6
		);
	});
});

describe('SceneModel environment (plan 019)', () => {
	const rot = (t: number) => ({
		x: 0,
		y: Math.sin((2.9089e-4 * t) / 2),
		z: 0,
		w: Math.cos((2.9089e-4 * t) / 2)
	});

	test('a vessel the sim stood at body-fixed (0, 0) is on the pad whatever the body rotation (plan 025)', () => {
		const m = new SceneModel({ bodies: [{ id: BODY, radius: R }], partShapes: shapes });
		// the body has turned 0.5 rad; the sim places at body-fixed coordinates, so the vessel
		// is at the turned +X axis, 10 m above the ground
		const angle = 0.5;
		const q = { x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) };
		// rotation about +Y by `angle`: (x, 0, 0) -> (x cos, 0, -x sin)
		const at = (h: number) => ({
			x: (R + h) * Math.cos(angle),
			y: 0,
			z: -(R + h) * Math.sin(angle)
		});
		const p = at(10);
		const s = snap(0, vessel(1, p.x, p.y, p.z));
		s.bodies[0]!.rotation = q;
		m.sync(s);
		const pad = m.environment.site.root;
		m.prepareFrame(0.016);
		const vesselGroup = m.scene.children.find((c) => c.type === 'Group')!;
		// the site root is exactly 10 m below the vessel's root origin: right under it
		expect(pad.position.distanceTo(vesselGroup.position)).toBeCloseTo(10, 4);
	});

	test('an explicit launch site is kept and the environment follows the body rotation', () => {
		const m = new SceneModel({
			bodies: [{ id: BODY, radius: R }],
			partShapes: shapes,
			launchSite: { latitude: 0, longitude: 0 }
		});
		const s = snap(100, vessel(1, R + 10, 0, 0));
		s.bodies[0]!.rotation = rot(100);
		m.sync(s);
		m.prepareFrame(0.016);
		const a = m.environment.site.root.position.clone();
		const s2 = snap(200, vessel(1, R + 10, 0, 0));
		s2.bodies[0]!.rotation = rot(200);
		m.sync(s2);
		m.prepareFrame(0.016);
		expect(m.environment.site.root.position.distanceTo(a)).toBeGreaterThan(10); // moved with the body
	});

	test('the camera is kept above the ground', () => {
		const m = make();
		m.sync(snap(0, vessel(1, R + 1, 0, 0)));
		m.orbitCamera({ dPitch: -2, zoomFactor: 0.01 });
		m.sync(snap(0, vessel(1, R + 1, 0, 0)));
		const body = m.bodyObject(BODY)!;
		expect(m.camera.position.distanceTo(body.position) - R).toBeGreaterThanOrEqual(1.19);
	});
});

describe('map view camera', () => {
	test('turning the map camera before its first placement keeps the default distance', () => {
		const m = make();
		m.setMapView(true);
		m.orbitCamera({ dYaw: 0.5, dPitch: 0.3, zoomFactor: 0.2 });
		m.sync(snap(0, vessel(1, R + 100, 0, 0)));
		const body = m.bodyObject(BODY)!;
		expect(m.camera.position.distanceTo(body.position)).toBeCloseTo(4 * R, 3);
	});
});
