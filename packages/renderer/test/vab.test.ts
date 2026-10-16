import { describe, expect, it } from 'bun:test';
import {
	approach,
	approachCamera,
	cameraAxes,
	cameraPosition,
	frameDistance,
	initialCamera,
	minPitch,
	orbit,
	pan,
	VAB_CAMERA_LIMITS,
	zoom
} from '../src/vab/orbit-camera.ts';
import { pickNode, raySphere, toNdc } from '../src/vab/picking.ts';
import { diffParts, floorShift, unionExtent, type VabPart } from '../src/vab/scene-model.ts';

const L = VAB_CAMERA_LIMITS;

describe('orbit camera', () => {
	it('orbits by pixels and clamps the pitch', () => {
		const s = initialCamera();
		const a = orbit(s, 100, 0);
		expect(a.yaw).toBeLessThan(s.yaw);
		expect(a.pitch).toBe(s.pitch);
		expect(orbit(s, 0, 100000).pitch).toBe(L.maxPitch);
		expect(orbit(s, 0, -100000).pitch).toBeGreaterThanOrEqual(minPitch(s));
	});

	it('never lets the camera below the floor', () => {
		for (const ty of [0, 1, 4, 12]) {
			const s = orbit({ ...initialCamera(10), target: [0, ty, 0] }, 0, -100000);
			expect(cameraPosition(s)[1]).toBeGreaterThanOrEqual(L.floorClearance - 1e-9);
		}
	});

	it('keeps the camera inside the room whatever the yaw', () => {
		for (let k = 0; k < 16; k++) {
			const s = zoom({ ...initialCamera(10), yaw: (k / 16) * Math.PI * 2, pitch: 0.2 }, 1e6);
			const p = cameraPosition(s);
			expect(Math.abs(p[0])).toBeLessThanOrEqual(L.roomHalf + 1e-6);
			expect(Math.abs(p[2])).toBeLessThanOrEqual(L.roomHalf + 1e-6);
			expect(s.distance).toBeGreaterThanOrEqual(L.minDistance);
		}
	});

	it('zoom scales the distance within limits', () => {
		const s = initialCamera(10);
		expect(zoom(s, 2).distance).toBeCloseTo(20, 9);
		expect(zoom(s, 1e-6).distance).toBe(L.minDistance);
		expect(zoom(s, 1e6).distance).toBeLessThanOrEqual(L.maxDistance);
		expect(zoom(s, 1e6).distance).toBeGreaterThan(20);
	});

	it('camera sits at the distance from the target', () => {
		const s = { ...initialCamera(12), target: [1, 5, -2] as const };
		const p = cameraPosition(s);
		expect(Math.hypot(p[0] - 1, p[1] - 5, p[2] + 2)).toBeCloseTo(12, 9);
	});

	it('axes are orthonormal and perpendicular to the view direction', () => {
		const s = { ...initialCamera(12), yaw: 1.1, pitch: 0.5 };
		const { right, up } = cameraAxes(s);
		const dot = (a: readonly number[], b: readonly number[]): number =>
			a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
		const p = cameraPosition(s);
		const fwd = [s.target[0] - p[0], s.target[1] - p[1], s.target[2] - p[2]].map(
			(v) => v / s.distance
		);
		expect(dot(right, up)).toBeCloseTo(0, 9);
		expect(dot(right, fwd)).toBeCloseTo(0, 9);
		expect(dot(up, fwd)).toBeCloseTo(0, 9);
		expect(dot(up, up)).toBeCloseTo(1, 9);
	});

	it('pan moves the target with the drag and stays inside the hangar', () => {
		const s = { ...initialCamera(10), yaw: 0, pitch: 0 };
		const p = pan(s, 100, 0, 1000, 40);
		// Dragging right moves the scene right, so the target moves left (-x for yaw 0).
		expect(p.target[0]).toBeLessThan(s.target[0]);
		const per = (2 * 10 * Math.tan((40 * Math.PI) / 360)) / 1000;
		expect(s.target[0] - p.target[0]).toBeCloseTo(100 * per, 9);
		const far = pan(s, -1e7, 1e7, 1000, 40);
		expect(Math.abs(far.target[0])).toBeLessThanOrEqual(L.panExtent);
		expect(far.target[1]).toBeLessThanOrEqual(L.panTop);
		expect(pan(s, 0, -1e7, 1000, 40).target[1]).toBeGreaterThanOrEqual(0);
	});

	it('frames the larger of the two extents', () => {
		const tall = frameDistance(2, 20, 40, 16 / 9);
		const wide = frameDistance(40, 2, 40, 16 / 9);
		expect(tall).toBeCloseTo((10 * 1.25) / Math.tan((40 * Math.PI) / 360), 9);
		expect(wide).toBeGreaterThan(frameDistance(2, 2, 40, 16 / 9));
		// A narrow window needs more distance for the same width.
		expect(frameDistance(10, 2, 40, 0.5)).toBeGreaterThan(frameDistance(10, 2, 40, 2));
	});

	it('approach converges without overshoot and takes the short way round in yaw', () => {
		expect(approach(0, 10, 0, 7)).toBe(0);
		expect(approach(0, 10, 100, 7)).toBeCloseTo(10, 9);
		const a = approach(0, 10, 0.1, 7);
		expect(a).toBeGreaterThan(0);
		expect(a).toBeLessThan(10);
		const cur = { ...initialCamera(), yaw: 3.0 };
		const goal = { ...initialCamera(), yaw: -3.0 };
		const next = approachCamera(cur, goal, 0.05);
		expect(next.yaw).toBeGreaterThan(3.0); // goes through pi, not back through 0
	});
});

