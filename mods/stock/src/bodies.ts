import { defineBody, GRAVITATIONAL_CONSTANT, km } from '@orbital/sdk';

/** Standard gravitational parameter of the home body, m³/s² (Kerbin-scale: radius 600 km, surface g about 9.81 m/s²). */
export const HOME_MU = 3.5316e12;
/** The home planet: spherical, point-mass gravity, exponential atmosphere, root body of the system. */
export const HomeBody = defineBody({
	id: 'stock.home',
	mass: HOME_MU / GRAVITATIONAL_CONSTANT,
	radius: km(600),
	rotationPeriod: 21_600,
	atmosphere: { scaleHeight: 5_600, surfacePressure: 101_325, height: km(70) }
});
