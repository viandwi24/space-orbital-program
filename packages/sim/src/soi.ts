/**
 * Sphere-of-influence transitions (ADR 0051). Checked after every step for every vessel: on rails
 * the crossing time is bisected inside the step and the conic is replaced at that instant; in
 * flight the physics frame is re-based (origin and velocity translated, local poses untouched).
 */
import { intoChildFrame, intoParentFrame, length, sub, type StateVector } from '@orbital/kepler';
import type { EntityId } from '@orbital/core';
import { bodyById, stateInParent, type BodyRuntime } from './bodies.ts';
import { isControlled, vesselIds, vesselOf, type SimCore } from './core.ts';
import { refreshPose } from './frames.ts';
import { computeRails, railsMotion } from './orbit.ts';

/** Where a vessel at `r` (relative to `body`) at time `t` belongs, if not in `body`'s sphere. */
interface Target {
	/** The body whose sphere it moves to. */
	to: BodyRuntime;
	/** `exit`: from a child to its parent; `enter`: from a body into one of its children. */
	kind: 'exit' | 'enter';
	/** The child involved (the body left, or the body entered). */
	child: BodyRuntime;
}

/** Signed "how far past the boundary": positive once the vessel belongs to `target`'s side. */
function pastBoundary(target: Target, r: StateVector['r'], t: number): number {
	if (target.kind === 'exit') return length(r) - target.child.soi;
	return target.child.soi - length(sub(r, stateInParent(target.child, t).r));
}

/** The transition `r` (relative to `body`, time `t`) calls for, or undefined. */
function targetAt(body: BodyRuntime, r: StateVector['r'], t: number): Target | undefined {
	if (body.parent && length(r) > body.soi) return { kind: 'exit', to: body.parent, child: body };
	for (const child of body.children) {
		if (length(sub(r, stateInParent(child, t).r)) < child.soi) {
			return { kind: 'enter', to: child, child };
		}
	}
	return undefined;
}

/** State relative to the new body of a state relative to the old one, continuous in the system frame. */
function convert(target: Target, state: StateVector, t: number): StateVector {
	const childState = stateInParent(target.child, t);
	return target.kind === 'exit'
		? intoParentFrame(state, childState)
		: intoChildFrame(state, childState);
}

function announce(core: SimCore, vesselId: EntityId, from: string, to: string): void {
	core.events.emit('vessel:soi-changed', { vessel: vesselId, from, to });
	// A change the player must see: back to real time, and the time that was still to be played at
	// the old rate is dropped (ADR 0051).
	if (isControlled(core, vesselOf(core, vesselId))) {
		core.warp = 1;
		core.warpTarget = null;
		core.warpStopped = true;
	}
}

/** On-rails vessels: find the crossing in `[tPrev, t]`, convert there, restart the conic at that time. */
function transitionRails(core: SimCore, vesselId: EntityId, tPrev: number): void {
	const vessel = vesselOf(core, vesselId);
	const rails = vessel.rails;
	if (!rails || rails.kind === 'surface') return;
	const body = bodyById(core, vessel.soi);
	const t = core.t;
	const now = railsMotion(body, rails, t);
	const target = targetAt(body, now.r, t);
	if (!target) return;
	const past = (tau: number): number => pastBoundary(target, railsMotion(body, rails, tau).r, tau);
	// A vessel that already was on the far side when the step began (placed there, or its rails
	// were just made) switches now instead of at a time before it existed.
	const tc = past(tPrev) > 0 ? t : core.trajectory.crossing(past, tPrev, t);
	const state = convert(target, railsMotion(body, rails, tc), tc);
	const next = bodyById(core, target.to.def.id);
	vessel.soi = next.def.id;
	vessel.rails = computeRails(next.mu, state.r, state.v, tc, core.info.gravityModel);
	const here = railsMotion(next, vessel.rails, t);
	vessel.com = here.r;
	vessel.velocity = here.v;
	announce(core, vesselId, body.def.id, next.def.id);
}

/** One flight frame: decided by its focus vessel, moved as a whole. */
function transitionFrame(core: SimCore, frameIndex: number): void {
	const frame = core.frames[frameIndex]!;
	if (!frame.inUse || frame.vessels.length === 0) return;
	const focus =
		frame.vessels.find((id) => isControlled(core, vesselOf(core, id))) ?? frame.vessels[0]!;
	const body = bodyById(core, frame.soi);
	const target = targetAt(body, vesselOf(core, focus).com, core.t);
	if (!target) return;
	const state = convert(target, { r: frame.origin, v: frame.velocity }, core.t);
	frame.origin = state.r;
	frame.velocity = state.v;
	frame.soi = target.to.def.id;
	for (const id of frame.vessels) {
		const vessel = vesselOf(core, id);
		vessel.soi = frame.soi;
		refreshPose(core, frame, id);
	}
	for (const id of frame.vessels) announce(core, id, body.def.id, frame.soi);
}

/**
 * Switch every vessel that crossed a sphere boundary during the step that took the clock from
 * `tPrev` to `core.t`. Flight frames first (a frame is one decision), then rails vessels, each in
 * ascending order, so the outcome depends on state only.
 */
export function applySoiTransitions(core: SimCore, tPrev: number): void {
	if (core.bodies.size < 2) return;
	for (let i = 0; i < core.frames.length; i++) transitionFrame(core, i);
	for (const id of vesselIds(core)) {
		const v = vesselOf(core, id);
		// agency objects circle home far below its moons (plan 126, ADR 0190 point 3)
		if (v.mode === 'on-rails' && v.owner === undefined) transitionRails(core, id, tPrev);
	}
}
