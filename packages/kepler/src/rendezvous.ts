/**
 * Rendezvous aids (plan 057, ADR 0084): the closest approach of a vessel's patched-conic path to a
 * moving target across spheres of influence, and the impulsive burns that plan a meeting: match the
 * target's velocity, a Hohmann transfer with its phase-angle wait, the relative nodes of two
 * orbit planes with the plane-change burn. Pure functions; the page turns the results into nodes.
 */
import { trueToMean, wrapTwoPi } from './anomaly.ts';
import type { StateVector } from './convert.ts';
import { closestApproach } from './approach.ts';
import { bodyStateAt } from './body-state.ts';
import { burnComponents, orbitalAxes, type BurnComponents } from './maneuver.ts';
import {
	predictPatchedConics,
	type PatchedBody,
	type PatchedOptions,
	type PatchedSegment,
	type PatchedStart
} from './patched.ts';
import { propagateUniversal } from './propagate.ts';
import { add, cross, dot, length, normalize, scale, sub, type Vec3 } from './vec3.ts';

/** A state of the path: relative to the sphere's body and in the system frame (the root's centre). */
export interface TrackState {
	body: string;
	relative: StateVector;
	system: StateVector;
}

export interface PatchedTrack {
	/** First and last time the path covers (the last is earlier than asked when it ends in an impact). */
	t0: number;
	t1: number;
	segments: PatchedSegment[];
	/** State at `t`, clamped to `[t0, t1]`. */
	at(t: number): TrackState;
}

const muOf = (bodies: readonly PatchedBody[], id: string): number => {
	const b = bodies.find((x) => x.id === id);
	if (!b) throw new RangeError(`unknown body "${id}"`);
	return b.mu;
};

/**
 * The patched-conic path of `start` for `horizon` seconds as a function of time. The prediction is
 * made once; each query propagates inside the segment that holds the time.
 */
export function patchedTrack(
	bodies: readonly PatchedBody[],
	start: PatchedStart,
	horizon: number,
	options: PatchedOptions = {}
): PatchedTrack {
	return trackOfSegments(bodies, predictPatchedConics(bodies, start, horizon, options), start.t);
}

/**
 * The same function of time for segments that are already predicted (for example the path with
 * maneuver nodes applied, `predictWithManeuvers`). `fallback` is the start time of an empty path.
 */
export function trackOfSegments(
	bodies: readonly PatchedBody[],
	segments: readonly PatchedSegment[],
	fallback = 0
): PatchedTrack {
	const first = segments[0];
	const last = segments.at(-1);
	const t0 = first ? first.t0 : fallback;
	const t1 = last ? last.t1 : fallback;
	const at = (time: number): TrackState => {
		const t = Math.min(Math.max(time, t0), t1);
		let seg = segments.find((s) => t >= s.t0 && t <= s.t1);
		seg ??= last;
		if (!seg) throw new RangeError('patchedTrack: empty path');
		const relative = propagateUniversal(
			seg.entry.r,
			seg.entry.v,
			muOf(bodies, seg.body),
			t - seg.t0
		);
		const body = bodyStateAt(bodies, seg.body, t, 'system');
		return {
			body: seg.body,
			relative,
			system: { r: add(body.r, relative.r), v: add(body.v, relative.v) }
		};
	};
	return { t0, t1, segments: [...segments], at };
}

/** A body's motion in the system frame, as a function of time (for `closestApproachPatched`). */
export const bodyTrack =
	(bodies: readonly PatchedBody[], id: string) =>
	(t: number): StateVector =>
		bodyStateAt(bodies, id, t, 'system');

/**
 * Motion of a point on a conic about `body` in the system frame: the state `(r, v)` relative to
 * `body` at time `t0` is propagated, `body` itself follows its orbit. For a vessel the page knows
 * only on its current conic.
 */
export const conicTrack =
	(bodies: readonly PatchedBody[], body: string, r: Vec3, v: Vec3, t0: number) =>
	(t: number): StateVector => {
		const rel = propagateUniversal(r, v, muOf(bodies, body), t - t0);
		const b = bodyStateAt(bodies, body, t, 'system');
		return { r: add(b.r, rel.r), v: add(b.v, rel.v) };
	};

