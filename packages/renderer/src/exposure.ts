/** Eye adaptation as a pure function (tested): the exposure that keeps day, dusk and night readable. */
import { lerp, smoothstep } from './vec.ts';

/** Exposure multiplier at full night (sun more than `NIGHT_END` below the horizon). */
export const NIGHT_EXPOSURE = 4;
export const DAY_EXPOSURE = 0.7;
/** Sun elevation, degrees, above which the exposure is the day value / below which it is the night value. */
export const DAY_START = 6;
export const NIGHT_END = -14;

/**
 * The night sky's own light, irradiance over pi (linear RGB): starlight, airglow and the scattered
 * light of the moon, bluish as night vision sees it. The ground, the meshes' sky light and the image
 * light all add it, on both renderers. Three times plan 019's first value: at that value a moonless
 * site away from its floodlights read as black (the owner, 2026-10-21).
 */
export const NIGHT_SKY: readonly [number, number, number] = [0.0105, 0.0144, 0.0285];

/**
 * How far the horizon sinks below the local horizontal at `altitude` over a body of `radius`, degrees:
 * the sun is still in view down to this elevation (41 degrees at 200 km over a 600 km planet).
 */
export const horizonDipDeg = (radius: number, altitude: number): number =>
	altitude > 0 && radius > 0 ? Math.acos(radius / (radius + altitude)) / (Math.PI / 180) : 0;

/** Exposure for the sun elevation (degrees) at the camera; decreases monotonically with elevation. */
export const exposureFor = (sunElevationDeg: number): number =>
	lerp(NIGHT_EXPOSURE, DAY_EXPOSURE, smoothstep(NIGHT_END, DAY_START, sunElevationDeg));

/** Frame-rate independent smoothing toward `target` (time constant `tau`, s). */
export const adaptExposure = (current: number, target: number, dt: number, tau = 1.2): number =>
	current + (target - current) * (1 - Math.exp(-Math.max(0, dt) / tau));

/**
 * How much of the star field is drawn, 0 to 1 (plan 039). Daylight drowns the stars, so a camera in
 * the lower atmosphere sees none until the sun is well below the horizon; above a quarter of the
 * atmosphere's height the sky is thin enough that they show whatever the sun does. At 0 the planet
 * pass skips the star field altogether, which is a large part of its cost over the sky.
 */
export function starVisibility(
	sunElevationDeg: number,
	altitude: number,
	atmosphereHeight: number
): number {
	const night = 1 - smoothstep(-14, -4, sunElevationDeg);
	const thin = smoothstep(0.25, 0.65, altitude / Math.max(atmosphereHeight, 1));
	return Math.max(night, thin);
}
