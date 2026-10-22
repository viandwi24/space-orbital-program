/**
 * Tethers (plan 313, ADR 0272 as amended): a winch's rope between two vessels. The rope is the
 * sim's, not a physics joint: before each step, when its anchors are farther apart than its length
 * and still separating, equal and opposite pulls at the anchors stop the separation over the step
 * (plus a small correction for the overshoot). That pull is the tension; above the rope's strength
 * it snaps. A winch arms with its `connect` and ties on to the nearest socket of another vessel in
 * reach; the pair is `PartState.tether` on the winch part, saved with the world.
 */
import type { EntityId, Vec3 } from '@orbital/core';
import { add, dot, length, scale, sub } from '@orbital/kepler';
import {
	moduleDefOf,
	moduleState,
	partOf,
	totalMass,
	vesselIds,
	vesselOf,
	type SimCore
} from './core.ts';
import { motionOf } from './orbit.ts';
import { partTransform, partVelocity } from './frames.ts';
import { qRotate } from './math.ts';
import { wake, wakeBlocker } from './modes.ts';
import type { FlightFrame } from './state.ts';

/** Fraction of the overshoot taken out per step (Baumgarte), and the most it may add, m/s. */
const CORRECTION = 0.2;
const MAX_CORRECTION = 3;
/** The tension is smoothed over this long before it is held against the rope's strength, s. */
const TENSION_TIME = 0.1;
/** A rope stretched past this many times its reach (a jump on rails, a teleport) snaps. */
const OVERSTRETCH = 1.5;

interface Spec {
	module: string;
	anchor: Vec3;
	maxLength: number;
	length: number;
	strength: number;
	connect: boolean;
}

/** The writable part of a winch module's state (ADR 0272 amendment). */
interface WinchState {
	connected?: boolean;
	length?: number;
	tension?: number;
	snapped?: boolean;
}

/** The winch module of a part and its rope now, or null. */
function specOf(core: SimCore, part: EntityId): Spec | null {
	for (const m of partOf(core, part).modules) {
		const hook = moduleDefOf(core, m.id).tether;
		if (!hook) continue;
		const s = hook(m.config, moduleState(core, part, m.id));
		if (s) return { module: m.id, ...s };
	}
	return null;
}

/** Where a socket part takes a rope (part frame), or undefined for a part that is not one. */
function socketOf(core: SimCore, part: EntityId): Vec3 | undefined {
	for (const m of partOf(core, part).modules) {
		const hook = moduleDefOf(core, m.id).socket;
		if (hook) return hook(m.config).anchor;
	}
	return undefined;
}

function stateOf(core: SimCore, part: EntityId, module: string): WinchState {
	const s = moduleState(core, part, module);
	return s && typeof s === 'object' ? (s as WinchState) : {};
}

/** A point of a part in the frame (its anchor), from the part's pose. */
const anchorAt = (core: SimCore, frame: FlightFrame, part: EntityId, anchor: Vec3): Vec3 => {
	const t = partTransform(core, frame, part);
	return add(t.position, qRotate(t.rotation, anchor));
};

/** Every winch part of the frame's vessels. */
function winches(core: SimCore, frame: FlightFrame): EntityId[] {
	const out: EntityId[] = [];
	for (const v of frame.vessels)
		for (const p of vesselOf(core, v).parts)
			if (partOf(core, p).modules.some((m) => moduleDefOf(core, m.id).tether)) out.push(p);
	return out;
}

function release(core: SimCore, part: EntityId, module: string): void {
	delete partOf(core, part).tether;
	const s = stateOf(core, part, module);
	s.connected = false;
	s.tension = 0;
	core.events.emit('tether:released', { vessel: partOf(core, part).vessel, part });
}

/** The nearest socket of another vessel of the frame within `reach` of `at`; the target's first. */
function nearestSocket(
	core: SimCore,
	frame: FlightFrame,
	own: EntityId,
	at: Vec3,
	reach: number
): EntityId | undefined {
	const target = vesselOf(core, own).target;
	const preferred = target?.kind === 'vessel' ? target.id : undefined;
	let best: { part: EntityId; d: number; pref: boolean } | undefined;
	for (const v of frame.vessels) {
		if (v === own) continue;
		for (const p of vesselOf(core, v).parts) {
			const anchor = socketOf(core, p);
			if (!anchor) continue;
			const d = length(sub(anchorAt(core, frame, p, anchor), at));
			if (d > reach) continue;
			const pref = v === preferred;
			if (!best || (pref && !best.pref) || (pref === best.pref && d < best.d))
				best = { part: p, d, pref };
		}
	}
	return best?.part;
}

/** Vessels this much farther than a winch's reach are not woken for it, m. */
const WAKE_MARGIN = 50;

/**
 * Before the frames are prepared (where commands run): an armed or tied winch in flight puts the
 * vessels with a socket within its reach (plus a margin) in flight, and its tied peer always, so
 * the rope has both bodies to pull (plan 313).
 */
