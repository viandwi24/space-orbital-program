import { defineBody, GRAVITATIONAL_CONSTANT, km } from '@orbital/sdk';

/**
 * The Sun (plan 122, ADR 0119 point 3): the root of the stock system, a star with no surface. It
 * carries the system's calendar (ADR 0141: read on the root): days and years of the home planet.
 */
export const SunBody = defineBody({
	id: 'stock.sun',
	mass: 1.7565459e28,
	radius: km(261_600),
	rotationPeriod: 432_000,
	star: true,
	calendar: { kind: 'fictional', home: 'stock.home' }
});

/** Axial tilt of the home planet, rad (ADR 0119 point 4: the inclination of its orbit, pole +Y). */
export const HOME_TILT = (23.44 * Math.PI) / 180;
/**
 * The home planet's orbit around the Sun: 13.6 Gm, a year of 9.2 Ms (about 425 solar days). The
 * node and the phase put the Sun where the fixed sun of earlier versions was at t = 0 (declination
 * 0.2 rad; the launch site sees it 30 degrees up and rising), so a new world starts in the same light.
 */
export const HOME_ORBIT = {
	a: 13_599_840_256,
	e: 0,
	i: HOME_TILT,
	raan: 4.675573,
	argp: 0,
	m0: 5.759979,
	epoch: 0
};

/** Standard gravitational parameter of the home body, m³/s² (Kerbin-scale: radius 600 km, surface g about 9.81 m/s²). */
export const HOME_MU = 3.5316e12;
/**
 * The home planet: spherical, point-mass gravity, exponential atmosphere, orbiting the Sun (plan
 * 122). Its pole is the system +Y: the tilt is the orbit's, so nothing in its sphere changed.
 */
export const HomeBody = defineBody({
	id: 'stock.home',
	mass: HOME_MU / GRAVITATIONAL_CONSTANT,
	radius: km(600),
	// sidereal; the solar day is about 21 651 s now that the planet orbits the Sun
	rotationPeriod: 21_600,
	parent: 'stock.sun',
	orbit: HOME_ORBIT,
	atmosphere: { scaleHeight: 5_600, surfacePressure: 101_325, height: km(70) },
	terrain: { kind: 'hills' },
	// Science thresholds and multiplier (plan 103, ADR 0178 point 2).
	science: { flyingHigh: km(18), spaceHigh: km(250), multiplier: 1 },
	// Science regions (plan 104, ADR 0180 point 2): the biomes the ground is drawn with.
	regions: {
		kind: 'biomes',
		regions: [
			{ id: 'desert', multiplier: 1.5 },
			{ id: 'rock', multiplier: 1.5 },
			{ id: 'snow', multiplier: 1.5 }
		]
	}
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
	science: { spaceHigh: km(60), multiplier: 2 },
	regions: {
		kind: 'cells',
		seed: 7,
		regions: [
			{ id: 'highlands', label: 'Highlands' },
			{ id: 'maria', label: 'Maria', multiplier: 1.2 },
			{ id: 'crater-fields', label: 'Crater fields', multiplier: 1.5 }
		]
	},
	orbit: { a: MOON_ORBIT_RADIUS, e: 0, i: 0, raan: 0, argp: 0, m0: 1, epoch: 0 }
});
