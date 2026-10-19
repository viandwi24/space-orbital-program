/**
 * Docking (plan 222, ADR 0218): free ports of equal size on two flight vessels of one frame pull
 * each other in when they are inside the magnet range, facing each other and slow; inside the
 * capture range they merge the two vessels into one (one rigid body, ADR 0018). The vessel that
 * keeps its id remembers the other (`VesselState.docks`), so an undock at that port pair gives
 * the other side its name and design back (`restoreUndocked`, called from the split).
 */
import type {
	EntityId,
	PartSnapshot,
	PortAlignment,
	PortSnapshot,
	Quat,
	Vec3
} from '@orbital/core';
import { add, dot, length, normalize, scale, sub } from '@orbital/kepler';
import {
	isControlled,
	moduleDefOf,
	moduleState,
	partDefOf,
	frameOfVessel,
	partOf,
	totalMass,
	vesselOf,
	type SimCore
} from './core.ts';
import { bodyMotion, createVesselBody, partTransform, partVelocity } from './frames.ts';
import { qConj, qMul, qRotate } from './math.ts';
import { reachMilestone } from './milestones.ts';
import type { DockRecord, FlightFrame, VesselState } from './state.ts';

/** Ports this close (face to face, m) start to pull each other. */
export const MAGNET_RANGE = 5;
/** Ports this close (m) capture. */
export const CAPTURE_RANGE = 0.15;
/** The faces and the line between them must be within this angle, rad (15°). */
export const ALIGN_ANGLE = (15 * Math.PI) / 180;
/** Closing faster than this (m/s) the magnet lets go, and nothing captures. */
export const MAX_PULL_SPEED = 1;
/** A capture needs the relative speed of the faces under this, m/s. */
export const CAPTURE_SPEED = 0.5;
/** Relative acceleration of the magnet, m/s². */
export const PULL_ACCEL = 0.15;
/** The magnet pulls only while the faces close slower than this, m/s: they meet gently. */
export const PULL_TARGET = 0.3;
/** A port that just undocked does not capture for this long, s. */
export const UNDOCK_COOLDOWN = 5;
/** Ports whose faces met faster than `CAPTURE_SPEED` do not capture for this long, s (they bounce). */
export const BOUNCE_COOLDOWN = 10;

interface Port {
	part: EntityId;
	vessel: EntityId;
	size: number;
	node: string;
	/** Face point and outward direction in the frame's axes. */
	at: Vec3;
	dir: Vec3;
}

const cosAlign = Math.cos(ALIGN_ANGLE);

/** The free ports of a flight vessel: a dock hook, the face node unattached, not cooling down. */
function freePorts(core: SimCore, frame: FlightFrame, vesselId: EntityId): Port[] {
	const out: Port[] = [];
	for (const id of vesselOf(core, vesselId).parts) {
		const part = partOf(core, id);
		if (part.portBlockedUntil !== undefined && core.t < part.portBlockedUntil) continue;
		for (const m of part.modules) {
			const dock = moduleDefOf(core, m.id).dock?.(m.config);
			if (!dock) continue;
			if (part.attachments.some((a) => a.node === dock.node)) continue;
			const node = partDefOf(core, part).attach?.[dock.node];
			if (!node) continue;
			const t = partTransform(core, frame, id);
			out.push({
				part: id,
				vessel: vesselId,
				size: dock.size,
				node: dock.node,
				at: add(
					t.position,
					qRotate(t.rotation, { x: node.pos[0], y: node.pos[1], z: node.pos[2] })
				),
				dir: normalize(qRotate(t.rotation, { x: node.dir[0], y: node.dir[1], z: node.dir[2] }))
			});
		}
	}
	return out;
}

/** Ports `a` and `b` face each other along the line between them. */
function aligned(a: Port, b: Port): boolean {
	if (dot(a.dir, scale(b.dir, -1)) < cosAlign) return false;
	const d = sub(b.at, a.at);
	const dist = length(d);
	if (dist < 0.05) return true;
	const n = scale(d, 1 / dist);
	return dot(a.dir, n) >= cosAlign && dot(b.dir, scale(n, -1)) >= cosAlign;
}

interface Pair {
	a: Port;
	b: Port;
	dist: number;
	/** Relative velocity of the faces, b minus a. */
	rel: Vec3;
}

