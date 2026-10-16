/**
 * Vessel lifecycle: assembly from a resolved design, placement, splitting at a node (staging) and
 * destruction. Vessels and parts are world entities holding plain-data components (state.ts).
 */
import {
	parseModuleConfig,
	type EntityId,
	type Quat,
	type ResolvedDesign,
	type Vec3,
	type VesselDesign
} from '@orbital/core';
import { add, cross, normalize, scale, sub } from '@orbital/kepler';
import {
	designCom,
	frameOfVessel,
	moduleDefOf,
	partDefOf,
	partMass,
	partOf,
	totalMass,
	vesselOf,
	type SimCore
} from './core.ts';
import { leaveFlight } from './frames.ts';
import { fromTuple, qAboutY, qFromBasis, qMul, qRotate } from './math.ts';
import { computeRails, motionOf } from './orbit.ts';
import { halfExtentsOf } from './parts.ts';
import {
	jointKey,
	moduleStateToken,
	PART,
	VESSEL,
	type PartState,
	type VesselState
} from './state.ts';

type Resolved = Extract<ResolvedDesign, { ok: true }>;

/**
 * Create the vessel and part entities for a resolved design. The vessel starts on rails with a
 * zero pose; the caller places it (`placeOnSurface` / `placeAtState`) and then puts it in flight
 * or on rails.
 */
export function spawnVessel(core: SimCore, design: VesselDesign, resolved: Resolved): EntityId {
	const world = core.world;
	const vesselId = world.createEntity();
	const byIndex = new Map<number, EntityId>();
	for (const rp of resolved.parts) {
		const partId = world.createEntity();
		byIndex.set(rp.index, partId);
		const modules: PartState['modules'] = [];
		for (const [moduleId, raw] of rp.definition.modules ?? []) {
			const def = moduleDefOf(core, moduleId);
			const parsed = parseModuleConfig(def, raw);
			if (!parsed.ok) {
				throw new Error(`part "${rp.definition.id}" module "${moduleId}": ${parsed.message}`);
			}
			modules.push({ id: moduleId, config: parsed.value });
			const state = def.state?.(parsed.value);
			if (state !== undefined) world.add(partId, moduleStateToken(moduleId), state);
		}
		world.add(partId, PART, {
			vessel: vesselId,
			index: rp.index,
			definition: rp.definition.id,
			designPos: rp.position,
			attachments: [],
			modules
		});
	}
	for (const rp of resolved.parts) {
		if (!rp.parent) continue;
		const child = partOf(core, byIndex.get(rp.index)!);
		const parent = partOf(core, byIndex.get(rp.parent.index)!);
		parent.attachments.push({
			node: rp.parent.parentNode,
			peer: byIndex.get(rp.index)!,
			peerNode: rp.parent.node
		});
		child.attachments.push({
			node: rp.parent.node,
			peer: byIndex.get(rp.parent.index)!,
			peerNode: rp.parent.parentNode
		});
	}
	const parts = resolved.parts.map((rp) => byIndex.get(rp.index)!);
	const state: VesselState = {
		name: design.name,
		mode: 'on-rails',
		soi: core.body.def.id,
		root: byIndex.get(resolved.root)!,
		parts,
		control: { throttle: 0, pitch: 0, roll: 0, yaw: 0 },
		stages: design.stages.map((stage) => stage.map((i) => byIndex.get(i)!)),
		nextStage: 0,
		com: { x: 0, y: 0, z: 0 },
		velocity: { x: 0, y: 0, z: 0 },
		orientation: { x: 0, y: 0, z: 0, w: 1 },
		rails: null,
		idle: 0,
		landed: false,
		pad: null
	};
	world.add(vesselId, VESSEL, state);
	core.events.emit('vessel:created', { vessel: vesselId });
	return vesselId;
}

/** Lowest design-frame point of the vessel along its +Y axis (negative or zero for a standing stack). */
function lowestPoint(core: SimCore, parts: readonly EntityId[]): number {
	let lowest = Infinity;
	for (const id of parts) {
		const p = partOf(core, id);
		lowest = Math.min(lowest, p.designPos.y - halfExtentsOf(partDefOf(core, p)).y);
	}
	return lowest;
}

/**
 * Stand the vessel on the ground at (latitude, longitude), nose up, resting on its lowest point,
 * moving with the rotating ground. Local X points east, Y up, Z south.
 */
