/**
 * Flight frames: one physics backend plus a local frame that moves at constant velocity
 * (`bci = origin + local`, `bciVelocity = frame.velocity + localVelocity`), so Rapier's float32
 * sees small positions and small velocities (units-and-frames.md, ADR 0017). This file creates and
 * removes the (one, compound) body of each vessel, applies gravity and drag, keeps a ground tile
 * under every vessel near the ground (ADR 0019), advances the backend, reads contacts and poses back.
 */
import type {
	EntityId,
	PhysicsBackend,
	Quat,
	ShapePlacement,
	Transform,
	Vec3
} from '@orbital/core';
import { add, cross, dot, length, scale, sub } from '@orbital/kepler';
import { ambientAt } from './atmosphere.ts';
import { bodyById, type BodyRuntime } from './bodies.ts';
import { axisAreas } from './aero.ts';
import {
	CONTACT_DISTANCE,
	DEFAULT_IMPACT_TOLERANCE,
	DESTROY_FACTOR,
	DRAG_COEFFICIENT,
	GROUND_FRICTION,
	GROUND_TILE_ENTER,
	GROUND_TILE_EXIT,
	GROUND_TILE_HALF,
	PHYSICS_RANGE,
	REANCHOR_DISTANCE,
	STONE_ENTER,
	STONE_EXIT
} from './constants.ts';
import {
	designCom,
	frameOfVessel,
	isControlled,
	moduleDefOf,
	moduleState,
	partDefOf,
	partMass,
	partOf,
	vesselOf,
	type SimCore
} from './core.ts';
import { runUpdateHooks } from './hooks.ts';
import { heatInput, stepThermal, type HeatInput, type Overheat } from './thermal.ts';
import { ZERO, qConj, qMul, qRotate, uprightRotation } from './math.ts';
import { massProperties } from './mass.ts';
import { halfExtentsOf, isTurned, partRotation } from './parts.ts';
import { stepSas } from './sas.ts';
import type { FlightBody, FlightFrame, GroundTile } from './state.ts';
import {
	bodyFixedDirection,
	bodyHasStoneColliders,
	createStoneField,
	needsStones,
	placeStones,
	stoneNormalAt
} from './stones.ts';
import { groundPlane } from './terrain.ts';

export function createFrame(id: number, backend: PhysicsBackend): FlightFrame {
	return {
		id,
		backend,
		inUse: false,
		soi: '',
		origin: { x: 0, y: 0, z: 0 },
		velocity: { x: 0, y: 0, z: 0 },
		vessels: [],
		bodies: new Map(),
		tiles: new Map()
	};
}

/** Gravitational acceleration at position `r` relative to a body of parameter `mu`, m/s² (point mass, simulation.md). */
export function gravityAt(mu: number, r: Vec3): Vec3 {
	const d = length(r);
	return scale(r, -mu / (d * d * d));
}

/** The body the frame is centred on (ADR 0051). */
export const bodyOfFrame = (core: SimCore, frame: FlightFrame): BodyRuntime =>
	bodyById(core, frame.soi);

/**
 * The frame a vessel at `com` (relative to the body `soi`) should be simulated in: an active frame
 * of the same body whose origin is within `PHYSICS_RANGE`, else a free frame (taken and anchored at
 * `com` / `velocity`), else undefined.
 */
export function acquireFrame(
	core: SimCore,
	soi: string,
	com: Vec3,
	velocity: Vec3
): FlightFrame | undefined {
	const near = core.frames.find(
		(f) =>
			f.inUse && f.soi === soi && f.vessels.length > 0 && length(sub(com, f.origin)) < PHYSICS_RANGE
	);
	if (near) return near;
	const free = core.frames.find((f) => !f.inUse);
	if (!free) return undefined;
	free.inUse = true;
	free.soi = soi;
	free.origin = { ...com };
	free.velocity = { ...velocity };
	return free;
}

function releaseIfEmpty(frame: FlightFrame): void {
	if (frame.vessels.length > 0) return;
	frame.inUse = false;
	frame.bodies.clear();
	frame.tiles.clear();
}