function pairs(core: SimCore, frame: FlightFrame): Pair[] {
	const ports = frame.vessels.flatMap((v) => freePorts(core, frame, v));
	const out: Pair[] = [];
	for (let i = 0; i < ports.length; i++) {
		for (let j = i + 1; j < ports.length; j++) {
			const a = ports[i]!;
			const b = ports[j]!;
			if (a.vessel === b.vessel || Math.abs(a.size - b.size) > 1e-3) continue;
			const dist = length(sub(b.at, a.at));
			if (dist > MAGNET_RANGE || !aligned(a, b)) continue;
			const rel = sub(partVelocity(core, frame, b.part), partVelocity(core, frame, a.part));
			out.push({ a, b, dist, rel });
		}
	}
	return out.sort((p, q) => p.dist - q.dist || p.a.part - q.a.part);
}

/** Before the physics step: the magnets pull aligned, slow port pairs together. */
export function pullPorts(core: SimCore, frame: FlightFrame): void {
	for (const { a, b, dist, rel } of pairs(core, frame)) {
		if (dist < 1e-3 || length(rel) > MAX_PULL_SPEED) continue;
		const closing = -dot(rel, scale(sub(b.at, a.at), 1 / dist));
		if (closing >= PULL_TARGET) continue;
		const ma = totalMass(core, vesselOf(core, a.vessel).parts);
		const mb = totalMass(core, vesselOf(core, b.vessel).parts);
		const reduced = (ma * mb) / (ma + mb);
		const toward = scale(sub(b.at, a.at), 1 / dist);
		const f = scale(toward, PULL_ACCEL * reduced);
		const bodyA = frame.bodies.get(a.vessel);
		const bodyB = frame.bodies.get(b.vessel);
		if (!bodyA || !bodyB) continue;
		frame.backend.applyForce(bodyA.handle, f, a.at);
		frame.backend.applyForce(bodyB.handle, scale(f, -1), b.at);
		core.active.add(a.vessel);
		core.active.add(b.vessel);
	}
}

/** After the physics step: pairs inside the capture range, slow enough, merge. */
export function capturePorts(core: SimCore): void {
	for (const frame of core.frames) {
		if (!frame.inUse) continue;
		for (;;) {
			const close = pairs(core, frame).filter((p) => p.dist <= CAPTURE_RANGE);
			// faces that meet too fast bounce: no capture for a while
			for (const p of close) {
				if (length(p.rel) <= CAPTURE_SPEED) continue;
				for (const id of [p.a.part, p.b.part])
					partOf(core, id).portBlockedUntil = core.t + BOUNCE_COOLDOWN;
			}
			const hit = close.find((p) => length(p.rel) <= CAPTURE_SPEED);
			if (!hit) break;
			merge(core, frame, hit.a, hit.b);
		}
	}
}

function setDocked(core: SimCore, part: EntityId, docked: boolean): void {
	for (const m of partOf(core, part).modules) {
		if (!moduleDefOf(core, m.id).dock) continue;
		const state = moduleState(core, part, m.id) as { docked?: boolean } | undefined;
		if (state && typeof state === 'object') state.docked = docked;
	}
}

/** The vessel that keeps its id: a controlled one before an uncontrolled one, then the heavier, then the lower id. */
function keeperOf(
	core: SimCore,
	a: VesselState,
	ida: EntityId,
	b: VesselState,
	idb: EntityId
): boolean {
	const ca = isControlled(core, a);
	const cb = isControlled(core, b);
	if (ca !== cb) return ca;
	const ma = totalMass(core, a.parts);
	const mb = totalMass(core, b.parts);
	if (Math.abs(ma - mb) > 1e-9) return ma > mb;
	return ida < idb;
}

const maxIndex = (core: SimCore, v: VesselState): number =>
	Math.max(
		-1,
		...v.parts.map((p) => partOf(core, p).index),
		...(v.design?.parts.map((p) => p.index) ?? [])
	);

