/** Small float64 vector/quaternion helpers for the pure environment maths (no Three.js). */
import type { Quat, Vec3 } from '@orbital/core';

export const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => vec(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 => vec(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Vec3, s: number): Vec3 => vec(a.x * s, a.y * s, a.z * s);
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 =>
	vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const normalize = (a: Vec3): Vec3 => {
	const l = length(a);
	return l > 0 ? scale(a, 1 / l) : vec(0, 1, 0);
};

export const IDENTITY_QUAT: Quat = { x: 0, y: 0, z: 0, w: 1 };

/** Rotate `v` by the unit quaternion `q`. */
export function rotate(q: Quat, v: Vec3): Vec3 {
	const u = vec(q.x, q.y, q.z);
	const t = scale(cross(u, v), 2);
	return add(add(v, scale(t, q.w)), cross(u, t));
}

export const conjugate = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

/** Inverse rotation (inertial to body-fixed when `q` is the body orientation). */
export const rotateInverse = (q: Quat, v: Vec3): Vec3 => rotate(conjugate(q), v);

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const smoothstep = (e0: number, e1: number, x: number): number => {
	const t = clamp((x - e0) / (e1 - e0), 0, 1);
	return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const DEG = Math.PI / 180;
