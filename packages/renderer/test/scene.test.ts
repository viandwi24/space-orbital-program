import { describe, expect, test } from 'bun:test';
import type { BodyId, EntityId, PartId, Snapshot, VesselSnapshot } from '@orbital/core';
import { BoxGeometry, CylinderGeometry, Mesh } from 'three';
import { SceneModel, type PartShape } from '../src/scene.ts';

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
		const body = m.scene.children.find((c) => c.type === 'Mesh' && c.scale.x === R) as Mesh;
		// origin snapped to the 1024 m grid near the vessel, so everything is small
		expect(Math.abs(group.position.x)).toBeLessThan(1024);
		expect(group.position.x - body.position.x).toBeCloseTo(R + 100, 6);
		expect(m.camera.position.distanceTo(group.position)).toBeCloseTo(25, 6);
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
		const body = m.scene.children.find((c) => c.type === 'Mesh' && c.scale.x === R)!;
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
		expect(m.camera.position.distanceTo(groups[1]!.position)).toBeCloseTo(25, 6);
	});
});
