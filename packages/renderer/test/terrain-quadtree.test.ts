/** Plan 398 (ADR 0343): the CDLOD quadtree on the cube-sphere, as a pure reference for the compute walk. */
import { describe, expect, test } from 'bun:test';
import {
	dirOf,
	faceUV,
	morphFactor,
	nodeAt,
	nodeSphere,
	rangeOf,
	selectNodes,
	type QuadtreeOptions,
	type Vec3
} from '../src/terrain-quadtree.ts';

const R = 600_000;
const OPTS: QuadtreeOptions = { radius: R, maxLevel: 12, range0: 400, maxHeight: 6_000 };

const at = (dir: Vec3, alt: number): Vec3 => [
	dir[0] * (R + alt),
	dir[1] * (R + alt),
	dir[2] * (R + alt)
];

describe('the cube-sphere mapping', () => {
	test('faceUV inverts dirOf on every face, across the seams', () => {
		for (let face = 0; face < 6; face++)
			for (const u of [-1, -0.7, 0, 0.3, 0.99])
				for (const v of [-0.9, 0, 0.5, 1]) {
					const back = faceUV(dirOf(face, u, v));
					const again = dirOf(back.face, back.u, back.v);
					const d = dirOf(face, u, v);
					expect(Math.hypot(d[0] - again[0], d[1] - again[1], d[2] - again[2])).toBeLessThan(1e-9);
				}
	});
	test('a node contains its own centre direction', () => {
		const n = { face: 2, level: 5, x: 11, y: 20 };
		const s = nodeSphere(n, R);
		const c = s.center;
		const found = nodeAt([c[0] / R, c[1] / R, c[2] / R], 5);
		expect(found).toEqual(n);
	});
});

describe('selectNodes', () => {
	test('is the six faces for a camera far away, and finer nearer', () => {
		expect(selectNodes(at([0, 0, 1], 5_000_000), OPTS).length).toBe(6);
		const near = selectNodes(at([0, 0, 1], 100), OPTS);
		expect(near.length).toBeGreaterThan(30);
		expect(Math.max(...near.map((n) => n.level))).toBe(OPTS.maxLevel);
	});
	test('levels grow toward the camera: the nearest patch is the finest', () => {
		const cam = at(dirOf(4, 0.2, -0.1), 50);
		const nodes = selectNodes(cam, OPTS);
		const nearest = nodes
			.map((n) => ({
				n,
				d: Math.hypot(...(nodeSphere(n, R).center.map((c, i) => c - cam[i]!) as number[]))
			}))
			.sort((a, b) => a.d - b.d)[0]!;
		expect(nearest.n.level).toBe(OPTS.maxLevel);
	});
	test('covers the sphere without overlap: every sampled direction is in exactly one patch', () => {
		const cam = at(dirOf(0, 0.95, 0.95), 300); // beside a corner of the cube
		const nodes = selectNodes(cam, OPTS);
		for (let i = 0; i < 400; i++) {
			const a = (i / 400) * Math.PI * 2;
			const dir: Vec3 = [Math.cos(a) * 0.8, Math.sin(a * 3) * 0.5, Math.sin(a) * 0.8];
			const l = Math.hypot(...dir);
			const d: Vec3 = [dir[0] / l, dir[1] / l, dir[2] / l];
			const hits = nodes.filter((n) => {
				const m = nodeAt(d, n.level);
				return m.face === n.face && m.x === n.x && m.y === n.y;
			});
			expect(hits.length).toBe(1);
		}
	});
	test('neighbouring patches differ by at most one level, including across cube edges', () => {
		for (const cam of [
			at(dirOf(0, 0.97, 0.2), 120),
			at(dirOf(2, 0.99, 0.99), 40),
			at(dirOf(4, 0, 0), 2_000)
		]) {
			const nodes = selectNodes(cam, OPTS);
			const levelAt = (d: Vec3): number => {
				const hit = nodes.find((n) => {
					const m = nodeAt(d, n.level);
					return m.face === n.face && m.x === n.x && m.y === n.y;
				});
				return hit!.level;
			};
			const c = cam.map((v) => v / Math.hypot(...cam)) as unknown as Vec3;
			for (let i = 0; i < 300; i++) {
				// points at growing angle from the camera, and a point a little further on
				const a = i * 2.399;
				const r = 1e-4 * (1 + (i % 50) ** 1.6);
				const p: Vec3 = [
					c[0] + Math.cos(a) * r,
					c[1] + Math.sin(a) * r,
					c[2] + Math.cos(a * 2) * r
				];
				const q: Vec3 = [p[0] + 2e-5 * Math.cos(a + 1), p[1] + 2e-5 * Math.sin(a + 1), p[2] + 2e-5];
				const lp = levelAt(norm3(p));
				const lq = levelAt(norm3(q));
				expect(Math.abs(lp - lq)).toBeLessThanOrEqual(1);
			}
		}
	});
});

const norm3 = (a: Vec3): Vec3 => {
	const l = Math.hypot(...a);
	return [a[0] / l, a[1] / l, a[2] / l];
};

describe('ranges and the morph', () => {
	test('a level range is twice the next finer one', () => {
		for (let l = 0; l < OPTS.maxLevel; l++) expect(rangeOf(l, OPTS)).toBe(2 * rangeOf(l + 1, OPTS));
	});
	test('the morph is 0 inside 70 % of the range and 1 at the range', () => {
		expect(morphFactor(0, 1000)).toBe(0);
		expect(morphFactor(700, 1000)).toBe(0);
		expect(morphFactor(850, 1000)).toBeCloseTo(0.5, 9);
		expect(morphFactor(1000, 1000)).toBe(1);
		expect(morphFactor(5000, 1000)).toBe(1);
	});
});
