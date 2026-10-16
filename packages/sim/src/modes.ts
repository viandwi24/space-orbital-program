/**
 * Flight <-> on-rails transitions (simulation.md "Vessel modes"). On rails the centre of mass
 * follows kepler and attitude is frozen; in flight the vessel is one compound rigid body in a flight frame.
 */
import type { EntityId } from '@orbital/core';
import { cross, dot, length, sub } from '@orbital/kepler';
import {
	DEBRIS_REST_SPEED,
	DEBRIS_REST_TIME,
	GROUND_TILE_EXIT,
	PHYSICS_RANGE,
	RAILS_IDLE_TIME
} from './constants.ts';
import { frameOfVessel, isControlled, vesselIds, vesselOf, type SimCore } from './core.ts';
import { acquireFrame, enterFlight, leaveFlight, refreshPose } from './frames.ts';
import { computeRails, isStableOrbit, motionOf } from './orbit.ts';
import { destroyVessel } from './vessel.ts';

/** Put a flight vessel on rails at its current centre-of-mass state. */
export function toRails(core: SimCore, vesselId: EntityId, reason: string): void {
	const vessel = vesselOf(core, vesselId);
	const frame = frameOfVessel(core, vesselId);
	if (frame) refreshPose(core, frame, vesselId);
	vessel.rails = computeRails(core.body.mu, vessel.com, vessel.velocity, core.t);
	leaveFlight(core, vesselId);
	vessel.mode = 'on-rails';
	vessel.idle = 0;
	core.events.emit('vessel:mode-changed', { vessel: vesselId, mode: 'on-rails', reason });
}

/** Why the vessel cannot go in flight right now, or undefined if it can. */
export function wakeBlocker(core: SimCore, vesselId: EntityId): string | undefined {
	const vessel = vesselOf(core, vesselId);
	if (vessel.mode === 'flight') return undefined;
	if (core.warp > 1) return `time warp is ${core.warp}x; set warp to 1 first`;
	const motion = motionOf(core, vessel);
	const joins = core.frames.some(
		(f) => f.inUse && f.vessels.length > 0 && length(sub(motion.r, f.origin)) < PHYSICS_RANGE
	);
	const free = joins || core.frames.some((f) => !f.inUse);
	return free ? undefined : 'no free physics frame (another vessel is in flight far away)';
}

/** Put an on-rails vessel in flight (creates its bodies). Throws if `wakeBlocker` is set. */
export function wake(core: SimCore, vesselId: EntityId, reason: string): void {
	const vessel = vesselOf(core, vesselId);
	if (vessel.mode === 'flight') return;
	const blocker = wakeBlocker(core, vesselId);
	if (blocker) throw new Error(`cannot put vessel ${vesselId} in flight: ${blocker}`);
	const motion = motionOf(core, vessel);
	const frame = acquireFrame(core, motion.r, motion.v);
	if (!frame) throw new Error(`cannot put vessel ${vesselId} in flight: no free physics frame`);
	vessel.com = motion.r;
	vessel.velocity = motion.v;
	enterFlight(core, vesselId, frame);
	core.events.emit('vessel:mode-changed', { vessel: vesselId, mode: 'flight', reason });
}

/** Whether a flight vessel may go on rails: idle long enough and its orbit clears the atmosphere. */
export function railsEligible(
	core: SimCore,
	vesselId: EntityId,
	minIdle = RAILS_IDLE_TIME
): boolean {
	const vessel = vesselOf(core, vesselId);
	return (
		vessel.mode === 'flight' &&
		vessel.idle >= minIdle &&
		!vessel.landed &&
		isStableOrbit(core, vessel.com, vessel.velocity)
	);
}

/** Altitude of the centre of mass above the reference sphere and its radial speed (ADR 0021). */
function altitudeAndClimb(core: SimCore, id: EntityId): { alt: number; climb: number } {
	const motion = motionOf(core, vesselOf(core, id));
	const r = length(motion.r);
	return { alt: r - core.body.def.radius, climb: dot(motion.r, motion.v) / r };
}

/**
 * Ballistic debris (ADR 0021): a flight vessel with no control source, idle long enough, off the
 * ground tile band, not in a stable orbit, and either climbing or above the atmosphere. It can
 * only fall back, so it is propagated analytically instead of holding up time warp. A descending
 * vessel below the atmosphere top stays in flight and takes ground impact damage (plan 012).
 */
export function ballisticEligible(
	core: SimCore,
	vesselId: EntityId,
	minIdle = RAILS_IDLE_TIME
): boolean {
	const vessel = vesselOf(core, vesselId);
	if (vessel.mode !== 'flight' || vessel.idle < minIdle || vessel.landed) return false;
	if (isControlled(core, vessel) || isStableOrbit(core, vessel.com, vessel.velocity)) return false;
	const { alt, climb } = altitudeAndClimb(core, vesselId);
	return alt > GROUND_TILE_EXIT && (climb > 0 || alt >= (core.body.def.atmosphere?.height ?? 0));
}

/** Go through flight vessels and put the idle ones in stable orbits, and ballistic debris, on rails. */
export function autoRails(core: SimCore): void {
	for (const frame of core.frames) {
		if (!frame.inUse) continue;
		for (const id of frame.vessels.slice()) {
			if (railsEligible(core, id)) toRails(core, id, 'idle in a stable orbit');
			else if (ballisticEligible(core, id)) toRails(core, id, 'ballistic debris');
		}
	}
}

/**
 * Remove debris that ended (ADR 0021): on-rails debris on a non-stable path that descends into
 * the atmosphere (drag would take it; rails has none) or reaches the surface, and uncontrolled
 * vessels that have lain still on the ground for `DEBRIS_REST_TIME`. Controlled vessels are never
 * removed. Decided from state and `t` only, so replays agree.
 */
export function reapDebris(core: SimCore): void {
	const top = core.body.def.atmosphere?.height ?? 0;
	const omega = { x: 0, y: core.body.omega, z: 0 };
	for (const id of vesselIds(core)) {
		const vessel = vesselOf(core, id);
		if (isControlled(core, vessel)) continue;
		if (vessel.mode === 'on-rails') {
			const motion = motionOf(core, vessel);
			if (isStableOrbit(core, motion.r, motion.v)) continue;
			const { alt, climb } = altitudeAndClimb(core, id);
			if (alt <= 0 || (alt < top && climb < 0)) {
				destroyVessel(core, id, 'debris re-entered the atmosphere');
			}
		} else if (vessel.landed && vessel.idle >= DEBRIS_REST_TIME) {
			const ground = cross(omega, vessel.com);
			if (length(sub(vessel.velocity, ground)) < DEBRIS_REST_SPEED) {
				destroyVessel(core, id, 'debris at rest on the surface');
			}
		}
	}
}
