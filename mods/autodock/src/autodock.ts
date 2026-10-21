/**
 * The Auto Dock autopilot (plan 310, ADR 0271), flown through the public `VesselPilot` only.
 *
 * The player controls the vessel from a docking port and targets a port of another vessel. Then:
 * 1. align: SAS points the own port against the target port's axis (anti-parallel) while RCS
 *    nulls the relative velocity;
 * 2. reposition (plan 330): from beside or behind the port, RCS flies round the target, outside a
 *    keep-out sphere around it, to a point on the port's axis (the start distance);
 * 3. approach: in along the axis, stopping at each corridor mark (200, 50, 10 m) until it is
 *    centred, aligned and slow; each stretch has a speed limit; a PID keeps it on the axis;
 * 4. capture: the last metres at a soft, steady speed: the ports' magnets take over and the sim
 *    docks the two (which ends the autopilot as done). Off the axis close in, it backs out.
 * It aborts on a shortage of RCS propellant, when RCS cannot move the vessel, or after too long.
 * Settings (ADR 0285): `speed` careful, normal or fast; `start` auto, or 20, 50 or 100 m.
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
	/** careful (x0.5), normal, fast (x1.5): the speed limits. */
	speed?: string;
	/** Where the approach along the axis starts: `auto` or a distance in m. */
	start?: string | number;
}

export const SPEED_FACTORS: Record<string, number> = { careful: 0.5, normal: 1, fast: 1.5 };

