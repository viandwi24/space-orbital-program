import { describe, expect, test } from 'bun:test';
import type { BodyId, EntityId, Snapshot, Vec3 } from '@orbital/core';
import { PerspectiveCamera } from 'three';
import { initialRig, rigOffset } from '../src/camera-rig.ts';
import { projectWorldPoint, segmentHitsSphere } from '../src/project.ts';
import { SceneModel } from '../src/scene.ts';

const W = 1600;
const H = 900;
const T = Math.tan((25 * Math.PI) / 180); // half the vertical field of view of 50 degrees

/** Camera at (0, 0, 10) looking down -Z at the origin, 50 degrees vertical, 16:9. */
function knownCamera(): PerspectiveCamera {
	const camera = new PerspectiveCamera(50, W / H, 0.1, 1000);
	camera.position.set(0, 0, 10);
	camera.lookAt(0, 0, 0);
	camera.updateMatrixWorld();
	camera.updateProjectionMatrix();
	return camera;
}

describe('projectWorldPoint', () => {
	const camera = knownCamera();

	test('the point the camera looks at is the screen centre', () => {
		const p = projectWorldPoint(camera, { x: 0, y: 0, z: 0 }, W, H)!;
		expect(p.x).toBeCloseTo(W / 2, 9);
		expect(p.y).toBeCloseTo(H / 2, 9);
		expect(p.hidden).toBe(false);
	});

	test('offsets follow the pinhole model: x to the right, y up the screen (pixel y grows downward)', () => {
		// Distance along the view axis is 10 for every point in the z = 0 plane.
		const right = projectWorldPoint(camera, { x: 1, y: 0, z: 0 }, W, H)!;
		expect(right.x).toBeCloseTo(((1 / 10 / (T * (W / H)) + 1) / 2) * W, 9);
		expect(right.y).toBeCloseTo(H / 2, 9);
		const up = projectWorldPoint(camera, { x: 0, y: 1, z: 0 }, W, H)!;
		expect(up.x).toBeCloseTo(W / 2, 9);
		expect(up.y).toBeCloseTo(((1 - 1 / 10 / T) / 2) * H, 9);
		// Twice as far along the axis, half the offset: (0, 0, -10) is 20 away.
		const far = projectWorldPoint(camera, { x: 2, y: 0, z: -10 }, W, H)!;
		expect(far.x).toBeCloseTo(((2 / 20 / (T * (W / H)) + 1) / 2) * W, 9);
	});

	test('the edge of the field of view lands on the edge of the screen', () => {
		// 10 m ahead, T * 10 m up is the top edge.
		const top = projectWorldPoint(camera, { x: 0, y: T * 10, z: 0 }, W, H)!;
		expect(top.y).toBeCloseTo(0, 9);
		const bottomRight = projectWorldPoint(camera, { x: T * 10 * (W / H), y: -T * 10, z: 0 }, W, H)!;
		expect(bottomRight.x).toBeCloseTo(W, 9);
		expect(bottomRight.y).toBeCloseTo(H, 9);
	});

	test('points behind or in the plane of the camera are null', () => {
		expect(projectWorldPoint(camera, { x: 0, y: 0, z: 20 }, W, H)).toBeNull();
		expect(projectWorldPoint(camera, { x: 3, y: 1, z: 10 }, W, H)).toBeNull();
	});

	test('a body between the camera and the point hides it; one beside the line of sight does not', () => {
		const body = [{ center: { x: 0, y: 0, z: 0 }, radius: 2 }];
		expect(projectWorldPoint(camera, { x: 0, y: 0, z: -5 }, W, H, body)!.hidden).toBe(true);
		// In front of the sphere, between it and the camera.
		expect(projectWorldPoint(camera, { x: 0, y: 0, z: 5 }, W, H, body)!.hidden).toBe(false);
		// The line from (0,0,10) to (5,0,0) passes 4.47 m from the centre (|a x d| / |d| = 50 / 11.18).
		expect(projectWorldPoint(camera, { x: 5, y: 0, z: 0 }, W, H, body)!.hidden).toBe(false);
		// A point on the surface facing the camera is not hidden by its own body.
		expect(projectWorldPoint(camera, { x: 0, y: 0, z: 2 }, W, H, body)!.hidden).toBe(false);
	});
});

