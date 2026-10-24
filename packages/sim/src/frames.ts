/**
 * Flight frames: one physics backend plus a local frame that moves at constant velocity
 * (`bci = origin + local`, `bciVelocity = frame.velocity + localVelocity`), so Rapier's float32
 * sees small positions and small velocities (units-and-frames.md, ADR 0017). This file creates and
 * removes the (one, compound) body of each vessel, applies gravity and drag, keeps a ground tile
 * under every vessel near the ground (ADR 0019), advances the backend, reads contacts and poses back.
 */
import { noteDragArea } from './aero-facts.ts';
import { WATER_DEPTH } from '@orbital/core';
import type {
	EntityId,
	PhysicsBackend,
	Quat,
	ShapePlacement,
	Transform,
	Vec3,
	WheelSpec
} from '@orbital/core';
import { add, cross, dot, length, normalize, scale, sub } from '@orbital/kepler';
import { ambientAt, machDragFactor } from './atmosphere.ts';
import { bodyById, rotationAt, spinAt, type BodyRuntime } from './bodies.ts';
import { axisAreas } from './aero.ts';
import { ruleOf } from './economy.ts';
import {
	BLUNT_DAMPING_RATIO,
	CONTACT_DISTANCE,
	DEFAULT_IMPACT_TOLERANCE,
	DESTROY_FACTOR,
	DRAG_COEFFICIENT,
	GROUND_FRICTION,
	GROUND_TILE_ENTER,
	GROUND_TILE_EXIT,
	GROUND_TILE_HALF,
	SUPPORT_REACH,
	SUPPORT_SAMPLES,
	SUPPORT_SLACK,
	FRAME_MERGE_REACH,
	LOAD_RANGE,
	PHYSICS_RANGE,
	REANCHOR_DISTANCE,
	REENTRY_HEATING_RULE,
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
import { ZERO, qAboutY, qConj, qMul, qRotate, uprightRotation } from './math.ts';
import { stepWalking } from './eva.ts';
import { nBodyOn, thirdBody } from './nbody.ts';
import { massProperties } from './mass.ts';
import { colliderBoxes, halfExtentsOf, isTurned, partRotation } from './parts.ts';
import { stepSas } from './sas.ts';
import {
	effectiveControl,
	type FlightBody,
	type FlightFrame,
	type GroundTile,
	type WheelRef
} from './state.ts';
import {
	bodyFixedDirection,
	bodyHasStoneColliders,
	createStoneField,
	needsStones,
	placeStones,
	stoneNormalAt
} from './stones.ts';
import { groundPlane, terrainUnder } from './terrain.ts';
import { SHELL_DRAG_COEFFICIENT, hasShell, shellShape, shieldedParts } from './debris.ts';
import { stepWater, waterUnder } from './water.ts';

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
		tiles: new Map(),
		wet: new Map(),
		wetVessels: new Set(),
		waterImpacts: []
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
	frame.wet.clear();
	frame.wetVessels.clear();
	frame.waterImpacts = [];
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
	const rel = sub(v, cross(spinAt(bodyOfFrame(core, frame), core.t), r));
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
): {
	shapes: ShapePlacement[];
	shapeParts: EntityId[];
	signature: string;
	wheels: Map<number, WheelRef>;
} {
	const vessel = vesselOf(core, vesselId);
	const rootDesign = partOf(core, vessel.root).designPos;
	const shapes: ShapePlacement[] = [];
	const shapeParts: EntityId[] = [];
	const extras: unknown[] = [];
	const wheels = new Map<number, WheelRef>();
	for (const id of vessel.parts) {
		const part = partOf(core, id);
		const at = sub(part.designPos, rootDesign);
		const turn = isTurned(part) ? partRotation(part) : undefined;
		// a hollow part (a cargo bay, plan 356) has only its modules' walls
		const hollow = part.modules.some(
			(m) =>
				moduleDefOf(core, m.id).hollow?.(m.config, moduleState(core, id, m.id) as never) === true
		);
		if (hollow) extras.push([id, 'hollow']);
		for (const box of hollow ? [] : colliderBoxes(partDefOf(core, part))) {
			const rotation =
				box.yaw === 0 ? turn : turn ? qMul(turn, qAboutY(box.yaw)) : qAboutY(box.yaw);
			shapes.push({
				shape: { type: 'box', halfExtents: box.halfExtents },
				position: at,
				...(rotation ? { rotation } : {})
			});
			shapeParts.push(id);
		}
		for (const m of part.modules) {
			const colliders = moduleDefOf(core, m.id).colliders;
			if (!colliders) continue;
			for (const [k, c] of colliders(m.config, moduleState(core, id, m.id)).entries()) {
				// a wheel is frictionless: the sim applies its tyre forces (plan 063, ADR 0161)
				if (c.wheel)
					wheels.set(shapes.length, {
						part: id,
						module: m.id,
						k,
						at: add(at, turn ? qRotate(turn, c.offset) : c.offset),
						half: c.halfExtents,
						...(turn ? { turn } : {})
					});
				shapes.push({
					shape: { type: 'box', halfExtents: c.halfExtents },
					position: add(at, turn ? qRotate(turn, c.offset) : c.offset),
					...(turn ? { rotation: turn } : {}),
					...(c.wheel ? { friction: 0 } : {})
				});
				shapeParts.push(id);
				extras.push([id, c.offset, c.halfExtents, c.wheel ? 1 : 0]);
			}
		}
	}
	return { shapes, shapeParts, signature: JSON.stringify(extras), wheels };
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
		...(colliders.wheels.size > 0 ? { wheels: colliders.wheels } : {}),
		corners: colliderCorners(colliders.shapes),
		signature: colliders.signature
	});
}

