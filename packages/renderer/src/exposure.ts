/** Eye adaptation as a pure function (tested): the exposure that keeps day, dusk and night readable. */
import { lerp, smoothstep } from './vec.ts';

/** Exposure multiplier at full night (sun more than `NIGHT_END` below the horizon). */
export const NIGHT_EXPOSURE = 4;
export const DAY_EXPOSURE = 0.7;
/** Sun elevation, degrees, above which the exposure is the day value / below which it is the night value. */
export const DAY_START = 6;
export const NIGHT_END = -14;

/** Exposure for the sun elevation (degrees) at the camera; decreases monotonically with elevation. */
export const exposureFor = (sunElevationDeg: number): number =>
	lerp(NIGHT_EXPOSURE, DAY_EXPOSURE, smoothstep(NIGHT_END, DAY_START, sunElevationDeg));

/** Frame-rate independent smoothing toward `target` (time constant `tau`, s). */
export const adaptExposure = (current: number, target: number, dt: number, tau = 1.2): number =>
	current + (target - current) * (1 - Math.exp(-Math.max(0, dt) / tau));
