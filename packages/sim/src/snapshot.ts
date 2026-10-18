/** Builds the plain-data `Snapshot` the host reads (protocol.ts). Read-only: never mutates sim state. */
import { milestonesSnapshot } from './milestones.ts';
import { rangeSnapshot } from './range.ts';
import {
	bodyId,
	partId,
	type PartSnapshot,
	type Snapshot,
	type EntityId,
	type Quat,
	type Vec3,
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
import { dataUse, storagesOf } from './data.ts';
import { rosterSnapshot, vesselCrewSnapshot } from './crew.ts';
import { scienceSnapshot, vesselScienceSnapshot } from './science.ts';
import { networkSnapshot } from './comms.ts';
import { lifeSupportSnapshot } from './life.ts';
import { actionsSnapshot } from './actions.ts';
import { objectivesSnapshot } from './objectives.ts';
import { nodeSnapshots } from './maneuver.ts';
import { partPose, partVelocity } from './frames.ts';
import { bodyOfVessel, rotationAt, spinAt, systemPosition } from './bodies.ts';
import { qAboutY, qMul, qRotate } from './math.ts';
import { isTurned, partRotation } from './parts.ts';
import { elementsOf, motionOf, orientationOf } from './orbit.ts';
import { resolveTarget } from './target.ts';
import { terrainUnder } from './terrain.ts';
import { economySnapshot, quoteRecovery, recoveryBlocker } from './economy.ts';
import { sitesSnapshot } from './buildings.ts';

function moduleViews(core: SimCore, part: EntityId): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const m of partOf(core, part).modules) {
		const view = moduleDefOf(core, m.id).snapshot;
		if (view) out[m.id] = view(moduleState(core, part, m.id));
	}
	return out;
}

/**
 * A connector's far end for the snapshot (ADR 0071): the peer part and the point on its surface,
 * relative to the vessel's root origin in the inertial axes like `PartSnapshot.position`.
 */
function linkOf(
	core: SimCore,
	partEntity: EntityId,
	rootRotation: Quat
): { link?: { peer: EntityId; point: Vec3 } } {
	const part = partOf(core, partEntity);
	if (!part.link) return {};
	const vessel = vesselOf(core, part.vessel);
	const rootDesign = partOf(core, vessel.root).designPos;
	return {
		link: { peer: part.link.peer, point: qRotate(rootRotation, sub(part.link.point, rootDesign)) }
	};
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
				temperature: partOf(core, partEntity).temperature,
				...linkOf(core, partEntity, root.rotation)
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
				orientation: isTurned(p) ? qMul(orientation, partRotation(p)) : orientation,
				modules: moduleViews(core, partEntity),
				temperature: p.temperature,
				...linkOf(core, partEntity, orientation)
			});
		}
	}
	const snapshot: VesselSnapshot = {
		id,
		name: vessel.name,
		mode: vessel.mode,
		soi: bodyId(vessel.soi),
		position,
		velocity,
		orientation,
		parts
	};
	snapshot.sas = {
		mode: vessel.sas.mode,
		reference: vessel.sas.reference,
		error: vessel.sas.error
	};
	snapshot.nodes = nodeSnapshots(core, vessel);
	const target = resolveTarget(core, vessel);
	if (target) snapshot.target = target;
	if (recoveryBlocker(core, id) === undefined) snapshot.recovery = quoteRecovery(core, id);
	if (storagesOf(core, id).length > 0) snapshot.data = dataUse(core, id);
	const crew = vesselCrewSnapshot(core, id);
	if (crew) snapshot.crew = crew;
	const life = lifeSupportSnapshot(core, id);
	if (life) snapshot.lifeSupport = life;
	const science = vesselScienceSnapshot(core, id);
	if (science) snapshot.science = science;
	if (vessel.mode === 'flight') {
		const actions = actionsSnapshot(core, id);
		if (actions) snapshot.actions = actions;
	}
	const body = bodyOfVessel(core, vessel);
	if (body.terrain) snapshot.terrainHeight = terrainUnder(core, body, position);
	// A vessel fixed to the ground follows no orbit: the conic through its inertial state would
	// dip below the surface (ADR 0024).
	if (vessel.rails?.kind === 'surface') {
		// The root part's velocity, like a flight vessel's (the orbital branch reports the COM's).
		snapshot.velocity = cross(spinAt(body, core.t), position);
		snapshot.surface = true;
		return snapshot;
	}
	const orbit =
		vessel.rails?.kind === 'elements'
			? vessel.rails.elements
			: elementsOf(body.mu, motion.r, motion.v, core.t);
	if (orbit) snapshot.orbit = orbit;
	return snapshot;
}

export function takeSnapshot(core: SimCore): Snapshot {
	const objectives = objectivesSnapshot(core);
	const roster = rosterSnapshot(core);
	const science = scienceSnapshot(core);
	const network = networkSnapshot(core);
	const milestones = milestonesSnapshot(core);
	const range = rangeSnapshot(core);
	return {
		t: core.t,
		vessels: vesselIds(core).map((id) => vesselSnapshot(core, id)),
		bodies: [...core.bodies.values()].map((body) => ({
			id: bodyId(body.def.id),
			position: systemPosition(body, core.t),
			rotation: rotationAt(body, core.t)
		})),
		rules: rulesView(core),
		economy: economySnapshot(core),
		sites: sitesSnapshot(core),
		...(objectives ? { objectives } : {}),
		...(science ? { science } : {}),
		...(network ? { network } : {}),
		...(milestones ? { milestones } : {}),
		...(range ? { range } : {}),
		...(roster ? { crew: roster } : {})
	};
}

/** Registered rules' values, rebuilt only after a `set-rule` (ADR 0111 point 5). */
export function rulesView(core: SimCore): Readonly<Record<string, boolean | number | string>> {
	if (core.rulesView === null) {
		const view: Record<string, boolean | number | string> = {};
		for (const rule of core.registries.rules.list()) {
			const value = core.info.rules[rule.id];
			if (value !== undefined) view[rule.id] = value;
		}
		core.rulesView = Object.freeze(view);
	}
	return core.rulesView;
}
