/**
 * Targets (plan 035, ADR 0064): a vessel may aim at another body or vessel. The target is plain
 * data on the vessel (`VesselState.target`); this file resolves it to the relative state the
 * snapshot reports and the SAS points at, finds the closest approach through the trajectory provider (`conicClosestApproach`, plan 080),
 * applies the command and drops a target that no longer exists. Every result is a function of sim
 * state, so a resumed run resolves exactly as the original would.
 */
import {
	bodyId,
	type CommandResult,
	type EntityId,
	type TargetApproach,
	type TargetRef,
	type TargetSnapshot,
	type Vec3
} from '@orbital/core';
import {
	add,
	length,
	normalize,
	period,
	periapsis,
	sub,
	type OrbitalElements,
	type StateVector
} from '@orbital/kepler';
import { bodyOfVessel, elementsAt, stateInParent, type BodyRuntime } from './bodies.ts';
import { moduleDefOf, partOf, vesselIds, vesselOf, type SimCore } from './core.ts';
import { elementsOf, motionOf } from './orbit.ts';
import { VESSEL, type TargetState, type VesselState } from './state.ts';

/** Longest window the closest-approach search looks ahead, s (ten days, like node prediction). */
export const MAX_APPROACH_WINDOW = 10 * 86_400;
/** Samples of the closest-approach scan. */
const APPROACH_SAMPLES = 240;
/** Closer than this the direction to the target is not worth pointing at, m. */
export const MIN_TARGET_DISTANCE = 0.5;

const refuse = (reason: string): CommandResult => ({ ok: false, reason });

/** State of a body in the system frame (the root's centre) at time `t`. */
function bodyState(body: BodyRuntime, t: number): StateVector {
	let r: Vec3 = { x: 0, y: 0, z: 0 };
	let v: Vec3 = { x: 0, y: 0, z: 0 };
	for (let b: BodyRuntime | undefined = body; b?.parent; b = b.parent) {
		const s = stateInParent(b, t);
		r = add(r, s.r);
		v = add(v, s.v);
	}
	return { r, v };
}

/** Centre-of-mass state of a vessel in the system frame now. */
function vesselState(core: SimCore, vessel: VesselState): StateVector {
	const body = bodyState(bodyOfVessel(core, vessel), core.t);
	const m = motionOf(core, vessel);
	return { r: add(body.r, m.r), v: add(body.v, m.v) };
}

/** The vessel a ref names, or undefined when it is gone. */
function targetVessel(core: SimCore, id: EntityId): VesselState | undefined {
	return core.world.hasEntity(id) ? core.world.get(id, VESSEL) : undefined;
}

/** Elements of a vessel's centre of mass about its sphere-of-influence body; undefined on the ground or off a conic. */
function vesselElements(core: SimCore, vessel: VesselState): OrbitalElements | undefined {
	const rails = vessel.rails;
	if (rails?.kind === 'surface' || rails?.kind === 'frozen') return undefined;
	if (rails?.kind === 'elements') return rails.elements;
	const body = bodyOfVessel(core, vessel);
	const m = motionOf(core, vessel);
	return elementsOf(body.mu, m.r, m.v, core.t);
}

/** Closest approach of the vessel's orbit to the target's, or null when they do not share a primary. */
function approachOf(
	core: SimCore,
	vessel: VesselState,
	ref: TargetState,
	other: VesselState | undefined
): TargetApproach | null {
	const soi = bodyOfVessel(core, vessel);
	const own = vesselElements(core, vessel);
	// An orbit that dips into the ground (a vessel climbing from the pad) is not a path worth a search.
	if (!own || periapsis(own) <= soi.def.radius) return null;
	let theirs: OrbitalElements | undefined;
	if (ref.kind === 'body') {
		const body = core.bodies.get(ref.id);
		// A moon or planet that orbits the vessel's own primary: the pre-encounter conic (the map shows the encounter itself).
		if (body?.parent === soi) theirs = elementsAt(body, core.t);
	} else if (other && other.soi === vessel.soi) {
		theirs = vesselElements(core, other);
	}
	if (!theirs) return null;
	const mu = soi.mu;
	const span = Math.min(period(own, mu), MAX_APPROACH_WINDOW);
	const found = core.trajectory.conicClosestApproach(
		(t) => core.trajectory.propagate(own, mu, t),
		(t) => core.trajectory.propagate(theirs, mu, t),
		core.t,
		core.t + span,
		APPROACH_SAMPLES
	);
	return { time: found.t, distance: found.distance, relativeSpeed: found.relativeSpeed };
}

