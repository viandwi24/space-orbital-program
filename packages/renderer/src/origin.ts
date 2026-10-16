/**
 * Floating origin (ADR 0007, units-and-frames.md). Pure float64 math: the GPU only ever sees
 * `world − origin`, which is small near the camera anchor.
 */
import type { Vec3 } from '@orbital/core';

/** Re-centre when the anchor is farther than this from the origin, m (units-and-frames.md). */
export const DEFAULT_ORIGIN_THRESHOLD = 10_000;

/**
 * Origins snap to multiples of this, m. A power of two keeps `world − origin` exact in float64
 * (the origin has no low-order bits that the subtraction would have to round away).
 */
export const ORIGIN_GRID = 1024;

export const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

export const snapToGrid = (p: Vec3, grid: number = ORIGIN_GRID): Vec3 => ({
	x: Math.round(p.x / grid) * grid,
	y: Math.round(p.y / grid) * grid,
	z: Math.round(p.z / grid) * grid
});

/** True only when the anchor is strictly farther than `threshold` from `origin`. */
export const needsRebase = (
	origin: Vec3,
	anchor: Vec3,
	threshold: number = DEFAULT_ORIGIN_THRESHOLD
): boolean => Math.hypot(anchor.x - origin.x, anchor.y - origin.y, anchor.z - origin.z) > threshold;

export interface OriginUpdate {
	origin: Vec3;
	shifted: boolean;
	/** `newOrigin − oldOrigin`; subtract from every render-space position when `shifted`. */
	shift: Vec3;
}

/** Returns the same `origin` object when no shift is needed; never mutates its inputs. */
export function updateOrigin(
	origin: Vec3,
	anchor: Vec3,
	threshold: number = DEFAULT_ORIGIN_THRESHOLD
): OriginUpdate {
	if (!needsRebase(origin, anchor, threshold)) return { origin, shifted: false, shift: ZERO };
	const next = snapToGrid(anchor);
	return {
		origin: next,
		shifted: true,
		shift: { x: next.x - origin.x, y: next.y - origin.y, z: next.z - origin.z }
	};
}

/** World (root inertial frame, float64) to render space relative to `origin`. */
export const toRenderSpace = (world: Vec3, origin: Vec3): Vec3 => ({
	x: world.x - origin.x,
	y: world.y - origin.y,
	z: world.z - origin.z
});
