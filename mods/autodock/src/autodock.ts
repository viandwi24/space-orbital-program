/**
 * The Auto Dock autopilot (plan 310, ADR 0271), flown through the public `VesselPilot` only.
 *
 * The player controls the vessel from a docking port and targets a port of another vessel. Then:
 * 1. align: SAS points the own port against the target port's axis (anti-parallel) while RCS
 *    nulls the relative velocity;
 * 2. approach: RCS flies the own port out onto the target port's axis and in along it, stopping at
 *    each corridor mark (200, 50, 10, 1 m) until it is centred, aligned and slow; each stretch has
 *    a speed limit; a PID on the lateral offset keeps it on the axis;
 * 3. capture: the last metre at a soft, steady speed: the ports' magnets take over and the sim
 *    docks the two (which ends the autopilot as done).
 * It aborts on a shortage of RCS propellant, when RCS cannot move the vessel, from behind the
 * target port, off the axis too close in, or after too long.
 */
import { defineAutopilot, type DockingAlignment, type Vec3, type VesselPilot } from '@orbital/sdk';

/** Corridor marks where the vessel stops and centres, m from the target face along its axis; 0 is contact. */
export const CORRIDOR = [200, 50, 10, 0] as const;
/** Speed limits along the axis, m/s: beyond 50 m, 10 to 50 m, 1 to 10 m, the last metre. */
export const SPEED_LIMITS = [2, 1, 0.3, 0.15] as const;
/** The speed limit `along` m out. */
export const speedLimit = (along: number): number =>
	along > 50
		? SPEED_LIMITS[0]
		: along > 10
			? SPEED_LIMITS[1]
			: along > 1
				? SPEED_LIMITS[2]
				: SPEED_LIMITS[3];
/** Inside this the ports' magnets pull (the sim's range is 5 m), m; they close at up to `PULL_SPEED`. */
const MAGNETS = 6;
const PULL_SPEED = 0.3;
/** Farthest start, m (face to face). */
export const MAX_START_DISTANCE = 250;
/** Within this the faces count as aligned, rad (3°). */
export const ALIGNED = (3 * Math.PI) / 180;
/** Beyond this the approach stops and waits for the attitude, rad (6°). */
export const MISALIGNED = (6 * Math.PI) / 180;
/** The vessel is "stopped" at a mark below this relative speed, m/s. */
export const STOPPED = 0.05;
/**
 * A velocity error this large counts as "pushing at full" for the stall check, m/s; below
 * `DEADBAND` nothing is sent.
 */
const FULL_AT = 0.2;
const DEADBAND = 0.01;
/** First guess of the RCS acceleration per unit of demand, m/s² (learned while flying). */
const ACCEL_GUESS = 1;
/** Each push asks for this share of the error in one step (1 would be dead-beat). */
const PUSH_SHARE = 0.5;
/** Lateral PID gains: speed toward the axis per metre off it, per metre-second, and the cap. */
const KP = 0.25;
const KI = 0.01;
const LATERAL_SPEED = 0.5;
/** Abort when propellant falls below this share of its capacity. */
const PROPELLANT_RESERVE = 0.02;
/**
 * RCS "has no authority" when, pushing at full, the relative velocity changes by less than
 * `STALL_DV` in each `STALL_WINDOW` for `STALL_TIME` s in a row.
 */
const STALL_WINDOW = 5;
const STALL_DV = 0.01;
const STALL_TIME = 20;
/** Give up after this long, s. */
const TIMEOUT = 30 * 60;

export interface AutoDockParams {
	/** The RCS propellant to watch; `stock.monopropellant` by default. */
	propellant?: string;
}

export interface AutoDockMemory {
	phase: 'align' | 'approach' | 'capture';
	/** Index into `CORRIDOR` of the mark the vessel heads for. */
	mark: number;
	started: number;
	propellant: string;
	/** Integral of the lateral offset, m s (inertial axes). */
	integral: Vec3;
	/** Learned RCS acceleration per unit of demand, m/s². */
	accel: number;
	/** Last demand in inertial axes and the relative velocity then (to learn `accel`). */
	lastDemand: Vec3 | null;
	lastVelocity: Vec3 | null;
	/** Start of the current full-thrust window, and the relative velocity then. */
	windowAt: number;
	windowVelocity: Vec3 | null;
	/** Seconds of full thrust without a change of velocity. */
	stalled: number;
}

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
const clampLength = (a: Vec3, max: number): Vec3 => {
	const l = len(a);
	return l > max ? scale(a, max / l) : a;
};
const deg = (rad: number): number => (rad * 180) / Math.PI;

