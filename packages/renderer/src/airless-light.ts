/**
 * Light on an airless body (plan 049, ADR 0058), as pure numbers: the sun is the only direct light,
 * what else reaches a vessel is sunlight bounced off the regolith below it (a physical term, not a
 * fudge) and a small sky floor standing in for planetshine, which is real but a hundred times too
 * faint to read on screen. Radiometric units as `atmosphere-model.ts`: the sun's irradiance on a
 * white surface facing it is `sunIrradiance`; a radiance `L` is what a white Lambert surface lit
 * by an environment of constant `L` reflects.
 */
import { smoothstep } from './vec.ts';

export type Rgb = readonly [number, number, number];

/** Linear albedo of the regolith: the moon pass's tint (`moon.ts`), so the bounce matches what is seen. */
export const REGOLITH_ALBEDO = 0.135;
/** Sky floor as a fraction of `sunIrradiance / PI`: planetshine and starlight, lifted to stay legible. */
export const SKY_FLOOR = 0.012;
/** Colour of the planetshine (the home planet is blue-white). */
export const SKY_TINT: Rgb = [0.8, 0.9, 1];
/** Sun elevation (degrees) between which the direct light fades in: the horizon with a little relief. */
export const SUN_FADE: readonly [number, number] = [-1.5, 1];

/**
 * Exposure multiplier on an airless body: the sun there is not dimmed by air (about 1.4 times what
 * reaches the home pad at the same elevation), so the eye stops down by about as much.
 */
export const AIRLESS_EXPOSURE = 0.6;

export interface AirlessLight {
	/** Multiplier of the sun's irradiance (0 below the horizon, 1 above a degree). */
	sun: number;
	/** Radiance of the sky hemisphere, linear RGB. */
	sky: Rgb;
	/** Radiance of the ground hemisphere (sunlit regolith as the vessel sees it), linear RGB. */
	ground: Rgb;
}

/** The light a vessel on or near the ground of an airless body sees, for the sun at `sunElevationDeg` over local flat ground. */
export function airlessLight(sunElevationDeg: number, sunIrradiance: number): AirlessLight {
	const sun = smoothstep(SUN_FADE[0], SUN_FADE[1], sunElevationDeg);
	const sinEl = Math.max(Math.sin((sunElevationDeg * Math.PI) / 180), 0);
	const lit = (REGOLITH_ALBEDO * sunIrradiance * sun * sinEl) / Math.PI;
	const floor = (SKY_FLOOR * sunIrradiance) / Math.PI;
	return {
		sun,
		sky: [floor * SKY_TINT[0], floor * SKY_TINT[1], floor * SKY_TINT[2]],
		// planetshine falls on the ground too, and the regolith reflects its albedo of it
		ground: [
			lit + floor * REGOLITH_ALBEDO * SKY_TINT[0],
			lit + floor * REGOLITH_ALBEDO * SKY_TINT[1],
			lit + floor * REGOLITH_ALBEDO * SKY_TINT[2]
		]
	};
}
