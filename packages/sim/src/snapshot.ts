/** Builds the plain-data `Snapshot` the host reads (protocol.ts). Read-only: never mutates sim state. */
import { partResourceSnapshot, vesselResourceSnapshot } from './transfer.ts';
import { tetherSnapshot } from './tethers.ts';
import { portAlignment, portSnapshots } from './docking.ts';
import { techSnapshot } from './tech.ts';
import { debugSnapshot } from './debug.ts';
import { warpLimit } from './warp-limits.ts';
import { milestonesSnapshot } from './milestones.ts';
import { stations } from './stations.ts';
import { rangeSnapshot } from './range.ts';
import { reliabilitySnapshot } from './reliability.ts';
import { alarmsSnapshot } from './alarms.ts';
import { siteSpotOf, vesselTypeOf } from './fleet.ts';
import {
	bodyId,
	partId,
	type PartSnapshot,
	type ResourceSnapshot,
	type Snapshot,
	type EntityId,
	type Quat,
	type Vec3,
	type VesselSnapshot
} from '@orbital/core';
import { add, cross, length, sub } from '@orbital/kepler';
import { ambientAt } from './atmosphere.ts';
import { DEFAULT_MAX_TEMPERATURE } from './constants.ts';
import {
	designCom,
	frameOfVessel,
	moduleDefOf,
	moduleState,
	partDefOf,
	partOf,
	vesselIds,
	vesselOf,
	type SimCore,
	controlProblem
} from './core.ts';
import { dataUse, storagesOf } from './data.ts';
import { rosterSnapshot, vesselCrewSnapshot } from './crew.ts';
import { scienceSnapshot, situationView, vesselScienceSnapshot } from './science.ts';
import { networkSnapshot } from './comms.ts';
import { lifeSupportSnapshot } from './life.ts';
import { actionsSnapshot } from './actions.ts';
import { objectivesSnapshot } from './objectives.ts';
import { agenciesSnapshot } from './agencies.ts';
import { overriddenChannels } from './programs.ts';
import type { VesselState } from './state.ts';
import { contractsSnapshot } from './contracts.ts';
import { strategiesSnapshot } from './strategies.ts';
import { discoverySnapshot } from './discovery.ts';
import { nodeSnapshots } from './maneuver.ts';
import { partPose, partVelocity } from './frames.ts';
import { bodyOfVessel, rotationAt, spinAt, systemPosition } from './bodies.ts';
import { qAboutY, qMul, qRotate } from './math.ts';
import { isTurned, partRotation } from './parts.ts';
import { elementsOf, motionOf, orientationOf } from './orbit.ts';
import { resolveTarget } from './target.ts';
import { autopilotSnapshot } from './autopilot.ts';
import { terrainUnder } from './terrain.ts';
import { economySnapshot, recoveryBlocker } from './economy.ts';
import { quoteRecovery } from './recovery.ts';
import { marketSnapshot } from './market.ts';
import { sitesSnapshot } from './buildings.ts';
import { vesselSituationNow } from './situation.ts';
import { aeroFacts } from './aero-facts.ts';
import { overlaysSnapshot, storesSnapshot } from './mod-runtime.ts';

/** The part's failure temperature, K (its definition's, else the default; plan 212). */
const maxTemperatureOf = (core: SimCore, part: EntityId): number =>
	partDefOf(core, partOf(core, part)).maxTemperature ?? DEFAULT_MAX_TEMPERATURE;

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

/** `{ resources }` for a part with stores (plan 213), else nothing. */
function withResources(core: SimCore, partId: EntityId): { resources?: ResourceSnapshot[] } {
	const resources = partResourceSnapshot(core, partId);
	return resources ? { resources } : {};
}

