/**
 * Classical (Keplerian) orbital elements and derived quantities.
 *
 * Conventions (see docs/architecture/units-and-frames.md, "Orbital elements"):
 *  - SI units, angles in radians, frame is body-centred inertial with +Y = body north.
 *  - `a` is the semi-major axis; it is negative for hyperbolic orbits (energy > 0).
 *  - `i` is measured from +Y; `raan` and the longitude-type angles are measured right-handed about +Y
 *    starting at +X. `raan`, `argp` lie in [0, 2π).
 *  - `m0` is the mean anomaly at `epoch`: elliptic M in [0, 2π), hyperbolic M (unbounded, sign = side
 *    of periapsis).
 *  - Degenerate cases: circular → `argp = 0` and `m0` measures from the ascending node (argument of
 *    latitude); equatorial → `raan = 0` and `argp` is the longitude of periapsis; circular equatorial →
 *    both 0 and `m0` is the true longitude.
 *  - Near-parabolic orbits (|e − 1| < NEAR_PARABOLIC_TOLERANCE) cannot be represented with `a`; use
 *    `propagateUniversal` on the state vector instead.
 */
export type OrbitalElements = {
	/** Semi-major axis, m. Negative for hyperbolic orbits. */
	a: number;
	/** Eccentricity, dimensionless. */
	e: number;
	/** Inclination from +Y, rad, in [0, π]. */
	i: number;
	/** Right ascension of the ascending node, rad, in [0, 2π). */
	raan: number;
	/** Argument of periapsis, rad, in [0, 2π). */
	argp: number;
	/** Mean anomaly at `epoch`, rad. */
	m0: number;
	/** Simulation time at which `m0` holds, s. */
	epoch: number;
};

/** Below this eccentricity an orbit is treated as circular (argument of periapsis undefined → 0). */
export const CIRCULAR_TOLERANCE = 1e-11;
/** Below this inclination (or within it of π) an orbit is equatorial (RAAN undefined → 0). */
export const EQUATORIAL_TOLERANCE = 1e-11;
/** |e − 1| below this is near-parabolic: the element set is singular there. */
export const NEAR_PARABOLIC_TOLERANCE = 1e-8;

/** Thrown for inputs the element-based math cannot represent (near-parabolic, radial, …). */
export class KeplerError extends Error {
	override name = 'KeplerError';
}

export const isHyperbolic = (el: OrbitalElements): boolean => el.e > 1;

export const isNearParabolic = (e: number): boolean => Math.abs(e - 1) < NEAR_PARABOLIC_TOLERANCE;

/** Mean motion n = √(μ / |a|³), rad/s. Valid for elliptic and hyperbolic orbits. */
export const meanMotion = (el: OrbitalElements, mu: number): number =>
	Math.sqrt(mu / Math.abs(el.a * el.a * el.a));

/** Orbital period T = 2π √(a³/μ), s. `Infinity` for hyperbolic orbits. */
export const period = (el: OrbitalElements, mu: number): number =>
	isHyperbolic(el) ? Infinity : (2 * Math.PI) / meanMotion(el, mu);

/** Periapsis radius a(1 − e), m (distance from the body centre, not altitude). */
export const periapsis = (el: OrbitalElements): number => el.a * (1 - el.e);

/** Apoapsis radius a(1 + e), m. `Infinity` for hyperbolic orbits. */
export const apoapsis = (el: OrbitalElements): number =>
	isHyperbolic(el) ? Infinity : el.a * (1 + el.e);
