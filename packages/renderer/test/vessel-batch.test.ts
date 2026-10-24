/** Plan 367 (ADR 0344): a vessel's static part meshes merge to one mesh per material, and rebuild when they change. */
import { describe, expect, test } from 'bun:test';
import {
	BoxGeometry,
	type BufferGeometry,
	Group,
	Mesh,
	MeshStandardMaterial,
	Object3D,
	Quaternion,
	Vector3
} from 'three';
import { VesselBatch, batchSignature, groupGeometry } from '../src/parts/vessel-batch.ts';

const paint = new MeshStandardMaterial({ color: 0xffffff });
const metal = new MeshStandardMaterial({ color: 0x888888 });

/** A part model like the procedural one: a root with a static mesh of two material slots. */
function part(x: number, flat = false) {
	let geometry: BufferGeometry = new BoxGeometry(1, 1, 1);
	// the box's six faces: the first three on slot 0, the rest on slot 1
	geometry.clearGroups();
	geometry.addGroup(0, 18, 0);
	geometry.addGroup(18, 18, 1);
	// a non-indexed copy keeps the groups in vertex units, the same ranges
	const root = new Object3D();
	root.position.set(x, 0, 0);
	if (flat) geometry = geometry.toNonIndexed();
	const staticMesh = new Mesh(geometry, [paint, metal]);
	root.add(staticMesh);
	return { model: { root, staticMesh, cloned: false } };
}

describe('VesselBatch', () => {
	test('merges many parts into one mesh per material and hides the parts own meshes', () => {
		const group = new Group();
		const parts = new Map([1, 2, 3, 4, 5].map((i) => [i, part(i)] as const));
		const batch = new VesselBatch(group);
		batch.sync(parts);
		expect(group.children.length).toBe(2);
		for (const p of parts.values()) expect(p.model.staticMesh.visible).toBe(false);
		const tris = group.children.reduce(
			(n, m) => n + ((m as Mesh).geometry.getIndex()!.count / 3 || 0),
			0
		);
		expect(tris).toBe(5 * 12);
		// the merged geometry is in the vessel's frame: it spans the parts' positions
		const box = (group.children[0] as Mesh).geometry.boundingSphere!;
		expect(box.center.x).toBeCloseTo(3, 1);
		batch.dispose();
		expect(group.children.length).toBe(0);
		for (const p of parts.values()) expect(p.model.staticMesh.visible).toBe(true);
	});

	test('rebuilds on a part joining, moving or glowing, and not otherwise', () => {
		const group = new Group();
		const parts = new Map([1, 2].map((i) => [i, part(i)] as const));
		const batch = new VesselBatch(group);
		batch.sync(parts);
		const first = [...group.children];
		batch.sync(parts);
		expect(group.children[0]).toBe(first[0]!);
		parts.set(3, part(3));
		batch.sync(parts);
		expect(group.children[0]).not.toBe(first[0]!);
		const before = batchSignature(parts);
		parts.get(2)!.model.root.position.add(new Vector3(0, 1, 0));
		expect(batchSignature(parts)).not.toBe(before);
		parts
			.get(2)!
			.model.root.quaternion.copy(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 1));
		batch.sync(parts);
		// a part that glows has its own materials: it leaves the batch and draws its own mesh
		parts.get(1)!.model.cloned = true;
		batch.sync(parts);
		expect(parts.get(1)!.model.staticMesh.visible).toBe(true);
		expect(parts.get(2)!.model.staticMesh.visible).toBe(false);
		const tris = group.children.reduce((n, m) => n + (m as Mesh).geometry.getIndex()!.count / 3, 0);
		expect(tris).toBe(2 * 12);
	});

	test('a replaced model with the same id and place is merged again, not drawn twice', () => {
		const group = new Group();
		const parts = new Map([[1, part(1)]]);
		const batch = new VesselBatch(group);
		batch.sync(parts);
		const old = parts.get(1)!;
		parts.set(1, part(1));
		batch.sync(parts);
		expect(old.model.staticMesh.visible).toBe(true);
		expect(parts.get(1)!.model.staticMesh.visible).toBe(false);
		expect(group.children.length).toBe(2);
	});
});

describe('groupGeometry', () => {
	test('keeps only the vertices of its range and moves them by the matrix', () => {
		const g = new BoxGeometry(1, 1, 1);
		g.clearGroups();
		g.addGroup(0, 6, 0);
		const m = new Object3D();
		m.position.set(10, 0, 0);
		m.updateMatrix();
		const sub = groupGeometry(g, 0, 6, m.matrix)!;
		expect(sub.getIndex()!.count).toBe(6);
		expect(sub.getAttribute('position').count).toBeLessThanOrEqual(6);
		sub.computeBoundingBox();
		expect(sub.boundingBox!.min.x).toBeGreaterThanOrEqual(9.4);
	});
});

describe('non-indexed parts (what the procedural models are)', () => {
	test('merge the same way', () => {
		const group = new Group();
		const parts = new Map([1, 2, 3].map((i) => [i, part(i, true)] as const));
		new VesselBatch(group).sync(parts);
		expect(group.children.length).toBe(2);
		const verts = group.children.reduce(
			(n, m) => n + (m as Mesh).geometry.getAttribute('position').count,
			0
		);
		expect(verts).toBe(3 * 36);
		for (const p of parts.values()) expect(p.model.staticMesh.visible).toBe(false);
	});
});