/** Origin of a part relative to its vessel's root part, vessel body axes (constant while the vessel holds together). */
export function partOffset(core: SimCore, partId: EntityId): Vec3 {
	const part = partOf(core, partId);
	return sub(part.designPos, partOf(core, vesselOf(core, part.vessel).root).designPos);
}

export function bodyOfPart(core: SimCore, frame: FlightFrame, partId: EntityId): FlightBody {
	const body = frame.bodies.get(partOf(core, partId).vessel);
	if (!body) throw new Error(`sim: part ${partId} has no body in frame ${frame.id}`);
	return body;
}

/** Pose of a part in the frame's local axes: the body pose composed with the part's offset. */
export function partTransform(core: SimCore, frame: FlightFrame, partId: EntityId): Transform {
	const t = frame.backend.getTransform(bodyOfPart(core, frame, partId).handle);
	return {
		position: add(t.position, qRotate(t.rotation, partOffset(core, partId))),
		rotation: isTurned(partOf(core, partId))
			? qMul(t.rotation, partRotation(partOf(core, partId)))
			: t.rotation
	};
}

/** The body's centre of mass in the part frame (ADR 0045): the offset removed, the part's rotation undone. */
export function centreOfMassInPart(core: SimCore, frame: FlightFrame, partId: EntityId): Vec3 {
	const rel = sub(bodyOfPart(core, frame, partId).com, partOffset(core, partId));
	const part = partOf(core, partId);
	return isTurned(part) ? qRotate(qConj(partRotation(part)), rel) : rel;
}

/**
 * Velocity of `point` (part frame) relative to the air, in the part frame (ADR 0035): the point's
 * inertial velocity minus the co-rotating atmosphere's, `omega x r`.
 */
export function airVelocityAt(
	core: SimCore,
	frame: FlightFrame,
	partId: EntityId,
	point: Vec3
): Vec3 {
	const body = bodyOfPart(core, frame, partId);
	const m = bodyMotion(frame, body);
	const t = partTransform(core, frame, partId);
	const local = add(t.position, qRotate(t.rotation, point));
	const v = add(add(frame.velocity, m.linear), cross(m.angular, sub(local, m.centre)));
	const r = add(frame.origin, local);
	const rel = sub(v, cross({ x: 0, y: bodyOfFrame(core, frame).omega, z: 0 }, r));
	return qRotate(qConj(t.rotation), rel);
}

/**
 * Local-frame position and velocity of a body's centre of mass, and its angular velocity. The
 * velocity of a point of the rigid body is `linear + angular × (point − centre)`.
 */
export function bodyMotion(
	frame: FlightFrame,
	body: FlightBody
): { rotation: Quat; origin: Vec3; centre: Vec3; linear: Vec3; angular: Vec3 } {
	const t = frame.backend.getTransform(body.handle);
	const v = frame.backend.getVelocity(body.handle);
	return {
		rotation: t.rotation,
		origin: t.position,
		centre: add(t.position, qRotate(t.rotation, body.com)),
		linear: v.linear,
		angular: v.angular
	};
}

/** Velocity of a part's origin relative to the frame (rigid-body kinematics). */
export function partVelocity(core: SimCore, frame: FlightFrame, partId: EntityId): Vec3 {
	const m = bodyMotion(frame, bodyOfPart(core, frame, partId));
	const r = sub(partTransform(core, frame, partId).position, m.centre);
	return add(m.linear, cross(m.angular, r));
}

/**
 * The collision boxes of a vessel in body axes (origin at the root part): each part's own box
 * first, then the boxes its modules add for their current state (`ModuleDefinition.colliders`,
 * e.g. deployed landing-leg feet). `shapeParts[i]` is the part collider `i` belongs to;
 * `signature` identifies the module-contributed boxes so a change can be detected cheaply.
 */
