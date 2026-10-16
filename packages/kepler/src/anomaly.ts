/**
 * Anomaly conversions and Kepler's equation.
 *
 * Elliptic (e < 1):   M = E − e sin E                       (Vallado §2.2, Alg. 2 KepEqtnE)
 * Hyperbolic (e > 1): M = e sinh H − H                      (Vallado §2.2, Alg. 4 KepEqtnH)
 * True ↔ eccentric uses the half-angle forms, which stay well-conditioned near periapsis/apoapsis.
 */
import { isNearParabolic, KeplerError } from './elements.ts';

const TWO_PI = 2 * Math.PI;

/** Wraps an angle to [0, 2π). */
export function wrapTwoPi(angle: number): number {
	const w = angle % TWO_PI;
	return w < 0 ? w + TWO_PI : w;
}

/** Wraps an angle to (−π, π]. */
export function wrapPi(angle: number): number {
	const w = wrapTwoPi(angle);
	return w > Math.PI ? w - TWO_PI : w;
}

function assertNotParabolic(e: number, fn: string): void {
	if (isNearParabolic(e))
		throw new KeplerError(
			`${fn}: e = ${e} is near-parabolic (|e − 1| < 1e-8); anomaly-based math is singular there — use propagateUniversal`
		);
}

// ---- elliptic --------------------------------------------------------------

export const eccentricToMean = (E: number, e: number): number => E - e * Math.sin(E);

export const eccentricToTrue = (E: number, e: number): number =>
	2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));

export const trueToEccentric = (nu: number, e: number): number =>
	2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));

// ---- hyperbolic ------------------------------------------------------------

export const hyperbolicToMean = (H: number, e: number): number => e * Math.sinh(H) - H;

export const hyperbolicToTrue = (H: number, e: number): number =>
	2 * Math.atan(Math.sqrt((e + 1) / (e - 1)) * Math.tanh(H / 2));

/** Only valid for true anomalies inside the asymptotes, |ν| < acos(−1/e). */
export function trueToHyperbolic(nu: number, e: number): number {
	const nuMax = Math.acos(-1 / e);
	const w = wrapPi(nu);
	if (Math.abs(w) >= nuMax)
		throw new KeplerError(
			`trueToHyperbolic: ν = ${nu} rad is beyond the asymptote ±${nuMax} rad for e = ${e}`
		);
	return 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(w / 2));
}

// ---- Kepler's equation -----------------------------------------------------

export const KEPLER_MAX_NEWTON_ITERATIONS = 20;

export type KeplerSolution = {
	/** Eccentric anomaly E (e < 1) or hyperbolic anomaly H (e > 1), rad. */
	anomaly: number;
	/** Newton iterations used (≤ KEPLER_MAX_NEWTON_ITERATIONS). */
	iterations: number;
	/** True if Newton did not converge and the bisection fallback produced the result. */
	usedBisection: boolean;
};

/**
 * Solves Kepler's equation for E (elliptic) or H (hyperbolic) given the mean anomaly M.
 * Newton–Raphson (Vallado Alg. 2 / Alg. 4) with Danby's starting value for the elliptic case and an
 * asinh starting value for the hyperbolic case; falls back to bisection on a guaranteed bracket if
 * Newton has not converged after 20 iterations.
 */
export function solveKeplerDetailed(M: number, e: number): KeplerSolution {
	if (!(e >= 0) || !Number.isFinite(M))
		throw new KeplerError(`solveKepler: invalid input M = ${M}, e = ${e}`);
	assertNotParabolic(e, 'solveKepler');
	return e < 1 ? solveElliptic(M, e) : solveHyperbolic(M, e);
}

/** Solves Kepler's equation; see `solveKeplerDetailed`. Returns E (e < 1) or H (e > 1). */
export const solveKepler = (M: number, e: number): number => solveKeplerDetailed(M, e).anomaly;

function solveElliptic(M: number, e: number): KeplerSolution {
	// Solve on (−π, π] and add the whole revolutions back, so precision does not depend on |M|.
	const Mw = wrapPi(M);
	const revs = M - Mw;
	// Danby (1987): E0 = M + 0.85 e sign(sin M). Converges for all M and e < 1.
	let E = Mw + 0.85 * e * (Mw >= 0 ? 1 : -1);
	for (let k = 1; k <= KEPLER_MAX_NEWTON_ITERATIONS; k++) {
		const delta = (E - e * Math.sin(E) - Mw) / (1 - e * Math.cos(E));
		E -= delta;
		if (Math.abs(delta) <= 1e-14) return { anomaly: E + revs, iterations: k, usedBisection: false };
	}
	// E − M = e sin E ∈ [−e, e], so [M − e, M + e] always brackets the root.
	E = bisect((x) => x - e * Math.sin(x) - Mw, Mw - e, Mw + e);
	return { anomaly: E + revs, iterations: KEPLER_MAX_NEWTON_ITERATIONS, usedBisection: true };
}

function solveHyperbolic(M: number, e: number): KeplerSolution {
	// asinh(M/e) is exact asymptotically for large |M| (e sinh H dominates) and the right sign always.
	let H = Math.asinh(M / e);
	for (let k = 1; k <= KEPLER_MAX_NEWTON_ITERATIONS; k++) {
		const delta = (e * Math.sinh(H) - H - M) / (e * Math.cosh(H) - 1);
		H -= delta;
		if (Math.abs(delta) <= 1e-14 * Math.max(1, Math.abs(H)))
			return { anomaly: H, iterations: k, usedBisection: false };
	}
	// For H ≥ 0, e sinh H − H ≥ (e − 1) sinh H, so |H| ≤ asinh(|M| / (e − 1)) brackets the root.
	const bound = Math.asinh(Math.abs(M) / (e - 1));
	const lo = M >= 0 ? 0 : -bound;
	const hi = M >= 0 ? bound : 0;
	H = bisect((x) => e * Math.sinh(x) - x - M, lo, hi);
	return { anomaly: H, iterations: KEPLER_MAX_NEWTON_ITERATIONS, usedBisection: true };
}

/** Bisection for an increasing function f with f(lo) ≤ 0 ≤ f(hi); runs to float64 resolution. */
function bisect(f: (x: number) => number, lo: number, hi: number): number {
	for (let k = 0; k < 200; k++) {
		const mid = 0.5 * (lo + hi);
		if (mid === lo || mid === hi) return mid;
		if (f(mid) < 0) lo = mid;
		else hi = mid;
	}
	return 0.5 * (lo + hi);
}

// ---- dispatching helpers ----------------------------------------------------

/** Mean → true anomaly for elliptic or hyperbolic orbits. */
export function meanToTrue(M: number, e: number): number {
	const x = solveKepler(M, e);
	return e < 1 ? eccentricToTrue(x, e) : hyperbolicToTrue(x, e);
}

/** True → mean anomaly. The elliptic result is not wrapped; callers wrap to [0, 2π) as needed. */
export function trueToMean(nu: number, e: number): number {
	assertNotParabolic(e, 'trueToMean');
	return e < 1
		? eccentricToMean(trueToEccentric(nu, e), e)
		: hyperbolicToMean(trueToHyperbolic(nu, e), e);
}
