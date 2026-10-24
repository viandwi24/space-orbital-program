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
import { add, length, scale } from '@orbital/kepler';
import { motionOf, orientationOf } from './orbit.ts';
import { resolveTarget } from './target.ts';
import { ambientAt } from './atmosphere.ts';
import {
	frameOfPart,
	moduleDefOf,
	moduleState,
	partDefOf,
	partOf,
	vesselOf,
	type SimCore
} from './core.ts';
import { airVelocityAt, bodyOfFrame, centreOfMassInPart, partTransform } from './frames.ts';
import { isNonZero, qConj, qRotate } from './math.ts';
import { isTurned, partRotation } from './parts.ts';
import { effectiveControl } from './state.ts';
import { amountAvailable, depositResource, withdrawResource } from './resources.ts';
import { dataUse, storeData } from './data.ts';
import { creditScience, makeResult, vesselSituation } from './science.ts';
import { signalOf } from './comms.ts';
import { isFailed } from './reliability.ts';
import { moduleAction } from './actions.ts';
import { sunExposure } from './sunlight.ts';
import { terrainBelow } from './terrain.ts';
import { notePower } from './power.ts';
import { queueDebris, shieldedBy } from './debris.ts';
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
	setPairContacts: () => needsFlight('physics.setPairContacts'),
	ignoredPairs: () => needsFlight('physics.ignoredPairs'),
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
		sibling(otherId) {
			const other = part.modules.find((m) => m.id === otherId);
			if (!other) return undefined;
			const def = moduleDefOf(core, otherId);
			return def.snapshot?.(moduleState(core, partId, otherId) as never);
		},
		targetDirection() {
			const v = vesselOf(core, part.vessel);
			const t = resolveTarget(core, v);
			const away = t ? t.position : scale(motionOf(core, v).r, -1);
			const l = length(away);
			if (!(l > 0)) return undefined;
			const body = qConj(orientationOf(core, v));
			const local = qRotate(body, scale(away, 1 / l));
			return isTurned(part) ? qRotate(qConj(partRotation(part)), local) : local;
		},
		situation: () => vesselSituation(core, part.vessel),
		science: {
			result: (experiment) => makeResult(core, partId, experiment),
			credit: (subject, value) => creditScience(core, subject, value, 'recovered')
		},
		signal: () => signalOf(core, part.vessel),
		detach(node, impulse = 0, options) {
			if (!Number.isFinite(impulse) || impulse < 0) {
				throw new RangeError(`detach impulse must be a finite number >= 0, got ${impulse}`);
			}
			// a payload inside a closed bay or fairing cannot leave through its walls (plan 390)
			const closed = shieldedBy(core, part.vessel).get(partId);
			if (closed !== undefined) {
				throw new EnclosedError(partDefOf(core, partOf(core, closed)).title);
			}
			core.pending.push({
				part: partId,
				node,
				impulse,
				...(options?.consume ? { consume: true } : {})
			});
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

/** A separator inside a closed bay or fairing was fired (plan 390): the message names the bay. */
export class EnclosedError extends Error {
	constructor(readonly bay: string) {
		super(`${bay} is closed: open it first`);
	}
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
			// a flying module may call actions on other parts (plan 282: a sequencer's keyframes)
			if (!rails && def.drive && !isFailed(core, partId, m.id))
				runDrive(core, vesselId, partId, m.id, dt);
		}
	}
	notePower(core, vesselId);
}

/** Runs the calls `drive` asks for, as the target modules' own actions; a call with no target is skipped. */
function runDrive(
	core: SimCore,
	vesselId: EntityId,
	partId: EntityId,
	moduleId: string,
	dt: number
): void {
	const def = moduleDefOf(core, moduleId);
	const calls = def.drive!(makeContext(core, partId, moduleId), dt);
	if (calls.length === 0) return;
	const vessel = vesselOf(core, vesselId);
	for (const call of calls) {
		const target = vessel.parts.find((id) => partOf(core, id).index === call.part);
		if (target === undefined || !partOf(core, target).modules.some((m) => m.id === call.module))
			continue;
		const action = moduleAction(moduleDefOf(core, call.module), call.action);
		if (!action) continue;
		try {
			action(makeContext(core, target, call.module), ...call.args);
		} catch {
			// a call the target refuses (a locked joint, a bad value) is skipped, not fatal
		}
	}
}

/** Calls `onStage` on every module of `partId`. */
export function runStageHooks(core: SimCore, partId: EntityId): void {
	for (const m of partOf(core, partId).modules) {
		const hook = moduleDefOf(core, m.id).onStage;
		if (hook && !isFailed(core, partId, m.id)) hook(makeContext(core, partId, m.id));
	}
}
