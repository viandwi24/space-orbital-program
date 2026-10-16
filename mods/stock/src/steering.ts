/**
 * Steering arithmetic shared by the gimbal and the control surfaces (ADR 0045): the one mixing
 * rule that turns an attitude demand into a fraction of an actuator's range. Pure, SI, part frame.
 */
import type { Vec3 } from '@orbital/sdk';

/** An actuator closer than this to the centre of mass (m) has proportionally less authority. */
export const ARM_REFERENCE = 1;

export const cross = (a: Vec3, b: Vec3): Vec3 => ({
	x: a.y * b.z - a.z * b.y,
	y: a.z * b.x - a.x * b.z,
	z: a.x * b.y - a.y * b.x
});

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/**
 * Fraction of the range (-1..1) for an actuator whose torque per unit deflection is `torque`
 * (N·m per N for a gimbal, a lever arm in metres) given the torque-direction `demand`:
 * `clamp(d . t / |t|, -1, 1) * min(1, |t| / ARM_REFERENCE)`. Zero for an actuator with no lever.
 */
export function mixFraction(demand: Vec3, torque: Vec3): number {
	const n = Math.hypot(torque.x, torque.y, torque.z);
	if (n < 1e-9) return 0;
	const along = (demand.x * torque.x + demand.y * torque.y + demand.z * torque.z) / n;
	return clamp(along, -1, 1) * Math.min(1, n / ARM_REFERENCE);
}

/** Move `value` towards `target` by at most `step` (>= 0). */
export function slew(value: number, target: number, step: number): number {
	const d = target - value;
	return Math.abs(d) <= step ? target : value + Math.sign(d) * step;
}

/**
 * Target thrust tilt `[towardX, towardZ]` in rad for an engine at the part origin whose centre of
 * mass sits at `com` (part frame): the torque of a unit lateral force at the origin is
 * `(0 - com) x axis`.
 */
export function gimbalTarget(com: Vec3, demand: Vec3, rangeRad: number): readonly [number, number] {
	const r = { x: -com.x, y: -com.y, z: -com.z };
	return [
		rangeRad * mixFraction(demand, cross(r, { x: 1, y: 0, z: 0 })),
		rangeRad * mixFraction(demand, cross(r, { x: 0, y: 0, z: 1 }))
	];
}

/** Unit thrust direction for tilt angles `[ax, az]` (rad); the tilt is limited so it stays real. */
export function gimbalDirection(ax: number, az: number): Vec3 {
	const x = Math.sin(ax);
	const z = Math.sin(az);
	return { x, y: Math.sqrt(Math.max(0, 1 - x * x - z * z)), z };
}

/**
 * Target deflection (rad) of a control surface of range `maxRad` whose centre of pressure is at
 * `centre` with the hinge along local X, for forward flight (air towards -Y). A positive
 * deflection gives a force towards -Z, so the torque per unit is `-(r x z)`; backward flow flips it.
 */
export function surfaceTarget(
	centre: Vec3,
	com: Vec3,
	demand: Vec3,
	maxRad: number,
	forward: boolean
): number {
	const arm = { x: centre.x - com.x, y: centre.y - com.y, z: centre.z - com.z };
	const t = cross(arm, { x: 0, y: 0, z: 1 });
	return -maxRad * mixFraction(demand, t) * (forward ? 1 : -1);
}
