/**
 * Pure maths for the look of the effects (plan 033, ADR 0047): dust colour from the ground, wind,
 * the light a plume throws on the ground, and the colour of re-entry plasma by speed.
 */
import { clamp, lerp, smoothstep } from '../vec.ts';

export type Rgb = readonly [number, number, number];

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
	lerp(a[0], b[0], t),
	lerp(a[1], b[1], t),
	lerp(a[2], b[2], t)
];

const SAND: Rgb = [0.78, 0.66, 0.48];
const SOIL: Rgb = [0.5, 0.4, 0.3];
const ROCK: Rgb = [0.56, 0.54, 0.52];
const SNOWY: Rgb = [0.85, 0.87, 0.9];
const SPRAY: Rgb = [0.93, 0.96, 1];

/** Below this height (m above the reference sphere) the ground under a plume is water. */
export const WATER_LEVEL = 0.5;

/**
 * Tint of the dust a plume throws up from ground at `height` m above the reference sphere (the
 * terrain height of ADR 0043): white spray over water, pale sand on the coastal flats, soil, rock,
 * then snow high up.
 */
export function dustColour(height: number): Rgb {
	if (!(height > WATER_LEVEL)) return SPRAY;
	let c = mix(SAND, SOIL, smoothstep(5, 200, height));
	c = mix(c, ROCK, smoothstep(250, 700, height));
	return mix(c, SNOWY, smoothstep(1_400, 2_200, height));
}

/** The ground is water at this height. */
export const isWater = (height: number): boolean => !(height > WATER_LEVEL);

/**
 * Horizontal wind speed (m/s) and its heading (rad, in the local tangent plane from an arbitrary
 * but fixed axis) at `altitude` m and `time` s: a light surface breeze that stiffens with height,
 * with a slow drift of the direction. Deterministic.
 */
export function windAt(altitude: number, time: number): { speed: number; heading: number } {
	const h = Math.max(0, altitude);
	const speed = 2.5 + 9 * smoothstep(0, 3_000, h) + 0.8 * Math.sin(time * 0.17);
	return { speed: Math.max(0, speed), heading: 0.7 + 0.35 * Math.sin(time * 0.011) };
}

export interface GroundLight {
	/** Radius of the lit disc on the ground, m. */
	radius: number;
	/** Emission gain, 0 when too high to matter. */
	intensity: number;
}

/**
 * The glow a plume throws on the ground below it. It reaches six plume lengths down, falls off
 * with the square of the remaining reach, and the disc widens as the nozzle climbs.
 */
export function plumeGroundLight(
	height: number,
	throttle: number,
	plumeLength: number,
	exitRadius: number
): GroundLight {
	const l = Math.max(plumeLength, 0.5);
	const reach = 6 * l;
	const h = Math.max(0, height);
	const thr = clamp(throttle, 0, 1);
	if (h >= reach || thr <= 0) return { radius: 0, intensity: 0 };
	const f = 1 - h / reach;
	return {
		radius: exitRadius * 3 + h * 0.9 + l * 0.5,
		intensity: thr * f * f
	};
}

/**
 * Colour of the shock layer by speed (m/s), as a unit-ish emission tint: deep orange below 4 km/s,
 * yellow-white by 7 km/s, a pink-white at orbital return speed (7.8 km/s) and blue-white above
 * 10 km/s where the air ionises and dissociates.
 */
export function ionisationColour(speed: number): Rgb {
	const v = Math.max(0, speed);
	const ORANGE: Rgb = [1, 0.32, 0.08];
	const YELLOW: Rgb = [1, 0.7, 0.35];
	const PINK: Rgb = [1, 0.62, 0.78];
	const BLUE: Rgb = [0.55, 0.72, 1];
	if (v < 4_000) return ORANGE;
	if (v < 7_000) return mix(ORANGE, YELLOW, smoothstep(4_000, 7_000, v));
	if (v < 8_500) return mix(YELLOW, PINK, smoothstep(7_000, 8_500, v));
	return mix(PINK, BLUE, smoothstep(8_500, 11_000, v));
}
