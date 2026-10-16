/**
 * Pure engine arithmetic shared by the engine module, tests and the sim. No world, no physics:
 * everything is a function of config, state and ambient pressure, in SI.
 */
import { SEA_LEVEL_PRESSURE, STANDARD_GRAVITY } from '@orbital/sdk';

/** Standard gravity, m/s², the conventional definition used to convert Isp (s) to exhaust speed. */
export const G0 = STANDARD_GRAVITY;

/** Surface pressure of the home body, Pa; Isp interpolates between sea level and vacuum (one constant with the SDK's). */
export { SEA_LEVEL_PRESSURE };

export interface EngineConfigLike {
	/** Vacuum thrust at full throttle, N. */
	readonly thrust: number;
	readonly ispVacuum: number;
	readonly ispSeaLevel: number;
	readonly propellants: readonly { readonly resource: string; readonly ratio: number }[];
}

export interface EngineStateLike {
	readonly ignited: boolean;
	readonly throttle: number;
	readonly flameout: boolean;
}

export interface EngineOutput {
	/** Thrust magnitude along the engine axis, N. */
	thrust: number;
	/** Propellant mass flow, kg/s (constant per throttle: it does not depend on pressure). */
	massFlow: number;
	/** Isp at the given pressure, s. */
	isp: number;
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** Isp at `pressure` (Pa): linear between vacuum (0 Pa) and sea level. */
export function ispAt(config: EngineConfigLike, pressure: number): number {
	const f = clamp01(pressure / SEA_LEVEL_PRESSURE);
	return config.ispVacuum + (config.ispSeaLevel - config.ispVacuum) * f;
}

/**
 * Mass flow is fixed by the vacuum rating (`thrust / (ispVacuum · g0)` at full throttle) and
 * scales with throttle; thrust is `massFlow · isp(p) · g0`, which is lower in air. An engine that
 * is not ignited, has flamed out, or has zero throttle produces nothing.
 */
export function engineOutput(
	config: EngineConfigLike,
	state: EngineStateLike,
	pressure: number
): EngineOutput {
	const isp = ispAt(config, pressure);
	const throttle = state.ignited && !state.flameout ? clamp01(state.throttle) : 0;
	const massFlow = (throttle * config.thrust) / (config.ispVacuum * G0);
	return { thrust: massFlow * isp * G0, massFlow, isp };
}

/**
 * Split a mass flow into per-resource volume rates (units/s). `ratio` is by volume, so each rate
 * is `massFlow · ratio / Σ(ratio · density)`.
 */
export function propellantRates(
	config: EngineConfigLike,
	massFlow: number,
	densityOf: (resource: string) => number
): { resource: string; rate: number }[] {
	const massPerUnitMix = config.propellants.reduce(
		(sum, p) => sum + p.ratio * densityOf(p.resource),
		0
	);
	return config.propellants.map((p) => ({
		resource: p.resource,
		rate: (massFlow * p.ratio) / massPerUnitMix
	}));
}
