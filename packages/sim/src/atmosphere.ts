/**
 * The atmosphere (simulation.md, ADR 0204). Pressure falls as exp(-h/H) and is cut to zero at the
 * body's atmosphere height. The air temperature follows the body's `temperatureCurve` (288.15 K
 * without one); density follows from the ideal gas law, `ρ = p / (R·T)`, and the speed of sound
 * is `√(γ·R·T)`. Without a curve a 101 325 Pa surface gives 1.225 kg/m³, as before plan 212.
 */
import type { Ambient, BodyDefinition } from '@orbital/core';
import { AIR_GAMMA, AIR_GAS_CONSTANT, AIR_TEMPERATURE } from './constants.ts';

const VACUUM: Ambient = { pressure: 0, density: 0, altitude: 0 };

type Atmosphere = NonNullable<BodyDefinition['atmosphere']>;

/** The air temperature at `altitude` on the curve, K: linear between keys, held beyond the ends. */
export function temperatureAt(
	atmo: Pick<Atmosphere, 'temperatureCurve'>,
	altitude: number
): number {
	const keys = atmo.temperatureCurve;
	if (!keys || keys.length === 0) return AIR_TEMPERATURE;
	if (altitude <= keys[0]![0]) return keys[0]![1];
	for (let i = 1; i < keys.length; i++) {
		const [h1, t1] = keys[i]!;
		if (altitude <= h1) {
			const [h0, t0] = keys[i - 1]!;
			return t0 + ((t1 - t0) * (altitude - h0)) / (h1 - h0);
		}
	}
	return keys[keys.length - 1]![1];
}

export function ambientAt(body: BodyDefinition, altitude: number): Ambient {
	const atmo = body.atmosphere;
	if (!atmo || altitude >= atmo.height) return { ...VACUUM, altitude };
	const h = Math.max(altitude, 0);
	const pressure = atmo.surfacePressure * Math.exp(-h / atmo.scaleHeight);
	const gas = atmo.gasConstant ?? AIR_GAS_CONSTANT;
	const temperature = temperatureAt(atmo, h);
	return {
		pressure,
		density: pressure / (gas * temperature),
		altitude,
		temperature,
		speedOfSound: Math.sqrt((atmo.gamma ?? AIR_GAMMA) * gas * temperature)
	};
}

/**
 * Transonic drag rise (plan 212, ADR 0204 point 3): the factor on every part's drag coefficient by
 * Mach number. Flat 1 to Mach 0.8, a peak of 2.5 at 1.05, easing to 1.6 by Mach 2 and flat beyond,
 * one global curve as in KSP. Starting points for balancing.
 */
export const MACH_DRAG_CURVE: ReadonlyArray<readonly [number, number]> = [
	[0, 1],
	[0.8, 1],
	[1.05, 2.5],
	[1.3, 2.2],
	[2, 1.6]
];

export function machDragFactor(mach: number): number {
	const keys = MACH_DRAG_CURVE;
	if (!(mach > 0)) return 1;
	for (let i = 1; i < keys.length; i++) {
		const [m1, f1] = keys[i]!;
		if (mach <= m1) {
			const [m0, f0] = keys[i - 1]!;
			return f0 + ((f1 - f0) * (mach - m0)) / (m1 - m0);
		}
	}
	return keys[keys.length - 1]![1];
}
