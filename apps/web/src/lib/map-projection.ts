/**
 * Screen positions of map-view markers (Ap, Pe, vessel). The renderer exposes no projection, so the
 * page mirrors its map camera with the renderer's own pure rig functions (ADR 0026): a rig around the
 * SOI body (the target), up = +Y, perspective 50 degrees vertical like `SceneModel.camera`. If the
 * renderer's map camera changes, `Renderer.project` is the durable fix (draft plan 024).
 */
import type { Vec3 } from '@orbital/core';
import {
	applyRigInput,
	initialRig,
	rigOffset,
	type RigLimits,
	type RigState
} from '@orbital/renderer';

/** Vertical field of view of the renderer's camera, degrees (`new PerspectiveCamera(50, ...)`). */
export const MAP_FOV_DEG = 50;

export interface MapRigMirror {
	/** Same inputs the page gives `Renderer.orbitCamera`, applied while map view is on. */
	orbit(input: { dYaw?: number; dPitch?: number; zoomFactor?: number }): void;
	/**
	 * Projects a point relative to the SOI body centre; null when behind the camera. `hidden` is true
	 * when the body (a sphere of the radius given at creation) is between the camera and the point.
	 */
	project(
		point: Vec3,
		width: number,
		height: number
	): { x: number; y: number; hidden: boolean } | null;
	readonly rig: RigState;
}

export function createMapRigMirror(bodyRadius: number): MapRigMirror {
	const limits: RigLimits = { minDistance: bodyRadius * 1.1, maxDistance: bodyRadius * 1e4 };
	// SceneModel.placeCamera: distance 0 becomes 4 radii on the first map frame.
	let rig: RigState = { ...initialRig(0), distance: bodyRadius * 4 };
	return {
		get rig() {
			return rig;
		},
		orbit(input) {
			rig = applyRigInput(rig, limits, input);
		},
		project(point, width, height) {
			const o = rigOffset(rig);
			const f = unit({ x: -o.x, y: -o.y, z: -o.z });
			const right = unit(cross(f, { x: 0, y: 1, z: 0 }));
			const up = cross(right, f);
			const d = { x: point.x - o.x, y: point.y - o.y, z: point.z - o.z };
			const z = dot(d, f);
			if (z <= 0) return null;
			const t = Math.tan((MAP_FOV_DEG * Math.PI) / 360);
			const ndcX = dot(d, right) / z / (t * (width / height));
			const ndcY = dot(d, up) / z / t;
			return {
				x: ((ndcX + 1) / 2) * width,
				y: ((1 - ndcY) / 2) * height,
				hidden: segmentHitsSphere(o, point, bodyRadius)
			};
		}
	};
}

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
	x: a.y * b.z - a.z * b.y,
	y: a.z * b.x - a.x * b.z,
	z: a.x * b.y - a.y * b.x
});
const unit = (a: Vec3): Vec3 => {
	const l = Math.hypot(a.x, a.y, a.z) || 1;
	return { x: a.x / l, y: a.y / l, z: a.z / l };
};

/** Does the segment `a` -> `b` pass through the sphere of `radius` centred on the origin? */
export function segmentHitsSphere(a: Vec3, b: Vec3, radius: number): boolean {
	const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
	const len2 = dot(d, d);
	if (len2 === 0) return false;
	// Closest point of the segment to the origin.
	const t = Math.min(1, Math.max(0, -dot(a, d) / len2));
	const c = { x: a.x + d.x * t, y: a.y + d.y * t, z: a.z + d.z * t };
	return dot(c, c) < radius * radius * 0.999;
}
