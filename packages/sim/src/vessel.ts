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
	moduleState,
	partDefOf,
	partMass,
	partOf,
	totalMass,
	vesselOf,
	type SimCore
} from './core.ts';
import {
	bodyMotion,
	createVesselBody,
	impactOutcome,
	type GroundImpact,
	leaveFlight,
	partTransform,
	partVelocity
} from './frames.ts';
import { fromTuple, qAboutY, qFromBasis, qRotate } from './math.ts';
import { AMBIENT_TEMPERATURE, DEFAULT_IMPACT_TOLERANCE } from './constants.ts';
import type { Overheat } from './thermal.ts';
import { computeRails, motionOf, orientationOf, surfaceRails } from './orbit.ts';
import { halfExtentsOf } from './parts.ts';
import { moduleStateToken, PART, VESSEL, type PartState, type VesselState } from './state.ts';

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
			temperature: AMBIENT_TEMPERATURE,
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
		rest: 0
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
		// Boxes modules add (deployed feet) stand on the ground too.
		for (const m of p.modules) {
			const colliders = moduleDefOf(core, m.id).colliders;
			if (!colliders) continue;
			for (const c of colliders(m.config, moduleState(core, id, m.id))) {
				lowest = Math.min(lowest, p.designPos.y + c.offset.y - c.halfExtents.y);
			}
		}
	}
	return lowest;
}

/**
 * Stand the vessel on the ground at body-fixed (latitude, longitude), nose up, resting on its
 * lowest point, moving with the rotating ground. Local X points east, Y up, Z south. The body
 * has turned `omega * t` about +Y since t = 0, so the inertial position is the body-fixed one
 * rotated by that angle: a vessel loaded at any time stands on the same ground spot (plan 025).
 */
