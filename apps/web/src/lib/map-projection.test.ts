import { bodyId, entityId, type Snapshot } from '@orbital/core';
import { createSceneModel, rigOffset } from '@orbital/renderer';
import { describe, expect, it } from 'vitest';
import { createMapRigMirror, segmentHitsSphere } from './map-projection';

const W = 1600;
const H = 900;
const HOME = bodyId('stock.home');

/** Projects through the renderer's own camera matrices (column-major, as three stores them). */
function projectWith(
	camera: { matrixWorldInverse: { elements: number[] }; projectionMatrix: { elements: number[] } },
	p: { x: number; y: number; z: number }
): { x: number; y: number } {
	const v = camera.matrixWorldInverse.elements;
	const m = camera.projectionMatrix.elements;
	const ex = v[0]! * p.x + v[4]! * p.y + v[8]! * p.z + v[12]!;
	const ey = v[1]! * p.x + v[5]! * p.y + v[9]! * p.z + v[13]!;
	const ez = v[2]! * p.x + v[6]! * p.y + v[10]! * p.z + v[14]!;
	const cx = m[0]! * ex + m[4]! * ey + m[8]! * ez + m[12]!;
	const cy = m[1]! * ex + m[5]! * ey + m[9]! * ez + m[13]!;
	const cw = m[3]! * ex + m[7]! * ey + m[11]! * ez + m[15]!;
	return { x: ((cx / cw + 1) / 2) * W, y: ((1 - cy / cw) / 2) * H };
}

const snapshot = (): Snapshot =>
	({
		t: 0,
		bodies: [{ id: HOME, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } }],
		vessels: [
			{
				id: entityId(1),
				mode: 'on-rails',
				soi: HOME,
				position: { x: 700_000, y: 0, z: 0 },
				velocity: { x: 0, y: 0, z: 0 },
				orientation: { x: 0, y: 0, z: 0, w: 1 },
				parts: []
			}
		]
	}) as unknown as Snapshot;

describe('map rig mirror', () => {
	it('agrees with the renderer map camera, before and after orbiting and zooming', () => {
		const model = createSceneModel({
			bodies: [{ id: HOME, radius: 600_000 }],
			partShapes: new Map()
		});
		model.resize(W, H);
		model.setMapView(true);
		model.setActiveVessel(entityId(1));
		const mirror = createMapRigMirror(600_000);
		const points = [
			{ x: 700_000, y: 0, z: 0 },
			{ x: 0, y: 650_000, z: 120_000 },
			{ x: -300_000, y: 100_000, z: 800_000 }
		];
		const check = (): void => {
			model.sync(snapshot());
			model.camera.updateMatrixWorld();
			model.camera.updateProjectionMatrix();
			for (const p of points) {
				const want = projectWith(model.camera as never, p);
				const got = mirror.project(p, W, H)!;
				expect(got.x).toBeCloseTo(want.x, 4);
				expect(got.y).toBeCloseTo(want.y, 4);
			}
		};
		check();
		for (const input of [
			{ dYaw: 0.4, dPitch: -0.2 },
			{ zoomFactor: 0.8 },
			{ dYaw: -2, dPitch: 3 }
		]) {
			model.orbitCamera(input);
			mirror.orbit(input);
			check();
		}
	});
	it('marks points on the far side of the body as hidden', () => {
		const mirror = createMapRigMirror(600_000);
		const o = rigOffset(mirror.rig);
		const k = 650_000 / Math.hypot(o.x, o.y, o.z);
		const near = mirror.project({ x: o.x * k, y: o.y * k, z: o.z * k }, 800, 600)!;
		const far = mirror.project({ x: -o.x * k, y: -o.y * k, z: -o.z * k }, 800, 600)!;
		expect(near.hidden).toBe(false);
		expect(far.hidden).toBe(true);
		expect(segmentHitsSphere({ x: -10, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 1)).toBe(true);
		expect(segmentHitsSphere({ x: -10, y: 2, z: 0 }, { x: 10, y: 2, z: 0 }, 1)).toBe(false);
		expect(segmentHitsSphere({ x: 5, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 1)).toBe(false);
	});
	it('returns null for points behind the camera and clamps zoom to the rig limits', () => {
		const mirror = createMapRigMirror(600_000);
		mirror.orbit({ zoomFactor: 1e-9 });
		expect(mirror.rig.distance).toBeCloseTo(660_000, 3);
		const o = rigOffset(mirror.rig);
		expect(mirror.project({ x: 2 * o.x, y: 2 * o.y, z: 2 * o.z }, 800, 600)).toBeNull();
	});
});
