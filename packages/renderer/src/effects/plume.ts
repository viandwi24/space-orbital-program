/**
 * Engine plume shape from throttle and ambient pressure (pure; plan 020). A jet leaves the nozzle
 * at the exit pressure `pe`. Where the air is denser it is squeezed (over-expanded, narrow, long,
 * bright, with shock diamonds); where it is thinner it spreads (under-expanded, wide and short,
 * dimmer). The expansion factor is the isentropic area ratio `(pe / pa)^(1/gamma)` as a radius
 * `(pe / pa)^(1/(2 gamma))`, clamped so the vacuum plume stays a plume.
 */
import { clamp } from '../vec.ts';

export const SEA_LEVEL_PRESSURE = 101_325;
/** Exit pressure assumed when a descriptor gives none, Pa. */
export const DEFAULT_EXIT_PRESSURE = 60_000;
const GAMMA = 1.2;
const MAX_EXPANSION = 3.5;
const MIN_EXPANSION = 0.8;
/** Throttle below this is no plume (an engine that is off, or idling at zero). */
const MIN_THROTTLE = 0.01;

export interface PlumeInput {
	throttle: number;
	ignited: boolean;
	flameout: boolean;
	/** Ambient pressure at the nozzle, Pa. */
	ambientPressure: number;
	/** Nozzle exit pressure, Pa. */
	exitPressure: number;
	/** Plume length at full throttle at the design pressure, m. */
	baseLength: number;
	/** Nozzle exit radius, m. */
	exitRadius: number;
}

export interface PlumeShape {
	visible: boolean;
	/** Distance from the exit plane to the tip, m. */
	length: number;
	exitRadius: number;
	/** Widest radius of the plume, m. */
	maxRadius: number;
	/** `maxRadius / exitRadius` before the throttle factor (vacuum spreading). */
	expansion: number;
	/** Emission gain, 0..1. */
	brightness: number;
	/** 0 in air at or above the exit pressure, 1 in vacuum. */
	vacuum: number;
	/** Strength of the shock-diamond pattern, 0..1. */
	diamonds: number;
}

const finite = (v: number, fallback: number): number => (Number.isFinite(v) ? v : fallback);

const NONE: PlumeShape = {
	visible: false,
	length: 0,
	exitRadius: 0,
	maxRadius: 0,
	expansion: 1,
	brightness: 0,
	vacuum: 0,
	diamonds: 0
};

export function plumeShape(input: PlumeInput): PlumeShape {
	const throttle = clamp(finite(input.throttle, 0), 0, 1);
	if (!input.ignited || input.flameout || throttle < MIN_THROTTLE) return NONE;
	const pa = Math.max(0, finite(input.ambientPressure, 0));
	const pe = Math.max(1, finite(input.exitPressure, DEFAULT_EXIT_PRESSURE));
	const baseLength = Math.max(0, finite(input.baseLength, 0));
	const exitRadius = Math.max(0, finite(input.exitRadius, 0));
	const ratio = pa / pe;
	const vacuum = 1 - clamp(ratio, 0, 1);
	const expansion = clamp(
		Math.pow(pe / Math.max(pa, 1), 1 / (2 * GAMMA)),
		MIN_EXPANSION,
		MAX_EXPANSION
	);
	// Diamonds: visible while the jet is within a factor of a few of matched, strongest just under.
	const diamonds =
		ratio < 0.3 || ratio > 1.2 ? 0 : throttle * Math.sin((Math.PI * (ratio - 0.3)) / 0.9) ** 0.5;
	return {
		visible: true,
		length: baseLength * (0.25 + 0.75 * throttle) * (1 - 0.28 * vacuum),
		exitRadius,
		maxRadius: exitRadius * expansion * (0.65 + 0.35 * Math.sqrt(throttle)),
		expansion,
		brightness: Math.pow(throttle, 0.6) * (1 - 0.4 * vacuum),
		vacuum,
		diamonds
	};
}

/** Ambient pressure of an exponential atmosphere (the sim's `ambientAt`), Pa. */
export function ambientPressureAt(
	atmosphere: { scaleHeight: number; surfacePressure: number; height: number } | undefined,
	altitude: number
): number {
	if (!atmosphere || altitude >= atmosphere.height) return 0;
	return atmosphere.surfacePressure * Math.exp(-Math.max(altitude, 0) / atmosphere.scaleHeight);
}

/** Time constants of the engine ramp, s: the visible plume follows the commanded state (plan 026). */
export const RAMP_UP = 0.12;
export const RAMP_DOWN = 0.2;
export const FLASH_DECAY = 0.25;

export interface EngineRamp {
	/** Displayed throttle, 0..1. */
	level: number;
	/** Ignition flash, 1 at the moment of ignition, decaying to 0. */
	flash: number;
	/** The engine was lit at the previous step. */
	lit: boolean;
}

export const RAMP_START: EngineRamp = { level: 0, flash: 0, lit: false };

/**
 * One step of the start-up ramp and shutdown fade: the displayed throttle rises with `RAMP_UP`
 * and falls with `RAMP_DOWN` (exponential approach, so any `dt` is stable), an ignition (off to
 * lit) sets a flash that decays with `FLASH_DECAY`. Pure.
 */
export function stepEngineRamp(
	prev: EngineRamp,
	engine: { throttle: number; ignited: boolean; flameout: boolean },
	dt: number
): EngineRamp {
	const lit = engine.ignited && !engine.flameout;
	const goal = lit ? clamp(finite(engine.throttle, 0), 0, 1) : 0;
	const step = Math.max(0, finite(dt, 0));
	const tau = goal > prev.level ? RAMP_UP : RAMP_DOWN;
	const level = prev.level + (goal - prev.level) * (1 - Math.exp(-step / tau));
	const flash = lit && !prev.lit ? 1 : prev.flash * Math.exp(-step / FLASH_DECAY);
	return { level: level < 1e-4 ? 0 : level, flash: flash < 1e-3 ? 0 : flash, lit };
}