/** The vessel's target resolved now, or undefined when it has none (or it is gone). */
export function resolveTarget(core: SimCore, vessel: VesselState): TargetSnapshot | undefined {
	const ref = vessel.target;
	if (!ref) return undefined;
	let name: string;
	let state: StateVector;
	let other: VesselState | undefined;
	if (ref.kind === 'body') {
		const body = core.bodies.get(ref.id);
		if (!body) return undefined;
		name = body.def.id;
		state = bodyState(body, core.t);
	} else {
		other = targetVessel(core, ref.id);
		if (!other) return undefined;
		name = other.name;
		state = vesselState(core, other);
	}
	const own = vesselState(core, vessel);
	const position = sub(state.r, own.r);
	const velocity = sub(state.v, own.v);
	return {
		...(ref.kind === 'body'
			? { kind: 'body' as const, id: bodyId(ref.id) }
			: { kind: 'vessel' as const, id: ref.id }),
		name,
		position,
		velocity,
		distance: length(position),
		relativeSpeed: length(velocity),
		approach: approachOf(core, vessel, ref, other)
	};
}

/** Unit direction to the target in the shared inertial axes, or undefined (no target, or on top of it). */
export function targetDirection(core: SimCore, vessel: VesselState): Vec3 | undefined {
	if (!vessel.target) return undefined;
	const ref = vessel.target;
	let state: StateVector;
	if (ref.kind === 'body') {
		const body = core.bodies.get(ref.id);
		if (!body) return undefined;
		state = bodyState(body, core.t);
	} else {
		const other = targetVessel(core, ref.id);
		if (!other) return undefined;
		state = vesselState(core, other);
	}
	const d = sub(state.r, vesselState(core, vessel).r);
	return length(d) < MIN_TARGET_DISTANCE ? undefined : normalize(d);
}

/** `target-set`: refuses an unknown body or vessel and aiming at oneself. */
export function setTarget(
	core: SimCore,
	vesselId: EntityId,
	vessel: VesselState,
	target: TargetRef | null
): CommandResult {
	if (target === null) {
		vessel.target = null;
		return { ok: true };
	}
	if (target.kind === 'body') {
		if (!core.bodies.has(target.id)) {
			return refuse(
				`unknown body "${target.id}"; this sim has ${[...core.bodies.keys()].map((b) => `"${b}"`).join(', ')}`
			);
		}
		vessel.target = { kind: 'body', id: target.id };
		return { ok: true };
	}
	if (target.id === vesselId) return refuse('a vessel cannot target itself');
	const other = targetVessel(core, target.id);
	if (!other) return refuse(`unknown vessel ${target.id}`);
	if (target.part !== undefined) {
		// a docking port of the target vessel (plan 222)
		if (!other.parts.includes(target.part)) {
			return refuse(`part ${target.part} is not on vessel ${target.id}`);
		}
		const port = partOf(core, target.part).modules.some((m) => moduleDefOf(core, m.id).dock);
		if (!port) return refuse(`part ${target.part} is not a docking port`);
		vessel.target = { kind: 'vessel', id: target.id, part: target.part };
		return { ok: true };
	}
	vessel.target = { kind: 'vessel', id: target.id };
	return { ok: true };
}

/** Clear targets that name a vessel that is gone (destroyed, or reaped as debris); emits `vessel:target-lost`. */
export function pruneTargets(core: SimCore): void {
	for (const id of vesselIds(core)) {
		const vessel = vesselOf(core, id);
		const ref = vessel.target;
		if (ref?.kind === 'vessel' && ref.part !== undefined && !core.world.hasEntity(ref.part))
			delete ref.part;
		if (ref?.kind === 'vessel' && !targetVessel(core, ref.id)) {
			vessel.target = null;
			core.events.emit('vessel:target-lost', { vessel: id, target: ref.id });
		}
	}
}
