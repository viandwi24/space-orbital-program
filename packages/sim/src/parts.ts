/** Physics shape and inertia of a part, from its placeholder `shape` (ADR 0014, ADR 0017). */
import type { PartDefinition, Quat, Vec3 } from '@orbital/core';
import { FALLBACK_PART_SIZE } from './constants.ts';
import { qAboutY } from './math.ts';
import type { PartState } from './state.ts';

/** The part's rotation relative to the vessel axes: its full `rotation`, or its yaw about +Y. */
export const partRotation = (part: Pick<PartState, 'yaw' | 'rotation'>): Quat =>
	part.rotation ?? qAboutY(part.yaw);

/** True when the part is turned at all (so a caller can skip the rotation of the common case). */
export const isTurned = (part: Pick<PartState, 'yaw' | 'rotation'>): boolean =>
	part.rotation !== undefined || part.yaw !== 0;

/**
 * Half extents of the part's collision box. Cylinders use the box `(r, h/2, r)`: exact along the
 * stack axis (what stacking and separation depend on), conservative sideways. No shape: a 1 m box.
 */
export function halfExtentsOf(def: PartDefinition): Vec3 {
	const s = def.shape;
	if (!s)
		return { x: FALLBACK_PART_SIZE / 2, y: FALLBACK_PART_SIZE / 2, z: FALLBACK_PART_SIZE / 2 };
	if (s.kind === 'box') return { x: s.size[0] / 2, y: s.size[1] / 2, z: s.size[2] / 2 };
	return { x: s.radius, y: s.height / 2, z: s.radius };
}

/**
 * Principal inertia of the part about its own centre for `mass` kg. Cylinders get the
 * solid-cylinder moments (the box the collider uses would be 27 % too stiff about its axis);
 * boxes and shapeless parts the solid-box moments.
 */
export function inertiaOf(def: PartDefinition, mass: number): Vec3 {
	const s = def.shape;
	if (s?.kind === 'cylinder') {
		const side = (mass * (3 * s.radius * s.radius + s.height * s.height)) / 12;
		return { x: side, y: 0.5 * mass * s.radius * s.radius, z: side };
	}
	const h = halfExtentsOf(def);
	return {
		x: (mass / 3) * (h.y * h.y + h.z * h.z),
		y: (mass / 3) * (h.x * h.x + h.z * h.z),
		z: (mass / 3) * (h.x * h.x + h.y * h.y)
	};
}
