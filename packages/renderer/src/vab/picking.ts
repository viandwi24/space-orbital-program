/**
 * Picking maths for the VAB (plan 022): attach nodes are small spheres tested against the pointer
 * ray in plain numbers, so the choice is unit-tested without WebGL. Parts are picked with the
 * three.js `Raycaster` in `view.ts`.
 */
import type { V3 } from './orbit-camera.ts';

export interface PickRay {
	origin: V3;
	/** Unit direction. */
	dir: V3;
}

/** Distance along the ray to the near surface of the sphere, or null when it misses or is behind. */
export function raySphere(ray: PickRay, centre: V3, radius: number): number | null {
	const ox = ray.origin[0] - centre[0];
	const oy = ray.origin[1] - centre[1];
	const oz = ray.origin[2] - centre[2];
	const b = ox * ray.dir[0] + oy * ray.dir[1] + oz * ray.dir[2];
	const c = ox * ox + oy * oy + oz * oz - radius * radius;
	const disc = b * b - c;
	if (disc < 0) return null;
	const s = Math.sqrt(disc);
	const t0 = -b - s;
	const t1 = -b + s;
	if (t1 < 0) return null;
	return t0 >= 0 ? t0 : 0;
}

export interface PickableNode {
	key: string;
	position: V3;
	radius: number;
}

/**
 * The node under the ray. Several can overlap on a stack (two nodes at a junction); the one whose
 * centre is closest to the ray wins, so aiming at a node's middle always selects that node.
 */
export function pickNode<T extends PickableNode>(
	ray: PickRay,
	nodes: readonly T[],
	slack = 1
): { node: T; t: number } | null {
	let best: { node: T; t: number; off: number } | null = null;
	for (const node of nodes) {
		const t = raySphere(ray, node.position, node.radius * slack);
		if (t === null) continue;
		const vx = node.position[0] - ray.origin[0];
		const vy = node.position[1] - ray.origin[1];
		const vz = node.position[2] - ray.origin[2];
		const along = vx * ray.dir[0] + vy * ray.dir[1] + vz * ray.dir[2];
		const off = Math.hypot(
			vx - along * ray.dir[0],
			vy - along * ray.dir[1],
			vz - along * ray.dir[2]
		);
		if (!best || off < best.off - 1e-9) best = { node, t, off };
	}
	return best ? { node: best.node, t: best.t } : null;
}

/** Pixel position in an element to normalised device coordinates (x right, y up). */
export function toNdc(
	clientX: number,
	clientY: number,
	rect: { left: number; top: number; width: number; height: number }
): [number, number] {
	return [
		((clientX - rect.left) / rect.width) * 2 - 1,
		-(((clientY - rect.top) / rect.height) * 2 - 1)
	];
}