export interface PatchedApproach {
	/** Time of the minimum distance, s. */
	t: number;
	distance: number;
	relativeSpeed: number;
	/** Sphere the vessel is in then. */
	body: string;
	/** Both states then, system frame. */
	vessel: StateVector;
	target: StateVector;
	/** The vessel's state then relative to the body of its sphere. */
	relative: StateVector;
}

/** Closest approach of a path to `target`, a motion in the system frame, over the whole path. */
export function closestApproachOnTrack(
	track: PatchedTrack,
	target: (t: number) => StateVector,
	samples = 480
): PatchedApproach {
	const found = closestApproach((t) => track.at(t).system, target, track.t0, track.t1, samples);
	const there = track.at(found.t);
	return {
		t: found.t,
		distance: found.distance,
		relativeSpeed: found.relativeSpeed,
		body: there.body,
		vessel: there.system,
		target: target(found.t),
		relative: there.relative
	};
}

/**
 * Closest approach of the path of `start` (through the spheres of influence) to `target`, a motion
 * in the system frame, within `horizon` seconds. The window ends where the path does (an impact).
 * Same search as `closestApproach` (global scan, golden-section refinement).
 */
export function closestApproachPatched(
	bodies: readonly PatchedBody[],
	start: PatchedStart,
	target: (t: number) => StateVector,
	horizon: number,
	samples = 480,
	options: PatchedOptions = {}
): PatchedApproach {
	return closestApproachOnTrack(patchedTrack(bodies, start, horizon, options), target, samples);
}

export interface MatchBurn {
	/** The burn as a vector in the inertial axes, m/s. */
	burn: Vec3;
	/** The burn along the orbital frame of the vessel. */
	dv: BurnComponents;
	magnitude: number;
}

/**
 * The burn that gives the vessel the target's velocity: `target.v - own.v`. Both states are relative
 * to the same body at the same time (the closest approach, usually).
 */
export function matchVelocityBurn(own: StateVector, target: StateVector): MatchBurn {
	const burn = sub(target.v, own.v);
	return {
		burn,
		dv: burnComponents(orbitalAxes(own.r, own.v), burn),
		magnitude: length(burn)
	};
}

export interface HohmannBurns {
	/** Prograde burn at the first radius (negative when the transfer goes inward), m/s. */
	dv1: number;
	/** Prograde burn that circularises at the second radius, m/s. */
	dv2: number;
	/** Half the period of the transfer ellipse, s. */
	transferTime: number;
	/** Semi-major axis of the transfer ellipse, m. */
	semiMajor: number;
}

/** The two burns of a Hohmann transfer between circular orbits of radius `r1` and `r2` about `mu`. */
export function hohmannTransfer(mu: number, r1: number, r2: number): HohmannBurns {
	if (!(mu > 0) || !(r1 > 0) || !(r2 > 0)) {
		throw new RangeError(`hohmannTransfer: need mu, r1, r2 > 0 (got ${mu}, ${r1}, ${r2})`);
	}
	const s = r1 + r2;
	return {
		dv1: Math.sqrt(mu / r1) * (Math.sqrt((2 * r2) / s) - 1),
		dv2: Math.sqrt(mu / r2) * (1 - Math.sqrt((2 * r1) / s)),
		transferTime: Math.PI * Math.sqrt((s * s * s) / (8 * mu)),
		semiMajor: s / 2
	};
}

export interface HohmannPlan extends HohmannBurns {
	/** Time of the departure burn, s (same clock as `now`). */
	time: number;
	/** Seconds from `now` to the departure. */
	wait: number;
	/** Angle the target must lead the vessel by at departure, rad (negative: trail). */
	phaseAngle: number;
}

/**
 * Departure of a Hohmann transfer from the vessel's orbit to the target's, both taken as circular
 * and coplanar with the radii they have now (`|r|`). The wait is the time until the target leads
 * by `pi - n2 * transferTime`; undefined when the two go the opposite way round or share a mean
 * motion (no window ever opens); a window earlier than `minWait` seconds from now gives way to the
 * next. The departure burn uses the vessel's real radius and speed then.
 */
