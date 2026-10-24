/** Plan 414 (ADR 0371): vegetation with two levels of detail splits by distance and keeps every instance. */
import { describe, expect, test } from 'bun:test';
import { BufferGeometry, Color, Matrix4, MeshStandardMaterial } from 'three';
import { LOD_RESORT_DISTANCE, LodInstances, splitNear } from '../src/site-lod.ts';
import {
	pineGeometry,
	pineGeometryLow,
	roundTreeGeometry,
	roundTreeGeometryLow,
	bushGeometry,
	bushGeometryLow,
	tuftGeometry
} from '../src/site-vegetation.ts';

const tris = (g: BufferGeometry): number =>
	g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;

describe('the coarse geometries', () => {
	test('are a fraction of the full ones', () => {
		expect(tris(roundTreeGeometryLow())).toBeLessThan(tris(roundTreeGeometry()) / 2);
		expect(tris(pineGeometryLow())).toBeLessThan(tris(pineGeometry()) / 1.8);
		expect(tris(bushGeometryLow())).toBeLessThan(tris(bushGeometry()) / 5);
		expect(tris(tuftGeometry(true))).toBeLessThan(tris(tuftGeometry()) / 4);
	});
	test('keep the attributes of the full ones, so they share a pipeline', () => {
		const names = (g: BufferGeometry) => Object.keys(g.attributes).sort().join();
		expect(names(roundTreeGeometryLow())).toBe(names(roundTreeGeometry()));
		expect(names(pineGeometryLow())).toBe(names(pineGeometry()));
		expect(names(bushGeometryLow())).toBe(names(bushGeometry()));
		expect(names(tuftGeometry(true))).toBe(names(tuftGeometry()));
	});
});

describe('the near and far split', () => {
	test('is by distance on the ground, and every instance is in one list', () => {
		const xz = [0, 0, 50, 0, 100, 0, 0, 200, -80, 10];
		const { near, far } = splitNear(xz, { x: 0, z: 0 }, 90);
		expect(near).toEqual([0, 1, 4]);
		expect(far).toEqual([2, 3]);
		expect(near.length + far.length).toBe(xz.length / 2);
	});
});

describe('LodInstances', () => {
	const make = () => {
		const lod = new LodInstances(
			new BufferGeometry(),
			new BufferGeometry(),
			new MeshStandardMaterial(),
			4,
			false,
			90
		);
		for (const x of [10, 60, 120, 300])
			lod.add(new Matrix4().makeTranslation(x, 0, 0), new Color(1, 1, 1), x, 0);
		return lod;
	};
	test('sorts into the two meshes for the camera and re-sorts only after it has moved', () => {
		const lod = make();
		lod.update({ x: 0, z: 0 });
		expect([lod.near.count, lod.far.count]).toEqual([2, 2]);
		lod.update({ x: LOD_RESORT_DISTANCE - 1, z: 0 });
		expect([lod.near.count, lod.far.count]).toEqual([2, 2]);
		lod.update({ x: 200, z: 0 });
		expect([lod.near.count, lod.far.count]).toEqual([1, 3]); // only 120 is within 90 m of 200
		lod.show(true);
		expect(lod.near.visible && lod.far.visible).toBe(true);
		lod.show(false);
		expect(lod.near.visible || lod.far.visible).toBe(false);
	});
	test("writes each instance's matrix where it was put", () => {
		const lod = make();
		lod.update({ x: 0, z: 0 });
		const m = lod.near.instanceMatrix.array as Float32Array;
		expect(m[12]).toBe(10);
		expect(m[16 + 12]).toBe(60);
	});
});
