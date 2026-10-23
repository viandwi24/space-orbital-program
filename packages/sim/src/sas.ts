/**
 * Stability assist (plan 042, ADR 0049): turns a target attitude into the same attitude demand a
 * player's keys give, once per fixed step, from the vessel's orientation, angular velocity, mass
 * properties and the control authority its modules report. Environment-neutral and deterministic:
 * a pure function of sim state.
 */
import { isFailed } from './reliability.ts';
import {
	PHYSICS_WARP_MAX,
	REENTRY_AOA,
	type EntityId,
	type Quat,
	type SasMode,
	type Vec3
} from '@orbital/core';
import { cross, dot, length, normalize, scale, sub } from '@orbital/kepler';
import { bodyOfVessel, spinAt } from './bodies.ts';
import { isControlled, moduleDefOf, partOf, vesselIds, vesselOf, type SimCore } from './core.ts';
import { wake, wakeBlocker } from './modes.ts';
import type { FlightBody, FlightFrame, SasState, VesselState } from './state.ts';
import { makeContext } from './hooks.ts';
import { qConj, qFromBasis, qMul, qNormalize, qRotate } from './math.ts';
import { burnDirection } from './maneuver.ts';
import { targetDirection as directionToTarget } from './target.ts';
import { motionOf } from './orbit.ts';
import { partRotation } from './parts.ts';

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
 * `level` holds a craft against its own steady aerodynamic moment (plan 063, ADR 0161 point 5): its
 * integral may take the whole authority.
 */
export const LEVEL_INTEGRAL_LIMIT = 1;
const limitOf = (mode: SasMode): number =>
	mode === 'level' ? LEVEL_INTEGRAL_LIMIT : INTEGRAL_LIMIT;
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

/**
 * The nose SAS points, in the vessel's body axes (plan 221, ADR 0208 point 2): the control part's
 * +Y when the player chose "control from here", else the root's.
 */
export function controlNose(core: SimCore, vessel: VesselState): Vec3 {
	if (vessel.controlPart === undefined || !core.world.hasEntity(vessel.controlPart)) return NOSE;
	return qRotate(partRotation(partOf(core, vessel.controlPart)), NOSE);
}

/** The direction the modes that aim at something (not at the velocity) ask for: the node's burn or the target. */
function aimOf(core: SimCore, vessel: VesselState): Vec3 | undefined {
	switch (vessel.sas.mode) {
		case 'maneuver':
			return burnDirection(core, vessel);
		case 'target':
		case 'anti-target':
			return directionToTarget(core, vessel);
		case 'direction':
			return vessel.sas.direction;
		default:
			return undefined;
	}
}

/** The control part's top (+Z) in the vessel's body axes: "up" for its roll (plan 361). */
export function controlTop(core: SimCore, vessel: VesselState): Vec3 {
	const top = { x: 0, y: 0, z: 1 };
	if (vessel.controlPart === undefined || !core.world.hasEntity(vessel.controlPart)) return top;
	return qRotate(partRotation(partOf(core, vessel.controlPart)), top);
}

/** Modes that fly along the velocity: in the air they also level the wings (plan 361). */
const ALONG_PATH: ReadonlySet<SasMode> = new Set(['prograde', 'retrograde', 'reentry']);
/** The nose this far from the vertical (cosine) or more counts as flying, not climbing. */
const LEVEL_COS = 0.87;

/**
 * The control part's roll about the nose from local `up` (rad, positive turning the top toward the
 * right wing), or undefined when the nose is near the vertical and up has no direction across it.
 */
function rollFromUp(
	orientation: Quat,
	noseBody: Vec3,
	topBody: Vec3,
	up: Vec3
): number | undefined {
	const nose = qRotate(orientation, noseBody);
	const across = (v: Vec3): Vec3 | undefined => {
		const p = sub(v, scale(nose, dot(v, nose)));
		return length(p) < 0.05 ? undefined : normalize(p);
	};
	const top = across(qRotate(orientation, topBody));
	const ref = across(up);
	if (!top || !ref) return undefined;
	return Math.atan2(dot(cross(ref, top), nose), dot(ref, top));
}

const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** Pointing modes (the ones with a direction). */
export const isPointing = (mode: SasMode): boolean =>
	mode !== 'off' && mode !== 'hold' && mode !== 'level';

/**
 * Level wings (plan 063, ADR 0161 point 5): the attitude with the nose on the horizon along its own
 * heading and the wings level (+Z up), or undefined when the nose points straight up or down.
 */
