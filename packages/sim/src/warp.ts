/**
 * Flexible time warp (plan 206, ADR 0202): requests granted up to the world's limit with a reason,
 * physics warp up to 10× with vessels in flight, rails warp above it with every vessel on rails,
 * vessels nobody watches in an atmosphere frozen instead of lost, and warp-to targets.
 */
import {
	PHYSICS_WARP_MAX,
	type CommandResult,
	type EntityId,
	type WarpTarget
} from '@orbital/core';
import { cross, length, meanMotion, sub, wrapTwoPi } from '@orbital/kepler';
import { bodyOfVessel, rotationAt, spinAt } from './bodies.ts';
import { MAX_WARP } from './constants.ts';
import { frameOfVessel, isControlled, vesselIds, vesselOf, type SimCore } from './core.ts';
import { acquireFrame, enterFlight, leaveFlight, refreshPose } from './frames.ts';
import { qConj, qMul, qNormalize, qRotate } from './math.ts';
import { toRails, toSurfaceRails } from './modes.ts';
import { elementsOf, motionOf, orientationOf } from './orbit.ts';
import { stopWarp } from './warp-stop.ts';
import { limitingVessels, warpLimit, clampText, thrusting } from './warp-limits.ts';

/** How long before an apsis or a sphere change a warp-to stops, s (ADR 0202 point 6). */
export const WARP_TO_MARGIN = 15;
/** A node: the burn is about to start; the HUD's own 30 s lead stays the player's. */
export const NODE_MARGIN = 30;

const refuse = (reason: string): CommandResult => ({ ok: false, reason });

/** `warp` (ADR 0202 point 4): grant as much as the world allows and say why when it is less. */
export function requestWarp(core: SimCore, factor: number, vessel?: EntityId): CommandResult {
	if (vessel !== undefined) core.warpFocus = vessel;
	const asked = Math.min(factor, MAX_WARP);
	const limit = warpLimit(core);
	const granted = Math.max(1, Math.min(asked, limit.max));
	if (granted > PHYSICS_WARP_MAX) packForRails(core);
	core.warp = granted;
	core.warpTarget = null;
	if (granted < factor) {
		const text = clampText(limit);
		core.events.emit('warp:clamped', { requested: factor, granted, reason: text });
		return { ok: true, granted, limit: text };
	}
	return { ok: true, granted };
}

/** `warp-to` (ADR 0202 point 6): to a time, or to a target the sim finds, at the allowed level. */
export function requestWarpTo(
	core: SimCore,
	command: { time?: number; factor: number; target?: WarpTarget; vessel?: EntityId }
): CommandResult {
	const time = command.time ?? targetTime(core, command.target!);
	if (typeof time === 'string') return refuse(time);
	if (time <= core.t) return refuse('warp-to needs a time that has not passed');
	const r = requestWarp(core, command.factor, command.vessel);
	if (!r.ok) return r;
	core.warpTarget = time;
	return r;
}

/** The time a warp-to target means, margin included, or why there is none. */
function targetTime(core: SimCore, target: WarpTarget): number | string {
	if (target.kind === 'alarm') {
		const alarm = core.alarms.list.find((a) => a.id === target.id);
		return alarm ? alarm.time : `no alarm ${target.id}`;
	}
	const time = eventTime(core, target.kind, target.vessel);
	if (typeof time === 'string') return time;
	return Math.max(core.t + 1, time - (target.kind === 'node' ? NODE_MARGIN : WARP_TO_MARGIN));
}

/**
 * When a vessel's next apsis, sphere change or node comes (no margin), or why there is none. Alarms
 * (plan 224) share it with warp-to.
 */
export function eventTime(
	core: SimCore,
	kind: 'apoapsis' | 'periapsis' | 'soi' | 'node',
	id: EntityId
): number | string {
	if (!core.world.hasEntity(id)) return `unknown vessel ${id}`;
	const vessel = vesselOf(core, id);
	if (kind === 'node') {
		const next = vessel.nodes.filter((n) => n.time > core.t).sort((a, b) => a.time - b.time)[0];
		return next ? next.time : 'the vessel has no maneuver node ahead';
	}
	const body = bodyOfVessel(core, vessel);
	const m = motionOf(core, vessel);
	if (kind === 'soi') {
		const path = core.trajectory.predict(
			{ body: vessel.soi, r: m.r, v: m.v, t: core.t },
			400 * 86_400,
			{
				maxSegments: 2,
				maxStep: 3_600
			}
		);
		const change = path.find((s) => s.end === 'transition');
		return change ? change.t1 : 'no change of sphere ahead';
	}
	const el = vessel.rails?.kind === 'elements' ? vessel.rails.elements : undefined;
	const elements = el ?? elementsNow(core, id);
	if (!elements) return 'the vessel follows no orbit';
	if (kind === 'apoapsis' && elements.e >= 1) return 'an escape path has no apoapsis';
	const n = meanMotion(elements, body.mu);
	const mNow = wrapTwoPi(elements.m0 + n * (core.t - elements.epoch));
	const goal = kind === 'periapsis' ? 2 * Math.PI : Math.PI;
	let dM = wrapTwoPi(goal - mNow);
	if (dM < 1e-6) dM += 2 * Math.PI;
	return core.t + dM / n;
}

