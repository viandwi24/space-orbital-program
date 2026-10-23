/**
 * Robotic joints as built (plan 306, ADR 0269): a hinge, servo, rotor or piston moves the parts on
 * its moving side by re-posing them in the design frame, inside the vessel's one body. No physics
 * joints. Run between steps (after the backend step), so the body rebuild drops no queued force.
 */
import type { EntityId, JointSpec, Quat, Vec3 } from '@orbital/core';
import { add, scale, sub } from '@orbital/kepler';
import { cross } from '@orbital/kepler';
import {
	designCom,
	frameOfVessel,
	moduleDefOf,
	moduleState,
	partDefOf,
	partMass,
	partOf,
	vesselOf,
	type SimCore
} from './core.ts';
import { bodyMotion, inertiaApply, inertiaSolve, refreshColliders } from './frames.ts';
import { inertiaOf } from './parts.ts';
import { qMul, qNormalize, qRotate } from './math.ts';
import { partRotation } from './parts.ts';

/** A vessel's moving joints are posed (and its body rebuilt) at most this often, s (ADR 0269 point 4). */
export const JOINT_POSE_INTERVAL = 0.1;

const posedAt = new WeakMap<SimCore, Map<EntityId, number>>();
/** The counter-spin each vessel's root carries while a joint moves, world axes, rad/s (plan 390). */
const counterSpin = new WeakMap<SimCore, Map<EntityId, Vec3>>();

/** Rotation by `angle` rad about the unit `axis`. */
function qAboutAxis(axis: Vec3, angle: number): Quat {
	const s = Math.sin(angle / 2);
	return { x: axis.x * s, y: axis.y * s, z: axis.z * s, w: Math.cos(angle / 2) };
}

/**
 * The parts reached from `partId` through its attachments on `node`, without crossing `partId`
 * (the joint's moving side).
 */
export function movingSide(core: SimCore, partId: EntityId, node: string): Set<EntityId> {
	const vessel = partOf(core, partId).vessel;
	const side = new Set<EntityId>();
	const queue: EntityId[] = [];
	for (const a of partOf(core, partId).attachments) {
		if (a.node === node && core.world.hasEntity(a.peer)) queue.push(a.peer);
	}
	while (queue.length > 0) {
		const id = queue.pop()!;
		if (id === partId || side.has(id)) continue;
		const part = partOf(core, id);
		if (part.vessel !== vessel) continue;
		side.add(id);
		for (const a of part.attachments) {
			if (core.world.hasEntity(a.peer)) queue.push(a.peer);
		}
	}
	return side;
}

/** Turn or slide the joint's moving side by `delta` (rad or m) about its current pivot and axis. */
function applyJoint(
	core: SimCore,
	partId: EntityId,
	spec: JointSpec,
	delta: number
): Array<{ id: EntityId; from: Vec3; to: Vec3; spin?: Vec3 }> {
	const part = partOf(core, partId);
	const vessel = vesselOf(core, part.vessel);
	const turn = partRotation(part);
	const axis = qRotate(turn, spec.axis);
	const pivot = add(part.designPos, qRotate(turn, spec.pivot));
	let side = movingSide(core, partId, spec.node);
	// the root never moves in the design frame: the other side moves the other way (point 3)
	if (side.has(vessel.root)) {
		side = new Set(vessel.parts.filter((id) => !side.has(id)));
		delta = -delta;
	}
	const q = spec.kind === 'rotate' ? qAboutAxis(axis, delta) : undefined;
	const shift = spec.kind === 'translate' ? scale(axis, delta) : undefined;
	const move = (p: Vec3): Vec3 => (q ? add(pivot, qRotate(q, sub(p, pivot))) : add(p, shift!));
	const moved: Array<{ id: EntityId; from: Vec3; to: Vec3; spin?: Vec3 }> = [];
	const spin = q ? scale(axis, delta / JOINT_POSE_INTERVAL) : undefined;
	for (const id of side) {
		const p = partOf(core, id);
		const from = p.designPos;
		p.designPos = move(p.designPos);
		moved.push({ id, from, to: p.designPos, ...(spin ? { spin } : {}) });
		if (q) p.rotation = qNormalize(qMul(q, partRotation(p)));
		if (p.link) p.link = { peer: p.link.peer, point: move(p.link.point) };
	}
	return moved;
}

/**
 * Pose every flight vessel's joints whose value moved since the pose applied last, at most every
 * `JOINT_POSE_INTERVAL` per vessel, and rebuild that vessel's body.
 */
