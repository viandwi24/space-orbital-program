/** Orbital readouts for the HUD (plan 021): apsides, times to them, period, inclination. SI, display-free. */
import { GRAVITATIONAL_CONSTANT, type BodyDefinition } from '@orbital/core';
import { meanMotion, wrapTwoPi, type OrbitalElements } from '@orbital/kepler';

/** Standard gravitational parameter of `body`, the same product the sim uses. */
export const bodyMu = (body: Pick<BodyDefinition, 'mass'>): number =>
	GRAVITATIONAL_CONSTANT * body.mass;

export interface OrbitInfo {
	/** Altitudes above the reference sphere, m. `apoapsis` is undefined on escape trajectories. */
	apoapsis?: number;
	periapsis: number;
	/** Seconds from `t` to the next apoapsis / periapsis; undefined when it will not happen. */
	timeToApoapsis?: number;
	timeToPeriapsis?: number;
	period?: number;
	eccentricity: number;
	/** Inclination from the equator (the body's +Y pole), rad. */
	inclination: number;
	escape: boolean;
}

export function orbitInfo(
	el: OrbitalElements,
	mu: number,
	t: number,
	bodyRadius: number
): OrbitInfo {
	const n = meanMotion(el, mu);
	const m = el.m0 + n * (t - el.epoch);
	const out: OrbitInfo = {
		periapsis: el.a * (1 - el.e) - bodyRadius,
		eccentricity: el.e,
		inclination: el.i,
		escape: el.e >= 1
	};
	if (el.e < 1) {
		out.apoapsis = el.a * (1 + el.e) - bodyRadius;
		out.period = (2 * Math.PI) / n;
		out.timeToPeriapsis = wrapTwoPi(-m) / n;
		out.timeToApoapsis = wrapTwoPi(Math.PI - m) / n;
	} else if (m < 0) {
		out.timeToPeriapsis = -m / n;
	}
	return out;
}