function elementsNow(core: SimCore, id: EntityId) {
	const vessel = vesselOf(core, id);
	const m = motionOf(core, vessel);
	return elementsOf(bodyOfVessel(core, vessel).mu, m.r, m.v, core.t);
}

/**
 * Rails warp needs every vessel on rails (ADR 0202 points 3 and 7): grounded ones go on surface
 * rails, the rest on their conic, and one nobody watches in an atmosphere is frozen.
 */
export function packForRails(core: SimCore): void {
	const watched = new Set(limitingVessels(core));
	for (const id of vesselIds(core)) {
		const vessel = vesselOf(core, id);
		if (vessel.mode !== 'flight') continue;
		const body = bodyOfVessel(core, vessel);
		const alt = length(vessel.com) - body.def.radius;
		if (vessel.landed) toSurfaceRails(core, id, 'time warp');
		else if (body.def.atmosphere && alt < body.def.atmosphere.height && !watched.has(id)) {
			freeze(core, id, 'in the atmosphere during rails warp');
		} else toRails(core, id, 'time warp');
	}
}

/** Hold a vessel still in the body-fixed frame (ADR 0202 point 7): not integrated, not lost. */
export function freeze(core: SimCore, id: EntityId, reason: string): void {
	const vessel = vesselOf(core, id);
	const frame = frameOfVessel(core, id);
	if (frame) refreshPose(core, frame, id);
	const body = bodyOfVessel(core, vessel);
	const back = qConj(rotationAt(body, core.t));
	const ground = sub(vessel.velocity, cross(spinAt(body, core.t), vessel.com));
	vessel.rails = {
		kind: 'frozen',
		r: qRotate(back, vessel.com),
		v: qRotate(back, ground),
		q: qNormalize(qMul(back, vessel.orientation))
	};
	leaveFlight(core, id);
	vessel.mode = 'on-rails';
	vessel.idle = 0;
	vessel.rest = 0;
	core.events.emit('vessel:frozen', { vessel: id, reason });
	core.events.emit('vessel:mode-changed', { vessel: id, mode: 'on-rails', reason: 'frozen' });
}

/** Back into flight when warp is at physics levels again; one without a free frame waits. */
export function thawFrozen(core: SimCore): void {
	if (core.warp > PHYSICS_WARP_MAX) return;
	for (const id of vesselIds(core)) {
		const vessel = vesselOf(core, id);
		if (vessel.rails?.kind !== 'frozen') continue;
		const m = motionOf(core, vessel);
		const q = orientationOf(core, vessel);
		const frame = acquireFrame(core, vessel.soi, m.r, m.v);
		if (!frame) continue;
		vessel.com = m.r;
		vessel.velocity = m.v;
		vessel.orientation = q;
		enterFlight(core, id, frame);
		core.events.emit('vessel:thawed', { vessel: id });
		core.events.emit('vessel:mode-changed', { vessel: id, mode: 'flight', reason: 'thawed' });
	}
}

/**
 * Each step at rails warp: a watched vessel that started its engine or fell into the atmosphere
 * drops the warp to physics levels (ADR 0202 point 5); a vessel that came into flight is packed.
 */
export function holdWarpLimit(core: SimCore): void {
	if (core.warp <= PHYSICS_WARP_MAX) return;
	const limit = warpLimit(core);
	if (limit.max < core.warp) {
		const reason = limit.reason ?? 'the warp limit';
		if (limit.reason === 'in the atmosphere') {
			stopWarp(core, 'a vessel entered the atmosphere'); // to 1×: the player must see the entry
			return;
		}
		core.warp = Math.max(1, limit.max);
		if (core.warp <= PHYSICS_WARP_MAX) core.warpTarget = null;
		core.events.emit('warp:stopped', { reason });
		return;
	}
	if (vesselIds(core).some((id) => vesselOf(core, id).mode === 'flight')) packForRails(core);
}

/** A controlled vessel starts its engine during rails warp: down to the top physics level now. */
export function dropForThrust(core: SimCore, id: EntityId): void {
	if (core.warp <= PHYSICS_WARP_MAX) return;
	if (!isControlled(core, vesselOf(core, id))) return;
	core.warp = PHYSICS_WARP_MAX;
	core.warpTarget = null;
	core.events.emit('warp:stopped', { reason: 'engine running' });
}

export { thrusting };