/** How far off the axis the vessel may be to leave a mark at `along` m, m. */
export const lateralTolerance = (along: number): number => Math.max(0.1, 0.05 * along);

/** The mark ahead of a face `along` m out: the first corridor mark below it. */
export function markFor(along: number): number {
	const i = CORRIDOR.findIndex((m) => m < along - 0.5);
	return i < 0 ? CORRIDOR.length - 1 : i;
}

/** Why the vessel cannot start, or null. */
export function startProblem(ctrl: VesselPilot, propellant: string): string | null {
	if (!ctrl.controlPort)
		return 'Control from a docking port first (the port’s "Control from here").';
	if (!ctrl.target || ctrl.target.kind !== 'vessel' || !ctrl.targetPort)
		return 'Target a docking port of another vessel first.';
	if (!ctrl.targetPort.free) return 'The target port is not free.';
	const a = ctrl.alignment();
	if (!a) return 'The target vessel is out of range.';
	if (!a.sameSize) return 'The two ports are different sizes.';
	if (a.distance > MAX_START_DISTANCE)
		return `Come within ${MAX_START_DISTANCE} m of the target port first (now ${Math.round(a.distance)} m).`;
	const fuel = ctrl.resource(propellant);
	if (!fuel || fuel.amount <= PROPELLANT_RESERVE * fuel.capacity)
		return 'No RCS propellant aboard.';
	return null;
}

function readouts(a: DockingAlignment, mark: number): Record<string, number> {
	return {
		distance: Math.round(a.distance * 100) / 100,
		closing: Math.round(a.closing * 1000) / 1000,
		alignment: Math.round(deg(a.angle) * 10) / 10,
		lateral: Math.round(a.lateralDistance * 100) / 100,
		mark: CORRIDOR[mark] ?? 0
	};
}

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

/**
 * Send the RCS translation that drives the relative velocity (own minus target, inertial) toward
 * `want`, sized by the learned acceleration so one step takes `PUSH_SHARE` of the error: strong RCS
 * on a light vessel does not chatter, weak RCS on a heavy one pushes at full. Returns the error, m/s.
 */
function fly(
	ctrl: VesselPilot,
	m: AutoDockMemory,
	a: DockingAlignment,
	want: Vec3,
	dt: number
): number {
	// learn: the last demand's push along itself
	if (m.lastDemand && m.lastVelocity && dt > 0) {
		const d2 = dot(m.lastDemand, m.lastDemand);
		if (d2 > 0.04) {
			const seen = dot(sub(a.velocity, m.lastVelocity), m.lastDemand) / (d2 * dt);
			if (seen > 0) m.accel = 0.7 * m.accel + 0.3 * Math.min(50, Math.max(0.005, seen));
		}
	}
	m.lastVelocity = a.velocity;
	const error = sub(want, a.velocity);
	const size = len(error);
	if (size < DEADBAND) {
		ctrl.translate(0, 0, 0);
		m.lastDemand = null;
		return size;
	}
	const step = Math.max(dt, 0.02);
	const demand = clampLength(scale(error, PUSH_SHARE / (m.accel * step)), Math.sqrt(3));
	const local = ctrl.toLocal(demand);
	const x = Math.max(-1, Math.min(1, local.x));
	const y = Math.max(-1, Math.min(1, local.y));
	const z = Math.max(-1, Math.min(1, local.z));
	ctrl.translate(x, y, z);
	m.lastDemand = ctrl.toWorld({ x, y, z });
	return size;
}

