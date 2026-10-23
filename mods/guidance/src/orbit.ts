/**
 * Small two-body helpers for the guidance autopilots: vectors, the orbit of a state vector, the
 * time to an apsis, burn times. Pure; positions and velocities are body-centred inertial.
 */
import type { Vec3 } from '@orbital/sdk';

export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
	x: a.y * b.z - a.z * b.y,
	y: a.z * b.x - a.x * b.z,
	z: a.x * b.y - a.y * b.x
});
export const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const unit = (a: Vec3): Vec3 => {
	const l = length(a);
	return l > 1e-12 ? scale(a, 1 / l) : { x: 0, y: 0, z: 0 };
};
/** Angle between two vectors, rad. */
export const angleBetween = (a: Vec3, b: Vec3): number => {
	const l = length(a) * length(b);
	return l > 0 ? Math.acos(Math.max(-1, Math.min(1, dot(a, b) / l))) : 0;
};
export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
export const STANDARD_GRAVITY = 9.80665;

/** The orbit of a state vector. Radii in m from the body's centre; `apoapsis` is Infinity when open. */
export interface Orbit {
	/** Semi-major axis, m (negative when hyperbolic). */
	a: number;
	e: number;
	periapsis: number;
	apoapsis: number;
	/** Seconds to the next apoapsis (Infinity when open), and to the next periapsis. */
	toApoapsis: number;
	toPeriapsis: number;
	/** Radial speed, m/s (positive climbing). */
	radialSpeed: number;
}

export function orbitOf(r: Vec3, v: Vec3, mu: number): Orbit {
	const rr = length(r);
	const vv = length(v);
	const energy = (vv * vv) / 2 - mu / rr;
	const a = -mu / (2 * energy);
	const h = cross(r, v);
	const eVec = sub(scale(cross(v, h), 1 / mu), scale(r, 1 / rr));
	const e = length(eVec);
	const p = dot(h, h) / mu;
	const periapsis = p / (1 + e);
	const apoapsis = e < 1 ? p / (1 - e) : Infinity;
	const radialSpeed = dot(r, v) / rr;
	let toApoapsis = Infinity;
	let toPeriapsis = 0;
	if (e < 1 && a > 0) {
		const n = Math.sqrt(mu / (a * a * a));
		const period = (2 * Math.PI) / n;
		// eccentric anomaly from the radius and the sign of the radial speed
		const cosE = e > 1e-9 ? clamp((1 - rr / a) / e, -1, 1) : 1;
		let E = Math.acos(cosE);
		if (radialSpeed < 0) E = 2 * Math.PI - E;
		const M = E - e * Math.sin(E);
		toApoapsis = ((((Math.PI - M) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / n;
		toPeriapsis = ((((2 * Math.PI - M) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / n;
		if (toApoapsis > period) toApoapsis -= period;
	}
	return { a, e, periapsis, apoapsis, toApoapsis, toPeriapsis, radialSpeed };
}

/** Speed at radius `r` on an orbit of semi-major axis `a` (vis-viva). */
export const visViva = (mu: number, r: number, a: number): number =>
	Math.sqrt(mu * (2 / r - 1 / a));

/**
 * Seconds to burn `dv` with thrust `thrust` from mass `mass` at exhaust velocity `ve` (the rocket
 * equation: the vessel gets lighter during the burn).
 */
export function burnTime(dv: number, mass: number, thrust: number, ve: number): number {
	if (thrust <= 0) return Infinity;
	if (ve <= 0) return (mass * dv) / thrust;
	return ((mass * ve) / thrust) * (1 - Math.exp(-dv / ve));
}
