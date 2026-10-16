/**
 * Time of day for the hangar's daylight (plan 029): where the sun stands behind the clerestory
 * windows and how warm its light is. Pure maths; `hangar.ts` builds the shafts, the window glow
 * and the floor patches from it, the view tints its key light by `warmth`.
 */

/** The fixed afternoon used when the page gives no time of day. */
export const DEFAULT_TIME_OF_DAY = 0.68;

export interface DayLight {
	/** The clamped input, 0 = dawn, 0.5 = noon, 1 = dusk. */
	time: number;
	/** Sun elevation above the horizon, rad. */
	elevation: number;
	/** Unit vector from the room towards the sun (y up; the sun swings from -x over -z to +x). */
	toSun: readonly [number, number, number];
	/** 0 at noon, 1 at the horizon: how orange the light is. */
	warmth: number;
	/** Linear RGB of the sunlight. */
	sun: readonly [number, number, number];
	/** Linear RGB of the sky seen through the windows (before the vertical gradient). */
	sky: readonly [number, number, number];
}

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

export function dayLight(time: number = DEFAULT_TIME_OF_DAY): DayLight {
	const t = Math.min(1, Math.max(0, Number.isFinite(time) ? time : DEFAULT_TIME_OF_DAY));
	const arc = Math.sin(Math.PI * t);
	const elevation = ((6 + 54 * arc) * Math.PI) / 180;
	const theta = Math.PI * (1 + t);
	const c = Math.cos(elevation);
	const warmth = 1 - Math.pow(arc, 0.7);
	return {
		time: t,
		elevation,
		toSun: [Math.cos(theta) * c, Math.sin(elevation), Math.sin(theta) * c],
		warmth,
		sun: [mix(1.0, 1.0, warmth), mix(0.96, 0.6, warmth), mix(0.9, 0.3, warmth)],
		sky: [mix(0.62, 1.0, warmth), mix(0.8, 0.66, warmth), mix(1.0, 0.45, warmth)]
	};
}

/**
 * The part of a window's daylight that reaches the floor: a parallelogram from the window
 * rectangle along `-toSun` down to y = 0. Returns the four floor corners for a window whose
 * rectangle has corners `a`..`d` (any order around it), or null when the sun is behind the wall.
 */
export function floorPatch(
	corners: readonly (readonly [number, number, number])[],
	toSun: readonly [number, number, number]
): [number, number, number][] | null {
	if (toSun[1] <= 1e-3) return null;
	return corners.map(([x, y, z]) => {
		const s = y / toSun[1];
		return [x - toSun[0] * s, 0, z - toSun[2] * s] as [number, number, number];
	});
}