function merge(core: SimCore, frame: FlightFrame, pa: Port, pb: Port): void {
	const va = vesselOf(core, pa.vessel);
	const vb = vesselOf(core, pb.vessel);
	const aKeeps = keeperOf(core, va, pa.vessel, vb, pb.vessel);
	const [keep, gone] = aKeeps ? [pa, pb] : [pb, pa];
	const keeper = vesselOf(core, keep.vessel);
	const other = vesselOf(core, gone.vessel);
	const bodyK = frame.bodies.get(keep.vessel)!;
	const bodyG = frame.bodies.get(gone.vessel)!;
	const mk = bodyMotion(frame, bodyK);
	const mg = bodyMotion(frame, bodyG);

	// the other vessel's parts in the keeper's design frame, by their poses now
	const rootK = partOf(core, keeper.root);
	const inv: Quat = qConj(mk.rotation);
	const offset = maxIndex(core, keeper) + 1;
	const record: DockRecord = {
		port: keep.part,
		peerPort: gone.part,
		vessel: gone.vessel,
		name: other.name,
		...(other.design ? { design: other.design } : {}),
		...(keeper.design ? { keeperDesign: keeper.design } : {}),
		offset,
		keeperStages: keeper.stages.length,
		parts: [...other.parts],
		stages: other.stages.map((s) => [...s]),
		...(other.controlPart !== undefined ? { controlPart: other.controlPart } : {}),
		time: core.t
	};
	const poses = new Map(other.parts.map((id) => [id, partTransform(core, frame, id)]));
	const mK = totalMass(core, keeper.parts);
	const mG = totalMass(core, other.parts);
	for (const id of other.parts) {
		const part = partOf(core, id);
		const pose = poses.get(id)!;
		part.designPos = add(rootK.designPos, qRotate(inv, sub(pose.position, mk.origin)));
		part.rotation = qMul(inv, pose.rotation);
		part.vessel = keep.vessel;
		part.index += offset;
	}
	// the joint
	partOf(core, keep.part).attachments.push({
		node: keep.node,
		peer: gone.part,
		peerNode: gone.node
	});
	partOf(core, gone.part).attachments.push({
		node: gone.node,
		peer: keep.part,
		peerNode: keep.node
	});
	setDocked(core, keep.part, true);
	setDocked(core, gone.part, true);

	keeper.parts = [...keeper.parts, ...other.parts].sort((x, y) => x - y);
	keeper.stages = [...keeper.stages, ...other.stages];
	keeper.docks = [...(keeper.docks ?? []), record];
	if (keeper.design && other.design) {
		keeper.design = {
			...keeper.design,
			parts: [
				...keeper.design.parts,
				...other.design.parts.map((p) => ({
					...p,
					index: p.index + offset,
					parent: p.parent
						? { ...p.parent, index: p.parent.index + offset }
						: {
								index: partOf(core, keep.part).index,
								parentNode: keep.node,
								node: gone.node
							}
				}))
			],
			stages: [...keeper.design.stages, ...other.design.stages.map((s) => s.map((i) => i + offset))]
		};
	}
	keeper.idle = 0;
	keeper.rest = 0;
	// one body for the two: the joint momentum, the keeper's root pose
	const linear = scale(add(scale(mk.linear, mK), scale(mg.linear, mG)), 1 / (mK + mG));
	const angular = scale(add(scale(mk.angular, mK), scale(mg.angular, mG)), 1 / (mK + mG));
	frame.backend.removeBody(bodyK.handle);
	frame.backend.removeBody(bodyG.handle);
	frame.bodies.delete(keep.vessel);
	frame.bodies.delete(gone.vessel);
	frame.vessels = frame.vessels.filter((v) => v !== gone.vessel);
	createVesselBody(core, frame, keep.vessel, {
		origin: mk.origin,
		rotation: mk.rotation,
		linear,
		angular
	});
	core.world.destroyEntity(gone.vessel);
	core.active.add(keep.vessel);
	reachMilestone(core, 'dock', keeper.soi, keep.vessel);
	core.events.emit('vessel:docked', {
		vessel: keep.vessel,
		absorbed: gone.vessel,
		port: keep.part,
		peerPort: gone.part
	});
}

/**
 * After a split at a port pair that docked (an undock): the side with the docked vessel's parts
 * takes its name, design, part indices, stages and control part back; the other side its design.
 * `kept` and `split` are the two vessels of the split.
 */
