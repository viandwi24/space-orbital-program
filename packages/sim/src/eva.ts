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
import { ruleOf } from './economy.ts';
import { isTurned, partRotation, halfExtentsOf } from './parts.ts';
import { amountIn, roomIn, withdrawFrom } from './resources.ts';
import { memberOf, vesselOfMember } from './crew.ts';
import { acquireFrame, bodyMotion, enterFlight } from './frames.ts';
import { makeContext } from './hooks.ts';
import { reachMilestone } from './milestones.ts';
import { wake, wakeBlocker } from './modes.ts';
import { motionOf, orientationOf } from './orbit.ts';
import { VESSEL, type FlightBody, type FlightFrame } from './state.ts';
import { add, cross, dot, length, normalize, scale, sub } from '@orbital/kepler';
import { destroyVessel, placeAtState, placeOnSurface, spawnVessel } from './vessel.ts';

/** How far a suit may be from the vessel it boards with the assist rule, m (ADR 0120 point 2). */
export const BOARD_RANGE = 50;
/** The rule that keeps the 50 m boarding assist (plan 225, ADR 0209 point 5); on in Sandbox. */
export const BOARD_ASSIST_RULE = 'stock.eva-board-assist';
/** How near a hatch's exit point a suit boards, m (plan 225). */
export const BOARD_HATCH_RANGE = 2;
/** Length of the segment out of a hatch that must be clear, m. */
export const HATCH_PROBE = 1.2;
/** Where a suit appears, m out of the hatch. */
export const HATCH_EXIT = 1;
/** How far a suit reaches for a ladder, m from its centre to where it would hang. */
export const GRAB_RANGE = 1;
/** A hanging suit's centre is this far out from the ladder, m. */
export const LADDER_STANDOFF = 0.45;
/** Climbing speed at `rate` 1, m/s. */
export const CLIMB_SPEED = 0.6;
/** Upward speed of a jump, m/s. */
export const JUMP_SPEED = 2.5;
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

/** `distance` m east of vessel `nearId`'s centre (SOI-relative). */
function eastOf(core: SimCore, nearId: EntityId, distance: number): Vec3 {
	const motion = motionOf(core, vesselOf(core, nearId));
	const { east } = horizon(core, nearId, motion.r);
	return add(motion.r, scale(east, distance));
}

/** A point given in a part's frame, SOI-relative, from the vessel's design and attitude. */
function pointOf(core: SimCore, vesselId: EntityId, partId: EntityId, p: Vec3): Vec3 {
	const vessel = vesselOf(core, vesselId);
	const part = partOf(core, partId);
	const local = add(part.designPos, isTurned(part) ? qRotate(partRotation(part), p) : p);
	const rel = sub(local, designCom(core, vessel.parts));
	return add(motionOf(core, vessel).r, qRotate(orientationOf(core, vessel), rel));
}

/**
 * Spawns a one-part vessel at `at` (SOI-relative) beside `nearId`: standing on the ground below it
 * when that vessel stands, else at its velocity in space; then puts it in flight. Returns the new
 * id or a reason.
 */
