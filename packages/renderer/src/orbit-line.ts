/**
 * Samples an orbit into points for the map view. The renderer may not import the kepler package
 * (boundaries.md) and core does not re-export it, so the conic is sampled here directly.
 *
 * Frame (units-and-frames.md, "Orbital elements"): the textbook (Vallado) formulas use a frame with
 * pole K; ours maps onto it by the proper rotation I = x, J = −z, K = y. We build the point in the
 * perifocal plane, rotate with R3(−Ω) R1(−i) R3(−ω) in textbook axes, then map (I, J, K) → (x, y, z)
 * = (I, K, −J).
 */
import type { Vec3, VesselSnapshot } from '@orbital/core';

/** `@orbital/core` does not export `OrbitalElements` by name; this is the type of `VesselSnapshot.orbit`. */
export type OrbitalElements = NonNullable<VesselSnapshot['orbit']>;

export interface SampleOptions {
	/** Number of segments (points = segments + 1; closed ellipses repeat the first point). */
	segments?: number;
	/**
	 * Hyperbolic trajectories are clipped at this radius from the body centre, m (e.g. the SOI
	 * radius). Defaults to 10 × periapsis. Ignored for elliptic orbits.
	 */
	maxRadius?: number;
}

export const DEFAULT_SEGMENTS = 256;

/** Perifocal (P toward periapsis, Q 90° ahead in the orbit plane) to our frame. */
function toBodyFrame(el: OrbitalElements, xp: number, yp: number): Vec3 {
	const cO = Math.cos(el.raan);
	const sO = Math.sin(el.raan);
	const ci = Math.cos(el.i);
	const si = Math.sin(el.i);
	const cw = Math.cos(el.argp);
	const sw = Math.sin(el.argp);
	// Textbook perifocal -> IJK (the rotation matrix R3(−Ω) R1(−i) R3(−ω), perifocal to IJK).
	const I = (cO * cw - sO * sw * ci) * xp + (-cO * sw - sO * cw * ci) * yp;
	const J = (sO * cw + cO * sw * ci) * xp + (-sO * sw + cO * cw * ci) * yp;
	const K = sw * si * xp + cw * si * yp;
	return { x: I, y: K, z: -J };
}

/**
 * Points of the orbit relative to the SOI body, in the body-centred inertial frame, ordered in the
 * direction of motion starting at periapsis. Elliptic orbits close (last point equals the first).
 * Throws on non-finite elements, inconsistent signs of `a` and `e - 1`, or the near-parabolic band
 * (which snapshots express by omitting `orbit`).
 */
export function sampleOrbit(el: OrbitalElements, options: SampleOptions = {}): Vec3[] {
	const segments = options.segments ?? DEFAULT_SEGMENTS;
	if (!Number.isInteger(segments) || segments < 2) {
		throw new Error(`sampleOrbit: segments must be an integer >= 2, got ${segments}`);
	}
	const finite = [el.a, el.e, el.i, el.raan, el.argp].every(Number.isFinite);
	// a > 0 <=> e < 1, a < 0 <=> e > 1 (units-and-frames.md); e within 1e-8 of 1 is near-parabolic.
	if (!finite || el.a === 0 || el.e < 0 || Math.abs(el.e - 1) < 1e-8 || el.a > 0 !== el.e < 1) {
		throw new Error(`sampleOrbit: invalid or unsupported orbital elements ${JSON.stringify(el)}`);
	}
	const points: Vec3[] = [];
	if (el.e < 1) {
		// Uniform in eccentric anomaly E: no singularity at e -> 0, denser near periapsis.
		const b = el.a * Math.sqrt(1 - el.e * el.e);
		for (let k = 0; k <= segments; k++) {
			const E = k === segments ? 0 : (2 * Math.PI * k) / segments;
			points.push(toBodyFrame(el, el.a * (Math.cos(E) - el.e), b * Math.sin(E)));
		}
		return points;
	}
	// Hyperbola (a < 0): x = |a|(e − cosh H), y = |a| sqrt(e² − 1) sinh H, r = |a|(e cosh H − 1).
	const A = Math.abs(el.a);
	const rp = A * (el.e - 1);
	const maxRadius = options.maxRadius ?? 10 * rp;
	if (!(maxRadius > rp)) {
		throw new Error(`sampleOrbit: maxRadius ${maxRadius} must exceed periapsis radius ${rp}`);
	}
	const Hmax = Math.acosh((maxRadius / A + 1) / el.e);
	const b = A * Math.sqrt(el.e * el.e - 1);
	for (let k = 0; k <= segments; k++) {
		const H = -Hmax + (2 * Hmax * k) / segments;
		points.push(toBodyFrame(el, A * (el.e - Math.cosh(H)), b * Math.sinh(H)));
	}
	return points;
}
