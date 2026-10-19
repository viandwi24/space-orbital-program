import type { PartShape } from '@orbital/sdk';

/** Every stack part is a 1.25 m class cylinder unless it says otherwise: radius in metres. */
export const RADIUS = 0.625;

export type Vec3Tuple = [number, number, number];

/** A stack node: position, outward direction and joint diameter, m (plan 207, ADR 0212). */
export interface StackNode {
	pos: Vec3Tuple;
	dir: Vec3Tuple;
	size: number;
}

/**
 * Stack parts attach end to end along local Y: `top` faces +Y, `bottom` faces -Y, both on the
 * axis at half the part height. `dir` points away from the part. Both faces are `size` across
 * unless `bottomSize` says otherwise (an adapter).
 */
export function stackNodes(
	height: number,
	size = 1.25,
	bottomSize = size
): Record<'top' | 'bottom', StackNode> {
	return {
		top: { pos: [0, height / 2, 0], dir: [0, 1, 0], size },
		bottom: { pos: [0, -height / 2, 0], dir: [0, -1, 0], size: bottomSize }
	};
}

export const cylinder = (height: number, radius = RADIUS): PartShape => ({
	kind: 'cylinder',
	radius,
	height
});

/** The 2.5 m class (plan 210): radius, m. */
export const WIDE_RADIUS = 1.25;

/** Radius of the radial booster and the nose cone that caps it, m. */
export const BOOSTER_RADIUS = 0.4;
