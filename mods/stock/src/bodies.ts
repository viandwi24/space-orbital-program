import { defineBody, km } from '@orbital/sdk';

/** Standard gravitational parameter of the home body, m³/s² (Kerbin-scale: radius 600 km, surface g about 9.81 m/s²). */
export const HOME_MU = 3.5316e12;
/** Newtonian constant of gravitation, m³/(kg·s²) (CODATA 2018), used only to turn μ into a mass. */
const G = 6.6743e-11;

/** The home planet: spherical, point-mass gravity, exponential atmosphere, root body of the system. */
export const HomeBody = defineBody({
	id: 'stock.home',
	mass: HOME_MU / G,
	radius: km(600),
	rotationPeriod: 21_600,
	atmosphere: { scaleHeight: 5_600, surfacePressure: 101_325, height: km(70) }
});
