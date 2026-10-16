/**
 * Flight frames: one physics backend plus a local frame that moves at constant velocity
 * (`bci = origin + local`, `bciVelocity = frame.velocity + localVelocity`), so Rapier's float32
 * sees small positions and small velocities (units-and-frames.md, ADR 0017). This file creates and
 * removes the (one, compound) body of each vessel, applies gravity, drag and ground contact, advances the backend and
 * reads poses back.
 */
import type { EntityId, PhysicsBackend, Quat, Transform, Vec3 } from '@orbital/core';
import { add, cross, dot, length, scale, sub } from '@orbital/kepler';
import { ambientAt } from './atmosphere.ts';
import { axisAreas } from './aero.ts';
import { CRASH_SPEED, DRAG_COEFFICIENT, PHYSICS_RANGE, REANCHOR_DISTANCE } from './constants.ts';
import {
	designCom,
	frameOfVessel,
	isControlled,
	partDefOf,
	partMass,
	partOf,
	totalMass,
	vesselOf,
	type SimCore
} from './core.ts';
import { runUpdateHooks } from './hooks.ts';
import { ZERO, qAboutY, qConj, qMul, qRotate } from './math.ts';
import { massProperties } from './mass.ts';
import { halfExtentsOf } from './parts.ts';
import type { FlightBody, FlightFrame } from './state.ts';

export function createFrame(id: number, backend: PhysicsBackend): FlightFrame {
	return {
		id,
		backend,
		inUse: false,
		origin: { x: 0, y: 0, z: 0 },
		velocity: { x: 0, y: 0, z: 0 },
		vessels: [],
		bodies: new Map()
	};
}

/** Gravitational acceleration at BCI position `r`, m/s² (point mass, simulation.md). */
export function gravityAt(core: SimCore, r: Vec3): Vec3 {
	const d = length(r);
	return scale(r, -core.body.mu / (d * d * d));
}

/**
 * The frame a vessel at `com` should be simulated in: an active frame whose origin is within
 * `PHYSICS_RANGE`, else a free frame (taken and anchored at `com` / `velocity`), else undefined.
 */
export function acquireFrame(core: SimCore, com: Vec3, velocity: Vec3): FlightFrame | undefined {
	const near = core.frames.find(
		(f) => f.inUse && f.vessels.length > 0 && length(sub(com, f.origin)) < PHYSICS_RANGE
	);
	if (near) return near;
	const free = core.frames.find((f) => !f.inUse);
	if (!free) return undefined;
	free.inUse = true;
	free.origin = { ...com };
	free.velocity = { ...velocity };
	return free;
}

function releaseIfEmpty(frame: FlightFrame): void {
	if (frame.vessels.length > 0) return;
	frame.inUse = false;
	frame.bodies.clear();
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
		rotation: t.rotation
	};
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
 * Create the vessel's one rigid body (ADR 0018): a box collider per part, the body origin at the
 * root part's origin `origin` (frame-local), the given `rotation`, centre-of-mass velocity and
 * angular velocity.
 */
export function createVesselBody(
	core: SimCore,
	frame: FlightFrame,
	vesselId: EntityId,
	pose: { origin: Vec3; rotation: Quat; linear: Vec3; angular: Vec3 }
): void {
	const vessel = vesselOf(core, vesselId);
	const rootDesign = partOf(core, vessel.root).designPos;
	const mp = massProperties(core, vessel.parts, rootDesign);
	const handle = frame.backend.createBody({
		shape: {
			type: 'compound',
			shapes: vessel.parts.map((id) => {
				const part = partOf(core, id);
				return {
					shape: { type: 'box' as const, halfExtents: halfExtentsOf(partDefOf(core, part)) },
					position: sub(part.designPos, rootDesign)
				};
			})
		},
		mass: mp.mass,
		inertia: mp.inertia,
		centerOfMass: mp.centerOfMass,
		inertiaFrame: mp.inertiaFrame,
		position: pose.origin,
		rotation: pose.rotation,
		linearVelocity: pose.linear,
		angularVelocity: pose.angular
	});
	frame.bodies.set(vesselId, {
		handle,
		mass: mp.mass,
		com: mp.centerOfMass,
		masses: new Map(vessel.parts.map((id) => [id, partMass(core, id)]))
	});
}

