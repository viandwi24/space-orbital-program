/** Plan 398 (ADR 0371): the patch maths of the mesh terrain against the sphere and the terrain height. */
import { describe, expect, test } from 'bun:test';
import { createTerrainField } from '@orbital/core';
import {
	INSTANCE_FLOATS,
	MESH_GRID,
	morphGrid,
	patchFrame,
	patchMorph,
	patchVertex,
	writeInstances
} from '../src/terrain-mesh-model.ts';
import { dirOf, nodeAt, selectNodes, type Vec3 } from '../src/terrain-quadtree.ts';

const R = 600_000;
const flat = (): number => 0;
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);

describe('patchVertex', () => {
	test('lies on the sphere of its height and on the direction of the face coordinates', () => {
		for (const node of [
			{ face: 4, level: 10, x: 300, y: 700 },
			{ face: 0, level: 3, x: 1, y: 2 },
			{ face: 2, level: 14, x: 8191, y: 8191 }
		]) {
			const p = patchFrame(node, R);
			for (const [gi, gj] of [
				[0, 0],
				[32, 0],
				[16, 16],
				[5, 27]
			] as const) {
				const h = 123.4;
				const v = patchVertex(p, gi, gj, R, () => h);
				const pos: Vec3 = [
					p.centre[0] + v.offset[0],
					p.centre[1] + v.offset[1],
					p.centre[2] + v.offset[2]
				];
				expect(len(pos)).toBeCloseTo(R + h, 3);
				const cells = 2 ** node.level;
				const u = ((node.x + gi / MESH_GRID) / cells) * 2 - 1;
				const w = ((node.y + gj / MESH_GRID) / cells) * 2 - 1;
				const want = dirOf(node.face, u, w);
				expect(Math.hypot(v.dir[0] - want[0], v.dir[1] - want[1], v.dir[2] - want[2])).toBeLessThan(
					1e-12
				);
			}
		}
	});

	test('a vertex is exact to a millimetre in float32 where a direct sum is not', () => {
		const p = patchFrame({ face: 4, level: 15, x: 16000, y: 16000 }, R);
		const v = patchVertex(p, 7, 9, R, () => 0);
		// the offset itself is small: float32 holds it to far better than a millimetre
		const f32 = [...v.offset].map((x) => Math.fround(x));
		expect(Math.abs(f32[0]! - v.offset[0])).toBeLessThan(1e-3);
		expect(len(v.offset)).toBeLessThan(80);
		// the same point as a body-centred float32 position is off by centimetres
		const abs = [0, 1, 2].map((i) => p.centre[i]! + v.offset[i]!);
		const direct = abs.map((x) => Math.fround(x));
		const worst = Math.max(...abs.map((x, i) => Math.abs(x - direct[i]!)));
		expect(worst).toBeGreaterThan(1e-3);
	});

	test("the heights of the vertices are the sim's terrain heights within 0.05 m", () => {
		const field = createTerrainField({ radius: R, seed: 7 });
		const camera = scale([...dirOf(4, 0.0, 0.0)] as Vec3);
		const nodes = selectNodes(camera, {
			radius: R,
			maxLevel: 14,
			range0: 150,
			minHeight: -2_000,
			maxHeight: 9_000,
			heightAt: (dir) => field.heightAt({ x: dir[0], y: dir[1], z: dir[2] }),
			maxSlope: 1
		});
		expect(nodes.length).toBeGreaterThan(50);
		let checked = 0;
		for (const node of nodes.slice(0, 40)) {
			const p = patchFrame(node, R);
			for (const [gi, gj] of [
				[0, 0],
				[16, 16],
				[32, 32],
				[3, 29]
			] as const) {
				const v = patchVertex(p, gi, gj, R, (dir) =>
					field.heightAt({ x: dir[0], y: dir[1], z: dir[2] })
				);
				const probe = field.heightAt({ x: v.dir[0], y: v.dir[1], z: v.dir[2] });
				expect(Math.abs(v.height - probe)).toBeLessThan(0.05);
				checked++;
			}
		}
		expect(checked).toBe(160);
	});
});

function scale(a: Vec3): Vec3 {
	return [a[0] * (R + 2), a[1] * (R + 2), a[2] * (R + 2)];
}

describe('the morph', () => {
	test('slides odd grid positions to the even one, and leaves even ones', () => {
		expect(morphGrid(5, 0)).toBe(5);
		expect(morphGrid(5, 1)).toBe(4);
		expect(morphGrid(5, 0.5)).toBe(4.5);
		expect(morphGrid(6, 1)).toBe(6);
		expect(morphGrid(32, 1)).toBe(32);
	});
	test("is 0 well inside a patch's range and 1 at it", () => {
		const o = { maxLevel: 14, range0: 150 };
		expect(patchMorph(10, 14, o)).toBe(0);
		expect(patchMorph(150, 14, o)).toBe(1);
		expect(patchMorph(300, 13, o)).toBe(1);
		expect(patchMorph(130, 14, o)).toBeGreaterThan(0);
	});
});

describe('writeInstances', () => {
	test('writes four vec4 a patch, the centre relative to the camera, and covers the sphere', () => {
		const camera = scale([...dirOf(2, 0.3, -0.2)] as Vec3);
		const o = {
			radius: R,
			maxLevel: 14,
			range0: 150,
			minHeight: -2_000,
			maxHeight: 9_000,
			heightAt: () => 0,
			maxSlope: 1
		};
		const { data, count } = writeInstances(camera, o);
		expect(count).toBeGreaterThan(50);
		expect(count).toBeLessThan(2000);
		expect(data.length).toBeGreaterThanOrEqual(count * INSTANCE_FLOATS);
		// the nearest patch is the finest and within a few hundred metres of the camera
		let nearest = Infinity;
		let level = -1;
		for (let i = 0; i < count; i++) {
			const k = i * INSTANCE_FLOATS;
			const d = Math.hypot(data[k]!, data[k + 1]!, data[k + 2]!);
			if (d < nearest) {
				nearest = d;
				level = data[k + 15]!;
			}
		}
		expect(nearest).toBeLessThan(400);
		expect(level).toBe(14);
		// every direction is in one of the patches
		for (const dir of [dirOf(0, 0, 0), dirOf(3, -0.9, 0.8), dirOf(5, 0.5, 0.5)]) {
			const hit = selectNodes(camera, o).filter((n) => {
				const m = nodeAt(dir, n.level);
				return m.face === n.face && m.x === n.x && m.y === n.y;
			});
			expect(hit.length).toBe(1);
		}
	});
});
