/**
 * The sky light colours of a frame, remembered while the sun and the camera barely move (plan 418).
 * `sunTransmittance`, `skyAmbient` and `horizonColour` integrate the atmosphere along a handful of
 * paths with tuples for every step, and the scene asked for all three every frame: a fifth of the
 * Space Center's garbage and as much at the pad. The sun moves 7e-5 rad a second at real time, so the
 * answer is the same to a thousandth for seconds; under time warp or in a climb it moves more than the
 * tolerance each frame and is worked out each frame, as before.
 */
import {
	horizonColour,
	skyAmbient,
	sunTransmittance,
	type Atmosphere,
	type RGB
} from './atmosphere-model.ts';

/** The sun elevation, rad, within which the colours are reused: 0.01 degrees. */
export const SKY_LIGHT_ELEVATION_TOLERANCE = 2e-4;
/** The camera altitude, m, within which the colours are reused: the scale height is 5600 m. */
export const SKY_LIGHT_ALTITUDE_TOLERANCE = 0.5;

export interface SkyLight {
	sunT: RGB;
	ambient: RGB;
	horizon: RGB;
}

export class SkyLightCache {
	private atm: Atmosphere | null = null;
	private alt = 0;
	private elev = 0;
	private light: SkyLight | null = null;
	/** How many times the colours were worked out (tests and the debug counters). */
	computed = 0;

	/** The light for this atmosphere, altitude and sun elevation; do not change the arrays returned. */
	get(atm: Atmosphere, alt: number, elev: number): SkyLight {
		if (
			this.light &&
			atm === this.atm &&
			Math.abs(elev - this.elev) <= SKY_LIGHT_ELEVATION_TOLERANCE &&
			Math.abs(alt - this.alt) <= SKY_LIGHT_ALTITUDE_TOLERANCE
		)
			return this.light;
		this.atm = atm;
		this.alt = alt;
		this.elev = elev;
		this.computed++;
		this.light = {
			sunT: sunTransmittance(atm, alt, elev),
			ambient: skyAmbient(atm, alt, elev),
			horizon: horizonColour(atm, alt, elev)
		};
		return this.light;
	}
}