export function stepJoints(core: SimCore): void {
	let times = posedAt.get(core);
	if (!times) posedAt.set(core, (times = new Map()));
	for (const frame of core.frames) {
		if (!frame.inUse) continue;
		for (const vesselId of frame.vessels.slice()) {
			if (core.t - (times.get(vesselId) ?? -Infinity) < JOINT_POSE_INTERVAL - 1e-9) continue;
			let moved = false;
			const motion: Array<{ id: EntityId; from: Vec3; to: Vec3; spin?: Vec3 }> = [];
			for (const partId of vesselOf(core, vesselId).parts) {
				for (const m of partOf(core, partId).modules) {
					const joint = moduleDefOf(core, m.id).joint;
					if (!joint) continue;
					const state = moduleState(core, partId, m.id) as { applied?: number };
					const spec = joint(m.config, state);
					if (!spec) continue;
					const delta = spec.value - (state.applied ?? 0);
					if (Math.abs(delta) < 1e-9) continue;
					motion.push(...applyJoint(core, partId, spec, delta));
					state.applied = spec.value;
					moved = true;
				}
			}
			if (moved) {
				times.set(vesselId, core.t);
				// the last counter-spin comes off before the rebuild, which keeps the spin that is left
				spinBy(core, vesselId, scale(counter(core).get(vesselId) ?? { x: 0, y: 0, z: 0 }, -1));
				counter(core).delete(vesselId);
				refreshColliders(core, vesselId, true);
				counterRotate(core, vesselId, motion);
			} else if (counter(core).has(vesselId)) {
				spinBy(core, vesselId, scale(counter(core).get(vesselId)!, -1));
				counter(core).delete(vesselId);
			}
		}
	}
}

const counter = (core: SimCore): Map<EntityId, Vec3> => {
	let c = counterSpin.get(core);
	if (!c) counterSpin.set(core, (c = new Map()));
	return c;
};

/**
 * Keep the vessel's angular momentum while parts swing (plan 390, ADR 0334): the moving parts carry
 * `L = sum m (r - com) x v` (their re-posed motion over one pose interval), and the rest turns the
 * other way by `I^-1 L` while they move, as a free body does. The previous offset is taken off first,
 * so a joint that stops leaves the root turned by what it counter-rotated and no spin.
 */
function counterRotate(
	core: SimCore,
	vesselId: EntityId,
	motion: ReadonlyArray<{ id: EntityId; from: Vec3; to: Vec3; spin?: Vec3 }>
): void {
	const frame = frameOfVessel(core, vesselId);
	const body = frame?.bodies.get(vesselId);
	if (!frame || !body) return;
	const m = bodyMotion(frame, body);
	const vessel = vesselOf(core, vesselId);
	const com = designCom(core, vessel.parts);
	let L: Vec3 = { x: 0, y: 0, z: 0 };
	for (const mv of motion) {
		if (!core.world.hasEntity(mv.id)) continue;
		const mass = partMass(core, mv.id);
		const r = sub(mv.to, com);
		const v = scale(sub(mv.to, mv.from), 1 / JOINT_POSE_INTERVAL);
		const c = cross(r, v);
		L = { x: L.x + mass * c.x, y: L.y + mass * c.y, z: L.z + mass * c.z };
		// a part turned by the joint also turns about its own centre
		if (mv.spin) {
			const part = partOf(core, mv.id);
			const own = inertiaApply(
				inertiaOf(partDefOf(core, part), mass),
				{ x: 0, y: 0, z: 0, w: 1 },
				partRotation(part),
				mv.spin
			);
			L = { x: L.x + own.x, y: L.y + own.y, z: L.z + own.z };
		}
	}
	// body axes to the frame's
	const world = qRotate(m.rotation, L);
	const offset = scale(inertiaSolve(body.inertia, body.inertiaFrame, m.rotation, world), -1);
	const angular = {
		x: m.angular.x + offset.x,
		y: m.angular.y + offset.y,
		z: m.angular.z + offset.z
	};
	frame.backend.setVelocity(body.handle, { linear: m.linear, angular });
	if (motion.length > 0) counter(core).set(vesselId, offset);
}

/** Add `dw` to the vessel's spin (world axes). */
function spinBy(core: SimCore, vesselId: EntityId, dw: Vec3): void {
	const frame = frameOfVessel(core, vesselId);
	const body = frame?.bodies.get(vesselId);
	if (!frame || !body || (dw.x === 0 && dw.y === 0 && dw.z === 0)) return;
	const m = bodyMotion(frame, body);
	frame.backend.setVelocity(body.handle, {
		linear: m.linear,
		angular: { x: m.angular.x + dw.x, y: m.angular.y + dw.y, z: m.angular.z + dw.z }
	});
}
