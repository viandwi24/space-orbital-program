/**
 * Re-entry plasma from airspeed and density (pure; plan 020). Uses the same stagnation-point law
 * as the simulation's heating (ADR 0023, Sutton-Graves `q = k sqrt(rho / r) v^3`), so the glow
 * the player sees starts where the parts really start to heat. The constants repeat the sim's
 * (`packages/sim/src/constants.ts`); the renderer may not import the sim.
 */
import type { Vec3 } from '@orbital/core';
import { clamp, cross, length, sub } from '../vec.ts';
import { ambientPressureAt } from './plume.ts';

export const AIR_GAS_CONSTANT = 287.05;
export const AIR_TEMPERATURE = 288.15;
export const SUTTON_GRAVES_K = 1.74e-4;
/** Nose radius assumed for the whole vessel, m (stock parts are 0.625 m class). */
export const PLASMA_NOSE_RADIUS = 0.625;
/**
 * Flux where the shell starts to show / is fully developed, W/m^2. Plan 040 lowered these from
 * 1e5 and 2e6: they were set for Earth-scale entry speeds, and the home body (radius 600 km, mu
 * 3.53e12) is entered from orbit at 2.4 km/s, where the peak flux of a ballistic return is 1.2e5
 * to 5.5e5 W/m^2 (ADR 0078), so the shell was invisible in every normal return.
 */
export const PLASMA_FLUX_START = 5e4;
export const PLASMA_FLUX_FULL = 6e5;

export function airDensity(
	atmosphere: { scaleHeight: number; surfacePressure: number; height: number } | undefined,
	altitude: number
): number {
	return ambientPressureAt(atmosphere, altitude) / (AIR_GAS_CONSTANT * AIR_TEMPERATURE);
}

/** Velocity of a vessel relative to air that turns with the body: `v - omega x r`. */
export function airVelocity(velocity: Vec3, position: Vec3, omega: Vec3): Vec3 {
	return sub(velocity, cross(omega, position));
}

export function stagnationFlux(density: number, noseRadius: number, speed: number): number {
	if (!(density > 0) || !(speed > 0) || !(noseRadius > 0)) return 0;
	return SUTTON_GRAVES_K * Math.sqrt(density / noseRadius) * speed ** 3;
}

/** 0..1 visibility of the plasma shell for a stagnation flux. */
export function plasmaIntensityFromFlux(flux: number): number {
	const t = clamp((flux - PLASMA_FLUX_START) / (PLASMA_FLUX_FULL - PLASMA_FLUX_START), 0, 1);
	return t * t * (3 - 2 * t);
}

/** Plasma intensity for an airspeed (m/s) at an altitude (m) in the given atmosphere. */
export function plasmaIntensity(
	airspeed: number,
	altitude: number,
	atmosphere: { scaleHeight: number; surfacePressure: number; height: number } | undefined
): number {
	return plasmaIntensityFromFlux(
		stagnationFlux(airDensity(atmosphere, altitude), PLASMA_NOSE_RADIUS, airspeed)
	);
}

export const speedOf = (v: Vec3): number => length(v);

/**
 * Plasma blackout (plan 040, ADR 0079). Radio fails when the plasma frequency of the shock layer
 * passes the link frequency, which needs enough electrons, and the electrons come from the same
 * dissociation and ionisation that the stagnation heat flux measures. So the display uses the
 * heating model's flux with a higher start than the glow: the shell shows from `PLASMA_FLUX_START`,
 * the signal goes at `BLACKOUT_FLUX_START` and is fully lost at `BLACKOUT_FLUX_FULL`. No flux in
 * vacuum (no density) and none at low speed (no ionisation), so blackout has a window in altitude
 * and speed by construction, as the real one does (it ends when the vessel slows and the air
 * thickens enough for collisions to damp the electrons: the flux falls with speed cubed).
 */
export const BLACKOUT_FLUX_START = 1.5e5;
export const BLACKOUT_FLUX_FULL = 4e5;
/** The HUD shows the badge at or above this level. */
export const BLACKOUT_BADGE_LEVEL = 0.5;

/** 0..1 loss of signal for a stagnation flux (W/m^2). */
export function blackoutLevelFromFlux(flux: number): number {
	const t = clamp((flux - BLACKOUT_FLUX_START) / (BLACKOUT_FLUX_FULL - BLACKOUT_FLUX_START), 0, 1);
	return t * t * (3 - 2 * t);
}

/** Loss of signal for an airspeed (m/s) at an altitude (m) in the given atmosphere. */
export function blackoutLevel(
	airspeed: number,
	altitude: number,
	atmosphere: { scaleHeight: number; surfacePressure: number; height: number } | undefined
): number {
	return blackoutLevelFromFlux(
		stagnationFlux(airDensity(atmosphere, altitude), PLASMA_NOSE_RADIUS, airspeed)
	);
}
