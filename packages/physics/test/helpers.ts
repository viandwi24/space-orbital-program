import type { Quat, Transform, Vec3 } from '@orbital/core';

export const ID: Quat = { x: 0, y: 0, z: 0, w: 1 };

export function qmul(a: Quat, b: Quat): Quat {
	return {
		x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
		y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
		z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
		w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
	};
}
export const qconj = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

export function rotate(q: Quat, v: Vec3): Vec3 {
	const r = qmul(qmul(q, { ...v, w: 0 }), qconj(q));
	return { x: r.x, y: r.y, z: r.z };
}

/** Pose of `b` expressed in the frame of `a`. */
export function relative(a: Transform, b: Transform): Transform {
	const d = {
		x: b.position.x - a.position.x,
		y: b.position.y - a.position.y,
		z: b.position.z - a.position.z
	};
	return { position: rotate(qconj(a.rotation), d), rotation: qmul(qconj(a.rotation), b.rotation) };
}

/** Largest component difference between two transforms (sign-folded for quaternions). */
export function transformDistance(a: Transform, b: Transform): number {
	const dq =
		a.rotation.x * b.rotation.x +
			a.rotation.y * b.rotation.y +
			a.rotation.z * b.rotation.z +
			a.rotation.w * b.rotation.w <
		0
			? -1
			: 1;
	return Math.max(
		Math.abs(a.position.x - b.position.x),
		Math.abs(a.position.y - b.position.y),
		Math.abs(a.position.z - b.position.z),
		Math.abs(a.rotation.x - dq * b.rotation.x),
		Math.abs(a.rotation.y - dq * b.rotation.y),
		Math.abs(a.rotation.z - dq * b.rotation.z),
		Math.abs(a.rotation.w - dq * b.rotation.w)
	);
}
