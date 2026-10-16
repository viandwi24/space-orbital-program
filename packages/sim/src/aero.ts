/**
 * Per-part drag, applied per body axis: `F_i = -½ ρ C_d A_i |v_i| v_i` for the airflow component
 * `v_i` along each part-local axis (ADR 0017). `A_i` is the projected area normal to the axis:
 * for a cylinder the side area `2 r h` across X and Z and the end face `π r²` along Y (zero when
 * the windward end is attached to another part: it is shielded); for a box the three face areas.
 * Parts without a shape count as a 1 m box. Working per axis keeps the axial drag exactly along
 * the body axis, so a vessel that is slightly off its velocity vector gets only second-order
 * (cross-flow) torque instead of the large destabilising torque a drag vector anti-parallel to
 * the velocity would put on the nose. Lift is out of scope.
 */
import type { PartShape, Vec3 } from '@orbital/core';
import { FALLBACK_PART_SIZE } from './constants.ts';

export interface CoveredEnds {
	/** The +Y end face is attached to another part. */
	top: boolean;
	/** The -Y end face is attached to another part. */
	bottom: boolean;
}

/** Projected areas (m²) normal to the part-local X, Y and Z axes for air moving along `sign(v_y)` on Y. */
export function axisAreas(shape: PartShape | undefined, vy: number, covered: CoveredEnds): Vec3 {
	if (shape?.kind === 'cylinder') {
		const { radius: r, height: h } = shape;
		const windwardCovered = vy > 0 ? covered.top : covered.bottom;
		return { x: 2 * r * h, y: windwardCovered ? 0 : Math.PI * r * r, z: 2 * r * h };
	}
	const [sx, sy, sz] =
		shape?.kind === 'box'
			? shape.size
			: ([FALLBACK_PART_SIZE, FALLBACK_PART_SIZE, FALLBACK_PART_SIZE] as const);
	return { x: sy * sz, y: sx * sz, z: sx * sy };
}
