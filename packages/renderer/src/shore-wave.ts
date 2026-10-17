/**
 * Shore waves (plan 038, ADR 0072): a swell entering shallow water slows (`c = sqrt(g d)`), so its
 * crests crowd together and move toward the shore; where its height reaches `BREAKER_INDEX` times the
 * depth it breaks into a foam band. Depth is `slope * x` for `x` metres from the shoreline. Pure
 * maths, tested in Bun; the planet pass takes the constants from here. The phase is periodic in
 * `SHORE_PERIOD`, which divides `WAVE_PERIOD`, so the shader's wrapped clock never jumps.
 */
import { WAVE_GRAVITY, WAVE_PERIOD } from './water-model.ts';

/** Beach slope (rise over run) used for every shore: 1 in 30. */
export const BEACH_SLOPE = 1 / 30;
/** Period of the swell that reaches the shore, s (25 cycles in `WAVE_PERIOD`). */
export const SHORE_PERIOD = WAVE_PERIOD / 25;
/** Height of the breaking waves on the sea, m, and the share of it on a lake. */
export const SHORE_WAVE_HEIGHT = 1.1;
export const LAKE_WAVE_SHARE = 0.3;
/** McCowan's breaker index, the ratio of wave height to depth at breaking (a first estimate: Goda, 2010). */
export const BREAKER_INDEX = 0.78;
/** Nearest distance to the shore (m) the phase is evaluated at (the wavenumber grows without bound there). */
export const SHORE_MIN_DISTANCE = 0.5;

export const shoreOmega = (period = SHORE_PERIOD): number => (2 * Math.PI) / period;

/** Distance from the shore (m) at which a wave of height `waveHeight` breaks on this slope. */
export const breakDistance = (
	waveHeight: number,
	slope = BEACH_SLOPE,
	index = BREAKER_INDEX
): number => waveHeight / (index * slope);

/**
 * Phase (rad) of the swell `x` metres from the shore at time `t`: the integral of the shoaling
 * wavenumber `omega / sqrt(g slope x)` along the beach, plus `omega t` (a wave travelling toward
 * smaller `x`). Crests are where it is a multiple of 2 pi; they move toward the shore as `t` grows.
 */
export function surfPhase(
	x: number,
	t: number,
	slope = BEACH_SLOPE,
	period = SHORE_PERIOD
): number {
	const w = shoreOmega(period);
	const xe = Math.max(x, SHORE_MIN_DISTANCE);
	return 2 * w * Math.sqrt(xe / (WAVE_GRAVITY * slope)) + w * t;
}

/** Distance between neighbouring crests (m) at `x` metres from the shore: `2 pi / (d phase / dx)`. */
export function crestSpacing(x: number, slope = BEACH_SLOPE, period = SHORE_PERIOD): number {
	const xe = Math.max(x, SHORE_MIN_DISTANCE);
	return (2 * Math.PI * Math.sqrt(WAVE_GRAVITY * slope * xe)) / shoreOmega(period);
}

/** A narrow crest in [0, 1] of a phase: 1 at a multiple of 2 pi, falling to 0 over about a third of the wavelength. */
export function crestProfile(phase: number): number {
	const c = 0.5 + 0.5 * Math.cos(phase);
	return c * c * c * c;
}

/** Excursion (m, toward the water positive) of the swash edge at time `t`: a fraction of the run-up of the waves. */
export function swashOffset(
	t: number,
	waveHeight = SHORE_WAVE_HEIGHT,
	slope = BEACH_SLOPE,
	period = SHORE_PERIOD
): number {
	const amplitude = (0.12 * waveHeight) / slope;
	const w = shoreOmega(period);
	return amplitude * (Math.sin(w * t) + 0.35 * Math.sin(2 * w * t + 1.1));
}

/**
 * Foam of the surf (0 to 1) `x` metres from the shoreline at time `t` for waves of `waveHeight`: a crest
 * line that is strong inside the breaker distance (white water, a swash sheet running up the sand) and
 * only a faint line outside it. A shore with no waves (`waveHeight` 0) has no surf.
 */
export function surfFoam(
	x: number,
	t: number,
	waveHeight = SHORE_WAVE_HEIGHT,
	slope = BEACH_SLOPE,
	period = SHORE_PERIOD
): number {
	if (waveHeight <= 0) return 0;
	const xb = breakDistance(waveHeight, slope);
	const crest = crestProfile(
		surfPhase(x - swashOffset(t, waveHeight, slope, period) * 0.5, t, slope, period)
	);
	const breaking = 1 - smoothstep(xb * 0.9, xb * 1.6, x);
	const shore = smoothstep(-2, 1, x);
	const reach = 1 - smoothstep(xb * 2.5, xb * 5, x);
	return Math.min(1, shore * (0.12 * crest * reach + breaking * (0.25 + 0.75 * crest)));
}

function smoothstep(e0: number, e1: number, x: number): number {
	const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
	return t * t * (3 - 2 * t);
}
