/**
 * Module hook runner: builds the `ModuleContext` (including the `VesselApi` capabilities,
 * ADR 0015) for one module instance and calls its hooks.
 */
import type {
	Ambient,
	BodyHandle,
	EntityId,
	ModuleContext,
	PhysicsBackend,
	Transform,
	Vec3,
	VesselApi
} from '@orbital/core';
import { add, length } from '@orbital/kepler';
import { ambientAt } from './atmosphere.ts';
import { frameOfPart, moduleDefOf, moduleState, partOf, vesselOf, type SimCore } from './core.ts';
import { airVelocityAt, bodyOfFrame, centreOfMassInPart, partTransform } from './frames.ts';
import { isNonZero, qConj, qRotate } from './math.ts';
import { isTurned, partRotation } from './parts.ts';
import { effectiveControl } from './state.ts';
import { amountAvailable, depositResource, withdrawResource } from './resources.ts';
import { dataUse, storeData } from './data.ts';
import { creditScience, makeResult, vesselSituation } from './science.ts';
import { signalOf } from './comms.ts';
import { isFailed } from './reliability.ts';
import { sunExposure } from './sunlight.ts';
import { terrainBelow } from './terrain.ts';
import { notePower } from './power.ts';
import { queueDebris } from './debris.ts';
import { waterUnder } from './water.ts';

const needsFlight = (what: string): never => {
	throw new Error(
		`${what} needs the vessel in flight mode; on-rails hooks (updateOnRails) must not use forces or the physics backend`
	);
};

/** Stands in for the backend while a vessel is on rails: every call explains why it fails. */
const RAILS_BACKEND: PhysicsBackend = {
	createBody: () => needsFlight('physics.createBody'),
	removeBody: () => needsFlight('physics.removeBody'),
	createFixedJoint: () => needsFlight('physics.createFixedJoint'),
	removeJoint: () => needsFlight('physics.removeJoint'),
	applyForce: () => needsFlight('physics.applyForce'),
	applyTorque: () => needsFlight('physics.applyTorque'),
	setMass: () => needsFlight('physics.setMass'),
	contacts: () => needsFlight('physics.contacts'),
	step: () => needsFlight('physics.step'),
	getTransform: () => needsFlight('physics.getTransform'),
	setTransform: () => needsFlight('physics.setTransform'),
	getVelocity: () => needsFlight('physics.getVelocity'),
	setVelocity: () => needsFlight('physics.setVelocity'),
	dispose: () => needsFlight('physics.dispose')
};

function finiteVec(v: Vec3, what: string): void {
	if (!Number.isFinite(v.x + v.y + v.z)) throw new RangeError(`${what} must be finite`);
}

