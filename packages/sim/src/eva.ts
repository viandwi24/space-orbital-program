/**
 * EVA (plan 109, ADR 0120): a crew member steps out into a suit, a vessel of its own; walks on the
 * ground (a controller of the ground speed, not a force); plants a flag; boards a vessel again, the
 * suit's samples coming aboard. The suit and the flag are found by what their parts declare (a
 * seat and `walk`; a `keep` module), so a mod can replace them.
 */
import {
	resolveVesselDesign,
	type CommandResult,
	type EntityId,
	type PartDefinition,
	type Vec3,
	type VesselDesign
} from '@orbital/core';
import { bodyOfVessel, rotationAt, spinAt } from './bodies.ts';
import {
	designCom,
	moduleDefOf,
	partDefOf as corePartDef,
	partOf,
	vesselOf,
	type SimCore
} from './core.ts';
import { qConj, qRotate } from './math.ts';
import { memberOf, vesselOfMember } from './crew.ts';
import { acquireFrame, bodyMotion, enterFlight } from './frames.ts';
import { makeContext } from './hooks.ts';
import { reachMilestone } from './milestones.ts';
import { wake, wakeBlocker } from './modes.ts';
import { motionOf } from './orbit.ts';
import type { FlightBody, FlightFrame } from './state.ts';
import { add, cross, dot, length, normalize, scale, sub } from '@orbital/kepler';
import { destroyVessel, placeAtState, placeOnSurface, spawnVessel } from './vessel.ts';

/** How far a suit may be from the vessel it boards, m (ADR 0120 point 2). */
export const BOARD_RANGE = 50;
/** The largest speed of a suit relative to the vessel it boards, m/s. */
export const BOARD_SPEED = 2;

const refuse = (reason: string): CommandResult => ({ ok: false, reason });

/** The registered suit part: a seat and `walk`. */
const suitPart = (core: SimCore): PartDefinition | undefined =>
	core.registries.parts.list().find((p) => p.walk !== undefined && (p.crewCapacity ?? 0) >= 1);

/** The registered flag part: a module that declares `keep`. */
const flagPart = (core: SimCore): PartDefinition | undefined =>
	core.registries.parts
		.list()
		.find((p) => (p.modules ?? []).some(([id]) => core.registries.modules.get(id)?.keep === true));

const onePart = (part: PartDefinition, name: string): VesselDesign => ({
	formatVersion: 1,
	name,
	parts: [{ index: 0, part: part.id as VesselDesign['parts'][number]['part'], parent: null }],
	stages: []
});

/** Distance from the vessel's centre of mass to its farthest part, m (from the design positions). */
function reach(core: SimCore, vesselId: EntityId): number {
	const vessel = vesselOf(core, vesselId);
	const com = designCom(core, vessel.parts);
	let out = 0;
	for (const id of vessel.parts) out = Math.max(out, length(sub(partOf(core, id).designPos, com)));
	return out;
}

/** East and up at a point relative to the vessel's body. */
function horizon(
	core: SimCore,
	vesselId: EntityId,
	r: Vec3
): { up: Vec3; east: Vec3; north: Vec3 } {
	const body = bodyOfVessel(core, vesselOf(core, vesselId));
	const spin = spinAt(body, core.t);
	const pole = length(spin) > 0 ? normalize(spin) : { x: 0, y: 1, z: 0 };
	const up = normalize(r);
	const e = cross(pole, up);
	const east = length(e) > 1e-9 ? normalize(e) : { x: 1, y: 0, z: 0 };
	return { up, east, north: cross(up, east) };
}

/**
 * Spawns a one-part vessel `distance` m east of `nearId`: standing on the ground when that vessel
 * stands, else at its velocity in space; then puts it in flight. Returns the new id or a reason.
 */