export function placeOnSurface(
	core: SimCore,
	vesselId: EntityId,
	latitude: number,
	longitude: number
): void {
	const vessel = vesselOf(core, vesselId);
	const up: Vec3 = {
		x: Math.cos(latitude) * Math.cos(longitude),
		y: Math.sin(latitude),
		z: -Math.cos(latitude) * Math.sin(longitude)
	};
	const eastRaw = cross({ x: 0, y: 1, z: 0 }, up);
	const east =
		Math.hypot(eastRaw.x, eastRaw.y, eastRaw.z) > 1e-9 ? normalize(eastRaw) : { x: 0, y: 0, z: -1 };
	vessel.orientation = qFromBasis(east, up, cross(east, up));
	const rootDesign = partOf(core, vessel.root).designPos;
	const rootOrigin = add(
		scale(up, core.body.def.radius),
		scale(up, rootDesign.y - lowestPoint(core, vessel.parts))
	);
	const offset = qRotate(vessel.orientation, sub(designCom(core, vessel.parts), rootDesign));
	vessel.com = add(rootOrigin, offset);
	vessel.velocity = cross({ x: 0, y: core.body.omega, z: 0 }, vessel.com);
}

/**
 * Pin a vessel standing on the surface to the pad: record its current body poses in the rotating
 * ground frame (ADR 0017). Call after the vessel is in flight.
 */
export function holdOnPad(core: SimCore, vesselId: EntityId): void {
	const vessel = vesselOf(core, vesselId);
	const com = designCom(core, vessel.parts);
	const unspin = qAboutY(-core.body.omega * core.t);
	vessel.pad = {
		poses: vessel.parts.map((part) => {
			const position = add(
				vessel.com,
				qRotate(vessel.orientation, sub(partOf(core, part).designPos, com))
			);
			return {
				part,
				position: qRotate(unspin, position),
				rotation: qMul(unspin, vessel.orientation)
			};
		})
	};
}

export function placeAtState(
	core: SimCore,
	vesselId: EntityId,
	position: Vec3,
	velocity: Vec3,
	orientation: Quat
): void {
	const vessel = vesselOf(core, vesselId);
	vessel.com = { ...position };
	vessel.velocity = { ...velocity };
	vessel.orientation = orientation;
}

/** Entities reachable from `start` through attachments. */
function component(core: SimCore, start: EntityId): EntityId[] {
	const seen = new Set<EntityId>([start]);
	const order = [start];
	for (let head = 0; head < order.length; head++) {
		for (const att of partOf(core, order[head]!).attachments) {
			if (!seen.has(att.peer)) {
				seen.add(att.peer);
				order.push(att.peer);
			}
		}
	}
	return order.sort((a, b) => a - b);
}

/**
 * Sever the attachment at `node` of `partId` (a decoupler firing). The vessel splits into the
 * side that keeps its id and a new vessel: the side with a control source keeps it (the side with
 * the old root if both or neither has one). `impulse` N·s pushes the halves apart along the node
 * direction as an equal and opposite change of momentum. Does nothing when `node` is unattached.
 * Returns the new vessel's id.
 */
