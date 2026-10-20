import { describe, expect, it } from 'bun:test';
import { Box3, Mesh } from 'three';
import { CREW, LANE, LANE_LENGTH, crewPose, lanePose } from '../src/vab/hangar-movers.ts';
import {
	HANGAR,
	TOWERS,
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
		expect(meshes).toBeLessThan(85);
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

	// Plan 220: a roomier Hangar.
	const armsOf = (h: ReturnType<typeof createHangar>) => h.root.getObjectByName('arms')!;
	/** The nearest any vertex of `o` comes to the vertical axis, m. */
	const nearest = (o: { traverse(f: (x: unknown) => void): void }): number => {
		let min = Infinity;
		o.traverse((x) => {
			if (!(x instanceof Mesh)) return;
			const p = x.geometry.getAttribute('position');
			for (let i = 0; i < p.count; i++) min = Math.min(min, Math.hypot(p.getX(i), p.getZ(i)));
		});
		return min;
	};

	it('the towers stand back: bases at |x| >= 14 m and z <= -12 m', () => {
		for (const t of TOWERS) {
			expect(Math.abs(t.x)).toBeGreaterThanOrEqual(14);
			expect(t.z).toBeLessThanOrEqual(-12);
		}
	});

	it('the swing arms stay retracted: nothing of them comes within 10 m of the axis, whatever the vessel (plan 255)', () => {
		const h = createHangar({ dust: 0, textureSize: 16 });
		const far = nearest(armsOf(h));
		expect(far).toBeGreaterThanOrEqual(10);
		expect(far).toBeGreaterThan(HANGAR.platformRadius * 1.5);
		h.setVesselRadius(5);
		expect(nearest(armsOf(h))).toBe(far);
		h.setVesselRadius(null);
		expect(nearest(armsOf(h))).toBe(far);
		h.dispose();
	});

	it('every mover path stays outside the platform and off the tower bases', () => {
		const onTower = (x: number, z: number, pad: number) =>
			TOWERS.some((t) => Math.abs(x - t.x) < 1.8 + pad && Math.abs(z - t.z) < 1.8 + pad);
		for (let s = 0; s < LANE_LENGTH; s += 0.25) {
			const p = lanePose(s);
			expect(Math.hypot(p.x, p.z)).toBeGreaterThan(HANGAR.platformRadius);
			expect(onTower(p.x, p.z, 1.5)).toBe(false); // the tug is about 3 m wide with its trailer
		}
		expect(LANE.zEast).toBeLessThan(-14.6 - 1.5);
		for (const c of CREW)
			for (let t = 0; t < 120; t += 0.5) {
				const p = crewPose(c, t);
				expect(Math.hypot(p.x, p.z)).toBeGreaterThan(HANGAR.platformRadius);
				expect(onTower(p.x, p.z, 0.3)).toBe(false);
			}
	});
});
