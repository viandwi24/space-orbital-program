/** Plan 113 / ADR 0118: the map's system scope, the highlight and the orbit layer, without a GPU. */
import { describe, expect, test } from 'bun:test';
import type { BodyId, EntityId, PartId, Snapshot, Vec3, VesselSnapshot } from '@orbital/core';
import type { Line2 } from 'three/addons/lines/Line2.js';
import type { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { MAP_HIGHLIGHT_COLOR, SceneModel, type PartShape } from '../src/scene.ts';

const HOME = 'stock.home' as BodyId;
const MOON = 'stock.cinder' as BodyId;
const POD = 'stock.pod' as PartId;
const q0 = { x: 0, y: 0, z: 0, w: 1 };
const MOON_A = 11.8e6;

const config = {
	bodies: [
		{ id: HOME, radius: 600_000, mass: 5.9e24 },
		{
			id: MOON,
			radius: 190_000,
			mass: 8.7e22,
			parent: HOME,
			orbit: { a: MOON_A, e: 0.1, i: 0, raan: 0, argp: 0, m0: 1, epoch: 0 }
		}
	],
	partShapes: new Map<string, PartShape>([[POD, { kind: 'box', size: { x: 1, y: 2, z: 3 } }]])
};
const vessel = (id: number, x: number): VesselSnapshot => ({
	id: id as EntityId,
	mode: 'on-rails',
	soi: HOME,
	position: { x, y: 0, z: 0 },
	velocity: { x: 0, y: 0, z: 2_300 },
	orientation: q0,
	orbit: { a: x, e: 0, i: 0, raan: 0, argp: 0, m0: 0, epoch: 0 },
	parts: [
		{
			id: (id + 100) as EntityId,
			definition: POD,
			position: { x: 0, y: 0, z: 0 },
			orientation: q0,
			modules: {}
		}
	]
});
const snapshot = (): Snapshot => ({
	t: 0,
	bodies: [
		{ id: HOME, position: { x: 0, y: 0, z: 0 }, rotation: q0 },
		{ id: MOON, position: { x: MOON_A, y: 0, z: 0 }, rotation: q0 }
	],
	vessels: [vessel(1, 700_000), vessel(2, 900_000)]
});
const at = (o: { position: { x: number; y: number; z: number } }): Vec3 => ({
	x: o.position.x,
	y: o.position.y,
	z: o.position.z
});
const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const lines = (m: SceneModel): Line2[] =>
	m.scene.children.filter((c) => c.type === 'Line2' && c.visible) as Line2[];

describe('map scope, highlight and layers (plan 113)', () => {
	test('the system scope looks at the root body from three moon apoapses', () => {
		const m = new SceneModel(config);
		m.setActiveVessel(1 as EntityId);
		m.setMapView(true);
		m.setMapScope('system');
		m.sync(snapshot());
		const home = at(m.bodyObject(HOME)!);
		expect(dist(at(m.camera), home)).toBeCloseTo(3 * MOON_A * 1.1, -3);
		// the vessel scope goes back to the vessel's sphere at four body radii
		m.setMapScope('vessel');
		m.sync(snapshot());
		expect(dist(at(m.camera), at(m.bodyObject(HOME)!))).toBeCloseTo(4 * 600_000, -2);
	});

	test('the highlight colours the chosen vessel orbit, the layer hides every orbit', () => {
		const m = new SceneModel(config);
		m.setMapView(true);
		m.setMapScope('system');
		m.setMapHighlight('vessel:2');
		m.sync(snapshot());
		const colours = lines(m).map((l) => (l.material as LineMaterial).color.getHex());
		expect(colours.filter((c) => c === MAP_HIGHLIGHT_COLOR)).toHaveLength(1);
		expect(lines(m)).toHaveLength(3); // two vessels and the moon
		m.setMapHighlight('body:stock.cinder');
		m.sync(snapshot());
		expect(
			lines(m).filter((l) => (l.material as LineMaterial).color.getHex() === MAP_HIGHLIGHT_COLOR)
		).toHaveLength(1);
		m.setMapLayers({ orbits: false });
		m.sync(snapshot());
		expect(lines(m)).toHaveLength(0);
	});
});