export function collectColliders(
	core: SimCore,
	vesselId: EntityId
): { shapes: ShapePlacement[]; shapeParts: EntityId[]; signature: string } {
	const vessel = vesselOf(core, vesselId);
	const rootDesign = partOf(core, vessel.root).designPos;
	const shapes: ShapePlacement[] = [];
	const shapeParts: EntityId[] = [];
	const extras: unknown[] = [];
	for (const id of vessel.parts) {
		const part = partOf(core, id);
		const at = sub(part.designPos, rootDesign);
		const turn = isTurned(part) ? partRotation(part) : undefined;
		shapes.push({
			shape: { type: 'box', halfExtents: halfExtentsOf(partDefOf(core, part)) },
			position: at,
			...(turn ? { rotation: turn } : {})
		});
		shapeParts.push(id);
		for (const m of part.modules) {
			const colliders = moduleDefOf(core, m.id).colliders;
			if (!colliders) continue;
			for (const c of colliders(m.config, moduleState(core, id, m.id))) {
				shapes.push({
					shape: { type: 'box', halfExtents: c.halfExtents },
					position: add(at, turn ? qRotate(turn, c.offset) : c.offset),
					...(turn ? { rotation: turn } : {})
				});
				shapeParts.push(id);
				extras.push([id, c.offset, c.halfExtents]);
			}
		}
	}
	return { shapes, shapeParts, signature: JSON.stringify(extras) };
}

/**
 * Create the vessel's one rigid body (ADR 0018): a box collider per part (plus module colliders),
 * the body origin at the root part's origin `origin` (frame-local), the given `rotation`,
 * centre-of-mass velocity and angular velocity.
 */
export function createVesselBody(
	core: SimCore,
	frame: FlightFrame,
	vesselId: EntityId,
	pose: { origin: Vec3; rotation: Quat; linear: Vec3; angular: Vec3 },
	restored?: {
		mass: number;
		centerOfMass: Vec3;
		inertia: Vec3;
		inertiaFrame: Quat;
		masses: Map<EntityId, number>;
	}
): void {
	const vessel = vesselOf(core, vesselId);
	const rootDesign = partOf(core, vessel.root).designPos;
	// A resumed body gets the mass properties the saved backend body had (`restored`), which can
	// lag the parts' current masses by one step; `updateMassProperties` pushes the difference.
	const mp = restored ?? massProperties(core, vessel.parts, rootDesign);
	const colliders = collectColliders(core, vesselId);
	const handle = frame.backend.createBody({
		shape: { type: 'compound', shapes: colliders.shapes },
		mass: mp.mass,
		inertia: mp.inertia,
		centerOfMass: mp.centerOfMass,
		inertiaFrame: mp.inertiaFrame,
		position: pose.origin,
		rotation: pose.rotation,
		linearVelocity: pose.linear,
		angularVelocity: pose.angular,
		friction: GROUND_FRICTION,
		restitution: 0
	});
	frame.bodies.set(vesselId, {
		handle,
		mass: mp.mass,
		com: mp.centerOfMass,
		inertia: mp.inertia,
		inertiaFrame: mp.inertiaFrame,
		masses: restored?.masses ?? new Map(vessel.parts.map((id) => [id, partMass(core, id)])),
		shapeParts: colliders.shapeParts,
		signature: colliders.signature
	});
}

/**
 * Rebuild a flight vessel's body when the boxes its modules contribute changed (a landing leg
 * deployed). Same pose and motion; call between steps, never with forces queued (ADR 0019).
 */
export function refreshColliders(core: SimCore, vesselId: EntityId): void {
	const frame = frameOfVessel(core, vesselId);
	const body = frame?.bodies.get(vesselId);
	if (!frame || !body) return;
	if (collectColliders(core, vesselId).signature === body.signature) return;
	const m = bodyMotion(frame, body);
	frame.backend.removeBody(body.handle);
	frame.bodies.delete(vesselId);
	createVesselBody(core, frame, vesselId, {
		origin: m.origin,
		rotation: m.rotation,
		linear: m.linear,
		angular: m.angular
	});
}

