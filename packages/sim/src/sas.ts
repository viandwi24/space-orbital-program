/**
 * Stability assist (plan 042, ADR 0049): turns a target attitude into the same attitude demand a
 * player's keys give, once per fixed step, from the vessel's orientation, angular velocity, mass
 * properties and the control authority its modules report. Environment-neutral and deterministic:
 * a pure function of sim state.
 */
import { isFailed } from './reliability.ts';
import type { EntityId, Quat, SasMode, Vec3 } from '@orbital/core';
import { cross, dot, length, normalize, scale, sub } from '@orbital/kepler';
import { bodyOfVessel, spinAt } from './bodies.ts';
import { isControlled, moduleDefOf, partOf, vesselOf, type SimCore } from './core.ts';
import type { FlightBody, FlightFrame, SasState, VesselState } from './state.ts';
import { makeContext } from './hooks.ts';
import { qConj, qMul, qNormalize, qRotate } from './math.ts';
import { burnDirection } from './maneuver.ts';
import { targetDirection as directionToTarget } from './target.ts';
import { motionOf } from './orbit.ts';

/** Position gain (1/s): desired rate per radian of error near the target. */
export const KP = 0.7;
/** Rate-loop gain (1/s). */
export const KR = 3;
/** Integral gain (rad/s^3 per rad). */
export const KI = 0.25;
/** Fraction of the angular acceleration the braking profile may count on. */
export const BRAKE = 0.5;
/** Largest slew rate, rad/s. */
export const RATE_MAX = 0.6;
/** Errors above this get no integral action (anti-windup), rad. */
export const INTEGRAL_ZONE = 0.2;
/** The integral is limited to this fraction of the authority. */
export const INTEGRAL_LIMIT = 0.5;
/**
 * Quiet band: a settled vessel (error below `QUIET_ENTER`, angular speed below `QUIET_RATE`) gets
 * exactly nothing until the error exceeds `QUIET_LEAVE`, so it stays force-free long enough to go
 * on rails with SAS on (ADR 0049). Rad and rad/s.
 */
export const QUIET_ENTER = 0.003;
export const QUIET_LEAVE = 0.01;
export const QUIET_RATE = 0.01;
/** A held attitude latches when the angular speed is below this (rad/s). */
export const LATCH_RATE = 0.004;
/** Below this speed the velocity has no direction worth pointing at, m/s. */
export const MIN_SPEED = 0.5;

const NOSE: Vec3 = { x: 0, y: 1, z: 0 };
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

/** The direction the modes that aim at something (not at the velocity) ask for: the node's burn or the target. */
function aimOf(core: SimCore, vessel: VesselState): Vec3 | undefined {
	switch (vessel.sas.mode) {
		case 'maneuver':
			return burnDirection(core, vessel);
		case 'target':
		case 'anti-target':
			return directionToTarget(core, vessel);
		default:
			return undefined;
	}
}

/** Pointing modes (the ones with a direction). */
export const isPointing = (mode: SasMode): boolean => mode !== 'off' && mode !== 'hold';

/**
 * Unit direction (BCI) a pointing mode asks the nose to take, or undefined when there is none
 * (too slow, or no orbit plane). Same definitions as the navball markers (ADR 0026): prograde
 * along the reference velocity, normal along `r x v` of the inertial state, radial along `r`;
 * `maneuver` along `burn`, the remaining burn of the earliest node (plan 045); `target` along
 * `burn` too and `anti-target` against it, where the caller passes the unit direction to the
 * vessel's target (plan 035).
 */
export function targetDirection(
	/** The body's angular velocity (inertial, rad/s), or its rate about +Y (plan 085 kept the number form). */
	omega: number | Vec3,
	sas: Pick<SasState, 'mode' | 'reference'>,
	r: Vec3,
	v: Vec3,
	burn?: Vec3
): Vec3 | undefined {
	const spin = typeof omega === 'number' ? { x: 0, y: omega, z: 0 } : omega;
	const surface = sub(v, cross(spin, r));
	const ref = sas.reference === 'surface' ? surface : v;
	const along = (d: Vec3, sign: number): Vec3 | undefined =>
		length(d) < MIN_SPEED ? undefined : scale(normalize(d), sign);
	const h = cross(r, v);
	const normal = (sign: number): Vec3 | undefined =>
		length(h) < 1e-6 * length(r) * Math.max(length(v), 1) ? undefined : scale(normalize(h), sign);
	switch (sas.mode) {
		case 'prograde':
			return along(ref, 1);
		case 'retrograde':
			return along(ref, -1);
		case 'normal':
			return normal(1);
		case 'antinormal':
			return normal(-1);
		case 'radial-out':
			return scale(normalize(r), 1);
		case 'radial-in':
			return scale(normalize(r), -1);
		case 'maneuver':
		case 'target':
			return burn;
		case 'anti-target':
			return burn && scale(burn, -1);
		default:
			return undefined;
	}
}

