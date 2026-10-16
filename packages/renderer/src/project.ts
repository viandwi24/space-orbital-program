/**
 * World point to screen pixel through a camera's matrices (plan 024, ADR 0033). Pure: it reads the
 * matrices three keeps on a camera and nothing else, so it is tested against a hand-made camera and
 * `SceneModel.project` hands it the real one.
 */
import type { Vec3 } from '@orbital/core';

/** The part of a three.js camera the projection reads (a `PerspectiveCamera` satisfies it). */
export interface ProjectionCamera {
	/** Camera position in the same space as the points. */
	readonly position: Vec3;
	/** World to eye space, column-major (call `updateMatrixWorld` first). */
	readonly matrixWorldInverse: { readonly elements: ArrayLike<number> };
	/** Eye to clip space, column-major. */
	readonly projectionMatrix: { readonly elements: ArrayLike<number> };
}

/** A sphere that can hide what lies behind it (a body). */
export interface Occluder {
	center: Vec3;
	radius: number;
}

/** A point on the screen in CSS pixels from the canvas's top-left corner. */
export interface ScreenPoint {
	x: number;
	y: number;
	/** True when an occluder lies between the camera and the point. */
	hidden: boolean;
}

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

/**
 * Does the segment `a` to `b` pass through the sphere? A segment that only grazes the surface (or
 * ends on it) does not: the sphere is shrunk by 0.1 % so markers on the surface stay visible.
 */
export function segmentHitsSphere(a: Vec3, b: Vec3, center: Vec3, radius: number): boolean {
	const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
	const len2 = dot(d, d);
	if (len2 === 0) return false;
	const rel = { x: a.x - center.x, y: a.y - center.y, z: a.z - center.z };
	// Closest point of the segment to the centre.
	const t = Math.min(1, Math.max(0, -dot(rel, d) / len2));
	const c = { x: rel.x + d.x * t, y: rel.y + d.y * t, z: rel.z + d.z * t };
	return dot(c, c) < radius * radius * 0.999;
}

/**
 * Screen position of `point` for a viewport of `width` x `height` pixels, or `null` when the point
 * is behind the camera (or exactly in its plane). Pixel (0, 0) is the top-left corner.
 */
export function projectWorldPoint(
	camera: ProjectionCamera,
	point: Vec3,
	width: number,
	height: number,
	occluders: readonly Occluder[] = []
): ScreenPoint | null {
	const v = camera.matrixWorldInverse.elements;
	const m = camera.projectionMatrix.elements;
	const ex = v[0]! * point.x + v[4]! * point.y + v[8]! * point.z + v[12]!;
	const ey = v[1]! * point.x + v[5]! * point.y + v[9]! * point.z + v[13]!;
	const ez = v[2]! * point.x + v[6]! * point.y + v[10]! * point.z + v[14]!;
	const cx = m[0]! * ex + m[4]! * ey + m[8]! * ez + m[12]!;
	const cy = m[1]! * ex + m[5]! * ey + m[9]! * ez + m[13]!;
	const cw = m[3]! * ex + m[7]! * ey + m[11]! * ez + m[15]!;
	if (!(cw > 0)) return null;
	return {
		x: ((cx / cw + 1) / 2) * width,
		y: ((1 - cy / cw) / 2) * height,
		hidden: occluders.some((o) => segmentHitsSphere(camera.position, point, o.center, o.radius))
	};
}