/**
 * Create the vessel's body at its pose (centre of mass `vessel.com`, at rest relative to its
 * velocity, turning at `angular` rad/s in the inertial axes: the planet's rotation for a vessel
 * woken from surface rails, so it does not start rotating against the ground, ADR 0024).
 */
export function enterFlight(
	core: SimCore,
	vesselId: EntityId,
	frame: FlightFrame,
	angular: Vec3 = ZERO
): void {
	const vessel = vesselOf(core, vesselId);
	const comDesign = designCom(core, vessel.parts);
	const rootDesign = partOf(core, vessel.root).designPos;
	const origin = sub(vessel.com, qRotate(vessel.orientation, sub(comDesign, rootDesign)));
	createVesselBody(core, frame, vesselId, {
		origin: sub(origin, frame.origin),
		rotation: vessel.orientation,
		linear: sub(vessel.velocity, frame.velocity),
		angular
	});
	frame.vessels = [...frame.vessels, vesselId].sort((a, b) => a - b);
	vessel.mode = 'flight';
	vessel.rails = null;
	vessel.idle = 0;
}

/** Remove the vessel's body from its frame. */
export function leaveFlight(core: SimCore, vesselId: EntityId): void {
	const frame = frameOfVessel(core, vesselId);
	if (!frame) return;
	const body = frame.bodies.get(vesselId);
	if (body) frame.backend.removeBody(body.handle);
	frame.bodies.delete(vesselId);
	removeTile(frame, vesselId);
	frame.vessels = frame.vessels.filter((v) => v !== vesselId);
	releaseIfEmpty(frame);
}

/** Refresh the cached centre of mass, velocity and orientation of a flight vessel from its body. */
export function refreshPose(core: SimCore, frame: FlightFrame, vesselId: EntityId): void {
	const vessel = vesselOf(core, vesselId);
	const m = bodyMotion(frame, frame.bodies.get(vesselId)!);
	vessel.com = add(frame.origin, m.centre);
	vessel.velocity = add(frame.velocity, m.linear);
	vessel.orientation = m.rotation;
}

/** Masses, gravity, module updates and drag for every vessel in the frame (forces for the next backend step). */
export function prepareFrame(core: SimCore, frame: FlightFrame, dt: number): Overheat[] {
	const { backend } = frame;
	const planet = bodyOfFrame(core, frame);
	const overheated: Overheat[] = [];
	for (const vesselId of frame.vessels.slice()) {
		const vessel = vesselOf(core, vesselId);
		core.active.delete(vesselId);
		const body = frame.bodies.get(vesselId)!;
		updateMassProperties(core, frame, vessel.parts, vesselId, body);
		// Point-mass gravity at the centre of mass (the gradient across a vessel is negligible).
		const motion = bodyMotion(frame, body);
		const centre = add(frame.origin, motion.centre);
		backend.applyForce(body.handle, scale(gravityAt(planet.mu, centre), body.mass));
		updateTile(core, frame, planet, vesselId, centre);
		stepSas(core, frame, vesselId, body, dt);
		runUpdateHooks(core, vesselId, dt);
		overheated.push(...stepThermal(core, vesselId, applyDrag(core, frame, vesselId), dt));
	}
	return overheated;
}

/** Push mass, centre of mass and inertia to the backend when any part's mass changed (propellant flow). */
function updateMassProperties(
	core: SimCore,
	frame: FlightFrame,
	parts: readonly EntityId[],
	vesselId: EntityId,
	body: FlightBody
): void {
	let changed = false;
	for (const id of parts) {
		if (partMass(core, id) !== body.masses.get(id)) {
			changed = true;
			break;
		}
	}
	if (!changed) return;
	const rootDesign = partOf(core, vesselOf(core, vesselId).root).designPos;
	const mp = massProperties(core, parts, rootDesign);
	frame.backend.setMass(body.handle, mp.mass, mp.inertia, {
		centerOfMass: mp.centerOfMass,
		inertiaFrame: mp.inertiaFrame
	});
	body.mass = mp.mass;
	body.com = mp.centerOfMass;
	body.inertia = mp.inertia;
	body.inertiaFrame = mp.inertiaFrame;
	for (const id of parts) body.masses.set(id, partMass(core, id));
}