/**
 * Rebuild a flight vessel's body when the boxes its modules contribute changed (a landing leg
 * deployed), or always with `force`. Same pose and motion; call between steps, never with forces queued (ADR 0019).
 */
export function refreshColliders(core: SimCore, vesselId: EntityId, force = false): void {
	const frame = frameOfVessel(core, vesselId);
	const body = frame?.bodies.get(vesselId);
	if (!frame || !body) return;
	// `force`: parts moved in the design frame (a robotic joint, ADR 0269)
	if (!force && collectColliders(core, vesselId).signature === body.signature) return;
	const m = bodyMotion(frame, body);
	// the rebuild must not push the vessel (plan 390, ADR 0334): the parts moved, so the centre of
	// mass is somewhere else in the body; the origin follows it so the centre stays where it was,
	// and the spin keeps its angular momentum (the inertia changed)
	const vessel = vesselOf(core, vesselId);
	const next = massProperties(core, vessel.parts, partOf(core, vessel.root).designPos);
	let origin = add(m.origin, qRotate(m.rotation, sub(body.com, next.centerOfMass)));
	origin = add(origin, liftOutOfGround(core, frame, vesselId, origin, m.rotation));
	const spin = inertiaApply(body.inertia, body.inertiaFrame, m.rotation, m.angular);
	frame.backend.removeBody(body.handle);
	frame.bodies.delete(vesselId);
	createVesselBody(core, frame, vesselId, {
		origin,
		rotation: m.rotation,
		linear: m.linear,
		angular: inertiaSolve(next.inertia, next.inertiaFrame, m.rotation, spin)
	});
}

/**
 * How far to raise a rebuilt body so none of its colliders is under the ground (plan 391, ADR 0337):
 * a leg deployed on the ground puts its feet below it, and the solver would shove the ship up at
 * 0.7 m/s to clear them. The deepest corner's depth along the local vertical, m; zero far above the
 * ground.
 */
function liftOutOfGround(
	core: SimCore,
	frame: FlightFrame,
	vesselId: EntityId,
	origin: Vec3,
	rotation: Quat
): Vec3 {
	const planet = bodyOfFrame(core, frame);
	const here = add(frame.origin, origin);
	if (length(here) - planet.def.radius > (planet.terrain?.maxHeight ?? 0) + 200) return ZERO;
	let lift = 0;
	for (const placed of collectColliders(core, vesselId).shapes) {
		const q = placed.rotation ? qMul(rotation, placed.rotation) : rotation;
		const centre = add(here, qRotate(rotation, placed.position));
		const s = placed.shape;
		const corners: Vec3[] =
			s.type === 'box'
				? [-1, 1].flatMap((sx) =>
						[-1, 1].flatMap((sy) =>
							[-1, 1].map((sz) =>
								add(
									centre,
									qRotate(q, {
										x: sx * s.halfExtents.x,
										y: sy * s.halfExtents.y,
										z: sz * s.halfExtents.z
									})
								)
							)
						)
					)
				: [centre];
		const reach = s.type === 'sphere' ? s.radius : s.type === 'capsule' ? s.radius : 0;
		for (const p of corners) {
			const ground = planet.def.radius + terrainUnder(core, planet, p);
			lift = Math.max(lift, ground - (length(p) - reach));
		}
	}
	if (!(lift > 0) || lift > 50) return ZERO;
	return scale(here, lift / length(here));
}

