/**
 * Robotic joints as built (plan 306, ADR 0269): a hinge, servo, rotor or piston moves the parts on
 * its moving side by re-posing them in the design frame, inside the vessel's one body. No physics
 * joints. Run between steps (after the backend step), so the body rebuild drops no queued force.
 */
import type { EntityId, JointSpec, Quat, Vec3 } from '@orbital/core';
import { add, scale, sub } from '@orbital/kepler';
import { moduleDefOf, moduleState, partOf, vesselOf, type SimCore } from './core.ts';
import { refreshColliders } from './frames.ts';
import { qMul, qNormalize, qRotate } from './math.ts';
import { partRotation } from './parts.ts';

/** A vessel's moving joints are posed (and its body rebuilt) at most this often, s (ADR 0269 point 4). */
export const JOINT_POSE_INTERVAL = 0.1;

const posedAt = new WeakMap<SimCore, Map<EntityId, number>>();

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
function applyJoint(core: SimCore, partId: EntityId, spec: JointSpec, delta: number): void {
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
	for (const id of side) {
		const p = partOf(core, id);
		p.designPos = move(p.designPos);
		if (q) p.rotation = qNormalize(qMul(q, partRotation(p)));
		if (p.link) p.link = { peer: p.link.peer, point: move(p.link.point) };
	}
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
			for (const partId of vesselOf(core, vesselId).parts) {
				for (const m of partOf(core, partId).modules) {
					const joint = moduleDefOf(core, m.id).joint;
					if (!joint) continue;
					const state = moduleState(core, partId, m.id) as { applied?: number };
					const spec = joint(m.config, state);
					if (!spec) continue;
					const delta = spec.value - (state.applied ?? 0);
					if (Math.abs(delta) < 1e-9) continue;
					applyJoint(core, partId, spec, delta);
					state.applied = spec.value;
					moved = true;
				}
			}
			if (moved) {
				times.set(vesselId, core.t);
				refreshColliders(core, vesselId, true);
			}
		}
	}
}