export function placeOnSurface(
	core: SimCore,
	vesselId: EntityId,
	latitude: number,
	longitude: number
): void {
	const vessel = vesselOf(core, vesselId);
	const up = qRotate(qAboutY(core.body.omega * core.t), {
		x: Math.cos(latitude) * Math.cos(longitude),
		y: Math.sin(latitude),
		z: -Math.cos(latitude) * Math.sin(longitude)
	});
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

	// Pose before the topology changes: per-side centre of mass state, and every part's pose.
	const all = vessel.parts;
	const motion = motionOf(core, vessel);
	const wasOnSurface = vessel.rails?.kind === 'surface';
	vessel.orientation = orientationOf(core, vessel); // stale on surface rails
	const comAll = designCom(core, all);
	const rootPose = frame ? bodyMotion(frame, frame.bodies.get(vesselId)!) : undefined;
	const partPositions = new Map<EntityId, Vec3>();
	if (frame) for (const id of all) partPositions.set(id, partTransform(core, frame, id).position);
	const sideState = (parts: readonly EntityId[]): { com: Vec3; velocity: Vec3 } => {
		if (!frame) {
			const off = qRotate(vessel.orientation, sub(designCom(core, parts), comAll));
			return { com: add(motion.r, off), velocity: motion.v };
		}
		let m = 0;
		let c: Vec3 = { x: 0, y: 0, z: 0 };
		let v: Vec3 = { x: 0, y: 0, z: 0 };
		for (const id of parts) {
			const mass = partMass(core, id);
			m += mass;
			c = add(c, scale(add(frame.origin, partPositions.get(id)!), mass));
			v = add(v, scale(add(frame.velocity, partVelocity(core, frame, id)), mass));
		}
		return { com: scale(c, 1 / m), velocity: scale(v, 1 / m) };
	};

	// Cut the graph.
	part.attachments = part.attachments.filter((a) => a !== att);
	const peer = partOf(core, peerId);
	peer.attachments = peer.attachments.filter((a) => a.peer !== partId);

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
		const q = rootPose ? rootPose.rotation : vessel.orientation;
		const dir = qRotate(q, fromTuple(partDefOf(core, part).attach![node]!.dir));
		const dvPeer = scale(dir, impulse / totalMass(core, sideQ));
		const dvPart = scale(dir, -impulse / totalMass(core, sideP));
		for (const [side, dv] of [
			[sideQ, dvPeer],
			[sideP, dvPart]
		] as const) {
			const target = side === keepSide ? stateKeep : stateNew;
			target.velocity = add(target.velocity, dv);
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
		rest: 0
	};
	for (const id of newSide) partOf(core, id).vessel = newId;
	vessel.parts = keepSide;
	vessel.root = keepRoot;
	vessel.stages = vessel.stages.map((s) => s.filter((id) => keepSet.has(id)));
	vessel.com = stateKeep.com;
	vessel.velocity = stateKeep.velocity;
	vessel.idle = 0;
	vessel.rest = 0;
	core.world.add(newId, VESSEL, newState);
	if (frame && rootPose) {
		// ADR 0018: the one body is replaced by one per side, each continuing the rigid motion
		// (same angular velocity, the side's mean velocity, which includes the separation impulse).
		const old = frame.bodies.get(vesselId)!;
		frame.backend.removeBody(old.handle);
		frame.bodies.delete(vesselId);
		frame.vessels = [...frame.vessels, newId].sort((a, b) => a - b);
		for (const [id, root, state] of [
			[vesselId, keepRoot, stateKeep],
			[newId, newRoot, stateNew]
		] as const) {
			createVesselBody(core, frame, id, {
				origin: partPositions.get(root)!,
				rotation: rootPose.rotation,
				linear: sub(state.velocity, frame.velocity),
				angular: rootPose.angular
			});
		}
	} else {
		// A piece that stays with a vessel standing on the ground stays on the ground (ADR 0024).
		vessel.rails = wasOnSurface
			? surfaceRails(core, vessel.com, vessel.orientation)
			: computeRails(core.body.mu, vessel.com, vessel.velocity, core.t);
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

/**
 * Apply an impact the ground contact reported (ADR 0019): a part above its tolerance is cut from
 * every neighbour (it becomes debris of its own) and, above twice the tolerance, destroyed. Emits
 * `part:damaged`. Does nothing for a part that an earlier impact of the same step already removed.
 */
export function damagePart(core: SimCore, hit: GroundImpact): void {
	if (!core.world.hasEntity(hit.part)) return;
	const def = partDefOf(core, partOf(core, hit.part));
	const outcome = impactOutcome(hit.speed, def.impactTolerance ?? DEFAULT_IMPACT_TOLERANCE);
	if (!outcome) return;
	loosePart(core, hit.part);
	core.events.emit('part:damaged', {
		vessel: hit.vessel,
		part: hit.part,
		definition: def.id,
		speed: hit.speed,
		outcome,
		cause: 'impact'
	});
	if (outcome === 'destroyed') {
		destroyVessel(core, partOf(core, hit.part).vessel, `${def.id} destroyed by impact`);
	}
}

/**
 * A part went above its `maxTemperature` (ADR 0023): it is cut from every neighbour and removed
 * (`part:damaged` with `cause: 'overheat'`, outcome `destroyed`; the vessel that held it keeps
 * its other parts as separate vessels). Does nothing if an earlier loss of the step removed it.
 */
export function burnPart(core: SimCore, hit: Overheat): void {
	if (!core.world.hasEntity(hit.part)) return;
	const def = partDefOf(core, partOf(core, hit.part));
	loosePart(core, hit.part);
	core.events.emit('part:damaged', {
		vessel: hit.vessel,
		part: hit.part,
		definition: def.id,
		speed: hit.speed,
		outcome: 'destroyed',
		cause: 'overheat',
		temperature: hit.temperature
	});
	destroyVessel(core, partOf(core, hit.part).vessel, `${def.id} destroyed by overheating`);
}

/** Cut a part from every neighbour; each remaining piece becomes a vessel of its own. */
function loosePart(core: SimCore, partId: EntityId): void {
	const part = partOf(core, partId);
	while (part.attachments.length > 0) splitVessel(core, partId, part.attachments[0]!.node, 0);
}
