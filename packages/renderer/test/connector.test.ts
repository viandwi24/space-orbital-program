/** Plan 041 / ADR 0071 and 0072: connector stubs, bars between link ends, the wing model, tilted parts. */
import { describe, expect, test } from 'bun:test';
import type { BodyId, EntityId, PartId, Snapshot, VesselSnapshot } from '@orbital/core';
import { Box3, Mesh, Object3D, Quaternion, Vector3 } from 'three';
import { ConnectorBars, connectorRadius, placeBar } from '../src/parts/connector.ts';
import { PartModelFactory } from '../src/parts/factory.ts';
import { PRESETS, detailOf } from '../src/presets.ts';
import { SceneModel } from '../src/scene.ts';
import { HighlightMaterials } from '../src/vab/highlight.ts';
import { PartLayer } from '../src/vab/part-layer.ts';
import { applyPartTurn, type VabScene } from '../src/vab/scene-model.ts';
import { stockMaps } from './stock-fixture.ts';

const maps = stockMaps();
const factory = (quality: 'high' | 'low' = 'high') =>
	new PartModelFactory({
		shapes: maps.shapes,
		visuals: maps.visuals,
		attach: maps.attach,
		detail: detailOf(PRESETS[quality])
	});

/** Both ends of a bar mesh in the world: its unit cylinder runs from y = -0.5 to +0.5. */
function ends(mesh: Mesh): [Vector3, Vector3] {
	mesh.updateMatrixWorld(true);
	return [
		new Vector3(0, -0.5, 0).applyMatrix4(mesh.matrixWorld),
		new Vector3(0, 0.5, 0).applyMatrix4(mesh.matrixWorld)
	];
}

describe('connector stubs and the wing (ADR 0071, 0072)', () => {
	for (const quality of ['high', 'low'] as const) {
		test(`${quality}: the strut and fuel-line stubs sit inside their shape, within the triangle budget`, () => {
			const f = factory(quality);
			for (const id of ['stock.strut', 'stock.fuel-line']) {
				const shape = maps.shapes.get(id)!;
				if (shape.kind !== 'cylinder') throw new Error(`${id} should be a cylinder`);
				const model = f.create(id);
				model.root.updateMatrixWorld(true);
				const box = new Box3().setFromObject(model.root);
				expect(box.max.y - box.min.y, id).toBeLessThanOrEqual(shape.height + 0.002);
				expect(Math.max(box.max.x, box.max.z), id).toBeLessThanOrEqual(shape.radius * 1.002);
				expect(model.triangles, id).toBeGreaterThanOrEqual(48);
				expect(model.triangles, id).toBeLessThanOrEqual(600);
				model.dispose();
			}
			f.dispose();
		});
		test(`${quality}: the wing fills its box from the root node to the tip, under its triangle budget`, () => {
			const f = factory(quality);
			const shape = maps.shapes.get('stock.wing')!;
			if (shape.kind !== 'box') throw new Error('the wing should be a box');
			const model = f.create('stock.wing');
			model.root.updateMatrixWorld(true);
			const box = new Box3().setFromObject(model.root);
			expect(box.min.x).toBeCloseTo(-shape.size.x / 2, 2);
			expect(box.max.x).toBeCloseTo(shape.size.x / 2, 2);
			expect(box.max.y - box.min.y).toBeLessThanOrEqual(shape.size.y + 0.002);
			expect(box.max.y - box.min.y).toBeGreaterThan(shape.size.y * 0.95);
			expect(box.max.z - box.min.z).toBeLessThanOrEqual(shape.size.z * 1.8 + 0.002);
			expect(
				Math.abs(box.min.x - maps.byId.get('stock.wing')!.attach!.radial!.pos[0])
			).toBeLessThan(0.002);
			expect(model.triangles).toBeGreaterThanOrEqual(60);
			expect(model.triangles).toBeLessThanOrEqual(4_000);
			model.dispose();
			f.dispose();
		});
	}
});