/** Drag on every part; returns the heat the same airflow puts on each part (ADR 0023). */
function applyDrag(
	core: SimCore,
	frame: FlightFrame,
	vesselId: EntityId
): Map<EntityId, HeatInput> {
	const heat = new Map<EntityId, HeatInput>();
	const planet = bodyOfFrame(core, frame);
	const body = planet.def;
	if (!body.atmosphere) return heat;
	const omega = { x: 0, y: planet.omega, z: 0 };
	const vessel = vesselOf(core, vesselId);
	const flight = frame.bodies.get(vesselId)!;
	const motion = bodyMotion(frame, flight); // one backend read for the whole vessel
	const rootDesign = partOf(core, vessel.root).designPos;
	for (const partId of vessel.parts) {
		const part = partOf(core, partId);
		const pose = {
			position: add(motion.origin, qRotate(motion.rotation, sub(part.designPos, rootDesign))),
			rotation: motion.rotation
		};
		const r = add(frame.origin, pose.position);
		const { density } = ambientAt(body, length(r) - body.radius);
		if (density === 0) continue;
		const v = add(
			add(frame.velocity, motion.linear),
			cross(motion.angular, sub(pose.position, motion.centre))
		);
		const rel = sub(v, cross(omega, r));
		const turned = isTurned(part) ? qMul(pose.rotation, partRotation(part)) : pose.rotation;
		const local = qRotate(qConj(turned), rel);
		const def = partDefOf(core, part);
		const covered = { top: false, bottom: false };
		for (const att of part.attachments) {
			const dirY = def.attach?.[att.node]?.dir[1] ?? 0;
			if (dirY > 0.5) covered.top = true;
			else if (dirY < -0.5) covered.bottom = true;
		}
		const area = axisAreas(def.shape, local.y, covered);
		const k = -0.5 * density * (def.dragCoefficient ?? DRAG_COEFFICIENT);
		const force = {
			x: k * area.x * Math.abs(local.x) * local.x,
			y: k * area.y * Math.abs(local.y) * local.y,
			z: k * area.z * Math.abs(local.z) * local.z
		};
		frame.backend.applyForce(flight.handle, qRotate(turned, force), pose.position);
		heat.set(partId, heatInput(density, def.shape, area, local));
	}
	return heat;
}

/** A part that hit the ground harder than its tolerance (ADR 0019). */
export interface GroundImpact {
	vessel: EntityId;
	part: EntityId;
	/** Closing speed along the ground normal, m/s. */
	speed: number;
}

function removeTile(frame: FlightFrame, vesselId: EntityId): void {
	const tile = frame.tiles.get(vesselId);
	if (!tile) return;
	if (tile.stones) frame.backend.removeBody(tile.stones.handle);
	frame.backend.removeBody(tile.handle);
	frame.tiles.delete(vesselId);
}

/**
 * Keep the ground tile of one vessel under it (ADR 0019, ADR 0043): created when the centre of mass
 * comes within `GROUND_TILE_ENTER` of the ground, removed above `GROUND_TILE_EXIT`. The ground is
 * the terrain under the centre of mass (the reference sphere without terrain): the tile's top face
 * is the tangent plane of the terrain on the radial of the centre of mass, with its slope, and it
 * moves with the rotating ground (velocity relative to the frame, plus the planet's angular
 * velocity) so friction sees the ground as it is.
 */
