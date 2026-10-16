/** Plan 044 / ADR 0054: the moon pass without a GPU - patch geometry, shader twin, the scene with two bodies. */
import { describe, expect, test } from 'bun:test';
import {
	MOON_SHAPE,
	moonHeight,
	type BodyId,
	type EntityId,
	type PartId,
	type Snapshot,
	type Vec3,
	type VesselSnapshot
} from '@orbital/core';
import { Mesh } from 'three';
import { MOON_PATCHES, MOON_SKIRT_DROP, patchVertex } from '../src/moon-model.ts';
import { MoonPass, patchGrid } from '../src/moon.ts';
import { moonHeightGLSL } from '../src/shaders/moon.glsl.ts';
import { SceneModel, type PartShape } from '../src/scene.ts';
import { patchFrame } from '../src/terrain-patch.ts';
import { length, normalize, scale, sub } from '../src/vec.ts';

const RADIUS = 190_000;
const HOME = 'stock.home' as BodyId;
const MOON = 'stock.cinder' as BodyId;
const POD = 'stock.pod' as PartId;
const q0 = { x: 0, y: 0, z: 0, w: 1 };

describe('patch vertices', () => {
	test('the local vertex formula equals the direct difference of two large vectors', () => {
		const centre = normalize({ x: 0.3, y: 0.5, z: 0.81 });
		const frame = patchFrame(centre, RADIUS, MOON_PATCHES.fine.span);
		const hc = moonHeight(frame.centre, RADIUS);
		let worst = 0;
		for (const [u, v] of [
			[0, 0],
			[1, 1],
			[-1, 0.5],
			[0.3, -0.9]
		] as const) {
			const n = normalize({
				x: frame.centre.x + frame.halfTan * (u * frame.east.x + v * frame.north.x),
				y: frame.centre.y + frame.halfTan * (u * frame.east.y + v * frame.north.y),
				z: frame.centre.z + frame.halfTan * (u * frame.east.z + v * frame.north.z)
			});
			const h = moonHeight(n, RADIUS);
			const direct = sub(scale(n, RADIUS + h), scale(frame.centre, RADIUS + hc));
			const local = patchVertex(
				frame.centre,
				frame.east,
				frame.north,
				frame.halfTan,
				RADIUS,
				u,
				v,
				h,
				hc
			);
			worst = Math.max(worst, length(sub(direct, local)));
		}
		expect(worst).toBeLessThan(1e-6);
	});

	test('the grid has a skirt ring of flagged vertices and valid triangles', () => {
		const g = patchGrid(8);
		const side = 8 + 3;
		const pos = g.getAttribute('position');
		expect(pos.count).toBe(side * side);
		let skirt = 0;
		for (let i = 0; i < pos.count; i++) {
			if (pos.getZ(i) === 1) skirt++;
			expect(Math.abs(pos.getX(i))).toBeLessThanOrEqual(1);
			expect(Math.abs(pos.getY(i))).toBeLessThanOrEqual(1);
		}
		expect(skirt).toBe(side * side - (side - 2) * (side - 2));
		const index = g.getIndex()!;
		expect(index.count).toBe((side - 1) * (side - 1) * 6);
		for (let i = 0; i < index.count; i++) expect(index.getX(i)).toBeLessThan(pos.count);
		expect(MOON_SKIRT_DROP).toBeGreaterThan(0);
	});
});

describe('the GLSL twin carries the constants of the TypeScript height function', () => {
	test('every scale, salt and profile constant of MOON_SHAPE is in the source', () => {
		for (const s of MOON_SHAPE.scales) {
			expect(moonHeightGLSL).toContain(
				`craterLayer(q, ${Number.isInteger(s.cellKm) ? `${s.cellKm}.0` : s.cellKm}`
			);
			expect(moonHeightGLSL).toContain(`, ${s.salt});`);
		}
		for (const k of [MOON_SHAPE.depth, MOON_SHAPE.rim, MOON_SHAPE.rimWidth, MOON_SHAPE.reach]) {
			expect(moonHeightGLSL).toContain(String(k));
		}
		expect(moonHeightGLSL).toContain(String(MOON_SHAPE.base));
		expect(moonHeightGLSL).toContain(String(MOON_SHAPE.plainTo));
	});
});

describe('MoonPass', () => {
	test('far away it asks for nothing; near the ground it wants the patches under the camera', () => {
		const moon = new MoonPass('moon', RADIUS);
		const far: Vec3 = { x: 5e7, y: 0, z: 0 };
		moon.update(far);
		const meshes = moon.root.children.filter((c): c is Mesh => c instanceof Mesh);
		expect(meshes).toHaveLength(3);
		expect(meshes.slice(1).every((m) => !m.visible)).toBe(true);
		moon.update({ x: RADIUS + 3_500 + 20, y: 0, z: 0 }); // 20 m above the plain
		// not baked yet (needs a context), so the meshes stay hidden until `bake`
		expect(meshes.slice(1).every((m) => !m.visible)).toBe(true);
		expect(moon.groundHeight({ x: 1, y: 0, z: 0 })).toBe(MOON_SHAPE.base);
		moon.dispose();
	});
});