describe('bars between the ends of a link', () => {
	test('a bar spans exactly from the part to the far end, for any direction', () => {
		const from = [1, 2, 3] as const;
		for (const to of [
			[1, 6, 3],
			[4, -1, 7],
			[-2, 2, 3],
			[1, 2, 3.5]
		] as const) {
			const mesh = new Mesh();
			placeBar(mesh, from, to, 0.04);
			const [a, b] = ends(mesh);
			expect(a.distanceTo(new Vector3(...from)) + b.distanceTo(new Vector3(...to))).toBeLessThan(
				1e-5
			);
			expect(mesh.scale.x).toBeCloseTo(0.04, 12);
			expect(mesh.scale.y).toBeCloseTo(new Vector3(...to).distanceTo(new Vector3(...from)), 12);
		}
		const same = new Mesh();
		placeBar(same, from, from, 0.04);
		expect(same.visible).toBe(false);
	});

	test('connector kinds draw bars of their own width; other parts draw none', () => {
		expect(connectorRadius(maps.visuals.get('stock.strut'))).toBeGreaterThan(0);
		expect(connectorRadius(maps.visuals.get('stock.fuel-line'))).toBeGreaterThan(
			connectorRadius(maps.visuals.get('stock.strut'))!
		);
		expect(connectorRadius(maps.visuals.get('stock.fin'))).toBeUndefined();
		expect(connectorRadius(undefined)).toBeUndefined();
	});

	test('ConnectorBars keeps one mesh per bar, moves it, drops it, and leaves its parent alone when empty', () => {
		const f = factory();
		const parent = new Object3D();
		const bars = new ConnectorBars(f, maps.visuals, parent);
		expect(parent.children).toHaveLength(0);
		bars.sync([
			{ key: 'a', definition: 'stock.strut', from: [0, 0, 0], to: [0, 3, 0] },
			{ key: 'b', definition: 'stock.fuel-line', from: [1, 0, 0], to: [1, -2, 0] },
			{ key: 'c', definition: 'stock.fin', from: [0, 0, 0], to: [5, 5, 5] }
		]);
		expect(parent.children).toHaveLength(1);
		expect(bars.count).toBe(2); // the fin names no bar
		const first = bars.root.children[0] as Mesh;
		bars.sync([{ key: 'a', definition: 'stock.strut', from: [0, 0, 0], to: [0, 4, 0] }]);
		expect(bars.count).toBe(1);
		expect(bars.root.children[0]).toBe(first);
		expect(first.scale.y).toBeCloseTo(4, 12);
		expect(first.userData.key).toBe('a');
		bars.sync([]);
		expect(parent.children).toHaveLength(0);
		bars.dispose();
		f.dispose();
	});
});

const BODY = 'stock.home' as BodyId;
const R = 600_000;
const OMEGA = (2 * Math.PI) / 21_600;
const id = (n: number) => n as EntityId;
const q0 = { x: 0, y: 0, z: 0, w: 1 };

describe('connectors in the flight scene', () => {
	const make = () =>
		new SceneModel({
			bodies: [
				{
					id: BODY,
					radius: R,
					atmosphere: { scaleHeight: 5600, surfacePressure: 101_325, height: 70_000 }
				}
			],
			partShapes: maps.shapes,
			partVisuals: maps.visuals,
			partAttach: maps.attach,
			preset: 'high',
			launchSite: { latitude: 0, longitude: 0 }
		});
	const vessel = (parts: VesselSnapshot['parts']): VesselSnapshot => ({
		id: id(1),
		mode: 'flight',
		soi: BODY,
		position: { x: R + 2, y: 0, z: 0 },
		velocity: { x: 0, y: 0, z: -OMEGA * R },
		orientation: q0,
		parts
	});
	const snap = (v: VesselSnapshot): Snapshot => ({
		t: 0,
		bodies: [{ id: BODY, position: { x: 0, y: 0, z: 0 }, rotation: q0 }],
		vessels: [v]
	});
	const strut = (link?: { peer: EntityId; point: { x: number; y: number; z: number } }) => ({
		id: id(3),
		definition: 'stock.strut' as PartId,
		position: { x: 0.7, y: 1, z: 0 },
		orientation: q0,
		modules: {},
		...(link ? { link } : {})
	});
	const tank = {
		id: id(2),
		definition: 'stock.tank-small' as PartId,
		position: { x: 0, y: 0, z: 0 },
		orientation: q0,
		modules: {}
	};

	test('a part with a link gets a bar from its position to the link point; a cut link loses it', () => {
		const m = make();
		m.sync(snap(vessel([tank, strut({ peer: id(2), point: { x: 0.625, y: -1, z: 0 } })])));
		const group = m.scene.children.find((c) => c.name.startsWith('vessel-'))!;
		const bars = group.children.find((c) => c.name === 'connectors')!;
		expect(bars.children).toHaveLength(1);
		const [a, b] = ends(bars.children[0] as Mesh);
		expect(a.distanceTo(new Vector3(0.7, 1, 0))).toBeLessThan(1e-5);
		expect(b.distanceTo(new Vector3(0.625, -1, 0))).toBeLessThan(1e-5);
		m.sync(snap(vessel([tank, strut()])));
		expect(group.children.some((c) => c.name === 'connectors')).toBe(false);
		m.dispose();
	});
});

