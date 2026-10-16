/**
 * State vector ↔ classical elements.
 *
 * Algorithms: Vallado Alg. 9 (RV2COE) and Alg. 10 (COE2RV). The textbook works in a frame with +K as
 * the pole; ours has +Y as the pole (ADR 0007). Both directions go through the proper rotation
 *   I = x,  J = −z,  K = y
 * so the textbook formulas are used unchanged. Consequence: RAAN and longitudes are measured
 * right-handed about +Y from +X (counter-clockwise seen from above the north pole), and a prograde
 * equatorial orbit has h = r × v along +Y.
 *
 * Angles between vectors use atan2((a × b)·ĥ, a·b) instead of acos + quadrant checks, which keeps full
 * precision near 0 and π and resolves the quadrant from the orbit normal directly.
 */
import { trueToMean, meanToTrue, wrapTwoPi } from './anomaly.ts';
import {
	CIRCULAR_TOLERANCE,
	EQUATORIAL_TOLERANCE,
	isNearParabolic,
	KeplerError,
	meanMotion,
	type OrbitalElements
} from './elements.ts';
import { cross, dot, length, scale, sub, type Vec3 } from './vec3.ts';

export type StateVector = { r: Vec3; v: Vec3 };

const toTextbook = (a: Vec3): Vec3 => ({ x: a.x, y: -a.z, z: a.y });
const fromTextbook = (a: Vec3): Vec3 => ({ x: a.x, y: a.z, z: -a.y });

/** Signed angle from `a` to `b`, right-handed about `axis` (unit), in (−π, π]. */
const angleAbout = (a: Vec3, b: Vec3, axis: Vec3): number =>
	Math.atan2(dot(cross(a, b), axis), dot(a, b));

const I_HAT: Vec3 = { x: 1, y: 0, z: 0 };

/**
 * Classical elements from a body-centred inertial state vector at time `t` (Vallado Alg. 9 RV2COE).
 * Degenerate cases follow the conventions documented on `OrbitalElements`.
 * Throws `KeplerError` for radial (h ≈ 0) and near-parabolic trajectories.
 */
export function fromStateVector(r: Vec3, v: Vec3, mu: number, t: number): OrbitalElements {
	const R = toTextbook(r);
	const V = toTextbook(v);
	const rMag = length(R);
	const vMag = length(V);
	if (!(rMag > 0) || !(mu > 0))
		throw new KeplerError(`fromStateVector: need |r| > 0 and μ > 0 (|r| = ${rMag}, μ = ${mu})`);

	const h = cross(R, V);
	const hMag = length(h);
	if (hMag <= 1e-12 * rMag * vMag)
		throw new KeplerError(
			'fromStateVector: radial trajectory (r ∥ v, h ≈ 0) has no orbital plane; not supported'
		);
	const hHat = scale(h, 1 / hMag);

	// Eccentricity vector e = ((v² − μ/r) r − (r·v) v) / μ.
	const eVec = scale(sub(scale(R, vMag * vMag - mu / rMag), scale(V, dot(R, V))), 1 / mu);
	const e = length(eVec);
	if (isNearParabolic(e))
		throw new KeplerError(
			`fromStateVector: near-parabolic orbit (e = ${e}, |e − 1| < 1e-8) cannot be expressed with a semi-major axis; use propagateUniversal on the state vector`
		);

	const energy = (vMag * vMag) / 2 - mu / rMag;
	const a = -mu / (2 * energy);
	const hEq = Math.hypot(h.x, h.y); // |h| sin i
	const i = Math.atan2(hEq, h.z);

	const circular = e < CIRCULAR_TOLERANCE;
	const equatorial = hEq / hMag < EQUATORIAL_TOLERANCE;
	// Node vector n = K × h points at the ascending node.
	const n: Vec3 = { x: -h.y, y: h.x, z: 0 };

	let raan: number;
	let argp: number;
	let nu: number;
	if (!circular && !equatorial) {
		raan = Math.atan2(n.y, n.x);
		argp = angleAbout(n, eVec, hHat);
		nu = angleAbout(eVec, R, hHat);
	} else if (circular && !equatorial) {
		// Argument of periapsis undefined → 0; ν becomes the argument of latitude.
		raan = Math.atan2(n.y, n.x);
		argp = 0;
		nu = angleAbout(n, R, hHat);
	} else if (!circular && equatorial) {
		// RAAN undefined → 0; argp becomes the longitude of periapsis.
		raan = 0;
		argp = angleAbout(I_HAT, eVec, hHat);
		nu = angleAbout(eVec, R, hHat);
	} else {
		// Both undefined → 0; ν becomes the true longitude.
		raan = 0;
		argp = 0;
		nu = angleAbout(I_HAT, R, hHat);
	}

	const m = trueToMean(nu, e);
	return {
		a,
		e,
		i,
		raan: wrapTwoPi(raan),
		argp: wrapTwoPi(argp),
		m0: e < 1 ? wrapTwoPi(m) : m,
		epoch: t
	};
}

/**
 * Body-centred inertial state vector at time `t` from classical elements (Vallado Alg. 10 COE2RV),
 * advancing the mean anomaly analytically from `epoch`. Works for elliptic and hyperbolic orbits.
 */
export function toStateVector(el: OrbitalElements, mu: number, t: number): StateVector {
	const { a, e } = el;
	if (isNearParabolic(e))
		throw new KeplerError(
			`toStateVector: near-parabolic elements (e = ${e}) are singular; use propagateUniversal`
		);
	if (!(mu > 0) || !(e >= 0) || (e < 1 && !(a > 0)) || (e > 1 && !(a < 0)))
		throw new KeplerError(
			`toStateVector: inconsistent elements (a = ${a}, e = ${e}, μ = ${mu}); elliptic needs a > 0, hyperbolic a < 0`
		);

	const nu = meanToTrue(el.m0 + meanMotion(el, mu) * (t - el.epoch), e);
	const cosNu = Math.cos(nu);
	const sinNu = Math.sin(nu);
	const p = a * (1 - e * e); // semi-latus rectum; positive for both conic types
	const rPf = p / (1 + e * cosNu);
	const vPf = Math.sqrt(mu / p);
	// Perifocal (PQW) components.
	const xr = rPf * cosNu;
	const yr = rPf * sinNu;
	const xv = -vPf * sinNu;
	const yv = vPf * (e + cosNu);

	// PQW → IJK rotation ROT3(−Ω) ROT1(−i) ROT3(−ω).
	const cO = Math.cos(el.raan);
	const sO = Math.sin(el.raan);
	const ci = Math.cos(el.i);
	const si = Math.sin(el.i);
	const cw = Math.cos(el.argp);
	const sw = Math.sin(el.argp);
	const r11 = cO * cw - sO * sw * ci;
	const r12 = -cO * sw - sO * cw * ci;
	const r21 = sO * cw + cO * sw * ci;
	const r22 = -sO * sw + cO * cw * ci;
	const r31 = sw * si;
	const r32 = cw * si;

	return {
		r: fromTextbook({ x: r11 * xr + r12 * yr, y: r21 * xr + r22 * yr, z: r31 * xr + r32 * yr }),
		v: fromTextbook({ x: r11 * xv + r12 * yv, y: r21 * xv + r22 * yv, z: r31 * xv + r32 * yv })
	};
}
