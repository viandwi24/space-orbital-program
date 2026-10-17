/**
 * One interface for orbit prediction (plan 080, ADRs 0095 and 0173). Every consumer (sim rails,
 * SOI crossings and nodes, map path, rendezvous aids) calls a `TrajectoryProvider`; the
 * patched-conics provider wraps the existing functions unchanged, so no number moves. An n-body
 * provider (plan 125) will implement the same interface.
 */
import { closestApproach as conicApproach, type ClosestApproach } from './approach.ts';
import { bodyStateAt, type BodyFrame } from './body-state.ts';
import type { OrbitalElements } from './elements.ts';
import {
	patchedStateAt,
	predictWithManeuvers as predictNodes,
	type ManeuverInput,
	type ManeuverPath
} from './maneuver.ts';
import {
	predictPatchedConics,
	type PatchedBody,
	type PatchedOptions,
	type PatchedSegment,
	type PatchedStart
} from './patched.ts';
import type { StateVector } from './convert.ts';
import { propagate as propagateConic } from './propagate.ts';
import {
	bodyTrack as trackOfBody,
	closestApproachOnTrack as approachOnTrack,
	closestApproachPatched,
	conicTrack as trackOfConic,
	patchedTrack,
	trackOfSegments as segmentsTrack,
	type PatchedApproach,
	type PatchedTrack
} from './rendezvous.ts';
import { findCrossing } from './soi.ts';
import type { Vec3 } from './vec3.ts';

/** Gravity models a world can name (ADR 0095); only `patched` has a provider. */
export type TrajectoryModel = 'patched' | 'n-body';

export interface TrajectoryCapabilities {
	readonly model: TrajectoryModel;
	/** Maneuver nodes are applied along the path. */
	readonly maneuvers: boolean;
	/** Paths cross spheres of influence. */
	readonly soiTransitions: boolean;
}

export interface TrajectoryProvider {
	readonly capabilities: TrajectoryCapabilities;
	/** The bodies the provider predicts with. */
	readonly bodies: readonly PatchedBody[];
	/** Where a start state is at `t` (its sphere and state relative to that body). */
	stateAt(
		start: PatchedStart,
		t: number,
		options?: PatchedOptions
	): { body: string; r: Vec3; v: Vec3 } | undefined;
	/** A body's state at `t`, relative to its parent (default) or in the system frame. */
	bodyState(id: string, t: number, frame?: BodyFrame): StateVector;
	/** A two-body conic (rails) at time `t`. */
	propagate(elements: OrbitalElements, mu: number, t: number): StateVector;
	/** The path for `horizon` seconds through the spheres of influence. */
	predict(start: PatchedStart, horizon: number, options?: PatchedOptions): PatchedSegment[];
	/** The path with maneuver nodes applied. */
	predictWithManeuvers(
		start: PatchedStart,
		nodes: readonly ManeuverInput[],
		horizon: number,
		options?: PatchedOptions
	): ManeuverPath;
	track(start: PatchedStart, horizon: number, options?: PatchedOptions): PatchedTrack;
	trackOfSegments(segments: readonly PatchedSegment[], fallback?: number): PatchedTrack;
	/** A body's motion in the system frame. */
	bodyTrack(id: string): (t: number) => StateVector;
	/** A point on a conic about `body`, in the system frame. */
	conicTrack(body: string, r: Vec3, v: Vec3, t0: number): (t: number) => StateVector;
	/** Closest approach of a predicted path to `target` within `horizon`. */
	closestApproach(
		start: PatchedStart,
		target: (t: number) => StateVector,
		horizon: number,
		samples?: number,
		options?: PatchedOptions
	): PatchedApproach;
	closestApproachOnTrack(
		track: PatchedTrack,
		target: (t: number) => StateVector,
		samples?: number
	): PatchedApproach;
	/** Closest approach of two states in one frame between `t0` and `t1`. */
	conicClosestApproach(
		from: (t: number) => StateVector,
		to: (t: number) => StateVector,
		t0: number,
		t1: number,
		samples?: number
	): ClosestApproach;
	/** Root of a signed distance between `t0` and `t1` (an SOI crossing). */
	crossing(signed: (t: number) => number, t0: number, t1: number, tolerance?: number): number;
}

/** The patched-conics provider: today's functions, unchanged, bound to `bodies`. */
export function createPatchedProvider(bodies: readonly PatchedBody[]): TrajectoryProvider {
	return {
		capabilities: { model: 'patched', maneuvers: true, soiTransitions: true },
		bodies,
		stateAt: (start, t, options) => patchedStateAt(bodies, start, t, options),
		bodyState: (id, t, frame) => bodyStateAt(bodies, id, t, frame),
		propagate: (elements, mu, t) => propagateConic(elements, mu, t),
		predict: (start, horizon, options) => predictPatchedConics(bodies, start, horizon, options),
		predictWithManeuvers: (start, nodes, horizon, options) =>
			predictNodes(bodies, start, nodes, horizon, options),
		track: (start, horizon, options) => patchedTrack(bodies, start, horizon, options),
		trackOfSegments: (segments, fallback) => segmentsTrack(bodies, segments, fallback),
		bodyTrack: (id) => trackOfBody(bodies, id),
		conicTrack: (body, r, v, t0) => trackOfConic(bodies, body, r, v, t0),
		closestApproach: (start, target, horizon, samples, options) =>
			closestApproachPatched(bodies, start, target, horizon, samples, options),
		closestApproachOnTrack: (track, target, samples) => approachOnTrack(track, target, samples),
		conicClosestApproach: (from, to, t0, t1, samples) => conicApproach(from, to, t0, t1, samples),
		crossing: (signed, t0, t1, tolerance) => findCrossing(signed, t0, t1, tolerance)
	};
}

/** The provider for a world's gravity model; `n-body` has none yet (ADR 0095). */
export function createTrajectoryProvider(
	model: TrajectoryModel,
	bodies: readonly PatchedBody[]
): TrajectoryProvider {
	if (model === 'n-body') throw new RangeError('n-body worlds are not available yet');
	return createPatchedProvider(bodies);
}

const cache = new WeakMap<readonly PatchedBody[], TrajectoryProvider>();

/**
 * One patched provider per body list, for callers that hold a list (the web client's map path and
 * rendezvous aids); the same list gives the same provider.
 */
export function trajectoryFor(bodies: readonly PatchedBody[]): TrajectoryProvider {
	let provider = cache.get(bodies);
	if (!provider) {
		provider = createPatchedProvider(bodies);
		cache.set(bodies, provider);
	}
	return provider;
}