export function wakeTetherNeighbours(core: SimCore): void {
	for (const frame of core.frames) {
		if (!frame.inUse) continue;
		for (const part of winches(core, frame)) {
			const spec = specOf(core, part);
			if (!spec) continue;
			const p = partOf(core, part);
			const peer = p.tether?.peer;
			if (!spec.connect && peer === undefined) continue;
			const here = motionOf(core, vesselOf(core, p.vessel)).r;
			for (const id of vesselIds(core)) {
				if (id === p.vessel) continue;
				const v = vesselOf(core, id);
				if (v.mode === 'flight' || v.soi !== frame.soi) continue;
				if (v.rails?.kind === 'frozen') continue;
				const tied =
					peer !== undefined && core.world.hasEntity(peer) && partOf(core, peer).vessel === id;
				if (!tied) {
					if (!spec.connect || !v.parts.some((q) => socketOf(core, q))) continue;
					if (length(sub(motionOf(core, v).r, here)) > spec.maxLength + WAKE_MARGIN) continue;
				}
				if (wakeBlocker(core, id) === undefined) wake(core, id, 'tether');
			}
		}
	}
}

/**
 * Before the physics step: ties armed winches on, lets go of disarmed ones, and pulls every
 * taut rope. Runs where the docking magnets pull, with the frame prepared.
 */
export function pullTethers(core: SimCore, frame: FlightFrame, dt: number): void {
	if (dt <= 0) return;
	for (const part of winches(core, frame)) {
		const spec = specOf(core, part);
		const p = partOf(core, part);
		if (!spec) {
			if (p.tether) delete p.tether;
			continue;
		}
		const state = stateOf(core, part, spec.module);
		const peer = p.tether?.peer;
		if (peer !== undefined && (!spec.connect || !core.world.hasEntity(peer))) {
			release(core, part, spec.module);
			continue;
		}
		const at = anchorAt(core, frame, part, spec.anchor);
		if (peer === undefined) {
			if (!spec.connect) continue;
			const socket = nearestSocket(core, frame, p.vessel, at, spec.maxLength);
			if (socket === undefined) continue;
			const d = length(sub(anchorAt(core, frame, socket, socketOf(core, socket)!), at));
			p.tether = { peer: socket };
			// the rope ties on at the distance it finds: no jerk on either vessel
			state.connected = true;
			state.length = Math.max(0.1, d);
			state.tension = 0;
			state.snapped = false;
			core.events.emit('tether:attached', {
				vessel: p.vessel,
				part,
				peerVessel: partOf(core, socket).vessel,
				peer: socket
			});
			continue;
		}
		const other = partOf(core, peer);
		core.active.add(p.vessel);
		core.active.add(other.vessel);
		if (!frame.bodies.has(other.vessel)) {
			// the far vessel went on rails or to another frame: bring it back into flight
			const ov = vesselOf(core, other.vessel);
			if (ov.mode !== 'flight' && wakeBlocker(core, other.vessel) === undefined)
				wake(core, other.vessel, 'tether');
			continue;
		}
		const to = anchorAt(core, frame, peer, socketOf(core, peer) ?? { x: 0, y: 0, z: 0 });
		const span = sub(to, at);
		const dist = length(span);
		const ropeLength = Math.min(spec.length, spec.maxLength);
		if (dist > spec.maxLength * OVERSTRETCH) {
			snap(core, part, spec.module, 0);
			continue;
		}
		if (dist <= ropeLength || dist < 1e-6) {
			state.tension = 0;
			continue;
		}
		const n = scale(span, 1 / dist);
		// separation speed of the far anchor from the near one along the rope
		const separating = dot(
			sub(partVelocity(core, frame, peer), partVelocity(core, frame, part)),
			n
		);
		const correction = Math.min(MAX_CORRECTION, (CORRECTION * (dist - ropeLength)) / dt);
		const want = separating + correction;
		if (want <= 0) {
			state.tension = 0;
			continue;
		}
		const ma = totalMass(core, vesselOf(core, p.vessel).parts);
		const mb = totalMass(core, vesselOf(core, other.vessel).parts);
		const impulse = want / (1 / ma + 1 / mb);
		const tension = impulse / dt;
		// the pull it holds, smoothed over about a tenth of a second: a one-step jolt (a contact,
		// the drum taking up slack) does not snap it, a load past its strength does
		const held =
			(state.tension ?? 0) + (tension - (state.tension ?? 0)) * Math.min(1, dt / TENSION_TIME);
		if (held > spec.strength) {
			snap(core, part, spec.module, held);
			continue;
		}
		state.tension = held;
		const a = frame.bodies.get(p.vessel)!;
		const b = frame.bodies.get(other.vessel)!;
		frame.backend.applyForce(a.handle, scale(n, tension), at);
		frame.backend.applyForce(b.handle, scale(n, -tension), to);
	}
}

function snap(core: SimCore, part: EntityId, module: string, tension: number): void {
	delete partOf(core, part).tether;
	const s = stateOf(core, part, module);
	s.connected = false;
	s.snapped = true;
	s.tension = 0;
	core.events.emit('tether:snapped', { vessel: partOf(core, part).vessel, part, tension });
}

/** The rope of a winch part for the snapshot (plan 313), or nothing. */
export function tetherSnapshot(
	core: SimCore,
	part: EntityId
): {
	tether?: {
		peer: EntityId;
		peerVessel: EntityId;
		anchor: Vec3;
		peerAnchor: Vec3;
		length: number;
		tension: number;
	};
} {
	const t = partOf(core, part).tether;
	if (!t || !core.world.hasEntity(t.peer)) return {};
	const spec = specOf(core, part);
	if (!spec) return {};
	const state = stateOf(core, part, spec.module);
	return {
		tether: {
			peer: t.peer,
			peerVessel: partOf(core, t.peer).vessel,
			anchor: spec.anchor,
			peerAnchor: socketOf(core, t.peer) ?? { x: 0, y: 0, z: 0 },
			length: spec.length,
			tension: state.tension ?? 0
		}
	};
}
