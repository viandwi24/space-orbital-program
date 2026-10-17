import { defineBody, GRAVITATIONAL_CONSTANT, km } from '@orbital/sdk';

/** Standard gravitational parameter of the home body, m³/s² (Kerbin-scale: radius 600 km, surface g about 9.81 m/s²). */
export const HOME_MU = 3.5316e12;
/** The home planet: spherical, point-mass gravity, exponential atmosphere, root body of the system. */
export const HomeBody = defineBody({
	id: 'stock.home',
	mass: HOME_MU / GRAVITATIONAL_CONSTANT,
	radius: km(600),
	rotationPeriod: 21_600,
	// The system's calendar (ADR 0141): days of this planet; years once it orbits a Sun (plan 122).
	calendar: { kind: 'fictional', home: 'stock.home' },
	atmosphere: { scaleHeight: 5_600, surfacePressure: 101_325, height: km(70) },
	terrain: { kind: 'hills' }
});

/** Semi-major axis of the moon's orbit around the home planet, m. */
const MOON_ORBIT_RADIUS = km(11_800);
/** Standard gravitational parameter of the moon, m³/s² (radius 190 km, surface gravity 1.6 m/s²). */
export const MOON_MU = 5.776e10;
/**
 * The moon (ADR 0052): airless, tidally locked (it turns once per orbit), on a circular equatorial
 * prograde orbit around the home planet, so a transfer from the equatorial launch site is a plain
 * Hohmann transfer. Its sphere of influence follows from the masses (Laplace, about 2 280 km).
 */
export const MoonBody = defineBody({
	id: 'stock.cinder',
	mass: MOON_MU / GRAVITATIONAL_CONSTANT,
	radius: km(190),
	rotationPeriod: 2 * Math.PI * Math.sqrt(MOON_ORBIT_RADIUS ** 3 / HOME_MU),
	parent: 'stock.home',
	terrain: { kind: 'craters' },
	orbit: { a: MOON_ORBIT_RADIUS, e: 0, i: 0, raan: 0, argp: 0, m0: 1, epoch: 0 }
});