function spawnBeside(
	core: SimCore,
	nearId: EntityId,
	part: PartDefinition,
	name: string,
	distance: number,
	onGround: boolean
): EntityId | string {
	if (core.warp > 1) return `time warp is ${core.warp}x; set warp to 1 first`;
	const design = onePart(part, name);
	const resolved = resolveVesselDesign(design, core.registries.parts);
	if (!resolved.ok)
		return `the ${part.id} part does not make a vessel: ${resolved.errors.join('; ')}`;
	const near = vesselOf(core, nearId);
	const motion = motionOf(core, near);
	const { east } = horizon(core, nearId, motion.r);
	const at = add(motion.r, scale(east, distance));
	const id = spawnVessel(core, design, resolved);
	const vessel = vesselOf(core, id);
	vessel.soi = near.soi;
	if (onGround) {
		const body = bodyOfVessel(core, vessel);
		const bf = qRotate(qConj(rotationAt(body, core.t)), at);
		const lat = Math.asin(Math.max(-1, Math.min(1, bf.y / length(bf))));
		const lon = Math.atan2(-bf.z, bf.x);
		placeOnSurface(core, id, lat, lon);
	} else {
		placeAtState(core, id, at, motion.v, near.orientation);
	}
	const frame = acquireFrame(core, vessel.soi, vessel.com, vessel.velocity);
	if (!frame) {
		destroyVessel(core, id, 'could not be placed');
		return 'no free physics frame (another vessel is in flight far away)';
	}
	enterFlight(core, id, frame, onGround ? spinAt(bodyOfVessel(core, vessel), core.t) : undefined);
	core.events.emit('vessel:mode-changed', { vessel: id, mode: vessel.mode, reason: 'loaded' });
	return id;
}

const standing = (core: SimCore, vesselId: EntityId): boolean => {
	const v = vesselOf(core, vesselId);
	return v.landed || v.rails?.kind === 'surface';
};

/** `crew-eva` (ADR 0120 point 2). */
export function crewEva(core: SimCore, vesselId: EntityId, memberId: string): CommandResult {
	const m = memberOf(core, memberId);
	if (!m || vesselOfMember(core, m) !== vesselId) {
		return refuse(`crew member "${memberId}" is not aboard vessel ${vesselId}`);
	}
	const suit = suitPart(core);
	if (!suit) return refuse('no EVA suit is loaded (a part with a seat and `walk`)');
	const onGround = standing(core, vesselId);
	const blocker = wakeBlocker(core, vesselId);
	if (blocker) return refuse(blocker);
	wake(core, vesselId, 'crew stepping out');
	const id = spawnBeside(
		core,
		vesselId,
		suit,
		`${m.name} (EVA)`,
		reach(core, vesselId) + 2,
		onGround
	);
	if (typeof id === 'string') return refuse(id);
	const seat = vesselOf(core, id).parts[0]!;
	m.location = { vessel: Number(id), part: Number(seat) };
	const body = vesselOf(core, id).soi;
	if (!m.places.includes(`eva:${body}`)) m.places.push(`eva:${body}`);
	reachMilestone(core, 'eva', body, id);
	return { ok: true, vessel: id };
}

/** `crew-board` (ADR 0120 point 2). */
export function crewBoard(core: SimCore, suitId: EntityId, targetId: EntityId): CommandResult {
	if (suitId === targetId) return refuse('a suit cannot board itself');
	if (!core.world.hasEntity(suitId) || !core.world.hasEntity(targetId)) {
		return refuse(`unknown vessel ${core.world.hasEntity(suitId) ? targetId : suitId}`);
	}
	const suit = vesselOf(core, suitId);
	const target = vesselOf(core, targetId);
	const members = core.crew.members.filter((m) => vesselOfMember(core, m) === suitId);
	if (members.length === 0) return refuse(`vessel ${suitId} carries no crew member`);
	if (suit.soi !== target.soi) return refuse(`vessel ${targetId} is not near (another sphere)`);
	const a = motionOf(core, suit);
	const b = motionOf(core, target);
	const distance = length(sub(a.r, b.r));
	if (distance > BOARD_RANGE) {
		return refuse(
			`vessel ${targetId} is ${Math.round(distance)} m away (at most ${BOARD_RANGE} m)`
		);
	}
	if (length(sub(a.v, b.v)) > BOARD_SPEED) {
		return refuse(`too fast: more than ${BOARD_SPEED} m/s relative to vessel ${targetId}`);
	}
	const seats: EntityId[] = [];
	for (const id of target.parts) {
		const free = (partDefOf(core, id).crewCapacity ?? 0) - seatedIn(core, id);
		for (let k = 0; k < free; k++) seats.push(id);
	}
	if (seats.length < members.length) return refuse(`vessel ${targetId} has no free seat`);
	members.forEach((m, i) => {
		m.location = { vessel: Number(targetId), part: Number(seats[i]!) };
	});
	// The suit's held samples come aboard: its `onRecover` hooks credit them to the vessel's locker.
	const locker = (target.samples ??= []);
	for (const partId of suit.parts) {
		for (const mod of partOf(core, partId).modules) {
			const hook = moduleDefOf(core, mod.id).onRecover;
			if (!hook) continue;
			const ctx = makeContext(core, partId, mod.id);
			const vessel = Object.create(ctx.vessel, {
				science: {
					value: {
						...ctx.vessel.science,
						credit: (subject: string, value: number) => locker.push({ subject, value })
					}
				}
			});
			hook({ ...ctx, vessel });
		}
	}
	destroyVessel(core, suitId, 'recovered');
	return { ok: true };
}

