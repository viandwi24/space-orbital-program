/**
 * The launch site's moving parts (plan 038, ADR 0073), as pure functions of the vessel's height and
 * of time: swing arms that fold away as the vessel lifts, steam venting from the tank, blinking
 * beacons and lit windows at night. Nothing here keeps state besides the arm angle the caller holds;
 * `site-meshes.ts` applies the results to meshes. Tested in Bun.
 */
import { hash3 } from './noise.ts';

const DEG = Math.PI / 180;

/** Angle (rad) the arms swing to when folded against the tower. */
export const ARM_RETRACTED = 92 * DEG;
/** Height of the vessel above the pad (m) at which the arms are fully folded. */
export const ARM_CLEAR_HEIGHT = 1.2;
/** Height (m) at which the arms start to fold: a vessel resting on its legs has settled a few centimetres. */
export const ARM_START_HEIGHT = 0.05;
/** Slew rates, rad/s: the arms fold fast (they must clear the vessel) and come back slowly. */
export const ARM_RETRACT_RATE = 150 * DEG;
export const ARM_EXTEND_RATE = 25 * DEG;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const smoothstep = (e0: number, e1: number, x: number): number => {
	const t = clamp((x - e0) / (e1 - e0), 0, 1);
	return t * t * (3 - 2 * t);
};

/**
 * The angle the arms should have for a vessel `height` metres above the pad: 0 (extended) with it on
 * the pad, `ARM_RETRACTED` from `ARM_CLEAR_HEIGHT` up. `null` (no vessel on the pad's world) is extended.
 */
export function armTarget(height: number | null): number {
	if (height === null) return 0;
	return ARM_RETRACTED * smoothstep(ARM_START_HEIGHT, ARM_CLEAR_HEIGHT, height);
}

/** Moves the arm angle toward the target by at most the slew rate for `dt` seconds. */
export function armStep(current: number, target: number, dt: number): number {
	const rate = target > current ? ARM_RETRACT_RATE : ARM_EXTEND_RATE;
	const max = rate * Math.max(dt, 0);
	return current + clamp(target - current, -max, max);
}

// --- steam -------------------------------------------------------------------------------------

/** Number of puffs of one vent and the seconds one puff lives. */
export const STEAM_PUFFS = 14;
export const STEAM_LIFE = 7;

export interface SteamPuff {
	/** Offset from the vent in site-local metres (east, up, south) before the wind is rotated in. */
	x: number;
	y: number;
	z: number;
	/** Radius of the puff, m. */
	size: number;
	/** Opacity 0 to 1. */
	alpha: number;
}

export interface SteamParams {
	/** Vertical speed at the vent, m/s, and how fast it dies away (1/s). */
	rise: number;
	drag: number;
	/** Wind drift, m/s east and south. */
	windX: number;
	windZ: number;
	/** Radius at the vent and the growth over a lifetime, m. */
	size0: number;
	grow: number;
	/** Peak opacity. */
	strength: number;
}

export const STEAM_DEFAULT: SteamParams = {
	rise: 2.6,
	drag: 0.55,
	windX: 1.4,
	windZ: 0.5,
	size0: 0.5,
	grow: 3.4,
	strength: 0.7
};

/**
 * Puff `index` (0 to `STEAM_PUFFS` - 1) of a vent at time `t`: a function, no state. Puffs are evenly
 * spread over the lifetime, rise with drag, drift with the wind, swell and fade; a little hash jitter
 * keeps them from standing in a column. `visibility` (0 to 1) scales the opacity (the vent dying down).
 */