/** One vessel's snapshot (also what an autopilot reads, plan 310). */
export function vesselSnapshot(core: SimCore, id: EntityId): VesselSnapshot {
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
				maxTemperature: maxTemperatureOf(core, partEntity),
				index: partOf(core, partEntity).index,
				...linkOf(core, partEntity, root.rotation),
				...tetherSnapshot(core, partEntity),
				...withResources(core, partEntity)
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
				maxTemperature: maxTemperatureOf(core, partEntity),
				index: p.index,
				...linkOf(core, partEntity, orientation),
				...tetherSnapshot(core, partEntity),
				...withResources(core, partEntity)
			});
		}
	}
	const snapshot: VesselSnapshot = {
		id,
		name: vessel.name,
		type: vesselTypeOf(core, vessel),
		...(vessel.owner ? { owner: vessel.owner } : {}),
		mode: vessel.mode,
		soi: bodyId(vessel.soi),
		position,
		velocity,
		orientation,
		parts,
		nextStage: vessel.nextStage,
		...(vessel.launchedAt !== undefined ? { launchedAt: vessel.launchedAt } : {}),
		...(situationView(core, id).splashed ? { splashed: true } : {}),
		situation: vesselSituationNow(core, id),
		aero: aeroFacts(core, id),
		...(vessel.trim || vessel.trimYaw || vessel.trimRoll
			? { trim: { pitch: vessel.trim ?? 0, yaw: vessel.trimYaw ?? 0, roll: vessel.trimRoll ?? 0 } }
			: {}),
		...(vessel.controlPart !== undefined ? { controlPart: vessel.controlPart } : {}),
		...programView(core, vessel)
	};
	snapshot.sas = {
		mode: vessel.sas.mode,
		reference: vessel.sas.reference,
		error: vessel.sas.error,
		...(vessel.sas.direction ? { direction: { ...vessel.sas.direction } } : {}),
		...(vessel.mode === 'flight' && vessel.sas.mode !== 'off' && vessel.sas.accel !== undefined
			? { accel: vessel.sas.accel }
			: {})
	};
	const pilot = autopilotSnapshot(core, vessel);
	if (pilot) snapshot.autopilot = pilot;
	if (vessel.autopilotLast) snapshot.autopilotLast = structuredClone(vessel.autopilotLast);
	if (vessel.autopilotSettings)
		snapshot.autopilotSettings = structuredClone(vessel.autopilotSettings);
	snapshot.nodes = nodeSnapshots(core, vessel);
	const target = resolveTarget(core, vessel);
	if (target) {
		const port = portAlignment(core, id);
		snapshot.target = port ? { ...target, port } : target;
	}
	if (recoveryBlocker(core, id) === undefined) snapshot.recovery = quoteRecovery(core, id);
	const atSite = siteSpotOf(core, id);
	if (atSite) snapshot.atSite = atSite;
	const uncontrolled = controlProblem(core, vessel);
	if (uncontrolled) snapshot.uncontrolled = uncontrolled;
	if (vessel.rcs) snapshot.rcs = true;
	const resources = vesselResourceSnapshot(parts.map((p) => p.resources));
	if (resources) snapshot.resources = resources;
	if (vessel.transfers?.length) {
		snapshot.transfers = vessel.transfers.map((t) => ({
			resource: t.resource,
			from: [...t.from],
			to: [...t.to],
			rate: t.rate
		}));
	}
	const ports = portSnapshots(core, parts);
	if (ports) snapshot.ports = ports;
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
	const air = ambientAt(body.def, length(position) - body.def.radius);
	if (air.speedOfSound) {
		const airspeed = length(sub(velocity, cross(spinAt(body, core.t), position)));
		snapshot.mach = airspeed / air.speedOfSound;
	}
	let hottest: { part: EntityId; fraction: number } | undefined;
	for (const p of parts) {
		const fraction = (p.temperature ?? 0) / (p.maxTemperature ?? DEFAULT_MAX_TEMPERATURE);
		if (fraction > 0.5 && fraction > (hottest?.fraction ?? 0)) hottest = { part: p.id, fraction };
	}
	if (hottest) snapshot.hottest = hottest;
	// A vessel fixed to the ground follows no orbit: the conic through its inertial state would
	// dip below the surface (ADR 0024).
	if (vessel.rails?.kind === 'frozen') {
		snapshot.frozen = true; // held still during rails warp (plan 206): no path to show
		return snapshot;
	}
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
	const agencies = agenciesSnapshot(core);
	const contracts = contractsSnapshot(core);
	const strategies = strategiesSnapshot(core);
	const discovery = discoverySnapshot(core);
	const roster = rosterSnapshot(core);
	const science = scienceSnapshot(core);
	const network = networkSnapshot(core);
	const milestones = milestonesSnapshot(core);
	const stationList = stations(core).map((s) => ({
		control: s.control,
		items: s.items.map((i) => ({
			vessel: i.vessel,
			role: i.role,
			...(i.experiment ? { experiment: i.experiment } : {})
		})),
		power: s.power,
		linked: s.linked,
		experiments: s.experiments,
		working: s.working,
		...(s.reason ? { reason: s.reason } : {})
	}));
	const tech = techSnapshot(core);
	const range = rangeSnapshot(core);
	const reliability = reliabilitySnapshot(core);
	const alarms = alarmsSnapshot(core);
	return {
		t: core.t,
		vessels: vesselIds(core).map((id) => vesselSnapshot(core, id)),
		bodies: [...core.bodies.values()].map((body) => ({
			id: bodyId(body.def.id),
			position: systemPosition(body, core.t),
			rotation: rotationAt(body, core.t)
		})),
		rules: rulesView(core),
		...withStores(core),
		...withOverlays(core),
		debug: debugSnapshot(core),
		warpLimit: warpLimit(core),
		...(core.paused ? { paused: true } : {}),
		...(alarms ? { alarms } : {}),
		economy: { ...economySnapshot(core), ...marketSnapshot(core) },
		sites: sitesSnapshot(core),
		day: core.ticks.lastDay,
		...(objectives ? { objectives } : {}),
		...(agencies ? { agencies } : {}),
		...(contracts ? { contracts } : {}),
		...(strategies ? { strategies } : {}),
		...(discovery ? { discovery } : {}),
		...(science ? { science } : {}),
		...(network ? { network } : {}),
		...(milestones ? { milestones } : {}),
		...(stationList.length > 0 ? { stations: stationList } : {}),
		...(tech ? { tech } : {}),
		...(range ? { range } : {}),
		...(reliability ? { reliability } : {}),
		...(roster ? { crew: roster } : {})
	};
}

/** `{ overlays }` while a sim system published one (ADR 0296 point 3). */
function withOverlays(core: SimCore): { overlays?: Snapshot['overlays'] } {
	const overlays = overlaysSnapshot(core);
	return overlays ? { overlays } : {};
}

/** `{ stores }` once a mod wrote one (ADR 0292 point 4). */
function withStores(core: SimCore): { stores?: Readonly<Record<string, unknown>> } {
	const stores = storesSnapshot(core);
	return stores ? { stores } : {};
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

/** The vessel's script and the channels the player holds against it (plan 320, ADR 0276). */
function programView(
	core: SimCore,
	vessel: VesselState
): Pick<VesselSnapshot, 'override' | 'script'> {
	const held = overriddenChannels(core, vessel);
	const s = vessel.script;
	return {
		...(held.length > 0 ? { override: held } : {}),
		...(s ? { script: { name: s.name, resumed: s.resumed, startedAt: s.startedAt } } : {})
	};
}