/** Context for module `moduleId` on `part`; `vesselId` is the part's current vessel. */
export function makeContext(core: SimCore, partId: EntityId, moduleId: string): ModuleContext {
	const part = partOf(core, partId);
	const vesselId = part.vessel;
	const vessel = vesselOf(core, vesselId);
	const instance = part.modules.find((m) => m.id === moduleId);
	if (!instance) throw new Error(`sim: part ${partId} has no module "${moduleId}"`);
	const frame = vessel.mode === 'flight' ? frameOfPart(core, partId) : undefined;

	/** The vessel's one body and the part's pose (ADR 0018: forces act on the body, at the part). */
	const pose = (): { backend: PhysicsBackend; transform: Transform; handle: BodyHandle } => {
		const body = frame?.bodies.get(vesselId);
		if (!frame || !body) return needsFlight(`module "${moduleId}": force or torque`);
		return {
			backend: frame.backend,
			transform: partTransform(core, frame, partId),
			handle: body.handle
		};
	};

	const api: VesselApi = {
		time: core.t,
		control: effectiveControl(vessel),
		get ambient(): Ambient {
			if (!frame) return { pressure: 0, density: 0, altitude: 0 };
			const { transform } = pose();
			const r = add(frame.origin, transform.position);
			const body = bodyOfFrame(core, frame);
			const altitude = length(r) - body.def.radius;
			const ground = terrainBelow(core, body, r) ?? 0;
			return { ...ambientAt(body.def, altitude), height: altitude - ground };
		},
		sunExposure: (dt, factor) => sunExposure(core, partId, dt, factor),
		groundClearance(point) {
			if (!frame) return undefined;
			const { transform } = pose();
			const local = point ?? { x: 0, y: 0, z: 0 };
			const r = add(frame.origin, add(transform.position, qRotate(transform.rotation, local)));
			const planet = bodyOfFrame(core, frame);
			const ground = waterUnder(core, planet, r) ? 0 : (terrainBelow(core, planet, r) ?? 0);
			return length(r) - planet.def.radius - ground;
		},
		applyForce(force, point) {
			finiteVec(force, 'force');
			const { backend, transform, handle } = pose();
			const world = qRotate(transform.rotation, force);
			if (isNonZero(force)) core.active.add(vesselId);
			if (point) {
				finiteVec(point, 'point');
				backend.applyForce(
					handle,
					world,
					add(transform.position, qRotate(transform.rotation, point))
				);
			} else backend.applyForce(handle, world, transform.position);
		},
		airVelocity(point) {
			if (point) finiteVec(point, 'point');
			if (!frame) return needsFlight(`module "${moduleId}": airVelocity`);
			return airVelocityAt(core, frame, partId, point ?? { x: 0, y: 0, z: 0 });
		},
		get centreOfMass(): Vec3 {
			if (!frame) return needsFlight(`module "${moduleId}": centreOfMass`);
			return centreOfMassInPart(core, frame, partId);
		},
		get torqueDemand(): Vec3 {
			// The control is about the vessel axes; a turned part sees it rotated back (ADR 0034, 0071).
			const c = effectiveControl(vessel);
			if (!isTurned(part)) return { x: c.pitch, y: c.roll, z: c.yaw };
			return qRotate(qConj(partRotation(part)), { x: c.pitch, y: c.roll, z: c.yaw });
		},
		torqueDemandMasked(mask) {
			const c = effectiveControl(vessel);
			const v = { x: c.pitch * mask.x, y: c.roll * mask.y, z: c.yaw * mask.z };
			return isTurned(part) ? qRotate(qConj(partRotation(part)), v) : v;
		},
		translateDemandMasked(mask) {
			const t = vessel.translate ?? { x: 0, y: 0, z: 0 };
			const v = { x: t.x * mask.x, y: t.y * mask.y, z: t.z * mask.z };
			return isTurned(part) ? qRotate(qConj(partRotation(part)), v) : v;
		},
		get rcs(): boolean {
			return vessel.rcs === true;
		},
		get translateDemand(): Vec3 {
			const t = vessel.translate ?? { x: 0, y: 0, z: 0 };
			if (!isTurned(part)) return { x: t.x, y: t.y, z: t.z };
			return qRotate(qConj(partRotation(part)), t);
		},
		applyTorque(torque) {
			finiteVec(torque, 'torque');
			const { backend, transform, handle } = pose();
			if (isNonZero(torque)) core.active.add(vesselId);
			backend.applyTorque(handle, qRotate(transform.rotation, torque));
		},
		resources: {
			amount: (resource) => amountAvailable(core, vessel, partId, resource),
			withdraw: (resource, amount) => withdrawResource(core, vessel, partId, resource, amount),
			deposit: (resource, amount) => depositResource(core, vessel, partId, resource, amount)
		},
		data: {
			store: (item) => storeData(core, part.vessel, item),
			used: () => dataUse(core, part.vessel).used,
			capacity: () => dataUse(core, part.vessel).capacity
		},
		situation: () => vesselSituation(core, part.vessel),
		science: {
			result: (experiment) => makeResult(core, partId, experiment),
			credit: (subject, value) => creditScience(core, subject, value, 'recovered')
		},
		signal: () => signalOf(core, part.vessel),
		detach(node, impulse = 0) {
			if (!Number.isFinite(impulse) || impulse < 0) {
				throw new RangeError(`detach impulse must be a finite number >= 0, got ${impulse}`);
			}
			core.pending.push({ part: partId, node, impulse });
		},
		releaseLink() {
			// a connector lets go of its far end (plan 313): as a split cuts it
			delete part.link;
		},
		spawnDebris(spec) {
			finiteVec(spec.offset, 'debris offset');
			finiteVec(spec.velocity, 'debris velocity');
			queueDebris(core, { from: partId, ...spec });
		}
	};

	return {
		world: core.world,
		events: core.events,
		registries: core.registries,
		physics: frame?.backend ?? RAILS_BACKEND,
		entity: partId,
		config: instance.config,
		state: moduleState(core, partId, moduleId),
		vessel: api
	};
}

/** Calls `update` (flight) or `updateOnRails` (rails) on every module of every part of the vessel. */
export function runUpdateHooks(core: SimCore, vesselId: EntityId, dt: number): void {
	const vessel = vesselOf(core, vesselId);
	const rails = vessel.mode === 'on-rails';
	for (const partId of vessel.parts.slice()) {
		for (const m of partOf(core, partId).modules) {
			const def = moduleDefOf(core, m.id);
			// On rails a module with a `background` closed form is worked by the tick instead (ADR 0171).
			const hook = rails ? (def.background ? undefined : def.updateOnRails) : def.update;
			// a failed module stops working (plan 130, ADR 0156 point 2)
			if (hook && !isFailed(core, partId, m.id)) hook(makeContext(core, partId, m.id), dt);
		}
	}
	notePower(core, vesselId);
}

/** Calls `onStage` on every module of `partId`. */
export function runStageHooks(core: SimCore, partId: EntityId): void {
	for (const m of partOf(core, partId).modules) {
		const hook = moduleDefOf(core, m.id).onStage;
		if (hook && !isFailed(core, partId, m.id)) hook(makeContext(core, partId, m.id));
	}
}