export interface AutoDockMemory {
	phase: 'align' | 'reposition' | 'approach' | 'capture';
	/** Speed limit factor. */
	speed: number;
	/** The start setting, m, or 0 for auto. */
	start: number;
	/** Where the approach starts, m out along the port's axis (set when repositioning). */
	standoff: number;
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

/** The farthest of `parts` from `from` (positions relative to the vessel root, inertial axes), m. */
function reach(parts: readonly { position: Vec3 }[], from: Vec3): number {
	let r = 0;
	for (const p of parts) r = Math.max(r, len(sub(p.position, from)));
	return r;
}

/**
 * Where the target can be hit, relative to the target port's face: a sphere round the target's root
 * that holds every part, plus our own size and a margin.
 */
export function keepOut(ctrl: VesselPilot): { centre: Vec3; radius: number } {
	const port = ctrl.targetPort!;
	const own = ctrl.controlPort!;
	const theirs = ctrl.targetVessel ? reach(ctrl.targetVessel.parts, { x: 0, y: 0, z: 0 }) : 5;
	const ours = reach(ctrl.vessel.parts, own.position);
	return { centre: scale(port.position, -1), radius: theirs + ours + 3 };
}

/** The approach's start distance: the setting, or just outside the keep-out sphere (at least 15 m). */
export function standoffOf(ctrl: VesselPilot, setting: number): number {
	const n = ctrl.targetPort!.direction;
	const { centre, radius } = keepOut(ctrl);
	// the smallest D with |n D - c| >= radius
	const b = dot(n, centre);
	const c2 = dot(centre, centre) - radius * radius;
	const outside = b + Math.sqrt(Math.max(0, b * b - c2));
	return Math.max(setting > 0 ? setting : 15, outside);
}

/** The next point on the way round the keep-out sphere toward `goal`, both relative to the port face. */
export function waypoint(p: Vec3, goal: Vec3, centre: Vec3, radius: number): Vec3 {
	const q = sub(p, centre);
	const g = sub(goal, centre);
	// the straight line clears the sphere: go straight
	const d = sub(g, q);
	const t = Math.max(0, Math.min(1, -dot(q, d) / Math.max(dot(d, d), 1e-9)));
	if (len(add(q, scale(d, t))) >= radius) return goal;
	// else step round the sphere, 25 degrees at a time, at least `radius` out
	const rq = Math.max(len(q), radius);
	const a = scale(q, 1 / Math.max(len(q), 1e-9));
	const b = scale(g, 1 / Math.max(len(g), 1e-9));
	const angle = Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
	if (angle < 1e-6) return goal;
	const f = Math.min(1, (25 * Math.PI) / 180 / angle);
	const s = Math.sin(angle);
	const dir = add(scale(a, Math.sin((1 - f) * angle) / s), scale(b, Math.sin(f * angle) / s));
	return add(centre, scale(dir, rq));
}

export const AutoDock = defineAutopilot<AutoDockMemory>({
	id: 'autodock.dock',
	title: 'Auto Dock',
	description:
		'Docks the port you control from with the targeted port: aligns, flies round to the port axis, nulls the drift and closes in along it by RCS.',
	rate: 10,
	start(ctrl, params) {
		const p = (params ?? {}) as AutoDockParams;
		const propellant = p.propellant ?? 'stock.monopropellant';
		const problem = startProblem(ctrl, propellant);
		if (problem) throw new Error(problem);
		ctrl.rcs(true);
		const start = p.start === undefined || p.start === 'auto' ? 0 : Number(p.start) || 0;
		return {
			phase: 'align',
			speed: SPEED_FACTORS[String(p.speed ?? 'normal')] ?? 1,
			start,
			standoff: 0,
			mark: 0,
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
		const log: string[] = [];
		const to = (phase: AutoDockMemory['phase'], line: string): void => {
			if (m.phase !== phase) log.push(line);
			m.phase = phase;
		};

		const n = ctrl.targetPort.direction;
		// own face against the target face
		ctrl.pointAt(scale(n, -1));
		if (!ctrl.vessel.rcs) ctrl.rcs(true);
		// own face relative to the target face
		const own = scale(ctrl.target.position, -1);
		const inCorridor = a.along > 1 && a.lateralDistance <= Math.max(1, 0.25 * a.along);

		let want: Vec3;
		let status: string;
		if (m.phase === 'align') {
			want = { x: 0, y: 0, z: 0 };
			status = `Aligning: ${deg(a.angle).toFixed(1)}° off`;
			if (a.angle < ALIGNED && len(a.velocity) < 2 * STOPPED) {
				if (inCorridor) {
					m.mark = markFor(a.along);
					to('approach', `on the axis ${a.along.toFixed(0)} m out: approach`);
				} else {
					m.standoff = standoffOf(ctrl, m.start);
					to(
						'reposition',
						`${a.along < -2 ? 'behind' : 'beside'} the port (${a.lateralDistance.toFixed(0)} m off the axis): flying round to ${m.standoff.toFixed(0)} m out on it`
					);
				}
			}
		} else if (m.phase === 'reposition') {
			const goal = scale(n, m.standoff);
			const { centre, radius } = keepOut(ctrl);
			const w = waypoint(own, goal, centre, radius);
			want = clampLength(scale(sub(w, own), 0.15), 1 * m.speed);
			const left = len(sub(goal, own));
			status = `Flying round to the port axis: ${left.toFixed(1)} m to go`;
			if (left < 1 && len(a.velocity) < 2 * STOPPED) {
				m.mark = markFor(a.along);
				to('approach', `on the axis ${a.along.toFixed(0)} m out: approach`);
			}
		} else {
			// off the axis this close: back out and line up again instead of hitting the target
			if (a.along < 2 && a.lateralDistance > 1) {
				m.standoff = standoffOf(ctrl, m.start);
				to('reposition', `${a.lateralDistance.toFixed(1)} m off the axis close in: backing out`);
				fly(ctrl, m, a, { x: 0, y: 0, z: 0 }, dt);
				return { phase: m.phase, status: 'Backing out', readouts: readouts(a, m.mark), log };
			}
			m.integral = clampLength(add(m.integral, scale(a.lateral, dt)), LATERAL_SPEED / KI);
			const toAxis = clampLength(sub(scale(a.lateral, -KP), scale(m.integral, KI)), LATERAL_SPEED);
			const goal = CORRIDOR[m.mark]!;
			const limit = speedLimit(a.along) * m.speed;
			const centred = a.lateralDistance < lateralTolerance(a.along);
			let speed: number;
			if (goal === 0) {
				// in from the last mark: soft and steady; the magnets pull from 5 m, and are not braked
				to('capture', 'last mark passed: soft capture');
				speed = a.angle < MISALIGNED && centred ? limit : 0;
				if (a.along < MAGNETS) speed = Math.max(speed, Math.min(a.closing, PULL_SPEED));
			} else {
				const left = a.along - goal;
				speed = a.angle < MISALIGNED ? Math.max(0, Math.min(limit, 0.2 * left)) : 0;
				if (left < 0.3 && Math.abs(a.closing) < STOPPED && a.angle < ALIGNED && centred) {
					m.mark = Math.min(m.mark + 1, CORRIDOR.length - 1);
					log.push(`held at ${goal} m, centred: on to ${CORRIDOR[m.mark]} m`);
				}
			}
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
					abort: 'RCS cannot move the vessel (no thrusters or no authority).',
					log
				};
		}
		return { phase: m.phase, status, readouts: readouts(a, m.mark), log };
	}
});