export function restoreUndocked(
	core: SimCore,
	kept: EntityId,
	split: EntityId,
	partA: EntityId,
	partB: EntityId
): void {
	const keeper = vesselOf(core, kept);
	const docks = keeper.docks ?? [];
	const i = docks.findIndex(
		(d) => (d.port === partA && d.peerPort === partB) || (d.port === partB && d.peerPort === partA)
	);
	if (i < 0) return;
	const rec = docks[i]!;
	keeper.docks = docks.filter((_, k) => k !== i);
	if (keeper.docks.length === 0) delete keeper.docks;
	const other = vesselOf(core, split);
	const otherHasDocked = other.parts.some((p) => rec.parts.includes(p));
	const [dockedSide, home] = otherHasDocked ? [other, keeper] : [keeper, other];
	const dockedId = otherHasDocked ? split : kept;
	const homeId = otherHasDocked ? kept : split;
	const homeName = otherHasDocked ? keeper.name : other.name.replace(/ \(debris\)$/, '');
	for (const p of dockedSide.parts) {
		const part = partOf(core, p);
		if (rec.parts.includes(p)) part.index -= rec.offset;
	}
	dockedSide.name = rec.name;
	if (rec.design) dockedSide.design = rec.design;
	else delete dockedSide.design;
	const kept_ = new Set(dockedSide.parts);
	dockedSide.stages = rec.stages
		.map((s) => s.filter((p) => kept_.has(p)))
		.filter((s) => s.length > 0 || rec.stages.length === 0);
	if (rec.controlPart !== undefined && kept_.has(rec.controlPart))
		dockedSide.controlPart = rec.controlPart;
	home.name = homeName;
	if (rec.keeperDesign) home.design = rec.keeperDesign;
	// the docked vessel's stages were appended after the keeper's own
	if (home === keeper) home.stages = home.stages.slice(0, rec.keeperStages);
	for (const p of [partA, partB]) {
		setDocked(core, p, false);
		partOf(core, p).portBlockedUntil = core.t + UNDOCK_COOLDOWN;
	}
	reachMilestone(core, 'undock', home.soi, homeId);
	core.events.emit('vessel:undocked', { vessel: homeId, restored: dockedId, name: rec.name });
}

/** The alignment of `vesselId`'s port with the port its target names (plan 222), or undefined. */
export function portAlignment(core: SimCore, vesselId: EntityId): PortAlignment | undefined {
	const vessel = vesselOf(core, vesselId);
	const ref = vessel.target;
	if (ref?.kind !== 'vessel' || ref.part === undefined || !core.world.hasEntity(ref.id))
		return undefined;
	const frame = frameOfVessel(core, vesselId);
	if (!frame || !frame.vessels.includes(ref.id)) return undefined;
	const theirs = freePorts(core, frame, ref.id).find((p) => p.part === ref.part);
	if (!theirs) return undefined;
	const mine = freePorts(core, frame, vesselId).filter(
		(p) => Math.abs(p.size - theirs.size) <= 1e-3
	);
	if (mine.length === 0) return undefined;
	const own =
		mine.find((p) => p.part === vessel.controlPart) ??
		mine.sort((a, b) => length(sub(a.at, theirs.at)) - length(sub(b.at, theirs.at)))[0]!;
	const d = sub(theirs.at, own.at);
	const along = dot(d, own.dir);
	const lateral = sub(d, scale(own.dir, along));
	const rel = sub(partVelocity(core, frame, theirs.part), partVelocity(core, frame, own.part));
	const dist = length(d);
	const angle =
		(Math.acos(Math.max(-1, Math.min(1, dot(own.dir, scale(theirs.dir, -1))))) * 180) / Math.PI;
	return {
		port: own.part,
		angle,
		offset: length(lateral),
		distance: dist,
		closing: dist > 1e-6 ? -dot(rel, scale(d, 1 / dist)) : 0
	};
}

/** The vessel's docking port faces from its part snapshots (plan 222), or undefined without a port. */
export function portSnapshots(
	core: SimCore,
	parts: readonly PartSnapshot[]
): PortSnapshot[] | undefined {
	const out: PortSnapshot[] = [];
	for (const snap of parts) {
		const part = partOf(core, snap.id);
		for (const m of part.modules) {
			const dock = moduleDefOf(core, m.id).dock?.(m.config);
			const node = dock && partDefOf(core, part).attach?.[dock.node];
			if (!dock || !node) continue;
			const q = snap.orientation;
			out.push({
				part: snap.id,
				size: dock.size,
				free: !part.attachments.some((a) => a.node === dock.node),
				position: add(
					snap.position,
					qRotate(q, { x: node.pos[0], y: node.pos[1], z: node.pos[2] })
				),
				direction: normalize(qRotate(q, { x: node.dir[0], y: node.dir[1], z: node.dir[2] })),
				orientation: q
			});
		}
	}
	return out.length > 0 ? out : undefined;
}
