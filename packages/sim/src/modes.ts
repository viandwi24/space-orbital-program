/**
 * Flight <-> on-rails transitions (simulation.md "Vessel modes"). On rails the centre of mass
 * follows kepler and attitude is frozen; in flight the vessel is one compound rigid body in a flight frame.
 */
import type { EntityId } from '@orbital/core';
import { enforceDebrisCap } from './fleet.ts';
import { PHYSICS_WARP_MAX } from '@orbital/core';
import { cross, dot, length, sub } from '@orbital/kepler';
import {
	DEBRIS_REST_SPEED,
	DEBRIS_REST_TIME,
	GROUND_TILE_EXIT,
	PHYSICS_RANGE,
	RAILS_IDLE_TIME,
	SURFACE_REST_SPEED,
	SURFACE_REST_SPIN,
	SURFACE_REST_TIME
} from './constants.ts';
import { bodyOfVessel, spinAt } from './bodies.ts';
import { frameOfVessel, isControlled, isKept, vesselIds, vesselOf, type SimCore } from './core.ts';
import { acquireFrame, bodyMotion, enterFlight, leaveFlight, refreshPose } from './frames.ts';
import { computeRails, isStableOrbit, motionOf, orientationOf, surfaceRails } from './orbit.ts';
import type { FlightFrame } from './state.ts';
import { terrainBelow } from './terrain.ts';
import { hasBackground, runBackground } from './tick.ts';
import { destroyVessel } from './vessel.ts';

/** Put a flight vessel on rails at its current centre-of-mass state. */
export function toRails(core: SimCore, vesselId: EntityId, reason: string): void {
	const vessel = vesselOf(core, vesselId);
	const frame = frameOfVessel(core, vesselId);
	if (frame) refreshPose(core, frame, vesselId);
	vessel.rails = computeRails(
		bodyOfVessel(core, vessel).mu,
		vessel.com,
		vessel.velocity,
		core.t,
		core.info.gravityModel
	);
	leaveFlight(core, vesselId);
	vessel.mode = 'on-rails';
	if (hasBackground(core, vesselId)) vessel.backgroundAt = core.t;
	vessel.idle = 0;
	vessel.rest = 0;
	core.events.emit('vessel:mode-changed', { vessel: vesselId, mode: 'on-rails', reason });
}

/**
 * Put a landed flight vessel on surface rails (ADR 0024): its centre of mass and orientation are
 * stored in the body-fixed frame, so it keeps its place and attitude on the rotating ground.
 */
export function toSurfaceRails(core: SimCore, vesselId: EntityId, reason: string): void {
	const vessel = vesselOf(core, vesselId);
	const frame = frameOfVessel(core, vesselId);
	if (frame) refreshPose(core, frame, vesselId);
	vessel.rails = surfaceRails(core, bodyOfVessel(core, vessel), vessel.com, vessel.orientation);
	leaveFlight(core, vesselId);
	vessel.mode = 'on-rails';
	if (hasBackground(core, vesselId)) vessel.backgroundAt = core.t;
	vessel.idle = 0;
	vessel.rest = 0;
	core.events.emit('vessel:mode-changed', { vessel: vesselId, mode: 'on-rails', reason });
}

/** Why the vessel cannot go in flight right now, or undefined if it can. */
export function wakeBlocker(core: SimCore, vesselId: EntityId): string | undefined {
	const vessel = vesselOf(core, vesselId);
	if (vessel.mode === 'flight') return undefined;
	if (core.warp > PHYSICS_WARP_MAX)
		return `time warp is ${core.warp}x; physics runs up to ${PHYSICS_WARP_MAX}x`;
	const motion = motionOf(core, vessel);
	const joins = core.frames.some(
		(f) =>
			f.inUse &&
			f.soi === vessel.soi &&
			f.vessels.length > 0 &&
			length(sub(motion.r, f.origin)) < PHYSICS_RANGE
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
	const frame = acquireFrame(core, vessel.soi, motion.r, motion.v);
	if (!frame) throw new Error(`cannot put vessel ${vesselId} in flight: no free physics frame`);
	runBackground(core, vesselId); // closed forms catch up to now before the vessel is stepped (ADR 0171)
	delete vessel.backgroundAt;
	const surface = vessel.rails?.kind === 'surface';
	vessel.com = motion.r;
	vessel.velocity = motion.v;
	vessel.orientation = orientationOf(core, vessel);
	// From the ground, at rest on it: the body turns with the planet (ADR 0024).
	enterFlight(
		core,
		vesselId,
		frame,
		surface ? spinAt(bodyOfVessel(core, vessel), core.t) : undefined
	);
	vessel.rest = 0;
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
		isStableOrbit(bodyOfVessel(core, vessel), vessel.com, vessel.velocity)
	);
}

