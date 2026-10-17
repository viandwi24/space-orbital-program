/**
 * Stages that stay where they came to rest (plan 040, ADR 0077). The sim removes an uncontrolled
 * vessel that has lain still on the ground for 10 s (ADR 0021, `debris at rest on the surface`).
 * The renderer cannot know why a vessel vanished, so it keeps the models of one that disappears
 * after lying still on the ground, was not the active vessel and was not hot, and shows them
 * frozen to the ground for `REMNANT_LIFETIME` seconds of simulated time. Pure rules, no Three.
 */
import type { Vec3 } from '@orbital/core';

/** Ground speed under which a vessel counts as lying still, m/s (the sim removes below 0.1). */
export const REST_SPEED = 0.3;
/** It must have lain still this long before it vanishes to count as removed at rest, s (the sim waits 10). */
export const REMNANT_REST_TIME = 9;
/** Root within this height of the ground counts as on it, m. */
export const REST_HEIGHT = 30;
/** A vessel above this temperature burnt, it did not come to rest, K. */
export const REMNANT_MAX_TEMPERATURE = 700;
/** Seconds of simulated time a remnant stays. */
export const REMNANT_LIFETIME = 900;
/** Remnants kept, and parts in one. */
export const MAX_REMNANTS = 3;
export const MAX_REMNANT_PARTS = 24;

export interface RestState {
	/** Simulated time when the vessel started lying still. */
	since: number;
	/** The last place it was seen, body-fixed (inertial position rotated back), m. */
	position: Vec3;
	soi: string;
	parts: number;
}

/** Advances a vessel's resting clock: it restarts whenever the vessel moves, floats or is hot. */
export function stepRest(
	prev: RestState | undefined,
	t: number,
	input: {
		groundSpeed: number;
		height: number;
		maxTemperature: number;
		position: Vec3;
		soi: string;
		parts: number;
	}
): RestState | undefined {
	const still =
		input.groundSpeed < REST_SPEED &&
		input.height < REST_HEIGHT &&
		input.maxTemperature <= REMNANT_MAX_TEMPERATURE &&
		input.parts <= MAX_REMNANT_PARTS;
	if (!still) return undefined;
	return {
		since: prev && prev.soi === input.soi ? prev.since : t,
		position: input.position,
		soi: input.soi,
		parts: input.parts
	};
}

/** Whether a vessel that vanished at time `t` stays as a remnant. */
export function staysAsRemnant(
	rest: RestState | undefined,
	t: number,
	wasActive: boolean
): boolean {
	return rest !== undefined && !wasActive && t - rest.since >= REMNANT_REST_TIME;
}