export function levelAttitude(orientation: Quat, up: Vec3): Quat | undefined {
	const nose = qRotate(orientation, { x: 0, y: 1, z: 0 });
	const flat = sub(nose, scale(up, dot(nose, up)));
	if (length(flat) < 1e-3) return undefined;
	const y = normalize(flat);
	return qFromBasis(cross(y, up), y, up);
}

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
		case 'reentry': {
			// the airflow's direction pitched up by the angle of attack, in the vertical plane
			if (length(surface) < MIN_SPEED) return undefined;
			const vHat = normalize(surface);
			const lift = cross(cross(vHat, normalize(r)), vHat);
			if (length(lift) < 1e-6) return vHat;
			const up = normalize(lift);
			const a = (REENTRY_AOA * Math.PI) / 180;
			return normalize({
				x: vHat.x * Math.cos(a) + up.x * Math.sin(a),
				y: vHat.y * Math.cos(a) + up.y * Math.sin(a),
				z: vHat.z * Math.cos(a) + up.z * Math.sin(a)
			});
		}
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
		case 'direction':
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
function pointError(orientation: Quat, d: Vec3, noseBody: Vec3 = NOSE): Vec3 {
	const nose = qRotate(orientation, noseBody);
	const axis = cross(nose, d);
	const s = length(axis);
	const c = dot(nose, d);
	if (s < 1e-12) {
		return c > 0 ? ZERO : { x: Math.PI, y: 0, z: 0 };
	}
	const angle = Math.atan2(s, c);
	const e = qRotate(qConj(orientation), scale(axis, angle / s));
	// no roll about the nose: for the root's nose (+Y) this is the x and z components
	return sub(e, scale(noseBody, dot(e, noseBody)));
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
		delete sas.roll; // the roll they leave is the one kept
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
	} else if (sas.mode === 'level') {
		const level = levelAttitude(orientation, normalize(vessel.com));
		if (level) error = holdError(orientation, level);
		else settle = true;
	} else {
		const d = targetDirection(
			spinAt(bodyOfVessel(core, vessel), core.t),
			sas,
			vessel.com,
			vessel.velocity,
			aimOf(core, vessel)
		);
		const noseBody = controlNose(core, vessel);
		if (d) {
			error = pointError(orientation, d, noseBody);
			// and the roll in the air (plan 361, ADR 0303): wings level along the path, else the roll
			// from local up it had when the mode took over
			const topBody = controlTop(core, vessel);
			const up = normalize(vessel.com);
			const nose = qRotate(orientation, noseBody);
			const body = bodyOfVessel(core, vessel);
			const air = body.def.atmosphere?.height ?? 0;
			const inAir = length(vessel.com) - body.def.radius < air;
			// in space the roll is only damped, as before: a vessel holding prograde round its orbit
			// settles and goes on rails
			const now =
				inAir || sas.mode === 'reentry'
					? rollFromUp(orientation, noseBody, topBody, up)
					: undefined;
			if (now !== undefined) {
				// re-entry keeps the wings level from orbit down; prograde and retrograde in the air
				const levelled = sas.mode === 'reentry' || inAir;
				let want: number;
				if (ALONG_PATH.has(sas.mode) && levelled && Math.abs(dot(nose, up)) < LEVEL_COS) want = 0;
				else {
					sas.roll ??= now;
					want = sas.roll;
				}
				const r = wrapAngle(want - now);
				error = { ...error };
				// a turn about the nose by r takes the top from its roll now to the one wanted
				error.x += noseBody.x * r;
				error.y += noseBody.y * r;
				error.z += noseBody.z * r;
			}
		} else settle = true;
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
	// the slowest turn axis of the nose, rad/s²: the HUD's "low torque" (plan 310)
	sas.accel = Math.min(limit[0]!, limit[2]!);
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
					-limitOf(sas.mode) * amax,
					limitOf(sas.mode) * amax
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

/** The assist level a mode needs (plan 260): 0 hold, 1 prograde, 2 normal and radial, 3 maneuver and target. */
export function sasLevelNeeded(mode: SasMode): number {
	switch (mode) {
		case 'off':
		case 'hold':
		case 'level':
		// the computer that asks for a direction does the aiming (plan 310, ADR 0271 point 2)
		case 'direction':
			return 0;
		case 'prograde':
		case 'retrograde':
		case 'reentry':
			return 1;
		case 'normal':
		case 'antinormal':
		case 'radial-in':
		case 'radial-out':
			return 2;
		default:
			return 3;
	}
}

/** The best assist level of the vessel's control sources (plan 260); a source without a level gives 3. */
export function sasLevelOf(core: SimCore, vessel: VesselState): number {
	let level = 0;
	for (const id of vessel.parts) {
		for (const m of partOf(core, id).modules) {
			const def = moduleDefOf(core, m.id);
			if (def.controlSource !== true) continue;
			level = Math.max(level, def.sasLevel ? def.sasLevel(m.config as never) : 3);
		}
	}
	return level;
}

/**
 * Rails step (ADR 0049): a pointing mode keeps the nose on its direction analytically on orbital
 * rails; `hold` keeps the frozen attitude; surface rails are untouched.
 */
export function stepSasOnRails(core: SimCore, vessel: VesselState, step = Infinity): void {
	const sas = vessel.sas;
	sas.active = false;
	const turn = railsTurn(core, vessel);
	if (!turn) return;
	const angle = 2 * Math.acos(Math.min(1, Math.abs(turn.w)));
	// no torque the last time it flew (no wheels, RCS off or dry): it cannot turn (plan 310)
	if (sas.accel === 0) {
		sas.error = angle;
		return;
	}
	// A real turn at physics warp is left for the wake before the next step: it takes the vessel's
	// own torque in flight (plan 310); only a small drift (prograde moving along the orbit) turns here
	if (angle > RAILS_TURN_WAKE && turnWakes(core, vessel)) {
		sas.error = angle;
		return;
	}
	// Rails warp holds the direction analytically; at 1x to 10x a change turns the vessel at a
	// bounded rate instead of snapping it in one step (plan 257)
	const limit = core.warp <= PHYSICS_WARP_MAX ? SAS_RAILS_RATE * step : Infinity;
	const part = angle > limit ? limit / angle : 1;
	vessel.orientation = qNormalize(
		qMul(part === 1 ? turn : scaleTurn(turn, part), vessel.orientation)
	);
	sas.error = part === 1 ? 0 : angle - limit;
}

/**
 * A pointing turn on rails bigger than this, at physics warp, puts the vessel in flight (plan 310):
 * the turn then takes its real torque, wheels and RCS, as in KSP, instead of a fixed rate. rad (2°).
 */
export const RAILS_TURN_WAKE = (2 * Math.PI) / 180;

/** The turn a pointing mode asks of an on-rails vessel now, or undefined. */
function railsTurn(core: SimCore, vessel: VesselState): Quat | undefined {
	const sas = vessel.sas;
	if (
		!isPointing(sas.mode) ||
		vessel.rails === null ||
		vessel.rails.kind === 'surface' ||
		vessel.rails.kind === 'frozen'
	)
		return undefined;
	if (!isControlled(core, vessel)) return undefined;
	const { r, v } = motionOf(core, vessel);
	const d = targetDirection(
		spinAt(bodyOfVessel(core, vessel), core.t),
		sas,
		r,
		v,
		aimOf(core, vessel)
	);
	if (!d) return undefined;
	return qBetween(qRotate(vessel.orientation, controlNose(core, vessel)), d);
}

/** The vessel can be woken for a turn: physics warp and room for it. */
function turnWakes(core: SimCore, vessel: VesselState): boolean {
	if (core.warp > PHYSICS_WARP_MAX) return false;
	return wakeBlocker(core, partOf(core, vessel.root).vessel) === undefined;
}

/**
 * Before a step (plan 310): on-rails vessels whose SAS asks for a real turn go in flight, so the turn
 * takes their torque. Runs before the sim chooses a flight step or a rails chunk.
 */
export function wakeTurningVessels(core: SimCore): void {
	if (core.warp > PHYSICS_WARP_MAX) return;
	for (const id of vesselIds(core)) {
		const vessel = vesselOf(core, id);
		if (vessel.mode !== 'on-rails' || vessel.sas.accel === 0) continue;
		const turn = railsTurn(core, vessel);
		if (!turn || 2 * Math.acos(Math.min(1, Math.abs(turn.w))) <= RAILS_TURN_WAKE) continue;
		if (wakeBlocker(core, id) === undefined) wake(core, id, 'SAS turn');
	}
}

/** How fast a vessel on rails turns at physics warp, rad/s (about what a small reaction wheel gives). */
export const SAS_RAILS_RATE = Math.PI / 6;

/** The rotation `turn` taken by the fraction `f` of its angle. */
function scaleTurn(turn: Quat, f: number): Quat {
	const w = Math.max(-1, Math.min(1, turn.w));
	const half = Math.acos(Math.abs(w));
	const sign = w < 0 ? -1 : 1;
	const s = Math.sin(half);
	if (s < 1e-12) return { x: 0, y: 0, z: 0, w: 1 };
	const k = (Math.sin(half * f) / s) * sign;
	return { x: turn.x * k, y: turn.y * k, z: turn.z * k, w: Math.cos(half * f) };
}

/** Latch the current attitude and start settling (switching `hold` on). */
export function beginHold(sas: SasState, orientation: Quat): void {
	sas.hold = orientation;
	sas.settling = true;
	sas.integral = { ...ZERO };
}
