/**
 * Flight <-> on-rails transitions (simulation.md "Vessel modes"). On rails the centre of mass
 * follows kepler and attitude is frozen; in flight the vessel's parts are bodies in a flight frame.
 */
import type { EntityId } from '@orbital/core';
import { length, sub } from '@orbital/kepler';
import { PHYSICS_RANGE, RAILS_IDLE_TIME } from './constants.ts';
import { frameOfVessel, vesselOf, type SimCore } from './core.ts';
import { acquireFrame, enterFlight, leaveFlight, refreshPose } from './frames.ts';
import { computeRails, isStableOrbit, motionOf } from './orbit.ts';

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

/** Go through flight vessels and put the idle ones in stable orbits on rails. */
export function autoRails(core: SimCore): void {
	for (const frame of core.frames) {
		if (!frame.inUse) continue;
		for (const id of frame.vessels.slice()) {
			if (railsEligible(core, id)) toRails(core, id, 'idle in a stable orbit');
		}
	}
}
