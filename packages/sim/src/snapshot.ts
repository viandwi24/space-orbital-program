/** Builds the plain-data `Snapshot` the host reads (protocol.ts). Read-only: never mutates sim state. */
import {
	bodyId,
	partId,
	type PartSnapshot,
	type Snapshot,
	type EntityId,
	type VesselSnapshot
} from '@orbital/core';
import { add, sub } from '@orbital/kepler';
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
import { ZERO, qAboutY, qRotate } from './math.ts';
import { elementsOf, motionOf } from './orbit.ts';

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
		orientation = root.rotation;
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
		orientation = vessel.orientation;
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
				orientation,
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