describe('picking', () => {
	const ray = { origin: [0, 0, 10] as const, dir: [0, 0, -1] as const };
	it('ray against a sphere', () => {
		expect(raySphere(ray, [0, 0, 0], 1)).toBeCloseTo(9, 9);
		expect(raySphere(ray, [3, 0, 0], 1)).toBeNull();
		expect(raySphere(ray, [0, 0, 20], 1)).toBeNull(); // behind
		expect(raySphere(ray, [0, 0, 10], 1)).toBe(0); // origin inside
	});

	it('picks the node whose centre is closest to the ray when several overlap', () => {
		const nodes = [
			{ key: 'a', position: [0.3, 0, 0] as const, radius: 0.5 },
			{ key: 'b', position: [0.05, 0, 0] as const, radius: 0.5 },
			{ key: 'far', position: [5, 0, 0] as const, radius: 0.5 }
		];
		expect(pickNode(ray, nodes)?.node.key).toBe('b');
		expect(pickNode({ origin: [5, 0, 10], dir: [0, 0, -1] }, nodes)?.node.key).toBe('far');
		expect(pickNode({ origin: [20, 0, 10], dir: [0, 0, -1] }, nodes)).toBeNull();
		expect(pickNode(ray, [])).toBeNull();
	});

	it('slack widens the hit area', () => {
		const n = [{ key: 'a', position: [0.6, 0, 0] as const, radius: 0.5 }];
		expect(pickNode(ray, n)).toBeNull();
		expect(pickNode(ray, n, 1.5)?.node.key).toBe('a');
	});

	it('pointer to NDC', () => {
		const rect = { left: 10, top: 20, width: 200, height: 100 };
		expect(toNdc(110, 70, rect)).toEqual([0, -0]);
		expect(toNdc(10, 20, rect)).toEqual([-1, 1]);
		expect(toNdc(210, 120, rect)).toEqual([1, -1]);
	});
});

describe('scene model', () => {
	const part = (
		key: string,
		definition = 'stock.tank-small',
		role: VabPart['role'] = 'solid'
	): VabPart => ({
		key,
		definition,
		position: [0, 0, 0],
		group: 'main',
		role
	});
	it('diffs added, removed, moved and replaced parts', () => {
		const prev = new Map([
			['0', { definition: 'stock.command-pod', role: 'solid' as const }],
			['1', { definition: 'stock.tank-small', role: 'solid' as const }],
			['ghost', { definition: 'stock.engine-lv', role: 'ghost' as const }]
		]);
		const d = diffParts(prev, [
			part('0', 'stock.command-pod'),
			part('1', 'stock.tank-medium'), // definition changed
			part('2'),
			part('ghost', 'stock.engine-lv', 'solid') // ghost became real
		]);
		expect(d.keep.map((p) => p.key)).toEqual(['0']);
		expect(d.add.map((p) => p.key).sort()).toEqual(['1', '2', 'ghost']);
		expect(d.remove.sort()).toEqual(['1', 'ghost']);
		expect(diffParts(prev, []).remove.sort()).toEqual(['0', '1', 'ghost']);
	});

	it('floor shift stands the lowest point at y = 0', () => {
		expect(floorShift([2, -3.5, 0])).toBe(3.5);
		expect(floorShift([])).toBe(0);
	});

	it('union of extents', () => {
		expect(unionExtent([])).toBeNull();
		expect(
			unionExtent([
				{ min: [0, 0, 0], max: [1, 2, 3] },
				{ min: [-1, 1, 0], max: [0, 5, 1] }
			])
		).toEqual({
			min: [-1, 0, 0],
			max: [1, 5, 3]
		});
	});
});

import { Box3, OrthographicCamera, Vector3 } from 'three';
import { frameIcon } from '../src/vab/icons.ts';

describe('icon framing', () => {
	it('every corner of the part lands inside the square, and the part nearly fills it', () => {
		for (const [min, max] of [
			[new Vector3(-0.625, -1, -0.625), new Vector3(0.625, 1, 0.625)],
			[new Vector3(-0.625, -0.1, -0.625), new Vector3(0.625, 0.1, 0.625)],
			[new Vector3(-0.6, -2, -0.6), new Vector3(0.6, 2, 0.6)]
		] as const) {
			const cam = new OrthographicCamera(-1, 1, 1, -1);
			const box = new Box3(min, max);
			frameIcon(box, cam);
			let extent = 0;
			for (const x of [min.x, max.x]) {
				for (const y of [min.y, max.y]) {
					for (const z of [min.z, max.z]) {
						const p = new Vector3(x, y, z).project(cam);
						expect(Math.abs(p.x)).toBeLessThanOrEqual(1 + 1e-9);
						expect(Math.abs(p.y)).toBeLessThanOrEqual(1 + 1e-9);
						extent = Math.max(extent, Math.abs(p.x), Math.abs(p.y));
					}
				}
			}
			expect(extent).toBeGreaterThan(0.85);
		}
	});
});