/** `crew-walk` (ADR 0120 point 3). */
export function crewWalk(
	core: SimCore,
	vesselId: EntityId,
	heading: number,
	speed: number
): CommandResult {
	const vessel = vesselOf(core, vesselId);
	const max = Math.max(0, ...vessel.parts.map((id) => partDefOf(core, id).walk?.speed ?? 0));
	if (max === 0) return refuse(`vessel ${vesselId} cannot walk (no part declares \`walk\`)`);
	if (speed > max) return refuse(`walking speed ${speed} m/s is above the suit's ${max} m/s`);
	if (speed === 0) {
		delete vessel.walk;
		return { ok: true };
	}
	const blocker = wakeBlocker(core, vesselId);
	if (blocker) return refuse(blocker);
	wake(core, vesselId, 'walking');
	vessel.walk = { heading, speed };
	return { ok: true };
}

/** `plant-flag` (ADR 0120 point 5). */
export function plantFlag(core: SimCore, suitId: EntityId): CommandResult {
	const suit = vesselOf(core, suitId);
	const walker = suit.parts.some((id) => partDefOf(core, id).walk !== undefined);
	if (!walker) return refuse(`vessel ${suitId} is not a suit`);
	if (!standing(core, suitId)) return refuse('a flag is planted on the ground');
	const flag = flagPart(core);
	if (!flag) return refuse('no flag is loaded (a part with a `keep` module)');
	const id = spawnBeside(core, suitId, flag, 'Flag', 1.5, true);
	if (typeof id === 'string') return refuse(id);
	return { ok: true, vessel: id };
}

/**
 * Before each step, for a landed vessel that can walk (ADR 0120 point 3): it keeps upright (its
 * spin is the ground's, as a person keeps balance) and, while walking, its body gets the ground
 * speed it walks at, keeping its vertical motion. Off the ground nothing changes.
 */
export function stepWalking(
	core: SimCore,
	frame: FlightFrame,
	vesselId: EntityId,
	body: FlightBody
): void {
	const vessel = vesselOf(core, vesselId);
	if (!vessel.landed) return;
	if (!vessel.walk && !vessel.parts.some((id) => partDefOf(core, id).walk !== undefined)) return;
	const motion = bodyMotion(frame, body);
	const spin = spinAt(bodyOfVessel(core, vessel), core.t);
	let linear = motion.linear;
	const walk = vessel.walk;
	if (walk) {
		const r = add(frame.origin, motion.centre);
		const { up, east, north } = horizon(core, vesselId, r);
		const ground = sub(cross(spin, r), frame.velocity);
		const relative = sub(motion.linear, ground);
		const vertical = scale(up, dot(relative, up));
		const target = add(
			scale(north, Math.cos(walk.heading) * walk.speed),
			scale(east, Math.sin(walk.heading) * walk.speed)
		);
		linear = add(add(ground, vertical), target);
		core.active.add(vesselId);
	}
	frame.backend.setVelocity(body.handle, { linear, angular: spin });
}

const seatedIn = (core: SimCore, part: EntityId): number =>
	core.crew.members.filter((m) => m.status === 'assigned' && m.location?.part === Number(part))
		.length;

const partDefOf = (core: SimCore, id: EntityId): PartDefinition =>
	corePartDef(core, partOf(core, id));