/** `I w`: the angular momentum of a body turning at `w` (world axes), with its principal moments and their frame. */
export function inertiaApply(inertia: Vec3, frameQ: Quat, rotation: Quat, w: Vec3): Vec3 {
	const q = qMul(rotation, frameQ);
	const p = qRotate(qConj(q), w);
	return qRotate(q, { x: inertia.x * p.x, y: inertia.y * p.y, z: inertia.z * p.z });
}

/** `I⁻¹ L`: the spin a body has at angular momentum `L` (world axes). */
export function inertiaSolve(inertia: Vec3, frameQ: Quat, rotation: Quat, L: Vec3): Vec3 {
	const q = qMul(rotation, frameQ);
	const p = qRotate(qConj(q), L);
	return qRotate(q, { x: p.x / inertia.x, y: p.y / inertia.y, z: p.z / inertia.z });
}

/** The corners of a body's colliders (a sphere's or capsule's extremes), body axes, one per centimetre. */
function colliderCorners(shapes: ShapePlacement[]): Vec3[] {
	const seen = new Set<string>();
	const out: Vec3[] = [];
	const push = (p: Vec3): void => {
		const key = `${Math.round(p.x * 100)}:${Math.round(p.y * 100)}:${Math.round(p.z * 100)}`;
		if (seen.has(key)) return;
		seen.add(key);
		out.push(p);
	};
	for (const placed of shapes) {
		const q = placed.rotation;
		const at = (local: Vec3): Vec3 => add(placed.position, q ? qRotate(q, local) : local);
		const s = placed.shape;
		if (s.type === 'box') {
			for (const sx of [-1, 1])
				for (const sy of [-1, 1])
					for (const sz of [-1, 1])
						push(at({ x: sx * s.halfExtents.x, y: sy * s.halfExtents.y, z: sz * s.halfExtents.z }));
		} else {
			const reach = s.type === 'sphere' ? s.radius : s.radius;
			const tall = s.type === 'capsule' ? s.halfHeight : 0;
			for (const y of tall > 0 ? [-tall, tall] : [0]) {
				push(at({ x: reach, y, z: 0 }));
				push(at({ x: -reach, y, z: 0 }));
				push(at({ x: 0, y, z: reach }));
				push(at({ x: 0, y, z: -reach }));
				push(at({ x: 0, y: y - reach, z: 0 }));
				push(at({ x: 0, y: y + reach, z: 0 }));
			}
		}
	}
	return out;
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

/**
 * Frames of one body whose vessels come within `LOAD_RANGE` of each other become one (plan 391,
 * ADR 0337; C3): without it two vessels in separate Rapier worlds fly through each other. Every vessel of
 * the later frame moves into the earlier one between steps, a body rebuilt at the same inertial pose
 * and velocity (local' = local + oB − oA, v' = v + vB − vA); only when all of them stay within
 * `FRAME_MERGE_REACH` of the earlier frame's origin, so the f32 world keeps its precision.
 */
export function mergeFrames(core: SimCore): void {
	const used = core.frames.filter((f) => f.inUse && f.vessels.length > 0);
	if (used.length < 2) return;
	const centres = (f: FlightFrame) =>
		f.vessels.map((id) => add(f.origin, bodyMotion(f, f.bodies.get(id)!).centre));
	for (const a of used) {
		for (const b of used) {
			if (!a.inUse || !b.inUse || a.id >= b.id || a.soi !== b.soi) continue;
			const ca = centres(a);
			const cb = centres(b);
			const meet = ca.some((p) => cb.some((q) => length(sub(p, q)) < LOAD_RANGE));
			if (!meet || cb.some((q) => length(sub(q, a.origin)) > FRAME_MERGE_REACH)) continue;
			for (const id of b.vessels.slice()) moveVessel(core, id, b, a);
		}
	}
}

/** One vessel's body from frame `from` into frame `to`, same inertial pose and velocity. */
function moveVessel(core: SimCore, vesselId: EntityId, from: FlightFrame, to: FlightFrame): void {
	const body = from.bodies.get(vesselId)!;
	const m = bodyMotion(from, body);
	from.backend.removeBody(body.handle);
	from.bodies.delete(vesselId);
	removeTile(from, vesselId);
	from.wet.delete(vesselId);
	from.wetVessels.delete(vesselId);
	from.wheelContacts?.delete(vesselId);
	for (const [key, g] of from.grace ?? []) {
		if (g.a === vesselId || g.b === vesselId) from.grace!.delete(key);
	}
	from.vessels = from.vessels.filter((v) => v !== vesselId);
	createVesselBody(core, to, vesselId, {
		origin: sub(add(from.origin, m.origin), to.origin),
		rotation: m.rotation,
		linear: sub(add(from.velocity, m.linear), to.velocity),
		angular: m.angular
	});
	to.vessels = [...to.vessels, vesselId].sort((x, y) => x - y);
	releaseIfEmpty(from);
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
		// an n-body world: the other bodies' pull, uniform over the bubble at its origin (ADR 0122 point 4)
		if (nBodyOn(core))
			backend.applyForce(body.handle, scale(thirdBody(planet, core.t, frame.origin), body.mass));
		updateTile(core, frame, planet, vesselId, centre);
		stepWheels(core, frame, vesselId, body, centre, dt);
		stepWalking(core, frame, vesselId, body, dt);
		stepSas(core, frame, vesselId, body, dt);
		runUpdateHooks(core, vesselId, dt);
		overheated.push(...stepThermal(core, vesselId, applyDrag(core, frame, vesselId, dt), dt));
		// Buoyancy and water drag (plan 067, ADR 0182)
		let wasWet = frame.wet.get(vesselId);
		if (!wasWet) frame.wet.set(vesselId, (wasWet = new Set()));
		const water = stepWater(core, frame, planet, vesselId, body, bodyMotion(frame, body), wasWet);
		if (water.wet) frame.wetVessels.add(vesselId);
		else frame.wetVessels.delete(vesselId);
		frame.waterImpacts.push(...water.impacts);
	}
	return overheated;
}

