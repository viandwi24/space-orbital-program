import type { StateVector } from './convert.ts';
import { add, sub } from './vec3.ts';

/**
 * Sphere-of-influence radius (Laplace): r_SOI = a (m / M)^(2/5).
 * Vallado §12.5 / Curtis eq. 8.21. Inputs: the body's semi-major axis around its parent (m) and the
 * two masses (kg). The switching rule and the sim integration are ADR 0051 (plan 044).
 */
export function soiRadius(aBody: number, mBody: number, mParent: number): number {
	if (!(aBody > 0) || !(mBody > 0) || !(mParent > 0))
		throw new RangeError(
			`soiRadius: need positive inputs (aBody = ${aBody}, mBody = ${mBody}, mParent = ${mParent})`
		);
	return aBody * Math.pow(mBody / mParent, 2 / 5);
}

/**
 * Patched-conic frame change when a vessel enters the sphere of influence of `child`: the vessel
 * state relative to the parent becomes its state relative to the child, given the child's state
 * relative to the same parent at the same instant. Position and velocity are continuous in the
 * parent frame (the axes of every body-centred frame are the same, units-and-frames.md).
 */
export const intoChildFrame = (state: StateVector, child: StateVector): StateVector => ({
	r: sub(state.r, child.r),
	v: sub(state.v, child.v)
});

/** The inverse of `intoChildFrame`: leaving the child's sphere of influence for its parent's. */
export const intoParentFrame = (state: StateVector, child: StateVector): StateVector => ({
	r: add(state.r, child.r),
	v: add(state.v, child.v)
});

/**
 * Time of a boundary crossing inside `[t0, t1]` by bisection. `signed(t)` is a continuous function
 * of time whose sign changes once between the ends (distance to the boundary minus its radius,
 * negated for an entry as the caller wishes): `signed(t0) <= 0 < signed(t1)` is required. Returns
 * the first instant at which the function is positive, to within `tolerance` seconds (the side the
 * vessel is on after the crossing, so a state converted there is not on the boundary's old side).
 */
export function findCrossing(
	signed: (t: number) => number,
	t0: number,
	t1: number,
	tolerance = 1e-7
): number {
	if (!(t1 >= t0)) throw new RangeError(`findCrossing: need t0 <= t1 (t0 = ${t0}, t1 = ${t1})`);
	if (signed(t0) > 0) return t0;
	if (!(signed(t1) > 0))
		throw new RangeError('findCrossing: the function does not change sign inside the interval');
	let lo = t0;
	let hi = t1;
	for (let k = 0; k < 200 && hi - lo > tolerance; k++) {
		const mid = 0.5 * (lo + hi);
		if (signed(mid) > 0) hi = mid;
		else lo = mid;
	}
	return hi;
}