describe('segmentHitsSphere', () => {
	const o = { x: 0, y: 0, z: 0 };
	test('through, beside, ending outside, and off-centre spheres', () => {
		expect(segmentHitsSphere({ x: -10, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, o, 1)).toBe(true);
		expect(segmentHitsSphere({ x: -10, y: 2, z: 0 }, { x: 10, y: 2, z: 0 }, o, 1)).toBe(false);
		expect(segmentHitsSphere({ x: 5, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, o, 1)).toBe(false);
		expect(segmentHitsSphere({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, o, 1)).toBe(false);
		expect(
			segmentHitsSphere({ x: 99, y: 0, z: 0 }, { x: 111, y: 0, z: 0 }, { x: 105, y: 0, z: 0 }, 1)
		).toBe(true);
	});
});

describe('SceneModel.project', () => {
	const BODY = 'stock.home' as BodyId;
	const R = 600_000;
	const ROOT: Vec3 = { x: 1.5e11, y: 0, z: 0 };
	const q0 = { x: 0, y: 0, z: 0, w: 1 };
	const snapshot = (): Snapshot => ({
		t: 0,
		bodies: [{ id: BODY, position: ROOT, rotation: q0 }],
		vessels: [
			{
				id: 1 as EntityId,
				mode: 'on-rails',
				soi: BODY,
				position: { x: 700_000, y: 0, z: 0 },
				velocity: { x: 0, y: 0, z: 0 },
				orientation: q0,
				parts: []
			}
		]
	});
	const mapModel = (): SceneModel => {
		const model = new SceneModel({ bodies: [{ id: BODY, radius: R }], partShapes: new Map() });
		model.resize(W, H);
		model.setMapView(true);
		model.setActiveVessel(1 as EntityId);
		model.sync(snapshot());
		return model;
	};
	const unit = (a: Vec3): Vec3 => {
		const l = Math.hypot(a.x, a.y, a.z);
		return { x: a.x / l, y: a.y / l, z: a.z / l };
	};

	test('in map view the SOI body centre is the screen centre, 1.5e11 m from the world origin', () => {
		const model = mapModel();
		const p = model.project(ROOT)!;
		expect(p.x).toBeCloseTo(W / 2, 4);
		expect(p.y).toBeCloseTo(H / 2, 4);
	});

	test('a point offset sideways from the target lands where the pinhole model puts it, before and after orbiting', () => {
		const model = mapModel();
		// The first map frame puts the camera 4 radii from the body (SceneModel.placeCamera).
		const check = (rig: { yaw: number; pitch: number; distance: number }): void => {
			const o = rigOffset(rig);
			const forward = unit({ x: -o.x, y: -o.y, z: -o.z });
			// right = forward x up(+Y), the map camera's up.
			const right = unit({ x: -forward.z, y: 0, z: forward.x });
			const s = 100_000;
			const p = model.project({
				x: ROOT.x + right.x * s,
				y: ROOT.y + right.y * s,
				z: ROOT.z + right.z * s
			})!;
			expect(p.x).toBeCloseTo(((s / rig.distance / (T * (W / H)) + 1) / 2) * W, 3);
			expect(p.y).toBeCloseTo(H / 2, 3);
		};
		const start = { ...initialRig(0), distance: R * 4 };
		check(start);
		// Orbit input is applied by the next call even without a new snapshot.
		model.orbitCamera({ dYaw: 0.5 });
		check({ ...start, yaw: start.yaw + 0.5 });
	});

	test('the far side of the body is hidden, the near side and the camera-facing vessel are not', () => {
		const model = mapModel();
		const o = rigOffset({ ...initialRig(0), distance: R * 4 });
		const k = 650_000 / Math.hypot(o.x, o.y, o.z);
		const at = (s: number): Vec3 => ({
			x: ROOT.x + o.x * k * s,
			y: ROOT.y + o.y * k * s,
			z: ROOT.z + o.z * k * s
		});
		expect(model.project(at(1))!.hidden).toBe(false);
		expect(model.project(at(-1))!.hidden).toBe(true);
	});

	test('points behind the camera are null', () => {
		const model = mapModel();
		const o = rigOffset({ ...initialRig(0), distance: R * 4 });
		const behind = { x: ROOT.x + 2 * o.x, y: ROOT.y + 2 * o.y, z: ROOT.z + 2 * o.z };
		expect(model.project(behind)).toBeNull();
	});
});