export const AutoDock = defineAutopilot<AutoDockMemory>({
	id: 'autodock.dock',
	title: 'Auto Dock',
	description:
		'Docks the port you control from with the targeted port: aligns, nulls the drift and closes in along the axis by RCS.',
	rate: 10,
	start(ctrl, params) {
		const propellant = (params as AutoDockParams | undefined)?.propellant ?? 'stock.monopropellant';
		const problem = startProblem(ctrl, propellant);
		if (problem) throw new Error(problem);
		ctrl.rcs(true);
		const a = ctrl.alignment()!;
		return {
			phase: 'align',
			mark: markFor(Math.max(a.along, 0)),
			started: ctrl.time,
			propellant,
			integral: { x: 0, y: 0, z: 0 },
			accel: ACCEL_GUESS,
			lastDemand: null,
			lastVelocity: null,
			windowAt: ctrl.time,
			windowVelocity: null,
			stalled: 0
		};
	},
	step(ctrl, m, dt) {
		const a = ctrl.alignment();
		if (!ctrl.target || !ctrl.targetPort)
			return { phase: m.phase, abort: 'The target port is gone.' };
		if (!a) return { phase: m.phase, abort: 'Not controlled from a docking port any more.' };
		const fuel = ctrl.resource(m.propellant);
		if (!fuel || fuel.amount <= PROPELLANT_RESERVE * fuel.capacity)
			return { phase: m.phase, abort: 'Out of RCS propellant.' };
		if (ctrl.time - m.started > TIMEOUT)
			return { phase: m.phase, abort: 'Took too long; docking stopped.' };
		if (a.along < -0.5)
			return {
				phase: m.phase,
				abort: 'Behind the target port: start in front of its face.',
				readouts: readouts(a, m.mark)
			};
		if (a.along < 2 && a.lateralDistance > 1)
			return {
				phase: m.phase,
				abort: 'Too far off the axis this close to the port.',
				readouts: readouts(a, m.mark)
			};

		const n = ctrl.targetPort.direction;
		// own face against the target face
		ctrl.pointAt(scale(n, -1));
		if (!ctrl.vessel.rcs) ctrl.rcs(true);

		// lateral: a PID toward the axis
		m.integral = clampLength(add(m.integral, scale(a.lateral, dt)), LATERAL_SPEED / KI);
		const toAxis = clampLength(sub(scale(a.lateral, -KP), scale(m.integral, KI)), LATERAL_SPEED);
		let want: Vec3;
		let status: string;
		if (m.phase === 'align') {
			want = { x: 0, y: 0, z: 0 };
			status = `Aligning: ${deg(a.angle).toFixed(1)}° off`;
			if (a.angle < ALIGNED && len(a.velocity) < 2 * STOPPED) m.phase = 'approach';
		} else {
			const goal = CORRIDOR[m.mark]!;
			const limit = speedLimit(a.along);
			const centred = a.lateralDistance < lateralTolerance(a.along);
			let speed: number;
			if (goal === 0) {
				// in from the last mark: soft and steady; the magnets pull from 5 m, and are not braked
				m.phase = 'capture';
				speed = a.angle < MISALIGNED && centred ? limit : 0;
				if (a.along < MAGNETS) speed = Math.max(speed, Math.min(a.closing, PULL_SPEED));
			} else {
				const left = a.along - goal;
				speed = a.angle < MISALIGNED ? Math.max(0, Math.min(limit, 0.2 * left)) : 0;
				if (left < 0.3 && Math.abs(a.closing) < STOPPED && a.angle < ALIGNED && centred)
					m.mark = Math.min(m.mark + 1, CORRIDOR.length - 1);
			}
			// approach speed along -n; the lateral correction never faster than the approach allows close in
			want = add(
				scale(n, -speed),
				clampLength(toAxis, Math.max(0.05, Math.min(LATERAL_SPEED, 0.1 * a.along)))
			);
			status =
				goal === 0
					? `Capture: ${a.distance.toFixed(2)} m`
					: `Approach to ${goal} m: ${a.along.toFixed(1)} m out, ${a.lateralDistance.toFixed(2)} m off axis`;
		}
		const error = fly(ctrl, m, a, want, dt);
		// RCS at full push that cannot change the velocity: no thrusters, or none that point the right way
		if (error < FULL_AT || a.along < MAGNETS) {
			m.windowVelocity = null;
			m.stalled = 0;
		} else if (!m.windowVelocity) {
			m.windowVelocity = a.velocity;
			m.windowAt = ctrl.time;
		} else if (ctrl.time - m.windowAt >= STALL_WINDOW) {
			const moved = len(sub(a.velocity, m.windowVelocity));
			m.stalled = moved < STALL_DV ? m.stalled + (ctrl.time - m.windowAt) : 0;
			m.windowVelocity = a.velocity;
			m.windowAt = ctrl.time;
			if (m.stalled >= STALL_TIME)
				return {
					phase: m.phase,
					abort: 'RCS cannot move the vessel (no thrusters or no authority).'
				};
		}
		return { phase: m.phase, status, readouts: readouts(a, m.mark) };
	}
});
