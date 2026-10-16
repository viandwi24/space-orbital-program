/**
 * Two-body propagation.
 *
 * - `propagate` advances classical elements analytically (mean anomaly is linear in time) and is
 *   what on-rails motion uses. Elliptic and hyperbolic only.
 * - `propagateUniversal` advances a state vector with the universal-variable formulation
 *   (Vallado Alg. 8 KEPLER, Stumpff-function form as in Curtis Alg. 3.3/3.4). It is valid for every
 *   conic, including the near-parabolic case where the element set is singular.
 */
import { toStateVector, type StateVector } from './convert.ts';
import { KeplerError, type OrbitalElements } from './elements.ts';
import { add, dot, length, scale, type Vec3 } from './vec3.ts';

/** State vector at time `t` from elements (analytic; see `toStateVector`). */
export const propagate = (el: OrbitalElements, mu: number, t: number): StateVector =>
	toStateVector(el, mu, t);

/** Stumpff C(z) = (1 − cos √z)/z, continued for z ≤ 0; series near 0 avoids cancellation. */
export function stumpffC(z: number): number {
	if (z > 1e-2) return (1 - Math.cos(Math.sqrt(z))) / z;
	if (z < -1e-2) return (Math.cosh(Math.sqrt(-z)) - 1) / -z;
	return 1 / 2 - z / 24 + (z * z) / 720 - (z * z * z) / 40320 + (z * z * z * z) / 3628800;
}

/** Stumpff S(z) = (√z − sin √z)/√z³, continued for z ≤ 0; series near 0 avoids cancellation. */
export function stumpffS(z: number): number {
	if (z > 1e-2) {
		const s = Math.sqrt(z);
		return (s - Math.sin(s)) / (s * s * s);
	}
	if (z < -1e-2) {
		const s = Math.sqrt(-z);
		return (Math.sinh(s) - s) / (s * s * s);
	}
	return 1 / 6 - z / 120 + (z * z) / 5040 - (z * z * z) / 362880 + (z * z * z * z) / 39916800;
}

const UNIVERSAL_MAX_ITERATIONS = 100;

/**
 * Propagates (r0, v0) by `dt` seconds under two-body gravity with parameter μ, for any eccentricity.
 * Solves the universal Kepler equation for χ with Newton's method kept inside a bracket (the
 * equation is monotonic in χ, so bisection is always a safe fallback step), then applies the
 * Lagrange f, g coefficients.
 */
export function propagateUniversal(r0: Vec3, v0: Vec3, mu: number, dt: number): StateVector {
	if (dt === 0) return { r: { ...r0 }, v: { ...v0 } };
	const r0Mag = length(r0);
	const v0Mag = length(v0);
	if (!(r0Mag > 0) || !(mu > 0))
		throw new KeplerError(`propagateUniversal: need |r0| > 0 and μ > 0 (|r0| = ${r0Mag})`);
	const sqrtMu = Math.sqrt(mu);
	const vr0 = dot(r0, v0) / r0Mag; // radial velocity
	const alpha = 2 / r0Mag - (v0Mag * v0Mag) / mu; // 1/a; ≤ 0 for parabolic/hyperbolic

	// Universal Kepler equation F(χ) = 0 and F'(χ) = r(χ) > 0.
	const F = (x: number) => {
		const z = alpha * x * x;
		return (
			((r0Mag * vr0) / sqrtMu) * x * x * stumpffC(z) +
			(1 - alpha * r0Mag) * x * x * x * stumpffS(z) +
			r0Mag * x -
			sqrtMu * dt
		);
	};
	const dF = (x: number) => {
		const z = alpha * x * x;
		return (
			((r0Mag * vr0) / sqrtMu) * x * (1 - z * stumpffS(z)) +
			(1 - alpha * r0Mag) * x * x * stumpffC(z) +
			r0Mag
		);
	};

	// Bracket: F(0) = −√μ dt, and F is increasing, so the root has the sign of dt.
	let lo = dt > 0 ? 0 : -1;
	let hi = dt > 0 ? 1 : 0;
	const grow = (bound: number) => {
		let b = bound;
		for (let k = 0; k < 200 && (dt > 0 ? F(b) < 0 : F(b) > 0); k++) b *= 2;
		return b;
	};
	// Elliptic first guess √μ α dt (Vallado); otherwise the near-circular scale √μ dt / r0.
	let x = alpha * r0Mag > 1e-6 ? sqrtMu * alpha * dt : (sqrtMu * dt) / r0Mag;
	if (dt > 0) hi = grow(Math.max(Math.abs(x), 1));
	else lo = grow(-Math.max(Math.abs(x), 1));
	if (x <= lo || x >= hi) x = 0.5 * (lo + hi);

	let converged = false;
	for (let k = 0; k < UNIVERSAL_MAX_ITERATIONS; k++) {
		const f = F(x);
		if (f < 0) lo = x;
		else hi = x;
		let next = x - f / dF(x);
		if (!(next > lo && next < hi)) next = 0.5 * (lo + hi);
		if (Math.abs(next - x) <= 1e-14 * Math.max(1, Math.abs(next))) {
			x = next;
			converged = true;
			break;
		}
		x = next;
	}
	if (!converged)
		throw new KeplerError(
			`propagateUniversal: universal Kepler equation did not converge (dt = ${dt} s, α = ${alpha} 1/m)`
		);

	const z = alpha * x * x;
	const C = stumpffC(z);
	const S = stumpffS(z);
	const f = 1 - ((x * x) / r0Mag) * C;
	const g = dt - ((x * x * x) / sqrtMu) * S;
	const r = add(scale(r0, f), scale(v0, g));
	const rMag = length(r);
	const fDot = (sqrtMu / (rMag * r0Mag)) * (z * S - 1) * x;
	const gDot = 1 - ((x * x) / rMag) * C;
	return { r, v: add(scale(r0, fDot), scale(v0, gDot)) };
}
