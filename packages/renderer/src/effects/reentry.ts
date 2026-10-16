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
/** Flux where the shell starts to show / is fully developed, W/m^2. */
export const PLASMA_FLUX_START = 1e5;
export const PLASMA_FLUX_FULL = 2e6;

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
