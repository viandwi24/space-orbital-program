/** Builds the plain-data `Snapshot` the host reads (protocol.ts). Read-only: never mutates sim state. */
import {
	bodyId,
	partId,
	type PartSnapshot,
	type Snapshot,
	type EntityId,
	type VesselSnapshot
} from '@orbital/core';
import { add, cross, sub } from '@orbital/kepler';
import {
	designCom,
	frameOfVessel,
	moduleDefOf,
	moduleState,
	partOf,
	vesselIds,
	vesselOf,
	type SimCore
} from './core.ts';
import { partPose, partVelocity } from './frames.ts';
import { ZERO, qAboutY, qMul, qRotate } from './math.ts';
import { elementsOf, motionOf, orientationOf } from './orbit.ts';

function moduleViews(core: SimCore, part: EntityId): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const m of partOf(core, part).modules) {
		const view = moduleDefOf(core, m.id).snapshot;
		if (view) out[m.id] = view(moduleState(core, part, m.id));
	}
	return out;
}

function vesselSnapshot(core: SimCore, id: EntityId): VesselSnapshot {
	const vessel = vesselOf(core, id);
	const frame = frameOfVessel(core, id);
	const motion = motionOf(core, vessel);
	let position;
	let velocity;
	let orientation;
	const parts: PartSnapshot[] = [];
	if (frame) {
		const root = partPose(core, frame, vessel.root);
		position = root.position;
		orientation = vessel.orientation; // the body axes; a part's own yaw is in its snapshot
		velocity = add(frame.velocity, partVelocity(core, frame, vessel.root));
		for (const partEntity of vessel.parts) {
			const pose = partPose(core, frame, partEntity);
			parts.push({
				id: partEntity,
				definition: partId(partOf(core, partEntity).definition),
				position: sub(pose.position, root.position),
				orientation: pose.rotation,
				modules: moduleViews(core, partEntity),
				temperature: partOf(core, partEntity).temperature
			});
		}
	} else {
		orientation = orientationOf(core, vessel);
		const rootDesign = partOf(core, vessel.root).designPos;
		const com = designCom(core, vessel.parts);
		position = sub(motion.r, qRotate(orientation, sub(com, rootDesign)));
		velocity = motion.v;
		for (const partEntity of vessel.parts) {
			const p = partOf(core, partEntity);
			parts.push({
				id: partEntity,
				definition: partId(p.definition),
				position: qRotate(orientation, sub(p.designPos, rootDesign)),
				orientation: p.yaw === 0 ? orientation : qMul(orientation, qAboutY(p.yaw)),
				modules: moduleViews(core, partEntity),
				temperature: p.temperature
			});
		}
	}
	const snapshot: VesselSnapshot = {
		id,
		mode: vessel.mode,
		soi: bodyId(vessel.soi),
		position,
		velocity,
		orientation,
		parts
	};
	// A vessel fixed to the ground follows no orbit: the conic through its inertial state would
	// dip below the surface (ADR 0024).
	if (vessel.rails?.kind === 'surface') {
		// The root part's velocity, like a flight vessel's (the orbital branch reports the COM's).
		snapshot.velocity = cross({ x: 0, y: core.body.omega, z: 0 }, position);
		snapshot.surface = true;
		return snapshot;
	}
	const orbit =
		vessel.rails?.kind === 'elements'
			? vessel.rails.elements
			: elementsOf(core.body.mu, motion.r, motion.v, core.t);
	if (orbit) snapshot.orbit = orbit;
	return snapshot;
}

export function takeSnapshot(core: SimCore): Snapshot {
	return {
		t: core.t,
		vessels: vesselIds(core).map((id) => vesselSnapshot(core, id)),
		bodies: [
			{
				id: bodyId(core.body.def.id),
				position: { ...ZERO },
				rotation: qAboutY(core.body.omega * core.t)
			}
		]
	};
}