export function steamPuff(
	index: number,
	t: number,
	visibility = 1,
	params: SteamParams = STEAM_DEFAULT
): SteamPuff {
	const phase = index / STEAM_PUFFS + t / STEAM_LIFE;
	const u = phase - Math.floor(phase); // 0 at the vent, 1 at the end of life
	const age = u * STEAM_LIFE;
	const cycle = Math.floor(phase); // a new puff each lifetime: its own jitter
	const j1 = hash3(index, cycle, 1, 31) - 0.5;
	const j2 = hash3(index, cycle, 2, 32) - 0.5;
	const rise = (params.rise / params.drag) * (1 - Math.exp(-params.drag * age));
	const fadeIn = smoothstep(0, 0.06, u);
	const fadeOut = (1 - u) * (1 - u);
	return {
		x: j1 * 0.8 + params.windX * age * (0.4 + 0.6 * u),
		y: rise,
		z: j2 * 0.8 + params.windZ * age * (0.4 + 0.6 * u),
		size: params.size0 + params.grow * Math.sqrt(u),
		alpha: params.strength * fadeIn * fadeOut * clamp(visibility, 0, 1)
	};
}

/** How strongly a vent shows for a vessel at this height above the pad: full on the pad, gone when it has left. */
export const steamVisibility = (height: number | null): number =>
	height === null ? 1 : 1 - smoothstep(0.4, 4, height);

// --- beacons and windows -------------------------------------------------------------------------

/** Period (s) of the beacons and the share of it they are lit. */
export const BEACON_PERIOD = 1.5;
export const BEACON_DUTY = 0.18;
/** The dim glow of an unlit beacon, relative to a lit one. */
export const BEACON_DIM = 0.06;

/** Brightness (0 to 1) of a beacon at time `t` with a phase offset in [0, 1) of the period. */
export function beaconLevel(t: number, offset: number): number {
	const x = t / BEACON_PERIOD + offset;
	const u = x - Math.floor(x);
	return u < BEACON_DUTY ? 1 : BEACON_DIM;
}

/** Share of the panes that are lit at night. */
export const WINDOW_LIT_SHARE = 0.55;

/** Whether the pane with this key is one of the lit ones (a fixed hash, so it never changes). */
export const windowIsLit = (key: number): boolean => hash3(key, 7, 3, 41) < WINDOW_LIT_SHARE;

/** Emissive strength of a lit pane for a floodlight level (0 by day, 1 at night): dark until dusk. */
export const windowGlow = (lampLevel: number): number => smoothstep(0.15, 0.7, lampLevel);

// --- the pad -------------------------------------------------------------------------------------

/**
 * Where the tracker thinks the vessel stands: `rest` is the height (m along the pad's vertical) of the
 * vessel's origin when it was first seen resting near the pad; `last` the previous reading.
 */
export interface PadTracker {
	rest: number | null;
	last: number | null;
}

export const newPadTracker = (): PadTracker => ({ rest: null, last: null });

/** Within this horizontal distance (m) of the pad axis a vessel counts as standing on the pad. */
export const PAD_NEAR = 60;
/** A reading this far (m) from the previous one is a different vessel (or a reload), not a lift-off. */
export const PAD_JUMP = 25;
/** Height reported for a vessel that is nowhere near the pad: arms folded, vents quiet. */
export const PAD_FAR = 1e6;

/**
 * Height (m) of a vessel above where it stood on the pad, from its position in the pad's frame:
 * `up` metres along the pad's vertical and `horizontal` metres off its axis. `null` without a vessel.
 * The first reading near the pad is taken as the resting height (the root part's origin is not on
 * the ground); a jump resets it (a new vessel); the lowest reading since is the rest.
 */
export function padHeight(state: PadTracker, up: number | null, horizontal: number): number | null {
	if (up === null) {
		state.rest = null;
		state.last = null;
		return null;
	}
	if (horizontal > PAD_NEAR) {
		state.rest = null;
		state.last = up;
		return PAD_FAR;
	}
	if (state.rest === null || (state.last !== null && Math.abs(up - state.last) > PAD_JUMP)) {
		state.rest = up;
	}
	state.rest = Math.min(state.rest, up);
	state.last = up;
	return up - state.rest;
}
