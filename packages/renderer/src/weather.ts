/**
 * The weather coverage over time (plan 397, ADR 0341): the cloud cover the planet pass bakes its cloud
 * map with, as a pure, deterministic function of the world seed and game time. A save reloads the
 * same sky; it is renderer data, not sim state. Cover follows a slow value noise (fronts of about
 * 6 h, a day and 2.5 days) around the old constant 0.42, so the sky is clear for stretches and
 * overcast for others across a few days of play.
 */

/** The cover the clouds had before weather moved, and the span around it. */
export const WEATHER_MEAN = 0.42;
export const WEATHER_SPAN = 0.34;
/** Periods of the three octaves, s of game time (the day of the home planet is not assumed). */
const PERIODS = [21_600, 86_400, 216_000] as const;
const WEIGHTS = [0.3, 0.45, 0.25] as const;

/** A hash of an integer lattice point to [-1, 1] (a seeded integer mix). */
function lattice(seed: number, i: number): number {
	let h = (Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(seed | 0, 0x165667b1)) >>> 0;
	h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
	h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
	h = (h ^ (h >>> 16)) >>> 0;
	return (h / 0xffffffff) * 2 - 1;
}

/** Smooth 1-D value noise in [-1, 1]. */
function noise1(seed: number, x: number): number {
	const i = Math.floor(x);
	const f = x - i;
	const s = f * f * (3 - 2 * f);
	return lattice(seed, i) * (1 - s) + lattice(seed, i + 1) * s;
}

/** Cloud cover (0..1 of the sky the map calls cloudy) at game time `t`, s, for a world `seed`. */
export function weatherCover(seed: number, t: number): number {
	let sum = 0;
	PERIODS.forEach((period, k) => {
		sum += WEIGHTS[k]! * noise1(seed + k * 7919, t / period);
	});
	return Math.min(0.9, Math.max(0.05, WEATHER_MEAN + WEATHER_SPAN * sum));
}

/** The cover the map is baked with: steps of 0.02, so it rebakes only when the weather moved visibly. */
export const COVER_STEP = 0.02;
export const quantizeCover = (cover: number): number => Math.round(cover / COVER_STEP) * COVER_STEP;

/**
 * One frame's move from the baked cover toward the target: at most one step per `holdSeconds` of
 * wall-clock time, so a fast time warp changes the sky a step at a time and rebakes at most that often.
 * Returns the new baked cover and the time left until the next move.
 */
export function stepCover(
	baked: number,
	target: number,
	wait: number,
	dt: number,
	holdSeconds = 2
): { cover: number; wait: number } {
	const left = wait - dt;
	if (left > 0 || Math.abs(target - baked) < COVER_STEP / 2)
		return { cover: baked, wait: Math.max(0, left) };
	const move = Math.sign(target - baked) * Math.min(COVER_STEP, Math.abs(target - baked));
	return { cover: quantizeCover(baked + move), wait: holdSeconds };
}