function spawnBeside(
	core: SimCore,
	nearId: EntityId,
	part: PartDefinition,
	name: string,
	at: Vec3,
	onGround: boolean
): EntityId | string {
	if (core.warp > 1) return `time warp is ${core.warp}x; set warp to 1 first`;
	const design = onePart(part, name);
	const resolved = resolveVesselDesign(design, core.registries.parts);
	if (!resolved.ok)
		return `the ${part.id} part does not make a vessel: ${resolved.errors.join('; ')}`;
	const near = vesselOf(core, nearId);
	const motion = motionOf(core, near);
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
	const seatPart = m.location ? (m.location.part as EntityId) : undefined;
	const hatch = seatPart !== undefined ? partDefOf(core, seatPart).hatch : undefined;
	if (hatch && seatPart !== undefined) {
		const blocked = hatchBlocker(core, vesselId, seatPart, hatch);
		if (blocked) return refuse(`Hatch blocked by ${blocked}`);
	}
	const blocker = wakeBlocker(core, vesselId);
	if (blocker) return refuse(blocker);
	wake(core, vesselId, 'crew stepping out');
	const at =
		hatch && seatPart !== undefined
			? pointOf(core, vesselId, seatPart, along(hatch.pos, hatch.dir, HATCH_EXIT))
			: eastOf(core, vesselId, reach(core, vesselId) + 2);
	const id = spawnBeside(core, vesselId, suit, `${m.name} (EVA)`, at, onGround);
	if (typeof id === 'string') return refuse(id);
	const seat = vesselOf(core, id).parts[0]!;
	m.location = { vessel: Number(id), part: Number(seat) };
	// the suit keeps what the member had left (plan 225); full the first time
	const gas = suit.walk?.propellant;
	if (gas && m.suitGas !== undefined) {
		const parts = vesselOf(core, id).parts;
		const extra = amountIn(core, parts, gas) - m.suitGas;
		if (extra > 0) withdrawFrom(core, parts, gas, extra);
	}
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
	if (ruleOf(core, BOARD_ASSIST_RULE) === true) {
		const distance = length(sub(a.r, b.r));
		if (distance > BOARD_RANGE) {
			return refuse(
				`vessel ${targetId} is ${Math.round(distance)} m away (at most ${BOARD_RANGE} m)`
			);
		}
	} else if (suit.latch?.vessel !== Number(targetId)) {
		const hatches = target.parts.flatMap((id) => {
			const h = partDefOf(core, id).hatch;
			return h ? [pointOf(core, targetId, id, along(h.pos, h.dir, HATCH_EXIT))] : [];
		});
		const ladders = target.parts.some((id) => partDefOf(core, id).ladder !== undefined);
		if (hatches.length === 0 && !ladders)
			return refuse(`vessel ${targetId} has no hatch or ladder to board at`);
		const nearest = Math.min(...hatches.map((h) => length(sub(h, a.r))));
		if (!(nearest <= BOARD_HATCH_RANGE)) {
			const how = Number.isFinite(nearest) ? `${Math.round(nearest)} m from its hatch; ` : '';
			return refuse(
				`vessel ${targetId}: ${how}board within ${BOARD_HATCH_RANGE} m of a hatch or from its ladder`
			);
		}
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
	// Top the suit's propellant up from the vessel's own stock of it (plan 225); the member keeps it.
	const gas = suit.parts.map((id) => partDefOf(core, id).walk?.propellant).find((g) => g);
	if (gas) {
		const left = amountIn(core, suit.parts, gas);
		const want = roomIn(core, suit.parts, gas);
		const got = want > 0 ? withdrawFrom(core, target.parts, gas, want) : 0;
		for (const m of members) m.suitGas = left + got;
	}
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
	const max = Math.max(
		0,
		...vessel.parts.map((id) => {
			const w = partDefOf(core, id).walk;
			return w ? Math.max(w.speed, w.run ?? 0) : 0;
		})
	);
	if (max === 0) return refuse(`vessel ${vesselId} cannot walk (no part declares \`walk\`)`);
	if (speed > max) return refuse(`walking speed ${speed} m/s is above the suit's ${max} m/s`);
	if (speed === 0) {
		delete vessel.walk;
		return { ok: true };
	}
	if (vessel.latch) return refuse('let go of the ladder first');
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
	const id = spawnBeside(core, suitId, flag, 'Flag', eastOf(core, suitId, 1.5), true);
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
	body: FlightBody,
	dt = 0
): void {
	const vessel = vesselOf(core, vesselId);
	if (vessel.latch) return stepLatch(core, frame, vesselId, body, dt);
	if (!vessel.landed) {
		delete vessel.jump;
		return;
	}
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
	if (vessel.jump) {
		delete vessel.jump;
		const { up } = horizon(core, vesselId, add(frame.origin, motion.centre));
		linear = add(linear, scale(up, JUMP_SPEED));
		core.active.add(vesselId);
	}
	frame.backend.setVelocity(body.handle, { linear, angular: spin });
}

const seatedIn = (core: SimCore, part: EntityId): number =>
	core.crew.members.filter((m) => m.status === 'assigned' && m.location?.part === Number(part))
		.length;

const partDefOf = (core: SimCore, id: EntityId): PartDefinition =>
	corePartDef(core, partOf(core, id));

const along = (pos: readonly number[], dir: readonly number[], d: number): Vec3 => {
	const u = normalize({ x: dir[0]!, y: dir[1]!, z: dir[2]! });
	return { x: pos[0]! + u.x * d, y: pos[1]! + u.y * d, z: pos[2]! + u.z * d };
};
const v3 = (t: readonly number[]): Vec3 => ({ x: t[0]!, y: t[1]!, z: t[2]! });

/** A point in a part's frame in the vessel's design space (the body frame of its rigid body). */
function designPoint(core: SimCore, partId: EntityId, p: Vec3): Vec3 {
	const part = partOf(core, partId);
	return add(part.designPos, isTurned(part) ? qRotate(partRotation(part), p) : p);
}

/** The first other part whose box lies across the segment out of the hatch, by title (plan 225). */
function hatchBlocker(
	core: SimCore,
	vesselId: EntityId,
	seat: EntityId,
	hatch: NonNullable<PartDefinition['hatch']>
): string | undefined {
	const a = designPoint(core, seat, v3(hatch.pos));
	const b = designPoint(core, seat, along(hatch.pos, hatch.dir, HATCH_PROBE));
	for (const id of vesselOf(core, vesselId).parts) {
		if (id === seat) continue;
		const part = partOf(core, id);
		const def = partDefOf(core, id);
		if (segmentHitsBox(a, b, part.designPos, halfExtentsOf(def))) return def.title;
	}
	return undefined;
}

/** Slab test of the segment a→b against an axis-aligned box (centre, half extents). */
function segmentHitsBox(a: Vec3, b: Vec3, c: Vec3, h: Vec3): boolean {
	let lo = 0;
	let hi = 1;
	for (const k of ['x', 'y', 'z'] as const) {
		const d = b[k] - a[k];
		const min = c[k] - h[k] - a[k];
		const max = c[k] + h[k] - a[k];
		if (Math.abs(d) < 1e-12) {
			if (min > 0 || max < 0) return false;
			continue;
		}
		let t0 = min / d;
		let t1 = max / d;
		if (t0 > t1) [t0, t1] = [t1, t0];
		lo = Math.max(lo, t0);
		hi = Math.min(hi, t1);
		if (lo > hi) return false;
	}
	return true;
}

/** The ladder point at `s` (0..1) where a suit's centre hangs, in the vessel's body frame. */
function hangPoint(core: SimCore, vesselId: EntityId, partId: EntityId, s: number): Vec3 {
	const l = partDefOf(core, partId).ladder!;
	const root = partOf(core, vesselOf(core, vesselId).root).designPos;
	const out = normalize(v3(l.out));
	const p = {
		x: l.from[0] + (l.to[0] - l.from[0]) * s + out.x * LADDER_STANDOFF,
		y: l.from[1] + (l.to[1] - l.from[1]) * s + out.y * LADDER_STANDOFF,
		z: l.from[2] + (l.to[2] - l.from[2]) * s + out.z * LADDER_STANDOFF
	};
	return sub(designPoint(core, partId, p), root);
}

const ladderLength = (core: SimCore, partId: EntityId): number => {
	const l = partDefOf(core, partId).ladder!;
	return length(sub(v3(l.to), v3(l.from)));
};

/** Vessels other than `suitId` in its sphere within 30 m of `at` that carry a ladder. */
function vesselIdsNear(core: SimCore, suitId: EntityId, at: Vec3): EntityId[] {
	const suit = vesselOf(core, suitId);
	const out: EntityId[] = [];
	for (const id of core.world.query([VESSEL])) {
		if (id === suitId) continue;
		const v = vesselOf(core, id);
		if (v.soi !== suit.soi) continue;
		if (!v.parts.some((p) => partDefOf(core, p).ladder !== undefined)) continue;
		if (length(sub(motionOf(core, v).r, at)) <= 30) out.push(id);
	}
	return out;
}

const frameOf = (core: SimCore, id: EntityId): FlightFrame | undefined =>
	core.frames.find((f) => f.inUse && f.bodies.has(id));

/** `crew-grab` (plan 225, ADR 0209 point 4): hang on the nearest ladder within reach, or let go. */
export function crewGrab(core: SimCore, suitId: EntityId, release: boolean): CommandResult {
	const suit = vesselOf(core, suitId);
	if (!suit.parts.some((id) => partDefOf(core, id).walk !== undefined))
		return refuse(`vessel ${suitId} is not a suit`);
	if (release) {
		delete suit.latch;
		return { ok: true };
	}
	if (suit.latch) return refuse('already holding a ladder');
	// a suit standing still rests on rails: wake it, and the vessels within reach, into one frame
	const blocker = wakeBlocker(core, suitId);
	if (blocker) return refuse(blocker);
	wake(core, suitId, 'grabbing a ladder');
	const here = motionOf(core, suit).r;
	for (const id of vesselIdsNear(core, suitId, here)) {
		if (!wakeBlocker(core, id)) wake(core, id, 'a suit grabs its ladder');
	}
	const frame = frameOf(core, suitId);
	if (!frame) return refuse('the suit is not in flight');
	const me = bodyMotion(frame, frame.bodies.get(suitId)!).centre;
	let best: { vessel: EntityId; part: EntityId; s: number; d: number } | undefined;
	for (const vesselId of frame.vessels) {
		if (vesselId === suitId) continue;
		const body = frame.bodies.get(vesselId);
		if (!body) continue;
		const m = bodyMotion(frame, body);
		for (const partId of vesselOf(core, vesselId).parts) {
			if (!partDefOf(core, partId).ladder) continue;
			const p0 = add(m.origin, qRotate(m.rotation, hangPoint(core, vesselId, partId, 0)));
			const p1 = add(m.origin, qRotate(m.rotation, hangPoint(core, vesselId, partId, 1)));
			const seg = sub(p1, p0);
			const len2 = dot(seg, seg);
			const s = len2 > 0 ? Math.min(1, Math.max(0, dot(sub(me, p0), seg) / len2)) : 0;
			const d = length(sub(me, add(p0, scale(seg, s))));
			if (d <= GRAB_RANGE && (!best || d < best.d)) best = { vessel: vesselId, part: partId, s, d };
		}
	}
	if (!best) return refuse(`no ladder within ${GRAB_RANGE} m`);
	delete suit.walk;
	suit.latch = { vessel: Number(best.vessel), part: Number(best.part), s: best.s, rate: 0 };
	core.active.add(suitId);
	return { ok: true };
}

/** `crew-climb` (plan 225): `rate` -1..1 of `CLIMB_SPEED` along the ladder, 0 holds. */
export function crewClimb(core: SimCore, suitId: EntityId, rate: number): CommandResult {
	const suit = vesselOf(core, suitId);
	if (!suit.latch) return refuse('not holding a ladder (grab one first)');
	suit.latch.rate = Math.max(-1, Math.min(1, rate));
	return { ok: true };
}

/** `crew-jump` (plan 225): a standing suit leaves the ground at `JUMP_SPEED`. */
export function crewJump(core: SimCore, suitId: EntityId): CommandResult {
	const suit = vesselOf(core, suitId);
	if (!suit.parts.some((id) => partDefOf(core, id).walk !== undefined))
		return refuse(`vessel ${suitId} is not a suit`);
	if (suit.latch) return refuse('let go of the ladder first');
	if (!suit.landed) return refuse('a suit jumps from the ground');
	suit.jump = true;
	return { ok: true };
}

/**
 * A latched suit (plan 225, design note): each step its pose and velocity are the ladder point's on
 * the vessel, as if rigidly attached, so it keeps its offset while the vessel turns and moves.
 */
function stepLatch(
	core: SimCore,
	frame: FlightFrame,
	suitId: EntityId,
	body: FlightBody,
	dt: number
): void {
	const suit = vesselOf(core, suitId);
	const latch = suit.latch!;
	const vesselId = latch.vessel as EntityId;
	const target = frame.bodies.get(vesselId);
	if (!target || !core.world.hasEntity(latch.part as EntityId)) {
		delete suit.latch;
		return;
	}
	const partId = latch.part as EntityId;
	if (latch.rate !== 0 && dt > 0) {
		const len = ladderLength(core, partId);
		latch.s = Math.max(
			0,
			Math.min(1, latch.s + (latch.rate * CLIMB_SPEED * dt) / Math.max(len, 1e-6))
		);
	}
	const m = bodyMotion(frame, target);
	const at = add(m.origin, qRotate(m.rotation, hangPoint(core, vesselId, partId, latch.s)));
	const tangent = qRotate(
		m.rotation,
		sub(hangPoint(core, vesselId, partId, 1), hangPoint(core, vesselId, partId, 0))
	);
	const len = length(tangent);
	const climb =
		len > 0 && dt > 0 ? scale(tangent, (latch.rate * CLIMB_SPEED) / len) : { x: 0, y: 0, z: 0 };
	const position = sub(at, qRotate(m.rotation, body.com));
	frame.backend.setTransform(body.handle, { position, rotation: m.rotation });
	const linear = add(
		add(m.linear, cross(m.angular, sub(at, m.centre))),
		latch.s > 0 && latch.s < 1 ? climb : { x: 0, y: 0, z: 0 }
	);
	frame.backend.setVelocity(body.handle, { linear, angular: m.angular });
	// both stay awake while it hangs on: a resting vessel would go to rails and drop the suit
	core.active.add(suitId);
	core.active.add(vesselId);
}