/**
 * Tyre forces (plan 063, ADR 0161 point 1) at the wheels that touched the ground in the last step:
 * rolling resistance and brakes along each wheel's rolling direction (the part's +Y, steered about
 * the ground normal by the yaw demand), side grip across it, each limited by its coefficient times
 * the wheel's share of the weight and by what stops the motion in one step.
 */
/** Share of a wheel's slip speed the tyre takes out per step (see `stepWheels`). */
const WHEEL_SETTLE = 0.25;

/** The wheel's spec at its collider `k` of its module, or undefined when the part or module is gone. */
function wheelSpecOf(core: SimCore, ref: WheelRef): WheelSpec | undefined {
	if (!core.world.hasEntity(ref.part)) return undefined;
	const instance = partOf(core, ref.part).modules.find((m) => m.id === ref.module);
	return instance
		? moduleDefOf(core, ref.module).colliders?.(
				instance.config,
				moduleState(core, ref.part, ref.module)
			)[ref.k]?.wheel
		: undefined;
}

function stepWheels(
	core: SimCore,
	frame: FlightFrame,
	vesselId: EntityId,
	body: FlightBody,
	centreWorld: Vec3,
	dt: number
): void {
	const contacts = frame.wheelContacts?.get(vesselId);
	const tile = frame.tiles.get(vesselId);
	if (!body.wheels || !tile) return;
	const vessel = vesselOf(core, vesselId);
	const planet = bodyOfFrame(core, frame);
	const n = tile.up;
	const motion = bodyMotion(frame, body);
	const omega = spinAt(planet, core.t);
	// where each wheel touches the ground: the contacts the physics reported, and the tyres pressed
	// into it inside their suspension's travel, where the hub does not touch yet (plan 283)
	const points = new Map<number, Vec3>();
	for (const [shape, local] of contacts ?? [])
		points.set(shape, add(motion.origin, qRotate(motion.rotation, local)));
	if (tile.surface) {
		for (const [shape, ref] of [...body.wheels].sort((a, b) => a[0] - b[0])) {
			const spec = wheelSpecOf(core, ref);
			const sus = spec?.suspension;
			if (!sus) continue;
			const state = moduleState(core, ref.part, ref.module) as { compression?: number };
			const rot = ref.turn ? qMul(motion.rotation, ref.turn) : motion.rotation;
			const axes = [
				qRotate(rot, { x: 1, y: 0, z: 0 }),
				qRotate(rot, { x: 0, y: 1, z: 0 }),
				qRotate(rot, { x: 0, y: 0, z: 1 })
			];
			const reach = (grow: number): number =>
				Math.abs(dot(n, axes[0]!)) * (ref.half.x + grow) +
				Math.abs(dot(n, axes[1]!)) * (ref.half.y + grow) +
				Math.abs(dot(n, axes[2]!)) * ref.half.z;
			const centre = add(motion.origin, qRotate(motion.rotation, ref.at));
			const height = dot(sub(centre, tile.surface), n);
			const travel = reach(sus.travel) - reach(0);
			const compress = reach(sus.travel) - height;
			if (compress <= 0 || travel <= 0) {
				state.compression = 0;
				continue;
			}
			const point = sub(centre, scale(n, height));
			if (!points.has(shape)) points.set(shape, point);
			const v = add(motion.linear, cross(motion.angular, sub(point, motion.centre)));
			const ground = sub(cross(omega, add(frame.origin, point)), frame.velocity);
			const closing = dot(sub(v, ground), n);
			const push = Math.min(
				sus.spring * travel * 1.5,
				Math.max(0, sus.spring * compress - sus.damper * closing)
			);
			if (push > 0) frame.backend.applyForce(body.handle, scale(n, push), point);
			state.compression = Math.min(1, compress / travel);
		}
	}
	if (points.size === 0) return;
	const weight = body.mass * length(gravityAt(planet.mu, centreWorld));
	const load = weight / points.size;
	const share = body.mass / points.size;
	const yaw = effectiveControl(vessel).yaw;
	for (const [shape, point] of [...points].sort((a, b) => a[0] - b[0])) {
		const ref = body.wheels.get(shape);
		if (!ref || !core.world.hasEntity(ref.part)) continue;
		const part = partOf(core, ref.part);
		const spec = wheelSpecOf(core, ref);
		if (!spec) continue;
		const v = add(motion.linear, cross(motion.angular, sub(point, motion.centre)));
		const ground = sub(cross(omega, add(frame.origin, point)), frame.velocity);
		const rel = sub(v, ground);
		const tangential = sub(rel, scale(n, dot(rel, n)));
		const turn = isTurned(part) ? partRotation(part) : undefined;
		const along = qRotate(
			motion.rotation,
			turn ? qRotate(turn, { x: 0, y: 1, z: 0 }) : { x: 0, y: 1, z: 0 }
		);
		const flat = sub(along, scale(n, dot(along, n)));
		if (length(flat) < 1e-6) continue;
		let roll = normalize(flat);
		const steer = spec.steer * yaw;
		if (steer !== 0) {
			const side0 = cross(n, roll);
			roll = add(scale(roll, Math.cos(steer)), scale(side0, Math.sin(steer)));
		}
		const side = cross(n, roll);
		// A push at the contact also turns the craft (the point sits below the centre of mass), so the
		// effective mass there is well under the share: take a quarter of the speed out per step, which
		// settles in a few steps where the whole of it overshoots and shimmies.
		const stop = (speed: number, limit: number): number =>
			-Math.max(-limit, Math.min(limit, (WHEEL_SETTLE * speed * share) / dt));
		const fRoll = stop(dot(tangential, roll), (spec.rolling + spec.brake * spec.grip) * load);
		// a motor pushes along the wheel with the throttle, not against the brakes (plan 260)
		const control = effectiveControl(vessel);
		// the rover keys' own throttle wins while it is set (plan 307)
		const push = control.wheelThrottle || control.throttle;
		let drive = spec.brake > 0 ? 0 : (spec.drive ?? 0) * push;
		// the motor fades toward its top speed in the direction it pushes (plan 307)
		const rolling = dot(tangential, roll);
		if (spec.topSpeed && drive * rolling > 0)
			drive *= Math.max(0, 1 - Math.abs(rolling) / spec.topSpeed);
		const fSide = stop(dot(tangential, side), spec.grip * load);
		frame.backend.applyForce(
			body.handle,
			add(scale(roll, fRoll + drive), scale(side, fSide)),
			point
		);
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
	body.inertia = mp.inertia;
	body.inertiaFrame = mp.inertiaFrame;
	for (const id of parts) body.masses.set(id, partMass(core, id));
}

/** Drag on every part; returns the heat the same airflow puts on each part (ADR 0023). */
function applyDrag(
	core: SimCore,
	frame: FlightFrame,
	vesselId: EntityId,
	dt: number
): Map<EntityId, HeatInput> {
	const heat = new Map<EntityId, HeatInput>();
	const planet = bodyOfFrame(core, frame);
	const body = planet.def;
	if (!body.atmosphere) return heat;
	const omega = spinAt(planet, core.t);
	// "Re-entry heating %" scales the convective input only; radiation still cools (ADR 0204 point 4)
	const rule = ruleOf(core, REENTRY_HEATING_RULE);
	const heating = typeof rule === 'number' ? Math.max(0, rule) : 1;
	const vessel = vesselOf(core, vesselId);
	const flight = frame.bodies.get(vesselId)!;
	const motion = bodyMotion(frame, flight); // one backend read for the whole vessel
	const rootDesign = partOf(core, vessel.root).designPos;
	// parts inside a closed fairing take no drag and no convective heat (plan 219, ADR 0224)
	const shielded = shieldedParts(core, vesselId);
	const shieldedAny = shielded.size > 0 || hasShell(core, vesselId);
	// C_d·A along the airflow, measured for mods that predict the flight (plan 347, ADR 0296)
	let dragArea = 0;
	let inAir = false;
	for (const partId of vessel.parts) {
		if (shielded.has(partId)) continue;
		const part = partOf(core, partId);
		const pose = {
			position: add(motion.origin, qRotate(motion.rotation, sub(part.designPos, rootDesign))),
			rotation: motion.rotation
		};
		const r = add(frame.origin, pose.position);
		const { density, speedOfSound } = ambientAt(body, length(r) - body.radius);
		if (density === 0) continue;
		const v = add(
			add(frame.velocity, motion.linear),
			cross(motion.angular, sub(pose.position, motion.centre))
		);
		const rel = sub(v, cross(omega, r));
		const turned = isTurned(part) ? qMul(pose.rotation, partRotation(part)) : pose.rotation;
		const local = qRotate(qConj(turned), rel);
		const def = partDefOf(core, part);
		// a closed fairing meets the air as its shell, its nose open to the wind (plan 219)
		const shell = shieldedAny ? shellShape(core, partId) : null;
		const covered = { top: false, bottom: false };
		for (const att of part.attachments) {
			const node = def.attach?.[att.node];
			const dirY = node?.dir[1] ?? 0;
			// an interstage carries the next stage on its top: that end is not open to the wind (plan 243)
			if (dirY > 0.5) covered.top = !shell || node?.shellTop !== undefined;
			else if (dirY < -0.5) covered.bottom = true;
		}
		const area = axisAreas(shell ?? def.shape, local.y, covered);
		// the transonic drag rise (plan 212, ADR 0204 point 3) from the part's own airspeed
		const mach = speedOfSound ? Math.hypot(local.x, local.y, local.z) / speedOfSound : 0;
		const cd = shell ? SHELL_DRAG_COEFFICIENT : (def.dragCoefficient ?? DRAG_COEFFICIENT);
		const k = -0.5 * density * cd * machDragFactor(mach);
		const force = {
			x: k * area.x * Math.abs(local.x) * local.x,
			y: k * area.y * Math.abs(local.y) * local.y,
			z: k * area.z * Math.abs(local.z) * local.z
		};
		frame.backend.applyForce(flight.handle, qRotate(turned, force), pose.position);
		const airspeed = Math.hypot(local.x, local.y, local.z);
		if (airspeed > 1) {
			inAir = true;
			const along = -(force.x * local.x + force.y * local.y + force.z * local.z) / airspeed;
			dragArea += along / (0.5 * density * airspeed * airspeed * machDragFactor(mach));
		}
		if (def.bluntBase !== undefined && !covered.bottom && def.shape?.kind === 'cylinder') {
			// the airflow turns an open blunt end to face it (plan 265): a moment about the vessel's
			// centre of mass, first order in the angle to the flow, with pitch damping
			const speed = Math.hypot(local.x, local.y, local.z);
			if (speed > 1e-3) {
				const { radius } = def.shape;
				const q = 0.5 * density * speed * speed;
				const area = Math.PI * radius * radius;
				const k = def.bluntBase * q * area * 2 * radius;
				// base (-Y) towards the part's velocity: a x v / |v| with a = -Y
				const spin = qRotate(qConj(turned), motion.angular);
				// an explicit step must not overshoot: at most half the rate removed per step
				const [, lateralLow, lateralHigh] = [
					flight.inertia.x,
					flight.inertia.y,
					flight.inertia.z
				].sort((a, b) => a - b) as [number, number, number];
				const lateral = (lateralLow + lateralHigh) / 2;
				const damping = Math.min(
					2 * BLUNT_DAMPING_RATIO * Math.sqrt(k * lateral),
					(0.5 * lateralLow) / dt
				);
				const torque = {
					x: (-k * local.z) / speed - damping * spin.x,
					y: 0,
					z: (k * local.x) / speed - damping * spin.z
				};
				frame.backend.applyTorque(flight.handle, qRotate(turned, torque));
			}
		}
		const input = heatInput(density, def.shape, area, local);
		heat.set(partId, heating === 1 ? input : { ...input, power: input.power * heating });
	}
	if (inAir) noteDragArea(core, vesselId, dragArea);
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
 * How far to raise the ground plane under a vessel so that no part of it is under the terrain (plan
 * 391, ADR 0337; C4): the plane is fitted at the centre of mass, and a long vehicle with a wheel over
 * a bump or a leg on a rock would stand with that part inside the ground. The lowest corners of the
 * body's colliders (those within `SUPPORT_REACH` of the plane, 8 at most) are asked for the terrain
 * under them; the plane rises to the highest of them, never by more than the height of the corner
 * over the plane plus `SUPPORT_SLACK` (a cliff face is not a floor). Zero without terrain.
 */
function supportRaise(
	core: SimCore,
	frame: FlightFrame,
	planet: BodyRuntime,
	vesselId: EntityId,
	plane: { point: Vec3; normal: Vec3 }
): number {
	const body = frame.bodies.get(vesselId);
	if (!body?.corners || !planet.terrain) return 0;
	const m = bodyMotion(frame, body);
	const low: Array<{ at: Vec3; over: number }> = [];
	for (const corner of body.corners) {
		const at = add(add(frame.origin, m.origin), qRotate(m.rotation, corner));
		const over = dot(sub(at, plane.point), plane.normal);
		if (over < SUPPORT_REACH) low.push({ at, over });
	}
	if (low.length === 0) return 0;
	low.sort((a, b) => a.over - b.over);
	let raise = 0;
	for (const { at, over } of low.slice(0, SUPPORT_SAMPLES)) {
		const ground = planet.def.radius + terrainUnder(core, planet, at);
		const reach = scale(at, ground / length(at));
		const height = dot(sub(reach, plane.point), plane.normal);
		raise = Math.max(raise, Math.min(height, over + SUPPORT_SLACK));
	}
	return Math.max(0, raise);
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
	// Over water the tile is the seabed, WATER_DEPTH under the water plane (ADR 0182 point 2).
	const water = waterUnder(core, planet, centre);
	const plane = water
		? (() => {
				const up = scale(centre, 1 / d);
				return { point: scale(up, radius - WATER_DEPTH), normal: up, height: -WATER_DEPTH };
			})()
		: groundPlane(core, planet, centre);
	const altitude = d - radius - plane.height;
	if (altitude > GROUND_TILE_EXIT || (!tile && altitude > GROUND_TILE_ENTER)) {
		removeTile(frame, vesselId);
		return;
	}
	const up = plane.normal;
	// the plane under the whole footprint, not just the centre of mass (plan 391, ADR 0337; C4)
	const surface = water
		? plane.point
		: add(plane.point, scale(up, supportRaise(core, frame, planet, vesselId, plane)));
	const position = sub(surface, frame.origin);
	const rotation = uprightRotation(up);
	const omega = spinAt(planet, core.t);
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
		tile = { handle, up, surface: position };
		frame.tiles.set(vesselId, tile);
	} else {
		frame.backend.setTransform(tile.handle, { position, rotation });
		frame.backend.setVelocity(tile.handle, { linear, angular: omega });
		tile.up = up;
		tile.surface = position;
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
	const omega = spinAt(bodyOfFrame(core, frame), core.t);
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
		// wheels in contact, for the tyre forces of the next step (plan 063, ADR 0161)
		if (body.wheels) {
			// kept in the body's own axes: the frame may re-anchor before the next step uses them
			const pose = frame.backend.getTransform(body.handle);
			const toBody = (p: Vec3): Vec3 => qRotate(qConj(pose.rotation), sub(p, pose.position));
			const sums = new Map<number, { sum: Vec3; n: number }>();
			for (const c of touching) {
				if (!body.wheels.has(c.shape)) continue;
				const seen = sums.get(c.shape);
				const local = toBody(c.point);
				sums.set(
					c.shape,
					seen ? { sum: add(seen.sum, local), n: seen.n + 1 } : { sum: local, n: 1 }
				);
			}
			// the mean of a wheel's contact points: a pairwise halving leans to the last one, and a height
			// field gives a wheel more points than a plane does (plan 391)
			const wheelPoints = new Map<number, Vec3>(
				[...sums].map(([shape, { sum, n }]) => [shape, scale(sum, 1 / n)])
			);
			(frame.wheelContacts ??= new Map()).set(vesselId, wheelPoints);
		}
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

/** Steps a pair must not overlap before its contacts come back, and the longest it may be ignored, s. */
export const GRACE_CLEAR_STEPS = 10;
export const GRACE_MAX_SECONDS = 20;

/**
 * Ignore the contacts between the bodies of vessels `a` and `b` until they have parted (plan 390,
 * ADR 0334): a split or a spawned piece starts with boxes inside each other's, and the solver
 * would throw both apart.
 */
export function graceBetween(frame: FlightFrame, a: EntityId, b: EntityId): void {
	const ba = frame.bodies.get(a);
	const bb = frame.bodies.get(b);
	if (!ba || !bb || a === b) return;
	const key = a < b ? `${a}:${b}` : `${b}:${a}`;
	frame.grace ??= new Map();
	frame.grace.set(key, { a, b, clear: 0, age: 0 });
	frame.backend.setPairContacts(ba.handle, bb.handle, false);
}

/** After a step: restore the contacts of every pair that has not overlapped for `GRACE_CLEAR_STEPS` steps. */
function stepGrace(frame: FlightFrame, dt: number): void {
	if (!frame.grace?.size) return;
	for (const [key, g] of [...frame.grace]) {
		const ba = frame.bodies.get(g.a);
		const bb = frame.bodies.get(g.b);
		if (!ba || !bb) {
			frame.grace.delete(key);
			continue;
		}
		g.age += dt;
		const touching = frame.backend.contacts(ba.handle, bb.handle).some((c) => c.distance < 0);
		g.clear = touching ? 0 : g.clear + 1;
		if (g.clear >= GRACE_CLEAR_STEPS || g.age >= GRACE_MAX_SECONDS) {
			frame.backend.setPairContacts(ba.handle, bb.handle, true);
			frame.grace.delete(key);
		}
	}
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
 * A ground tile (and its stones) touches only the vessel it was fitted to (plan 391, ADR 0337; C5):
 * a plane fitted under one vessel must not shove another one that stands near it. The pairs are
 * ignored in the backend, so a tile created under a neighbour does not throw it.
 */
function isolateTiles(frame: FlightFrame): void {
	for (const [owner, tile] of frame.tiles) {
		for (const [id, body] of frame.bodies) {
			if (id === owner) continue;
			frame.backend.setPairContacts(tile.handle, body.handle, false);
			if (tile.stones) frame.backend.setPairContacts(tile.stones.handle, body.handle, false);
		}
	}
}

/**
 * Advance the backend one step, then post-process: ground contacts are read (`landed`, impacts
 * above a part's tolerance are returned for the caller to apply), the frame origin moves with the
 * frame, the frame re-anchors when the focus vessel has drifted away from the origin, and vessel
 * poses are refreshed.
 */
export function advanceFrame(core: SimCore, frame: FlightFrame, dt: number): GroundImpact[] {
	isolateTiles(frame);
	const before = new Map<EntityId, ReturnType<typeof bodyMotion>>();
	for (const id of frame.tiles.keys()) before.set(id, bodyMotion(frame, frame.bodies.get(id)!));
	frame.backend.step(dt);
	stepGrace(frame, dt);
	const impacts = groundContacts(core, frame, before);
	// A wet vessel counts as landed (ADR 0182 point 5); entries into water are impacts (point 6).
	for (const id of frame.vessels) if (frame.wetVessels.has(id)) vesselOf(core, id).landed = true;
	impacts.push(...frame.waterImpacts);
	frame.waterImpacts = [];
	frame.origin = add(frame.origin, scale(frame.velocity, dt));
	holdAnchored(core, frame, core.t + dt);
	for (const id of frame.vessels) refreshPose(core, frame, id);
	reanchor(core, frame);
	return impacts;
}

/** A vessel with a part whose `anchor` hook says so (a launch clamp, plan 210). */
function anchoredByPart(core: SimCore, vesselId: EntityId): boolean {
	for (const id of vesselOf(core, vesselId).parts) {
		for (const m of partOf(core, id).modules) {
			const hook = moduleDefOf(core, m.id).anchor;
			if (hook?.(m.config, moduleState(core, id, m.id))) return true;
		}
	}
	return false;
}

/**
 * Launch clamps (plan 210, ADR 0203): after the step, a vessel held by a clamp on the ground goes
 * back to the pose it had in the body-fixed frame when the hold began, moving with the ground.
 * Thrust and contacts move it nowhere; once no part anchors it, the hold ends and the vessel keeps
 * the ground's velocity it had.
 */
function holdAnchored(core: SimCore, frame: FlightFrame, t: number): void {
	const planet = bodyOfFrame(core, frame);
	const turn = rotationAt(planet, t);
	const omega = spinAt(planet, t);
	for (const id of frame.vessels) {
		const vessel = vesselOf(core, id);
		const body = frame.bodies.get(id);
		if (!body || !frame.tiles.has(id) || !anchoredByPart(core, id)) {
			delete vessel.anchor;
			continue;
		}
		const now = frame.backend.getTransform(body.handle);
		if (!vessel.anchor) {
			vessel.anchor = {
				r: qRotate(qConj(turn), add(frame.origin, now.position)),
				q: qMul(qConj(turn), now.rotation)
			};
		}
		const r = qRotate(turn, vessel.anchor.r);
		frame.backend.setTransform(body.handle, {
			position: sub(r, frame.origin),
			rotation: qMul(turn, vessel.anchor.q)
		});
		frame.backend.setVelocity(body.handle, {
			linear: sub(cross(omega, r), frame.velocity),
			angular: omega
		});
	}
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
