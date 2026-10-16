import { describe, expect, it } from 'bun:test';
import { Box3, Mesh } from 'three';
import {
	HANGAR,
	createHangar,
	floorBrightness,
	hazard,
	plateHeight,
	wallBrightness,
	wallHeight
} from '../src/vab/hangar.ts';

describe('hangar', () => {
	it('builds without a canvas, inside the room, with the platform lit by an accent ring', () => {
		const h = createHangar({ dust: 50, textureSize: 64 });
		h.root.remove(h.shafts); // the light cones deliberately start in the walls
		const box = new Box3().setFromObject(h.root);
		expect(box.min.x).toBeGreaterThanOrEqual(-HANGAR.half - 1);
		expect(box.max.x).toBeLessThanOrEqual(HANGAR.half + 1);
		expect(box.max.y).toBeLessThanOrEqual(HANGAR.height + 0.5);
		expect(box.min.y).toBeGreaterThanOrEqual(-0.5);
		let meshes = 0;
		let triangles = 0;
		h.root.traverse((o) => {
			if (o instanceof Mesh) {
				meshes++;
				const g = o.geometry;
				triangles += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
			}
		});
		// Batching keeps the draw calls low: a few dozen meshes, under 100k triangles.
		expect(meshes).toBeLessThan(60);
		expect(triangles).toBeLessThan(100_000);
		expect(h.lamps.length).toBe(16);
		h.update(0.016, 1);
		h.dispose();
	});

	it('texture fields stay in range and tile', () => {
		for (const f of [floorBrightness, wallBrightness]) {
			for (let i = 0; i < 200; i++) {
				const u = (i * 0.173) % 1;
				const v = (i * 0.611) % 1;
				const b = f(u, v);
				expect(b).toBeGreaterThan(0.2);
				expect(b).toBeLessThan(1.25);
			}
		}
		expect(wallHeight(0.3, 0.2)).toBeCloseTo(wallHeight(1.3, 1.2), 6);
		expect(plateHeight(0.2, 0.7)).toBeCloseTo(plateHeight(1.2, 1.7), 6);
		const a = hazard(0.01, 0.01);
		const b = hazard(0.1, 0.1);
		expect(a).not.toEqual(b);
	});
});