describe('connectors and tilted parts in the VAB layer', () => {
	test('links become bars in their group; a part with a rotation is turned by it, not by its yaw', () => {
		const f = factory();
		const layer = new PartLayer(f, new HighlightMaterials(), maps.visuals);
		const half = Math.SQRT1_2;
		const scene: VabScene = {
			groups: [{ id: 'main', x: 0, z: 0 }],
			nodes: [],
			parts: [
				{
					key: '0',
					definition: 'stock.tank-small',
					position: [0, 0, 0],
					group: 'main',
					role: 'solid'
				},
				{
					key: '1',
					definition: 'stock.wing',
					position: [1, 0, 0],
					yaw: 1,
					rotation: [0, 0, half, half],
					group: 'main',
					role: 'solid'
				},
				{ key: '2', definition: 'stock.strut', position: [0.7, 1, 0], group: 'main', role: 'solid' }
			],
			links: [
				{
					key: '2',
					group: 'main',
					definition: 'stock.strut',
					from: [0.7, 1, 0],
					to: [0.625, -1, 0]
				}
			]
		};
		layer.sync(scene);
		const group = layer.groups.get('main')!;
		expect(group.bars.count).toBe(1);
		expect(layer.barRoots).toHaveLength(1);
		const [a, b] = ends(group.bars.root.children[0] as Mesh);
		expect(a.distanceTo(new Vector3(0.7, 1, 0))).toBeLessThan(1e-5);
		expect(b.distanceTo(new Vector3(0.625, -1, 0))).toBeLessThan(1e-5);
		// The wing is turned a quarter turn about Z: its +Y axis points along -X.
		const wing = layer.parts.get('1')!.model.root;
		const axis = new Vector3(0, 1, 0).applyQuaternion(wing.quaternion);
		expect(axis.x).toBeCloseTo(-1, 6);
		expect(axis.y).toBeCloseTo(0, 6);
		layer.sync({ ...scene, links: [] });
		expect(group.bars.count).toBe(0);
		layer.dispose();
		f.dispose();
	});

	test('applyPartTurn: yaw about the vertical without a rotation, the quaternion with one', () => {
		const a = new Object3D();
		applyPartTurn(a, { yaw: 0.5 });
		expect(new Quaternion().setFromEuler(a.rotation).y).toBeCloseTo(Math.sin(0.25), 12);
		const b = new Object3D();
		applyPartTurn(b, { yaw: 0.5, rotation: [0, 0, 0, 1] });
		expect(b.quaternion.w).toBe(1);
	});

	test('applyPartTurn: a part whose tilt is reset loses the old tilt (plan 279)', () => {
		const a = new Object3D();
		applyPartTurn(a, { yaw: 0, rotation: [Math.sin(0.4), 0, 0, Math.cos(0.4)] });
		applyPartTurn(a, { yaw: 0.3 });
		expect(a.rotation.x).toBe(0);
		expect(a.rotation.z).toBe(0);
		expect(a.rotation.y).toBeCloseTo(0.3, 12);
	});
});
