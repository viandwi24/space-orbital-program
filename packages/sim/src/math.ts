/** Quaternion and small vector helpers on plain data (Vec3 helpers come from kepler). */
import type { Quat, Vec3 } from '@orbital/core';

export const ZERO: Vec3 = { x: 0, y: 0, z: 0 };
export const IDENTITY: Quat = { x: 0, y: 0, z: 0, w: 1 };

export const fromTuple = (t: readonly [number, number, number]): Vec3 => ({
	x: t[0],
	y: t[1],
	z: t[2]
});

export const qMul = (a: Quat, b: Quat): Quat => ({
	x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
	y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
	z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
	w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
});

export const qConj = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

export function qNormalize(q: Quat): Quat {
	const l = Math.hypot(q.x, q.y, q.z, q.w);
	return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
}

/** Rotate `v` by the unit quaternion `q`: v + 2w(u×v) + 2u×(u×v). */
export function qRotate(q: Quat, v: Vec3): Vec3 {
	const cx = q.y * v.z - q.z * v.y;
	const cy = q.z * v.x - q.x * v.z;
	const cz = q.x * v.y - q.y * v.x;
	return {
		x: v.x + 2 * (q.w * cx + q.y * cz - q.z * cy),
		y: v.y + 2 * (q.w * cy + q.z * cx - q.x * cz),
		z: v.z + 2 * (q.w * cz + q.x * cy - q.y * cx)
	};
}

/** Rotation about +Y by `angle` rad (right-handed). */
export const qAboutY = (angle: number): Quat => ({
	x: 0,
	y: Math.sin(angle / 2),
	z: 0,
	w: Math.cos(angle / 2)
});

/** Unit quaternion of the rotation whose columns are the images of local X, Y, Z (right-handed). */
export function qFromBasis(x: Vec3, y: Vec3, z: Vec3): Quat {
	const m00 = x.x,
		m10 = x.y,
		m20 = x.z;
	const m01 = y.x,
		m11 = y.y,
		m21 = y.z;
	const m02 = z.x,
		m12 = z.y,
		m22 = z.z;
	const trace = m00 + m11 + m22;
	let q: Quat;
	if (trace > 0) {
		const s = 2 * Math.sqrt(trace + 1);
		q = { w: s / 4, x: (m21 - m12) / s, y: (m02 - m20) / s, z: (m10 - m01) / s };
	} else if (m00 > m11 && m00 > m22) {
		const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
		q = { w: (m21 - m12) / s, x: s / 4, y: (m01 + m10) / s, z: (m02 + m20) / s };
	} else if (m11 > m22) {
		const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
		q = { w: (m02 - m20) / s, x: (m01 + m10) / s, y: s / 4, z: (m12 + m21) / s };
	} else {
		const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
		q = { w: (m10 - m01) / s, x: (m02 + m20) / s, y: (m12 + m21) / s, z: s / 4 };
	}
	return qNormalize(q);
}

export const isNonZero = (v: Vec3): boolean => v.x !== 0 || v.y !== 0 || v.z !== 0;

/**
 * Rotation that stands a body upright on the ground at unit direction `up`: local Y = up, local X
 * east (the +Y rotation axis crossed with `up`), local Z south. Falls back to X = -Z at the poles.
 */
export function uprightRotation(up: Vec3): Quat {
	const ex = up.z; // (0,1,0) × up = (up.z, 0, -up.x)
	const ez = -up.x;
	const len = Math.hypot(ex, ez);
	const east: Vec3 = len > 1e-9 ? { x: ex / len, y: 0, z: ez / len } : { x: 0, y: 0, z: -1 };
	const south: Vec3 = {
		x: east.y * up.z - east.z * up.y,
		y: east.z * up.x - east.x * up.z,
		z: east.x * up.y - east.y * up.x
	};
	return qFromBasis(east, up, south);
}
