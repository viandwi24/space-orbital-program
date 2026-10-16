/**
 * Exponential atmosphere (simulation.md). Pressure falls as exp(-h/H) and is cut to zero at the
 * body's atmosphere height; density follows from the ideal gas law with a fixed air composition
 * and temperature, so a 101 325 Pa surface gives 1.225 kg/m³.
 */
import type { Ambient, BodyDefinition } from '@orbital/core';
import { AIR_GAS_CONSTANT, AIR_TEMPERATURE } from './constants.ts';

const VACUUM: Ambient = { pressure: 0, density: 0, altitude: 0 };

export function ambientAt(body: BodyDefinition, altitude: number): Ambient {
	const atmo = body.atmosphere;
	if (!atmo || altitude >= atmo.height) return { ...VACUUM, altitude };
	const pressure = atmo.surfacePressure * Math.exp(-Math.max(altitude, 0) / atmo.scaleHeight);
	return { pressure, density: pressure / (AIR_GAS_CONSTANT * AIR_TEMPERATURE), altitude };
}
