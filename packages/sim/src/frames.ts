/**
 * Flight frames: one physics backend plus a local frame that moves at constant velocity
 * (`bci = origin + local`, `bciVelocity = frame.velocity + localVelocity`), so Rapier's float32
 * sees small positions and small velocities (units-and-frames.md, ADR 0017). This file creates and
 * removes bodies for vessels, applies gravity, drag and ground contact, advances the backend and
 * reads poses back.
 */
import type { BodyHandle, EntityId, PhysicsBackend, Vec3 } from '@orbital/core';
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
import { IDENTITY, ZERO, fromTuple, qAboutY, qConj, qMul, qRotate } from './math.ts';
import { halfExtentsOf, inertiaOf } from './parts.ts';
import { jointKey, type FlightFrame } from './state.ts';

export function createFrame(id: number, backend: PhysicsBackend): FlightFrame {
	return {
		id,
		backend,
		inUse: false,
		origin: { x: 0, y: 0, z: 0 },
		velocity: { x: 0, y: 0, z: 0 },
		vessels: [],
		bodies: new Map(),
		joints: new Map(),
		masses: new Map()
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
	frame.joints.clear();
	frame.masses.clear();
}

/** Create one box body per part and one fixed joint per attachment, at the vessel's pose. */
export function enterFlight(core: SimCore, vesselId: EntityId, frame: FlightFrame): void {
	const vessel = vesselOf(core, vesselId);
	const { backend } = frame;
	const comDesign = designCom(core, vessel.parts);
	for (const partId of vessel.parts) {
		const part = partOf(core, partId);
		const def = partDefOf(core, part);
		const offset = qRotate(vessel.orientation, sub(part.designPos, comDesign));
		const mass = partMass(core, partId);
		const handle = backend.createBody({
			shape: { type: 'box', halfExtents: halfExtentsOf(def) },
			mass,
			...optionalInertia(inertiaOf(def, mass)),
			position: sub(add(vessel.com, offset), frame.origin),
			rotation: vessel.orientation,
			linearVelocity: sub(vessel.velocity, frame.velocity)
		});
		frame.bodies.set(partId, handle);
		frame.masses.set(partId, mass);
	}
	for (const partId of vessel.parts) {
		const part = partOf(core, partId);
		const def = partDefOf(core, part);
		for (const att of part.attachments) {
			if (att.peer < partId) continue; // each pair once, from the lower id
			const peerDef = partDefOf(core, partOf(core, att.peer));
			const a = frame.bodies.get(partId);
			const b = frame.bodies.get(att.peer);
			const na = def.attach?.[att.node];
			const nb = peerDef.attach?.[att.peerNode];
			if (a === undefined || b === undefined || !na || !nb) {
				throw new Error(`sim: cannot join parts ${partId} and ${att.peer}: missing body or node`);
			}
			const joint = backend.createFixedJoint(
				a,
				b,
				{ position: fromTuple(na.pos), rotation: IDENTITY },
				{ position: fromTuple(nb.pos), rotation: IDENTITY }
			);
			frame.joints.set(jointKey(partId, att.peer), joint);
		}
	}
	frame.vessels = [...frame.vessels, vesselId].sort((a, b) => a - b);
	vessel.mode = 'flight';
	vessel.rails = null;
	vessel.idle = 0;
}

const optionalInertia = (i: Vec3 | undefined): { inertia?: Vec3 } => (i ? { inertia: i } : {});

/** Remove the vessel's bodies (and with them their joints) from its frame. */
export function leaveFlight(core: SimCore, vesselId: EntityId): void {
	const frame = frameOfVessel(core, vesselId);
	if (!frame) return;
	const vessel = vesselOf(core, vesselId);
	for (const partId of vessel.parts) {
		for (const att of partOf(core, partId).attachments)
			frame.joints.delete(jointKey(partId, att.peer));
		const handle = frame.bodies.get(partId);
		if (handle !== undefined) frame.backend.removeBody(handle);
		frame.bodies.delete(partId);
		frame.masses.delete(partId);
	}
	frame.vessels = frame.vessels.filter((v) => v !== vesselId);
	releaseIfEmpty(frame);
}

/** Refresh the cached centre of mass, velocity and orientation of a flight vessel from its bodies. */
export function refreshPose(core: SimCore, frame: FlightFrame, vesselId: EntityId): void {
	const vessel = vesselOf(core, vesselId);
	let m = 0;
	let c = { x: 0, y: 0, z: 0 };
	let v = { x: 0, y: 0, z: 0 };
	for (const partId of vessel.parts) {
		const h = frame.bodies.get(partId)!;
		const mass = frame.masses.get(partId)!;
		m += mass;
		c = add(c, scale(add(frame.origin, frame.backend.getTransform(h).position), mass));
		v = add(v, scale(add(frame.velocity, frame.backend.getVelocity(h).linear), mass));
	}
	vessel.com = scale(c, 1 / m);
	vessel.velocity = scale(v, 1 / m);
	vessel.orientation = frame.backend.getTransform(frame.bodies.get(vessel.root)!).rotation;
}

/** Masses, gravity, module updates and drag for every vessel in the frame (forces for the next backend step). */
export function prepareFrame(core: SimCore, frame: FlightFrame, dt: number): void {
	const { backend } = frame;
	for (const vesselId of frame.vessels.slice()) {
		const vessel = vesselOf(core, vesselId);
		core.active.delete(vesselId);
		core.forces.delete(vesselId);
		for (const partId of vessel.parts) {
			const h = frame.bodies.get(partId)!;
			const mass = partMass(core, partId);
			if (mass !== frame.masses.get(partId)) {
				backend.setMass(h, mass, inertiaOf(partDefOf(core, partOf(core, partId)), mass));
				frame.masses.set(partId, mass);
			}
			const r = add(frame.origin, backend.getTransform(h).position);
			backend.applyForce(h, scale(gravityAt(core, r), mass));
		}
		runUpdateHooks(core, vesselId, dt);
		applyDrag(core, frame, vesselId);
	}
}

function applyDrag(core: SimCore, frame: FlightFrame, vesselId: EntityId): void {
	const body = core.body.def;
	if (!body.atmosphere) return;
	const omega = { x: 0, y: core.body.omega, z: 0 };
	const vessel = vesselOf(core, vesselId);
	for (const partId of vessel.parts) {
		const h = frame.bodies.get(partId)!;
		const pose = frame.backend.getTransform(h);
		const r = add(frame.origin, pose.position);
		const { density } = ambientAt(body, length(r) - body.radius);
		if (density === 0) continue;
		const v = add(frame.velocity, frame.backend.getVelocity(h).linear);
		const rel = sub(v, cross(omega, r));
		const local = qRotate(qConj(pose.rotation), rel);
		const part = partOf(core, partId);
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
		frame.backend.applyForce(h, qRotate(pose.rotation, force));
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
	for (const pose of pad.poses) {
		const h = frame.bodies.get(pose.part)!;
		const position = qRotate(spin, pose.position);
		frame.backend.setTransform(h, {
			position: sub(position, frame.origin),
			rotation: qMul(spin, pose.rotation)
		});
		frame.backend.setVelocity(h, {
			linear: sub(cross(omega, position), frame.velocity),
			angular: omega
		});
	}
	vessel.landed = true;
}

/**
 * The ground is the body's reference sphere. A body whose lowest point is below it is moved out,
 * and if it was moving into the ground (relative to the rotating ground) its velocity becomes the
 * ground's: a completely inelastic, sticky contact. Hard impacts destroy uncontrolled vessels.
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
		let impact = 0;
		for (const partId of vessel.parts) {
			const h = frame.bodies.get(partId)!;
			const t = backend.getTransform(h);
			const c = add(frame.origin, t.position);
			const dist = length(c);
			const up = scale(c, 1 / dist);
			const he = halfExtentsOf(partDefOf(core, partOf(core, partId)));
			const q = t.rotation;
			const extent =
				Math.abs(dot(qRotate(q, { x: 1, y: 0, z: 0 }), up)) * he.x +
				Math.abs(dot(qRotate(q, { x: 0, y: 1, z: 0 }), up)) * he.y +
				Math.abs(dot(qRotate(q, { x: 0, y: 0, z: 1 }), up)) * he.z;
			const penetration = extent - (dist - radius);
			if (penetration <= 0) continue;
			vessel.landed = true;
			backend.setTransform(h, { position: add(t.position, scale(up, penetration)), rotation: q });
			const vel = backend.getVelocity(h);
			const ground = cross(omega, c);
			const rel = sub(add(frame.velocity, vel.linear), ground);
			const closing = -dot(rel, up);
			if (closing > 0) {
				impact = Math.max(impact, closing);
				backend.setVelocity(h, {
					linear: sub(ground, frame.velocity),
					angular: vel.angular
				});
			}
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
	const rootHandle = frame.bodies.get(focus.root)!;
	const rootPos = frame.backend.getTransform(rootHandle).position;
	if (length(rootPos) <= REANCHOR_DISTANCE) return;
	const rootVel = frame.backend.getVelocity(rootHandle).linear;
	for (const handle of frame.bodies.values()) {
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
): { position: Vec3; rotation: { x: number; y: number; z: number; w: number } } {
	const t = frame.backend.getTransform(frame.bodies.get(part)!);
	return { position: add(frame.origin, t.position), rotation: t.rotation };
}