describe('a scene with the home planet and a moon', () => {
	const shapes = new Map<string, PartShape>([[POD, { kind: 'box', size: { x: 1, y: 2, z: 3 } }]]);
	const config = {
		bodies: [
			{
				id: HOME,
				radius: 600_000,
				mass: 5.9e24,
				atmosphere: { scaleHeight: 5_600, surfacePressure: 101_325, height: 70_000 }
			},
			{
				id: MOON,
				radius: RADIUS,
				mass: 8.7e22,
				parent: HOME,
				orbit: { a: 11.8e6, e: 0, i: 0, raan: 0, argp: 0, m0: 1, epoch: 0 }
			}
		],
		partShapes: shapes
	};
	const vessel = (position: Vec3): VesselSnapshot => ({
		id: 1 as EntityId,
		mode: 'flight',
		soi: MOON,
		position,
		velocity: { x: 0, y: 0, z: 0 },
		orientation: q0,
		parts: [
			{
				id: 2 as EntityId,
				definition: POD,
				position: { x: 0, y: 0, z: 0 },
				orientation: q0,
				modules: {}
			}
		]
	});
	const snapshot = (position: Vec3): Snapshot => ({
		t: 0,
		bodies: [
			{ id: HOME, position: { x: 0, y: 0, z: 0 }, rotation: q0 },
			{ id: MOON, position: { x: 6_372_971, y: 0, z: -9_931_024 }, rotation: q0 }
		],
		vessels: [vessel(position)]
	});

	test('an airless second body gets the moon pass, not a plain sphere', () => {
		const m = new SceneModel(config);
		const holder = m.bodyObject(MOON)!;
		expect(holder.children.some((c) => c.name === `moon:${MOON}`)).toBe(true);
		expect(m.bodyObject(HOME)!.children).toHaveLength(0);
	});

	test('a vessel in the moon sphere is placed at the moon and the camera stays above the cratered ground', () => {
		const m = new SceneModel(config);
		// the vessel sits on the plain, 3 500 m above the reference sphere, and the camera starts below it
		const up = { x: RADIUS + MOON_SHAPE.base + 5, y: 0, z: 0 };
		m.sync(snapshot(up));
		m.setFlightRig({ yaw: 0, pitch: -1.4, distance: 25 });
		m.sync(snapshot(up));
		const holder = m.bodyObject(MOON)!;
		const rel = sub(
			{ x: m.camera.position.x, y: m.camera.position.y, z: m.camera.position.z },
			{ x: holder.position.x, y: holder.position.y, z: holder.position.z }
		);
		expect(length(rel)).toBeGreaterThan(RADIUS + MOON_SHAPE.base);
	});

	test('the map view shows the moon orbit and its sphere of influence, and the focus can be set', () => {
		const m = new SceneModel(config);
		m.setMapView(true);
		m.sync(snapshot({ x: RADIUS + 3_505, y: 0, z: 0 }));
		const lines = m.scene.children.filter((c) => c.type === 'Line2');
		const spheres = m.scene.children.filter(
			(c) => c instanceof Mesh && (c.material as { wireframe?: boolean }).wireframe
		);
		expect(lines.length).toBeGreaterThanOrEqual(1);
		expect(spheres).toHaveLength(1);
		expect(spheres[0]!.visible).toBe(true);
		m.setMapFocus(HOME);
		m.sync(snapshot({ x: RADIUS + 3_505, y: 0, z: 0 }));
		expect(m.mapFocusBody).toBe(HOME);
		expect(m.bodyIds).toEqual([HOME, MOON]);
		// the flight view hides the furniture
		m.setMapView(false);
		m.sync(snapshot({ x: RADIUS + 3_505, y: 0, z: 0 }));
		expect(spheres[0]!.visible).toBe(false);
	});

	test('a predicted path is drawn only in map view and clears with null', () => {
		const m = new SceneModel(config);
		m.setMapView(true);
		const points = [
			{ x: 0, y: 0, z: 0 },
			{ x: 1e6, y: 0, z: 0 },
			{ x: 2e6, y: 1e5, z: 0 }
		];
		m.setMapPath([{ body: HOME, offset: { x: 0, y: 0, z: 0 }, points }]);
		m.sync(snapshot({ x: RADIUS + 3_505, y: 0, z: 0 }));
		const visible = () => m.scene.children.filter((c) => c.type === 'Line2' && c.visible).length;
		const withPath = visible();
		m.setMapPath(null);
		m.sync(snapshot({ x: RADIUS + 3_505, y: 0, z: 0 }));
		expect(visible()).toBe(withPath - 1);
	});
});