/**
 * Altitude of the centre of mass above the reference sphere, the height of the ground under it
 * (0 without terrain, ADR 0043) and its radial speed (ADR 0021).
 */
function altitudeAndClimb(
	core: SimCore,
	id: EntityId
): { alt: number; ground: number; climb: number } {
	const vessel = vesselOf(core, id);
	const body = bodyOfVessel(core, vessel);
	const motion = motionOf(core, vessel);
	const r = length(motion.r);
	return {
		alt: r - body.def.radius,
		ground: terrainBelow(core, body, motion.r) ?? 0,
		climb: dot(motion.r, motion.v) / r
	};
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
	const body = bodyOfVessel(core, vessel);
	if (isControlled(core, vessel) || isStableOrbit(body, vessel.com, vessel.velocity)) return false;
	const { alt, ground, climb } = altitudeAndClimb(core, vesselId);
	return (
		alt - ground > GROUND_TILE_EXIT && (climb > 0 || alt >= (body.def.atmosphere?.height ?? 0))
	);
}

/**
 * Count how long a controlled vessel has been landed, force-free and at rest on the rotating
 * ground (ADR 0024). "At rest" is relative to the ground under the centre of mass, in both
 * velocity and spin; any force, any motion, or losing contact restarts the count.
 */
export function trackRest(core: SimCore, frame: FlightFrame, vesselId: EntityId, dt: number): void {
	const vessel = vesselOf(core, vesselId);
	const body = frame.bodies.get(vesselId);
	const omega = spinAt(bodyOfVessel(core, vessel), core.t);
	const still =
		body !== undefined &&
		vessel.landed &&
		vessel.idle > 0 &&
		// a kept vessel (a flag) rests on surface rails too, so it does not hold a physics frame
		(isControlled(core, vessel) || isKept(core, vessel)) &&
		length(sub(vessel.velocity, cross(omega, vessel.com))) < SURFACE_REST_SPEED &&
		length(sub(bodyMotion(frame, body).angular, omega)) < SURFACE_REST_SPIN;
	vessel.rest = still ? vessel.rest + dt : 0;
}

/** Whether a flight vessel has rested on the ground long enough for surface rails. */
export function surfaceEligible(core: SimCore, vesselId: EntityId): boolean {
	const vessel = vesselOf(core, vesselId);
	return vessel.mode === 'flight' && vessel.landed && vessel.rest >= SURFACE_REST_TIME;
}

/**
 * Go through flight vessels and put on rails the idle ones in stable orbits, ballistic debris, and
 * controlled vessels at rest on the ground.
 */
export function autoRails(core: SimCore): void {
	for (const frame of core.frames) {
		if (!frame.inUse) continue;
		for (const id of frame.vessels.slice()) {
			if (railsEligible(core, id)) toRails(core, id, 'idle in a stable orbit');
			else if (ballisticEligible(core, id)) toRails(core, id, 'ballistic debris');
			else if (surfaceEligible(core, id)) toSurfaceRails(core, id, 'at rest on the ground');
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
	for (const id of vesselIds(core)) {
		const vessel = vesselOf(core, id);
		// an agency's object is never debris (plan 126); skip the module walk of `isControlled`
		if (vessel.owner !== undefined || isControlled(core, vessel) || isKept(core, vessel)) continue;
		const body = bodyOfVessel(core, vessel);
		const top = body.def.atmosphere?.height ?? 0;
		const omega = spinAt(body, core.t);
		if (vessel.rails?.kind === 'frozen') continue; // held still during rails warp, not lost (ADR 0202)
		if (vessel.rails?.kind === 'surface') continue; // debris at rest stays (plan 223)
		if (vessel.mode === 'on-rails') {
			const motion = motionOf(core, vessel);
			if (isStableOrbit(body, motion.r, motion.v)) continue;
			const { alt, ground, climb } = altitudeAndClimb(core, id);
			if (alt <= ground || (alt < top && climb < 0)) {
				destroyVessel(core, id, 'debris re-entered the atmosphere');
			}
		} else if (vessel.landed && vessel.idle >= DEBRIS_REST_TIME) {
			const ground = cross(omega, vessel.com);
			// persistent debris (plan 223, amending ADR 0021): it stays where it came to rest
			if (length(sub(vessel.velocity, ground)) < DEBRIS_REST_SPEED) {
				toSurfaceRails(core, id, 'debris at rest on the surface');
			}
		}
	}
	enforceDebrisCap(core);
}