/** Create the vessel's body at its pose (centre of mass `vessel.com`, at rest relative to its velocity). */
export function enterFlight(core: SimCore, vesselId: EntityId, frame: FlightFrame): void {
	const vessel = vesselOf(core, vesselId);
	const comDesign = designCom(core, vessel.parts);
	const rootDesign = partOf(core, vessel.root).designPos;
	const origin = sub(vessel.com, qRotate(vessel.orientation, sub(comDesign, rootDesign)));
	createVesselBody(core, frame, vesselId, {
		origin: sub(origin, frame.origin),
		rotation: vessel.orientation,
		linear: sub(vessel.velocity, frame.velocity),
		angular: ZERO
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
export function prepareFrame(core: SimCore, frame: FlightFrame, dt: number): void {
	const { backend } = frame;
	for (const vesselId of frame.vessels.slice()) {
		const vessel = vesselOf(core, vesselId);
		core.active.delete(vesselId);
		core.forces.delete(vesselId);
		const body = frame.bodies.get(vesselId)!;
		updateMassProperties(core, frame, vessel.parts, vesselId, body);
		// Point-mass gravity at the centre of mass (the gradient across a vessel is negligible).
		const centre = add(frame.origin, bodyMotion(frame, body).centre);
		backend.applyForce(body.handle, scale(gravityAt(core, centre), body.mass));
		runUpdateHooks(core, vesselId, dt);
		applyDrag(core, frame, vesselId);
	}
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
	for (const id of parts) body.masses.set(id, partMass(core, id));
}

function applyDrag(core: SimCore, frame: FlightFrame, vesselId: EntityId): void {
	const body = core.body.def;
	if (!body.atmosphere) return;
	const omega = { x: 0, y: core.body.omega, z: 0 };
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
		const local = qRotate(qConj(pose.rotation), rel);
		const def = partDefOf(core, part);
		const covered = { top: false, bottom: false };
		for (const att of part.attachments) {
			const dirY = def.attach?.[att.node]?.dir[1] ?? 0;
			if (dirY > 0.5) covered.top = true;
			else if (dirY < -0.5) covered.bottom = true;
		}
		const area = axisAreas(def.shape, local.y, covered);
		const k = -0.5 * density * DRAG_COEFFICIENT;
		const force = {
			x: k * area.x * Math.abs(local.x) * local.x,
			y: k * area.y * Math.abs(local.y) * local.y,
			z: k * area.z * Math.abs(local.z) * local.z
		};
		frame.backend.applyForce(flight.handle, qRotate(pose.rotation, force), pose.position);
	}
}

/**
 * Advance the backend one step, then post-process: the frame origin moves with the frame, bodies
 * below the ground are pushed out (and an uncontrolled vessel that hit it hard is destroyed), the
 * frame re-anchors when the focus vessel has drifted away from the origin, and vessel poses are
 * refreshed. Returns the vessels destroyed by the ground.
 */
export function advanceFrame(core: SimCore, frame: FlightFrame, dt: number): EntityId[] {
	frame.backend.step(dt);
	frame.origin = add(frame.origin, scale(frame.velocity, dt));
	for (const id of frame.vessels) holdOnPad(core, frame, id);
	const crashed = applyGround(core, frame);
	for (const id of frame.vessels) {
		if (!crashed.includes(id)) refreshPose(core, frame, id);
	}
	reanchor(core, frame);
	return crashed;
}

/**
 * Launch-pad hold (ADR 0017): while thrust does not exceed weight, pin every body to its pad pose
 * (fixed in the rotating ground frame); once it does, let go for good.
 */
function holdOnPad(core: SimCore, frame: FlightFrame, vesselId: EntityId): void {
	const vessel = vesselOf(core, vesselId);
	const pad = vessel.pad;
	if (!pad) return;
	const up = scale(vessel.com, 1 / length(vessel.com));
	const weight = (totalMass(core, vessel.parts) * core.body.mu) / dot(vessel.com, vessel.com);
	const lift = dot(core.forces.get(vesselId) ?? ZERO, up) - weight;
	if (lift > 0) {
		vessel.pad = null;
		return;
	}
	// `core.t` is advanced after the frames: the pose to hold is the one at the end of this step.
	const spin = qAboutY(core.body.omega * (core.t + core.dt));
	const omega = { x: 0, y: core.body.omega, z: 0 };
	const body = frame.bodies.get(vesselId)!;
	const origin = qRotate(spin, pad.position);
	const rotation = qMul(spin, pad.rotation);
	const centre = add(origin, qRotate(rotation, body.com));
	frame.backend.setTransform(body.handle, {
		position: sub(origin, frame.origin),
		rotation
	});
	frame.backend.setVelocity(body.handle, {
		linear: sub(cross(omega, centre), frame.velocity),
		angular: omega
	});
	vessel.landed = true;
}

/**
 * The ground is the body's reference sphere. If any part of a vessel is below it, the whole body
 * is moved out by the deepest penetration, and if a penetrating point was moving into the ground
 * (relative to the rotating ground) the body takes the ground's motion: a completely inelastic,
 * sticky contact. Hard impacts destroy uncontrolled vessels. Plan 012 replaces this.
 */
function applyGround(core: SimCore, frame: FlightFrame): EntityId[] {
	const { backend } = frame;
	const radius = core.body.def.radius;
	const omega = { x: 0, y: core.body.omega, z: 0 };
	const crashed: EntityId[] = [];
	for (const vesselId of frame.vessels) {
		const vessel = vesselOf(core, vesselId);
		if (vessel.pad) continue;
		vessel.landed = false;
		const body = frame.bodies.get(vesselId)!;
		const m = bodyMotion(frame, body);
		let deepest = 0;
		let deepestUp: Vec3 = ZERO;
		let impact = 0;
		let closingAny = false;
		for (const partId of vessel.parts) {
			const position = add(m.origin, qRotate(m.rotation, partOffset(core, partId)));
			const c = add(frame.origin, position);
			const dist = length(c);
			const up = scale(c, 1 / dist);
			const he = halfExtentsOf(partDefOf(core, partOf(core, partId)));
			const q = m.rotation;
			const extent =
				Math.abs(dot(qRotate(q, { x: 1, y: 0, z: 0 }), up)) * he.x +
				Math.abs(dot(qRotate(q, { x: 0, y: 1, z: 0 }), up)) * he.y +
				Math.abs(dot(qRotate(q, { x: 0, y: 0, z: 1 }), up)) * he.z;
			const penetration = extent - (dist - radius);
			if (penetration <= 0) continue;
			vessel.landed = true;
			if (penetration > deepest) {
				deepest = penetration;
				deepestUp = up;
			}
			const velocity = add(
				frame.velocity,
				add(m.linear, cross(m.angular, sub(position, m.centre)))
			);
			const closing = -dot(sub(velocity, cross(omega, c)), up);
			if (closing > 0) {
				closingAny = true;
				impact = Math.max(impact, closing);
			}
		}
		if (!vessel.landed) continue;
		const moved = add(m.origin, scale(deepestUp, deepest));
		backend.setTransform(body.handle, { position: moved, rotation: m.rotation });
		if (closingAny) {
			const centre = add(frame.origin, add(moved, qRotate(m.rotation, body.com)));
			backend.setVelocity(body.handle, {
				linear: sub(cross(omega, centre), frame.velocity),
				angular: omega
			});
		}
		if (impact > CRASH_SPEED && !isControlled(core, vessel)) crashed.push(vesselId);
	}
	return crashed;
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