function updateTile(
	core: SimCore,
	frame: FlightFrame,
	planet: BodyRuntime,
	vesselId: EntityId,
	centre: Vec3
): void {
	const radius = planet.def.radius;
	const d = length(centre);
	let tile = frame.tiles.get(vesselId);
	// Only a vessel low enough to meet the highest ground pays for a height evaluation.
	const sphereAltitude = d - radius;
	const reach = GROUND_TILE_EXIT + (planet.terrain?.maxHeight ?? 0);
	if (sphereAltitude > reach) {
		removeTile(frame, vesselId);
		return;
	}
	const plane = groundPlane(core, planet, centre);
	const altitude = d - radius - plane.height;
	if (altitude > GROUND_TILE_EXIT || (!tile && altitude > GROUND_TILE_ENTER)) {
		removeTile(frame, vesselId);
		return;
	}
	const up = plane.normal;
	const surface = plane.point;
	const position = sub(surface, frame.origin);
	const rotation = uprightRotation(up);
	const omega = { x: 0, y: planet.omega, z: 0 };
	const linear = sub(cross(omega, surface), frame.velocity);
	if (!tile) {
		const handle = frame.backend.createBody({
			kind: 'kinematic',
			shape: {
				type: 'compound',
				shapes: [
					{
						shape: { type: 'box', halfExtents: GROUND_TILE_HALF },
						position: { x: 0, y: -GROUND_TILE_HALF.y, z: 0 }
					}
				]
			},
			mass: 1,
			inertia: { x: 1, y: 1, z: 1 },
			position,
			rotation,
			linearVelocity: linear,
			angularVelocity: omega,
			friction: GROUND_FRICTION,
			restitution: 0
		});
		tile = { handle, up };
		frame.tiles.set(vesselId, tile);
	} else {
		frame.backend.setTransform(tile.handle, { position, rotation });
		frame.backend.setVelocity(tile.handle, { linear, angular: omega });
		tile.up = up;
	}
	updateStones(core, frame, planet, tile, centre, altitude, plane.height);
}

/**
 * Keep the stone colliders of a vessel low over an airless body's ground (plan 060, ADR 0092):
 * built when the centre of mass is within `STONE_ENTER` of the terrain, rebuilt when it has moved
 * `STONE_REFRESH` from where they were built, dropped above `STONE_EXIT`.
 */
function updateStones(
	core: SimCore,
	frame: FlightFrame,
	planet: BodyRuntime,
	tile: GroundTile,
	centre: Vec3,
	altitude: number,
	groundHeight: number
): void {
	if (!bodyHasStoneColliders(planet)) return;
	let field = tile.stones;
	if (altitude > STONE_EXIT || (!field && altitude > STONE_ENTER)) {
		if (field) frame.backend.removeBody(field.handle);
		tile.stones = undefined;
		return;
	}
	const dir = bodyFixedDirection(core, planet, centre);
	if (needsStones(field, dir, planet.def.radius)) {
		if (field) frame.backend.removeBody(field.handle);
		field = createStoneField(frame.backend, planet, dir, groundHeight);
		tile.stones = field;
	}
	if (field) placeStones(core, frame, planet, field);
}

/**
 * Read the contacts of every vessel with its ground tile after a step: `landed`, and the parts
 * whose impact speed exceeds their tolerance. The impact speed is the closing speed of the contact
 * point against the ground, from the velocities *before* the step (`before`): the step in which
 * the contact appears is the one that absorbs the approach speed.
 */
