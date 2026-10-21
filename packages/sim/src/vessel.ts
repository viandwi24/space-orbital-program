/**
 * Vessel lifecycle: assembly from a resolved design, placement, splitting at a node (staging) and
 * destruction. Vessels and parts are world entities holding plain-data components (state.ts).
 */
import { restoreUndocked } from './docking.ts';
import {
	cloneData,
	debrisName,
	parseModuleConfig,
	splitName,
	SURFACE_NODE,
	type EntityId,
	type Quat,
	type ResolvedDesign,
	type Vec3,
	type VesselDesign,
	withSettings
} from '@orbital/core';
import { add, cross, normalize, scale, sub } from '@orbital/kepler';
import { bodyOfVessel, rotationAt, spinAt } from './bodies.ts';
import {
	designCom,
	frameOfVessel,
	isControlled,
	moduleDefOf,
	moduleState,
	partDefOf,
	partMass,
	partOf,
	totalMass,
	vesselNames,
	vesselOf,
	type SimCore
} from './core.ts';
import { cheatOn } from './cheats.ts';
import { loseCrew } from './crew.ts';
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
import { halfExtentsOf, partRotation } from './parts.ts';
import { groundPlane } from './terrain.ts';
import {
	moduleStateToken,
	newSas,
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
		const settings = design.parts.find((p) => p.index === rp.index)?.settings;
		for (const [moduleId, base] of rp.definition.modules ?? []) {
			const def = moduleDefOf(core, moduleId);
			// per-part settings of the design (plan 219, ADR 0224) over the definition's config
			const raw = withSettings(base, settings?.[moduleId]);
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
			yaw: rp.yaw,
			...(rp.tilted ? { rotation: rp.rotation } : {}),
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
	for (const rp of resolved.parts) {
		if (!rp.link) continue;
		partOf(core, byIndex.get(rp.index)!).link = {
			peer: byIndex.get(rp.link.index)!,
			point: rp.link.point
		};
	}
	const parts = resolved.parts.map((rp) => byIndex.get(rp.index)!);
	const state: VesselState = {
		name: design.name,
		design: cloneData(design),
		mode: 'on-rails',
		soi: core.root.def.id,
		root: byIndex.get(resolved.root)!,
		parts,
		control: { throttle: 0, pitch: 0, roll: 0, yaw: 0 },
		sas: newSas(),
		nodes: [],
		target: null,
		stages: design.stages.map((stage) => stage.map((i) => byIndex.get(i)!)),
		...(design.groups && design.groups.length > 0
			? {
					groups: design.groups.map((g) => ({
						slot: g.slot,
						label: g.label,
						members: g.members.map((m) => ({
							part: byIndex.get(m.part)!,
							module: m.module,
							action: m.action
						}))
					}))
				}
			: {}),
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

/** Half the extent of the part's collision box along the vessel's Y axis (its own y half extent unless tilted). */
function verticalExtent(core: SimCore, part: PartState): number {
	const h = halfExtentsOf(partDefOf(core, part));
	if (!part.rotation) return h.y;
	// Row 1 of the rotation matrix of the part's quaternion.
	const { x, y, z, w } = part.rotation;
	return (
		Math.abs(2 * (x * y + z * w)) * h.x +
		Math.abs(1 - 2 * (x * x + z * z)) * h.y +
		Math.abs(2 * (y * z - x * w)) * h.z
	);
}

/** Half extent along the design's Z of a box of half extents `h` turned by `rotation` (row 2 of its matrix). */
function zExtent(h: Vec3, rotation: Quat | undefined): number {
	if (!rotation) return h.z;
	const { x, y, z, w } = rotation;
	return (
		Math.abs(2 * (x * z - y * w)) * h.x +
		Math.abs(2 * (y * z + x * w)) * h.y +
		Math.abs(1 - 2 * (x * x + y * y)) * h.z
	);
}

/**
 * Lowest design-frame point along -Z: the side an aircraft rests on when it lies level (plan 063,
 * ADR 0161 point 3), parts' boxes and their modules' boxes (wheels) turned with the part.
 */
function lowestAlongZ(core: SimCore, parts: readonly EntityId[]): number {
	let lowest = Infinity;
	for (const id of parts) {
		const p = partOf(core, id);
		lowest = Math.min(
			lowest,
			p.designPos.z - zExtent(halfExtentsOf(partDefOf(core, p)), p.rotation)
		);
		for (const m of p.modules) {
			const colliders = moduleDefOf(core, m.id).colliders;
			if (!colliders) continue;
			for (const c of colliders(m.config, moduleState(core, id, m.id))) {
				const at = p.rotation ? qRotate(p.rotation, c.offset) : c.offset;
				lowest = Math.min(lowest, p.designPos.z + at.z - zExtent(c.halfExtents, p.rotation));
			}
		}
	}
	return lowest;
}

/** Lowest design-frame point of the vessel along its +Y axis (negative or zero for a standing stack). */
function lowestPoint(core: SimCore, parts: readonly EntityId[]): number {
	let lowest = Infinity;
	for (const id of parts) {
		const p = partOf(core, id);
		lowest = Math.min(lowest, p.designPos.y - verticalExtent(core, p));
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
 * `level` (an aircraft, plan 063, ADR 0161 point 3) lays it down instead: nose (+Y) north, +Z up,
 * resting on its lowest point along -Z.
 */
export function placeOnSurface(
	core: SimCore,
	vesselId: EntityId,
	latitude: number,
	longitude: number,
	level = false
): void {
	const vessel = vesselOf(core, vesselId);
	const body = bodyOfVessel(core, vessel);
	const radial = qRotate(rotationAt(body, core.t), {
		x: Math.cos(latitude) * Math.cos(longitude),
		y: Math.sin(latitude),
		z: -Math.cos(latitude) * Math.sin(longitude)
	});
	// On terrain (ADR 0043) the vessel stands on the ground plane under it, nose along its normal
	// (a lander on a hillside, not a stack falling over onto it); on the sphere and in the flat
	// zone around the launch site the normal is the radial and nothing changes.
	const ground = groundPlane(core, body, radial);
	const up = ground.normal;
	const eastRaw = cross({ x: 0, y: 1, z: 0 }, up);
	const east =
		Math.hypot(eastRaw.x, eastRaw.y, eastRaw.z) > 1e-9 ? normalize(eastRaw) : { x: 0, y: 0, z: -1 };
	const rootDesign = partOf(core, vessel.root).designPos;
	let rootOrigin: Vec3;
	if (level) {
		const north = cross(up, east);
		vessel.orientation = qFromBasis(cross(north, up), north, up);
		rootOrigin = add(ground.point, scale(up, rootDesign.z - lowestAlongZ(core, vessel.parts)));
	} else {
		vessel.orientation = qFromBasis(east, up, cross(east, up));
		rootOrigin = add(ground.point, scale(up, rootDesign.y - lowestPoint(core, vessel.parts)));
	}
	const offset = qRotate(vessel.orientation, sub(designCom(core, vessel.parts), rootDesign));
	vessel.com = add(rootOrigin, offset);
	vessel.velocity = cross(spinAt(body, core.t), vessel.com);
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

/**
 * Unit vector, body axes, from `part` towards the peer across `node`: the node's direction turned
 * by the part's yaw, or for the reserved surface node the horizontal direction to the peer.
 */
function separationDirection(core: SimCore, part: PartState, node: string, peer: PartState): Vec3 {
	if (node === SURFACE_NODE) {
		const d = {
			x: peer.designPos.x - part.designPos.x,
			y: 0,
			z: peer.designPos.z - part.designPos.z
		};
		return normalize(d);
	}
	const dir = fromTuple(partDefOf(core, part).attach![node]!.dir);
	return qRotate(partRotation(part), dir);
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
	// Every attachment on the node is cut (only the reserved `surface` node hosts several, ADR 0034).
	let last: EntityId | undefined;
	const peers = partOf(core, partId)
		.attachments.filter((a) => a.node === node)
		.map((a) => a.peer)
		.sort((a, b) => a - b);
	for (const peer of peers) last = splitAt(core, partId, node, peer, impulse) ?? last;
	return last;
}

function splitAt(
	core: SimCore,
	partId: EntityId,
	node: string,
	peerOf: EntityId,
	impulse: number
): EntityId | undefined {
	const part = partOf(core, partId);
	const att = part.attachments.find((a) => a.node === node && a.peer === peerOf);
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
			// the part's mass sits at its `centerOfMass` offset (plan 265)
			const off = partDefOf(core, partOf(core, id)).centerOfMass;
			const turn = partTransform(core, frame, id).rotation;
			const away = off ? qRotate(turn, { x: off[0], y: off[1], z: off[2] }) : { x: 0, y: 0, z: 0 };
			m += mass;
			c = add(c, scale(add(add(frame.origin, partPositions.get(id)!), away), mass));
			const spin = rootPose ? cross(rootPose.angular, away) : { x: 0, y: 0, z: 0 };
			v = add(v, scale(add(add(frame.velocity, partVelocity(core, frame, id)), spin), mass));
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

	// A strut or fuel line whose two ends end up on different sides is cut (ADR 0071).
	for (const side of [keepSide, newSide]) {
		for (const id of side) {
			const link = partOf(core, id).link;
			if (link && !side.includes(link.peer)) delete partOf(core, id).link;
		}
	}

	// Equal and opposite momentum along the node direction (pointing from `part` towards `peer`).
	if (impulse > 0) {
		const q = rootPose ? rootPose.rotation : vessel.orientation;
		const dir = qRotate(q, separationDirection(core, part, node, partOf(core, peerId)));
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
		// one "debris" tail, or a number for a side that can be flown (ADR 0252)
		name: (controlled(newSide) ? splitName : debrisName)(vessel.name, vesselNames(core)),
		...(vessel.design ? { design: vessel.design } : {}),
		...(vessel.launchedAt !== undefined ? { launchedAt: vessel.launchedAt } : {}),
		mode: vessel.mode,
		soi: vessel.soi,
		root: newRoot,
		parts: newSide,
		control: { throttle: 0, pitch: 0, roll: 0, yaw: 0 },
		sas: structuredClone(vessel.sas),
		nodes: [],
		target: null,
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
	if (vessel.nodes.length > 0 && !isControlled(core, vessel) && isControlled(core, newState)) {
		// The maneuver nodes belong to the side that can still be flown (plan 045).
		newState.nodes = vessel.nodes;
		vessel.nodes = [];
		// The target goes with them: it is the flyable side that rendezvouses (plan 035).
		newState.target = vessel.target;
		vessel.target = null;
	}
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
			? surfaceRails(core, bodyOfVessel(core, vessel), vessel.com, vessel.orientation)
			: computeRails(
					bodyOfVessel(core, vessel).mu,
					vessel.com,
					vessel.velocity,
					core.t,
					core.info.gravityModel
				);
		newState.rails = computeRails(
			bodyOfVessel(core, vessel).mu,
			newState.com,
			newState.velocity,
			core.t,
			core.info.gravityModel
		);
	}
	if (vessel.controlPart !== undefined && !keepSet.has(vessel.controlPart)) {
		newState.controlPart = vessel.controlPart;
		delete vessel.controlPart;
	}
	core.events.emit('vessel:created', { vessel: newId, from: vesselId });
	// an undock gives the docked side its name and design back (plan 222, ADR 0218)
	restoreUndocked(core, vesselId, newId, partId, peerId);
	// each side's design indices (plan 221, ADR 0208 point 1): the host's records follow them
	const kept = (ids: readonly EntityId[]) =>
		ids.map((id) => partOf(core, id).index).sort((a, b) => a - b);
	core.events.emit('vessel:split', {
		parent: vesselId,
		vessel: newId,
		parentParts: kept(keepSide),
		parts: kept(newSide)
	});
	return newId;
}

/**
 * Apply the detach requests hooks queued. One request is a plain split. Several in one pass (the
 * radial decouplers of a stage) are separated as if simultaneous: every cut's impulse is worked
 * out against the vessel as it was before any of them, so boosters leave with equal speeds and
 * the recoils add up on the rest, instead of the later boosters inheriting the earlier recoil.
 */
export function processPending(core: SimCore): void {
	while (core.pending.length > 0) {
		const queue = core.pending;
		core.pending = [];
		const live = queue.filter((r) => core.world.hasEntity(r.part));
		if (live.length <= 1) {
			for (const req of live) splitVessel(core, req.part, req.node, req.impulse);
			continue;
		}
		const kicks = live.flatMap((req) => plannedKicks(core, req));
		for (const req of live) {
			if (core.world.hasEntity(req.part)) splitVessel(core, req.part, req.node, 0);
		}
		applyKicks(core, kicks);
	}
}

/** The change of velocity a cut gives every part of each of its two sides, from the pre-cut graph. */
function plannedKicks(
	core: SimCore,
	req: { part: EntityId; node: string; impulse: number }
): Array<{ parts: EntityId[]; dv: Vec3 }> {
	if (req.impulse <= 0) return [];
	const part = partOf(core, req.part);
	const vessel = vesselOf(core, part.vessel);
	const q = orientationOf(core, vessel);
	const out: Array<{ parts: EntityId[]; dv: Vec3 }> = [];
	for (const att of part.attachments.filter((a) => a.node === req.node)) {
		const sideP = componentWithout(core, req.part, req.part, att.peer);
		const sideQ = componentWithout(core, att.peer, req.part, att.peer);
		const dir = qRotate(q, separationDirection(core, part, req.node, partOf(core, att.peer)));
		out.push(
			{ parts: sideQ, dv: scale(dir, req.impulse / totalMass(core, sideQ)) },
			{ parts: sideP, dv: scale(dir, -req.impulse / totalMass(core, sideP)) }
		);
	}
	return out;
}

/** Entities reachable from `start` without crossing the edge between `a` and `b`. */
function componentWithout(core: SimCore, start: EntityId, a: EntityId, b: EntityId): EntityId[] {
	const seen = new Set<EntityId>([start]);
	const order = [start];
	for (let head = 0; head < order.length; head++) {
		const here = order[head]!;
		for (const att of partOf(core, here).attachments) {
			if ((here === a && att.peer === b) || (here === b && att.peer === a)) continue;
			if (!seen.has(att.peer)) {
				seen.add(att.peer);
				order.push(att.peer);
			}
		}
	}
	return order.sort((x, y) => x - y);
}

/** Add the planned velocity changes to the vessels the parts ended up in. */
function applyKicks(core: SimCore, kicks: Array<{ parts: EntityId[]; dv: Vec3 }>): void {
	const perVessel = new Map<EntityId, Vec3>();
	for (const kick of kicks) {
		// Every part of a side sits in one final vessel (the sides are unions of final components).
		const seen = new Set<EntityId>();
		for (const id of kick.parts) {
			if (!core.world.hasEntity(id)) continue;
			const vesselId = partOf(core, id).vessel;
			if (seen.has(vesselId)) continue;
			seen.add(vesselId);
			perVessel.set(vesselId, add(perVessel.get(vesselId) ?? { x: 0, y: 0, z: 0 }, kick.dv));
		}
	}
	for (const [vesselId, dv] of [...perVessel].sort((a, b) => a[0] - b[0])) {
		const vessel = vesselOf(core, vesselId);
		const frame = frameOfVessel(core, vesselId);
		const body = frame?.bodies.get(vesselId);
		if (frame && body) {
			const v = frame.backend.getVelocity(body.handle);
			frame.backend.setVelocity(body.handle, { linear: add(v.linear, dv), angular: v.angular });
			vessel.velocity = add(vessel.velocity, dv);
		} else if (vessel.rails && vessel.rails.kind !== 'surface' && vessel.rails.kind !== 'frozen') {
			vessel.velocity = add(vessel.velocity, dv);
			vessel.rails = computeRails(
				bodyOfVessel(core, vessel).mu,
				vessel.com,
				vessel.velocity,
				core.t,
				core.info.gravityModel
			);
		}
	}
}

/** Remove a vessel and its parts from the world and the physics frame. */
export function destroyVessel(core: SimCore, vesselId: EntityId, reason: string): void {
	const vessel = vesselOf(core, vesselId);
	leaveFlight(core, vesselId);
	if (reason !== 'recovered') loseCrew(core, vesselId); // the death rule (plan 106, ADR 0176 point 7)
	for (const id of vessel.parts) core.world.destroyEntity(id);
	core.world.destroyEntity(vesselId);
	core.science.cache.delete(vesselId);
	core.events.emit('vessel:destroyed', { vessel: vesselId, reason });
}

/**
 * Apply an impact the ground contact reported (ADR 0019): a part above its tolerance is cut from
 * every neighbour (it becomes debris of its own) and, above twice the tolerance, destroyed. Emits
 * `part:damaged`. Does nothing for a part that an earlier impact of the same step already removed.
 */
export function damagePart(core: SimCore, hit: GroundImpact): void {
	if (!core.world.hasEntity(hit.part)) return;
	if (cheatOn(core, 'no-crash-damage')) return;
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
	if (cheatOn(core, 'ignore-temperature')) return;
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
