/**
 * Minimal 3-vector helpers on plain `{x, y, z}` objects (no classes, see boundaries.md state rules).
 * Every function returns a new object; inputs are never mutated.
 */
export type Vec3 = { x: number; y: number; z: number };

export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });

export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });

export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

export const cross = (a: Vec3, b: Vec3): Vec3 => ({
	x: a.y * b.z - a.z * b.y,
	y: a.z * b.x - a.x * b.z,
	z: a.x * b.y - a.y * b.x
});

export const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);

/** Unit vector in the direction of `a`. Throws on the zero vector rather than returning NaNs. */
export function normalize(a: Vec3): Vec3 {
	const l = length(a);
	if (l === 0) throw new RangeError('normalize: cannot normalize the zero vector');
	return scale(a, 1 / l);
}