function groundContacts(
	core: SimCore,
	frame: FlightFrame,
	before: Map<EntityId, ReturnType<typeof bodyMotion>>
): GroundImpact[] {
	const impacts: GroundImpact[] = [];
	const omega = { x: 0, y: bodyOfFrame(core, frame).omega, z: 0 };
	for (const vesselId of frame.vessels) {
		const vessel = vesselOf(core, vesselId);
		vessel.landed = false;
		const tile = frame.tiles.get(vesselId);
		const prior = before.get(vesselId);
		if (!tile || !prior) continue;
		const body = frame.bodies.get(vesselId)!;
		const touching = frame.backend
			.contacts(body.handle, tile.handle)
			.filter((c) => c.distance <= CONTACT_DISTANCE);
		// A stone's surface is not the tile's plane: its contacts close along the sphere's normal there.
		const onStones = tile.stones
			? frame.backend
					.contacts(body.handle, tile.stones.handle)
					.filter((c) => c.distance <= CONTACT_DISTANCE)
			: [];
		if (touching.length === 0 && onStones.length === 0) continue;
		vessel.landed = true;
		const centre = bodyMotion(frame, body).centre;
		const speeds = new Map<EntityId, number>();
		const points = [
			...touching.map((c) => ({ c, normal: tile.up })),
			...onStones.map((c) => ({ c, normal: stoneNormalAt(tile.stones!, c.point) ?? tile.up }))
		];
		for (const { c, normal } of points) {
			const v = add(prior.linear, cross(prior.angular, sub(c.point, centre)));
			const ground = sub(cross(omega, add(frame.origin, c.point)), frame.velocity);
			const closing = -dot(sub(v, ground), normal);
			const part = body.shapeParts[c.shape]!;
			if (closing > (speeds.get(part) ?? 0)) speeds.set(part, closing);
		}
		for (const part of [...speeds.keys()].sort((a, b) => a - b)) {
			const speed = speeds.get(part)!;
			const tolerance =
				partDefOf(core, partOf(core, part)).impactTolerance ?? DEFAULT_IMPACT_TOLERANCE;
			if (speed > tolerance) impacts.push({ vessel: vesselId, part, speed });
		}
	}
	return impacts;
}

/** Outcome of an impact at `speed` for a part with `tolerance`; undefined when it survives. */
export function impactOutcome(
	speed: number,
	tolerance: number
): 'broken' | 'destroyed' | undefined {
	if (speed <= tolerance) return undefined;
	return speed > tolerance * DESTROY_FACTOR ? 'destroyed' : 'broken';
}

/**
 * Advance the backend one step, then post-process: ground contacts are read (`landed`, impacts
 * above a part's tolerance are returned for the caller to apply), the frame origin moves with the
 * frame, the frame re-anchors when the focus vessel has drifted away from the origin, and vessel
 * poses are refreshed.
 */
export function advanceFrame(core: SimCore, frame: FlightFrame, dt: number): GroundImpact[] {
	const before = new Map<EntityId, ReturnType<typeof bodyMotion>>();
	for (const id of frame.tiles.keys()) before.set(id, bodyMotion(frame, frame.bodies.get(id)!));
	frame.backend.step(dt);
	const impacts = groundContacts(core, frame, before);
	frame.origin = add(frame.origin, scale(frame.velocity, dt));
	for (const id of frame.vessels) refreshPose(core, frame, id);
	reanchor(core, frame);
	return impacts;
}

/** Re-centre the frame on its focus vessel when it has drifted more than REANCHOR_DISTANCE. */
function reanchor(core: SimCore, frame: FlightFrame): void {
	const focusId =
		frame.vessels.find((id) => isControlled(core, vesselOf(core, id))) ?? frame.vessels[0];
	if (focusId === undefined) return;
	const focus = vesselOf(core, focusId);
	const rootPos = partTransform(core, frame, focus.root).position;
	if (length(rootPos) <= REANCHOR_DISTANCE) return;
	const rootVel = partVelocity(core, frame, focus.root);
	for (const { handle } of frame.bodies.values()) {
		const t = frame.backend.getTransform(handle);
		const v = frame.backend.getVelocity(handle);
		frame.backend.setTransform(handle, {
			position: sub(t.position, rootPos),
			rotation: t.rotation
		});
		frame.backend.setVelocity(handle, { linear: sub(v.linear, rootVel), angular: v.angular });
	}
	frame.origin = add(frame.origin, rootPos);
	frame.velocity = add(frame.velocity, rootVel);
}

/** Pose of one part in BCI: position (origin + local) and absolute orientation. */
export function partPose(
	core: SimCore,
	frame: FlightFrame,
	part: EntityId
): { position: Vec3; rotation: Quat } {
	const t = partTransform(core, frame, part);
	return { position: add(frame.origin, t.position), rotation: t.rotation };
}
