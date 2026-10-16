/**
 * On-rails motion of a vessel's centre of mass (kepler). Elements normally; the state vector with
 * `propagateUniversal` when the elements are singular (near-parabolic, KeplerError).
 */
import type { Quat, Vec3 } from '@orbital/core';
import {
	cross,
	dot,
	fromStateVector,
	KeplerError,
	length,
	meanMotion,
	propagate,
	propagateUniversal,
	scale,
	sub,
	wrapTwoPi,
	type OrbitalElements
} from '@orbital/kepler';
import type { SimCore } from './core.ts';
import { qAboutY, qMul, qNormalize, qRotate } from './math.ts';
import type { RailsState, VesselState } from './state.ts';

/** Seconds after which a state-vector rails record is advanced (it is exact either way; this keeps dt small). */
const STATE_REBASE_INTERVAL = 600;

export interface Motion {
	r: Vec3;
	v: Vec3;
}

/** Rails state for a BCI state vector at time `t`. */
export function computeRails(mu: number, r: Vec3, v: Vec3, t: number): RailsState {
	try {
		return { kind: 'elements', elements: fromStateVector(r, v, mu, t) };
	} catch (e) {
		if (!(e instanceof KeplerError)) throw e;
		return { kind: 'state', r: { ...r }, v: { ...v }, t0: t };
	}
}

/**
 * Surface rails (ADR 0024) for a BCI centre of mass and root orientation at the current time:
 * both are stored in the body-fixed frame, which is the inertial frame rotated by `omega * t`
 * about +Y (the same rotation the snapshot reports for the body).
 */
export function surfaceRails(core: SimCore, com: Vec3, orientation: Quat): RailsState {
	const inverse = qAboutY(-core.body.omega * core.t);
	return { kind: 'surface', r: qRotate(inverse, com), q: qNormalize(qMul(inverse, orientation)) };
}

/** Elements for a state, or undefined when not expressible (near-parabolic, radial). */
export function elementsOf(mu: number, r: Vec3, v: Vec3, t: number): OrbitalElements | undefined {
	try {
		return fromStateVector(r, v, mu, t);
	} catch (e) {
		if (e instanceof KeplerError) return undefined;
		throw e;
	}
}

/**
 * Keep n·(t − epoch) small: once it reaches 2π, move `epoch` to `t` and fold the mean anomaly
 * (elliptic: wrapped to [0, 2π); hyperbolic: unbounded). Same orbit, better float64 conditioning
 * over long warps (journal 002).
 */
export function rebaseElements(el: OrbitalElements, mu: number, t: number): OrbitalElements {
	const dm = meanMotion(el, mu) * (t - el.epoch);
	if (Math.abs(dm) < 2 * Math.PI) return el;
	const m0 = el.m0 + dm;
	return { ...el, m0: el.e < 1 ? wrapTwoPi(m0) : m0, epoch: t };
}

/** Centre-of-mass state of an on-rails vessel at time `t`. */
export function railsMotion(core: SimCore, rails: RailsState, t: number): Motion {
	if (rails.kind === 'elements') return propagate(rails.elements, core.body.mu, t);
	if (rails.kind === 'surface') {
		const r = qRotate(qAboutY(core.body.omega * t), rails.r);
		return { r, v: cross({ x: 0, y: core.body.omega, z: 0 }, r) };
	}
	return propagateUniversal(rails.r, rails.v, core.body.mu, t - rails.t0);
}

/** Advance the stored rails state to `t` in place so later propagations start close by. */
export function rebaseRails(core: SimCore, vessel: VesselState, t: number): void {
	const rails = vessel.rails;
	if (!rails) return;
	if (rails.kind === 'surface') return; // fixed in the body frame: nothing drifts
	if (rails.kind === 'elements') {
		vessel.rails = { kind: 'elements', elements: rebaseElements(rails.elements, core.body.mu, t) };
	} else if (t - rails.t0 > STATE_REBASE_INTERVAL) {
		const s = propagateUniversal(rails.r, rails.v, core.body.mu, t - rails.t0);
		vessel.rails = { kind: 'state', r: s.r, v: s.v, t0: t };
	}
}

/** Centre-of-mass position and velocity now: from rails when on rails, else the cached flight pose. */
export function motionOf(core: SimCore, vessel: VesselState): Motion {
	if (vessel.rails) return railsMotion(core, vessel.rails, core.t);
	return { r: vessel.com, v: vessel.velocity };
}

/** Root orientation now: frozen on orbital rails, turning with the body on surface rails. */
export function orientationOf(core: SimCore, vessel: VesselState): Quat {
	const rails = vessel.rails;
	if (rails?.kind !== 'surface') return vessel.orientation;
	return qMul(qAboutY(core.body.omega * core.t), rails.q);
}

/** Periapsis radius of the conic through (r, v), valid for every eccentricity; 0 for radial states. */
export function periapsisRadius(mu: number, r: Vec3, v: Vec3): number {
	const rMag = length(r);
	const h = length(cross(r, v));
	const eVec = scale(sub(scale(r, dot(v, v) - mu / rMag), scale(v, dot(r, v))), 1 / mu);
	return (h * h) / (mu * (1 + length(eVec)));
}

/** True when the orbit stays above the atmosphere (above the surface for an airless body). */
export function isStableOrbit(core: SimCore, r: Vec3, v: Vec3): boolean {
	const { def, mu } = core.body;
	return periapsisRadius(mu, r, v) > def.radius + (def.atmosphere?.height ?? 0);
}
