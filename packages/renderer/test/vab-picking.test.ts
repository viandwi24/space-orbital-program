/** Plan 217: picking a part's side returns that face's normal; the turntable camera's height and focus. */
import { describe, expect, it } from 'bun:test';
import { BoxGeometry, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import {
	PAN_TOP_MARGIN,
	PAN_TOP_MIN,
	VAB_CAMERA_LIMITS,
	focus,
	initialCamera,
	limitsForVessel,
	pan,
	raise
} from '../src/vab/orbit-camera.ts';
import {
	nearestByScreen,
	onVerticalPlane,
	withinScreen,
	worldNormalOf
} from '../src/vab/picking.ts';

const hitNormal = (mesh: Mesh, origin: Vector3, dir: Vector3) => {
	mesh.updateMatrixWorld(true);
	const hit = new Raycaster(origin, dir.normalize()).intersectObject(mesh)[0];
	if (!hit) throw new Error('missed');
	return worldNormalOf(hit)!;
};

describe('picking a face (plan 217)', () => {
	it('a ray to the side of a box part returns that face normal', () => {
		const box = new Mesh(new BoxGeometry(1, 2, 1), new MeshBasicMaterial());
		const n = hitNormal(box, new Vector3(5, 0.3, 0.1), new Vector3(-1, 0, 0));
		expect(n[0]).toBeCloseTo(1, 9);
		expect(Math.abs(n[1]) + Math.abs(n[2])).toBeLessThan(1e-9);
		const top = hitNormal(box, new Vector3(0.2, 5, 0), new Vector3(0, -1, 0));
		expect(top[1]).toBeCloseTo(1, 9);
	});

	it('the normal turns with the part', () => {
		const box = new Mesh(new BoxGeometry(1, 2, 1), new MeshBasicMaterial());
		box.rotation.y = Math.PI / 2; // its +X face now looks along -Z
		const n = hitNormal(box, new Vector3(0, 0, -5), new Vector3(0, 0, 1));
		expect(n[2]).toBeCloseTo(-1, 9);
	});
});

describe('turntable camera (plan 217)', () => {
	it('the wheel moves the target up and down the vessel, clamped to the pan box', () => {
		const c = initialCamera();
		const up = raise(c, 3);
		expect(up.target[1]).toBeCloseTo(c.target[1] + 3, 9);
		expect(up.distance).toBe(c.distance);
		expect(raise(c, 1_000).target[1]).toBe(VAB_CAMERA_LIMITS.panTop);
		expect(raise(c, -1_000).target[1]).toBe(0);
	});

	it('a focus puts the target on the point', () => {
		const f = focus(initialCamera(), [1, 7, -2]);
		expect(f.target).toEqual([1, 7, -2]);
	});
});

describe('the camera reaches the top of a tall vessel (plan 238)', () => {
	it('a 60 m vessel: the wheel, focus and pan reach 60 m', () => {
		const l = limitsForVessel(60);
		const c = initialCamera();
		expect(raise(c, 1_000, l).target[1]).toBe(60 + PAN_TOP_MARGIN);
		expect(raise(c, 1_000, l).target[1]).toBeGreaterThanOrEqual(60);
		expect(focus(c, [0, 59, 0], l).target[1]).toBe(59);
		const up = pan({ ...c, pitch: 0 }, 0, 100_000, 800, 45, l);
		expect(up.target[1]).toBe(60 + PAN_TOP_MARGIN);
		// the old fixed box stopped at 34 m
		expect(raise(c, 1_000).target[1]).toBe(VAB_CAMERA_LIMITS.panTop);
	});

	it('a 5 m vessel: the target stops a little above 5 m; an empty platform keeps a small room', () => {
		const top = raise(initialCamera(), 1_000, limitsForVessel(5)).target[1];
		expect(top).toBeGreaterThan(5);
		expect(top).toBeLessThanOrEqual(5 + PAN_TOP_MARGIN);
		expect(limitsForVessel(null).panTop).toBe(PAN_TOP_MIN);
		expect(limitsForVessel(1).panTop).toBe(PAN_TOP_MIN);
	});
});

describe('nodes near the pointer (plan 244)', () => {
	const nodes = [
		{ key: 't0', x: 100, y: 100 },
		{ key: 't1', x: 130, y: 100 },
		{ key: 't2', x: 400, y: 300 }
	];
	it('the ones within the glow radius, nearest first', () => {
		expect(withinScreen(nodes, { x: 118, y: 100 }, 40).map((n) => n.key)).toEqual(['t1', 't0']);
		expect(withinScreen(nodes, { x: 118, y: 100 }, 15).map((n) => n.key)).toEqual(['t1']);
		expect(withinScreen(nodes, { x: 900, y: 900 }, 80)).toEqual([]);
	});
	it('snaps to the nearest within its radius, and to none beyond it', () => {
		expect(nearestByScreen(nodes, { x: 125, y: 104 }, 30)?.key).toBe('t1');
		expect(nearestByScreen(nodes, { x: 115, y: 100 }, 30)?.key).toBe('t0');
		expect(nearestByScreen(nodes, { x: 200, y: 200 }, 30)).toBeNull();
	});
	it('a tie goes to the lower key, so the choice does not flicker', () => {
		expect(nearestByScreen(nodes, { x: 115, y: 100 }, 30)?.key).toBe('t0');
	});
});

describe('the vertical plane of a fairing handle (plan 243)', () => {
	// camera on the +z axis looking down -z: the plane through the anchor faces it
	const ray = (origin: [number, number, number], to: [number, number, number]) => {
		const d = [to[0] - origin[0], to[1] - origin[1], to[2] - origin[2]];
		const l = Math.hypot(d[0]!, d[1]!, d[2]!);
		return { origin, dir: [d[0]! / l, d[1]! / l, d[2]! / l] as [number, number, number] };
	};
	it('gives the offset across and up from the anchor', () => {
		const hit = onVerticalPlane(ray([0, 0, 10], [0.6, 1.5, 0]), [0, 0, 0], [0, -1]);
		expect(hit!.across).toBeCloseTo(0.6, 9);
		expect(hit!.up).toBeCloseTo(1.5, 9);
		const left = onVerticalPlane(ray([0, 0, 10], [-0.6, -1, 0]), [0, 0, 0], [0, -1]);
		expect(left!.across).toBeCloseTo(-0.6, 9);
		expect(left!.up).toBeCloseTo(-1, 9);
	});
	it('is null for a ray parallel to the plane or crossing it behind', () => {
		expect(onVerticalPlane({ origin: [0, 0, 10], dir: [1, 0, 0] }, [0, 0, 0], [0, -1])).toBeNull();
		expect(onVerticalPlane({ origin: [0, 0, 10], dir: [0, 0, 1] }, [0, 0, 0], [0, -1])).toBeNull();
	});
});