/** Rotation that carries unit `a` onto unit `b` by the shortest way. */
export function qBetween(a: Vec3, b: Vec3): Quat {
	const c = dot(a, b);
	if (c < -1 + 1e-12) {
		const perp = Math.abs(a.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
		const axis = normalize(cross(a, perp));
		return { x: axis.x, y: axis.y, z: axis.z, w: 0 };
	}
	const x = cross(a, b);
	return qNormalize({ x: x.x, y: x.y, z: x.z, w: 1 + c });
}

/** Error vector (rad, body axes) that rotates the body onto `target` about the eigen-axis. */
function holdError(orientation: Quat, target: Quat): Vec3 {
	let q = qMul(target, qConj(orientation));
	if (q.w < 0) q = { x: -q.x, y: -q.y, z: -q.z, w: -q.w };
	const s = Math.hypot(q.x, q.y, q.z);
	if (s < 1e-12) return ZERO;
	const angle = 2 * Math.atan2(s, q.w);
	return qRotate(qConj(orientation), scale({ x: q.x / s, y: q.y / s, z: q.z / s }, angle));
}

/** Error vector (rad, body axes, no roll) that turns the nose onto the world direction `d`. */
function pointError(orientation: Quat, d: Vec3): Vec3 {
	const nose = qRotate(orientation, NOSE);
	const axis = cross(nose, d);
	const s = length(axis);
	const c = dot(nose, d);
	if (s < 1e-12) {
		return c > 0 ? ZERO : { x: Math.PI, y: 0, z: 0 };
	}
	const angle = Math.atan2(s, c);
	const e = qRotate(qConj(orientation), scale(axis, angle / s));
	return { x: e.x, y: 0, z: e.z };
}

/** Diagonal of the inertia tensor in body axes from the principal moments and their frame. */
function inertiaDiagonal(body: Pick<FlightBody, 'inertia' | 'inertiaFrame'>): Vec3 {
	const ex = qRotate(body.inertiaFrame, { x: 1, y: 0, z: 0 });
	const ey = qRotate(body.inertiaFrame, { x: 0, y: 1, z: 0 });
	const ez = qRotate(body.inertiaFrame, { x: 0, y: 0, z: 1 });
	const { x: a, y: b, z: c } = body.inertia;
	return {
		x: a * ex.x * ex.x + b * ey.x * ey.x + c * ez.x * ez.x,
		y: a * ex.y * ex.y + b * ey.y * ey.y + c * ez.y * ez.y,
		z: a * ex.z * ex.z + b * ey.z * ey.z + c * ez.z * ez.z
	};
}

/**
 * Largest torque per body axis the vessel's modules can add now (ADR 0049): each module's
 * `controlAuthority`, in its part frame, rotated by the part's yaw into body axes (magnitudes).
 */
export function vesselAuthority(core: SimCore, vesselId: EntityId): Vec3 {
	const vessel = vesselOf(core, vesselId);
	let x = 0;
	let y = 0;
	let z = 0;
	for (const partId of vessel.parts) {
		const part = partOf(core, partId);
		for (const m of part.modules) {
			const def = moduleDefOf(core, m.id);
			if (!def.controlAuthority || isFailed(core, partId, m.id)) continue;
			const a = def.controlAuthority(makeContext(core, partId, m.id));
			const c = Math.abs(Math.cos(part.yaw));
			const s = Math.abs(Math.sin(part.yaw));
			x += c * a.x + s * a.z;
			y += a.y;
			z += s * a.x + c * a.z;
		}
	}
	return { x, y, z };
}

const inputHeld = (v: VesselState): boolean =>
	v.control.pitch !== 0 || v.control.yaw !== 0 || v.control.roll !== 0;

/**
 * One flight step of the assist for `vesselId`: fills `sas.demand`/`sas.active`/`sas.error`.
 * Called before the module hooks so they see the demand.
 */
export function stepSas(
	core: SimCore,
	frame: FlightFrame,
	vesselId: EntityId,
	body: FlightBody,
	dt: number
): void {
	const vessel = vesselOf(core, vesselId);
	const sas = vessel.sas;
	sas.active = false;
	if (sas.mode === 'off' || !isControlled(core, vessel)) {
		sas.error = 0;
		return;
	}
	const orientation = frame.backend.getTransform(body.handle).rotation;
	const omegaWorld = frame.backend.getVelocity(body.handle).angular;
	const omega = qRotate(qConj(orientation), omegaWorld);

	if (inputHeld(vessel)) {
		// The player steers: the assist steps aside and follows (hold) or waits (pointing modes).
		sas.hold = orientation;
		sas.settling = sas.mode === 'hold';
		sas.integral = { ...ZERO };
		sas.error = 0;
		return;
	}

	let error: Vec3 | undefined;
	let settle = false;
	if (sas.mode === 'hold') {
		if (sas.settling) {
			sas.hold = orientation;
			settle = true;
			if (length(omega) < LATCH_RATE) sas.settling = false;
		} else error = holdError(orientation, sas.hold);
	} else {
		const d = targetDirection(
			spinAt(bodyOfVessel(core, vessel), core.t),
			sas,
			vessel.com,
			vessel.velocity,
			aimOf(core, vessel)
		);
		if (d) error = pointError(orientation, d);
		else settle = true;
	}

	const authority = vesselAuthority(core, vesselId);
	const inertia = inertiaDiagonal(body);
	const e = error ?? ZERO;
	sas.error = length(e);
	const rate = length(omega);
	const axes = ['x', 'y', 'z'] as const;
	const limit = axes.map((k) => authority[k] / Math.max(inertia[k], 1e-6));
	// A persistent disturbance shows as a learned integral: then the assist keeps working.
	const learned = axes.some((k, i) => Math.abs(sas.integral[k]) > 0.05 * limit[i]!);
	if (sas.quiet) {
		if (sas.error > QUIET_LEAVE || rate > 2 * QUIET_RATE || learned) sas.quiet = false;
	} else if (sas.error < QUIET_ENTER && rate < QUIET_RATE && !learned) sas.quiet = true;
	if (sas.quiet) return;
	const out = [0, 0, 0];
	const integral = { ...sas.integral };
	for (let i = 0; i < 3; i++) {
		const k = axes[i]!;
		const amax = limit[i]!;
		if (!(authority[k] > 1e-6) || !(amax > 0)) {
			integral[k] = 0;
			continue;
		}
		const err = e[k];
		const wDes = settle
			? 0
			: Math.sign(err) *
				Math.min(KP * Math.abs(err), Math.sqrt(2 * BRAKE * amax * Math.abs(err)), RATE_MAX);
		if (!settle && error) {
			if (Math.abs(err) < INTEGRAL_ZONE) {
				integral[k] = clamp(
					integral[k] + KI * err * dt,
					-INTEGRAL_LIMIT * amax,
					INTEGRAL_LIMIT * amax
				);
			}
		} else integral[k] = 0;
		const accel = KR * (wDes - omega[k]) + integral[k];
		out[i] = clamp(accel / amax, -1, 1);
	}
	sas.integral = integral;
	sas.demand = { x: out[0]!, y: out[1]!, z: out[2]! };
	sas.active = true;
}

/**
 * Rails step (ADR 0049): a pointing mode keeps the nose on its direction analytically on orbital
 * rails; `hold` keeps the frozen attitude; surface rails are untouched.
 */
export function stepSasOnRails(core: SimCore, vessel: VesselState): void {
	const sas = vessel.sas;
	sas.active = false;
	if (!isPointing(sas.mode) || vessel.rails === null || vessel.rails.kind === 'surface') return;
	if (!isControlled(core, vessel)) return;
	const { r, v } = motionOf(core, vessel);
	const d = targetDirection(
		spinAt(bodyOfVessel(core, vessel), core.t),
		sas,
		r,
		v,
		aimOf(core, vessel)
	);
	if (!d) return;
	const nose = qRotate(vessel.orientation, NOSE);
	vessel.orientation = qNormalize(qMul(qBetween(nose, d), vessel.orientation));
	sas.error = 0;
}

/** Latch the current attitude and start settling (switching `hold` on). */
export function beginHold(sas: SasState, orientation: Quat): void {
	sas.hold = orientation;
	sas.settling = true;
	sas.integral = { ...ZERO };
}