export function hohmannToTarget(
	own: StateVector,
	target: StateVector,
	mu: number,
	now: number,
	minWait = 0
): HohmannPlan | undefined {
	const r1 = length(own.r);
	const r2 = length(target.r);
	const h = normalize(cross(own.r, own.v));
	const h2 = cross(target.r, target.v);
	if (dot(h, h2) <= 0) return undefined;
	const burns = hohmannTransfer(mu, r1, r2);
	const n1 = Math.sqrt(mu / (r1 * r1 * r1));
	const n2 = Math.sqrt(mu / (r2 * r2 * r2));
	const dn = n2 - n1;
	if (Math.abs(dn) < 1e-12) return undefined;
	const u1 = scale(own.r, 1 / r1);
	const u2 = scale(target.r, 1 / r2);
	const phase0 = Math.atan2(dot(cross(u1, u2), h), dot(u1, u2));
	const alpha = Math.PI - n2 * burns.transferTime;
	const delta = alpha - phase0;
	const synodic = (2 * Math.PI) / Math.abs(dn);
	let wait = dn > 0 ? wrapTwoPi(delta) / dn : wrapTwoPi(-delta) / -dn;
	// A window too close to use (a node needs lead time) waits for the next one.
	while (wait < minWait) wait += synodic;
	const dep = propagateUniversal(own.r, own.v, mu, wait);
	const rd = length(dep.r);
	const vTransfer = Math.sqrt(mu * (2 / rd - 1 / burns.semiMajor));
	return {
		...burns,
		dv1: vTransfer - length(dep.v),
		time: now + wait,
		wait,
		phaseAngle: alpha
	};
}

export interface RelativeNode {
	kind: 'ascending' | 'descending';
	/** Time the vessel is there, s. */
	time: number;
	/** The plane-change burn as a vector (inertial axes) and in the orbital frame there. */
	burn: Vec3;
	dv: BurnComponents;
	magnitude: number;
	/** Angle between the two orbit planes, rad. */
	angle: number;
}

const rotate = (v: Vec3, axis: Vec3, angle: number): Vec3 => {
	const c = Math.cos(angle);
	const s = Math.sin(angle);
	return add(add(scale(v, c), scale(cross(axis, v), s)), scale(axis, dot(axis, v) * (1 - c)));
};

/**
 * Where the vessel's orbit crosses the plane of the target's orbit (the relative ascending node:
 * going to the side the target's angular momentum points to; and the descending node) and the burn
 * that turns the vessel's orbit plane into the target's there (the next pass when a node is
 * nearer than `minWait` seconds). Both states are relative to one body
 * at one time; elliptic orbits only (empty otherwise, and for parallel planes).
 */
export function relativeNodes(
	own: StateVector,
	target: StateVector,
	mu: number,
	now: number,
	minWait = 0
): RelativeNode[] {
	const r = length(own.r);
	const speed2 = dot(own.v, own.v);
	const energy = 2 / r - speed2 / mu;
	if (!(energy > 0)) return [];
	const a = 1 / energy;
	const n1 = normalize(cross(own.r, own.v));
	const n2 = normalize(cross(target.r, target.v));
	const x = cross(n1, n2);
	const s = length(x);
	if (s < 1e-9) return [];
	const angle = Math.atan2(s, dot(n1, n2));
	const axis = scale(x, 1 / s);
	const eVec = scale(sub(scale(own.r, speed2 - mu / r), scale(own.v, dot(own.r, own.v))), 1 / mu);
	const e = length(eVec);
	const p = e > 1e-9 ? scale(eVec, 1 / e) : scale(own.r, 1 / r);
	const q = cross(n1, p);
	const nuOf = (d: Vec3): number => Math.atan2(dot(d, q), dot(d, p));
	const nu0 = nuOf(own.r);
	const m0 = trueToMean(nu0, e);
	const n = Math.sqrt(mu / (a * a * a));
	const out: RelativeNode[] = [];
	for (const d of [axis, scale(axis, -1)]) {
		let wait = wrapTwoPi(trueToMean(nuOf(d), e) - m0) / n;
		// The same point again one revolution later when it is too close to use.
		while (wait < minWait) wait += (2 * Math.PI) / n;
		const there = propagateUniversal(own.r, own.v, mu, wait);
		const burn = sub(rotate(there.v, axis, angle), there.v);
		out.push({
			kind: dot(there.v, n2) > 0 ? 'ascending' : 'descending',
			time: now + wait,
			burn,
			dv: burnComponents(orbitalAxes(there.r, there.v), burn),
			magnitude: length(burn),
			angle
		});
	}
	return out.sort((u, w) => u.time - w.time);
}