export function splitVessel(
	core: SimCore,
	partId: EntityId,
	node: string,
	impulse: number
): EntityId | undefined {
	const part = partOf(core, partId);
	const att = part.attachments.find((a) => a.node === node);
	if (!att) return undefined;
	const vesselId = part.vessel;
	const vessel = vesselOf(core, vesselId);
	const peerId = att.peer;
	const frame = frameOfVessel(core, vesselId);

	// Pose before the topology changes: per-side centre of mass state.
	const all = vessel.parts;
	const motion = motionOf(core, vessel);
	const comAll = designCom(core, all);
	const sideState = (parts: readonly EntityId[]): { com: Vec3; velocity: Vec3 } => {
		if (!frame) {
			const off = qRotate(vessel.orientation, sub(designCom(core, parts), comAll));
			return { com: add(motion.r, off), velocity: motion.v };
		}
		let m = 0;
		let c: Vec3 = { x: 0, y: 0, z: 0 };
		let v: Vec3 = { x: 0, y: 0, z: 0 };
		for (const id of parts) {
			const h = frame.bodies.get(id)!;
			const mass = partMass(core, id);
			m += mass;
			c = add(c, scale(add(frame.origin, frame.backend.getTransform(h).position), mass));
			v = add(v, scale(add(frame.velocity, frame.backend.getVelocity(h).linear), mass));
		}
		return { com: scale(c, 1 / m), velocity: scale(v, 1 / m) };
	};

	// Cut the graph (and the joint).
	part.attachments = part.attachments.filter((a) => a !== att);
	const peer = partOf(core, peerId);
	peer.attachments = peer.attachments.filter((a) => a.peer !== partId);
	if (frame) {
		const key = jointKey(partId, peerId);
		const joint = frame.joints.get(key);
		if (joint !== undefined) frame.backend.removeJoint(joint);
		frame.joints.delete(key);
	}

	const sideP = component(core, partId);
	const sideQ = component(core, peerId);
	const controlled = (side: readonly EntityId[]): boolean =>
		side.some((id) =>
			partOf(core, id).modules.some((m) => moduleDefOf(core, m.id).controlSource === true)
		);
	const rootSide = sideP.includes(vessel.root) ? sideP : sideQ;
	const otherSide = rootSide === sideP ? sideQ : sideP;
	const keepSide = !controlled(rootSide) && controlled(otherSide) ? otherSide : rootSide;
	const newSide = keepSide === sideP ? sideQ : sideP;
	const cutOf = (side: readonly EntityId[]): EntityId => (side === sideP ? partId : peerId);

	const stateKeep = sideState(keepSide);
	const stateNew = sideState(newSide);

	// Equal and opposite momentum along the node direction (pointing from `part` towards `peer`).
	if (impulse > 0) {
		const q = frame
			? frame.backend.getTransform(frame.bodies.get(partId)!).rotation
			: vessel.orientation;
		const dir = qRotate(q, fromTuple(partDefOf(core, part).attach![node]!.dir));
		const dvPeer = scale(dir, impulse / totalMass(core, sideQ));
		const dvPart = scale(dir, -impulse / totalMass(core, sideP));
		for (const [side, dv] of [
			[sideQ, dvPeer],
			[sideP, dvPart]
		] as const) {
			const target = side === keepSide ? stateKeep : stateNew;
			target.velocity = add(target.velocity, dv);
			if (frame) {
				for (const id of side) {
					const h = frame.bodies.get(id)!;
					const v = frame.backend.getVelocity(h);
					frame.backend.setVelocity(h, { linear: add(v.linear, dv), angular: v.angular });
				}
			}
		}
	}

	const newId = core.world.createEntity();
	const keepRoot = keepSide.includes(vessel.root) ? vessel.root : cutOf(keepSide);
	const newRoot = newSide.includes(vessel.root) ? vessel.root : cutOf(newSide);
	const keepSet = new Set(keepSide);
	const newState: VesselState = {
		name: `${vessel.name} (debris)`,
		mode: vessel.mode,
		soi: vessel.soi,
		root: newRoot,
		parts: newSide,
		control: { throttle: 0, pitch: 0, roll: 0, yaw: 0 },
		stages: [],
		nextStage: 0,
		com: stateNew.com,
		velocity: stateNew.velocity,
		orientation: vessel.orientation,
		rails: null,
		idle: 0,
		landed: false,
		pad: null
	};
	for (const id of newSide) partOf(core, id).vessel = newId;
	vessel.parts = keepSide;
	vessel.root = keepRoot;
	vessel.stages = vessel.stages.map((s) => s.filter((id) => keepSet.has(id)));
	vessel.com = stateKeep.com;
	vessel.velocity = stateKeep.velocity;
	vessel.idle = 0;
	if (vessel.pad) vessel.pad = { poses: vessel.pad.poses.filter((p) => keepSet.has(p.part)) };
	core.world.add(newId, VESSEL, newState);
	if (frame) {
		frame.vessels = [...frame.vessels, newId].sort((a, b) => a - b);
	} else {
		vessel.rails = computeRails(core.body.mu, vessel.com, vessel.velocity, core.t);
		newState.rails = computeRails(core.body.mu, newState.com, newState.velocity, core.t);
	}
	core.events.emit('vessel:created', { vessel: newId, from: vesselId });
	return newId;
}

/** Apply the detach requests hooks queued, in order. */
export function processPending(core: SimCore): void {
	while (core.pending.length > 0) {
		const queue = core.pending;
		core.pending = [];
		for (const req of queue) {
			if (core.world.hasEntity(req.part)) splitVessel(core, req.part, req.node, req.impulse);
		}
	}
}

/** Remove a vessel and its parts from the world and the physics frame. */
export function destroyVessel(core: SimCore, vesselId: EntityId, reason: string): void {
	const vessel = vesselOf(core, vesselId);
	leaveFlight(core, vesselId);
	for (const id of vessel.parts) core.world.destroyEntity(id);
	core.world.destroyEntity(vesselId);
	core.events.emit('vessel:destroyed', { vessel: vesselId, reason });
}
