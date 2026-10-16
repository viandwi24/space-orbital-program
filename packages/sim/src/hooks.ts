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
import { partTransform } from './frames.ts';
import { isNonZero, qRotate } from './math.ts';
import { amountAvailable, depositResource, withdrawResource } from './resources.ts';

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
		control: vessel.control,
		get ambient(): Ambient {
			if (!frame) return { pressure: 0, density: 0, altitude: 0 };
			const { transform } = pose();
			const r = add(frame.origin, transform.position);
			return ambientAt(core.body.def, length(r) - core.body.def.radius);
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
		detach(node, impulse = 0) {
			if (!Number.isFinite(impulse) || impulse < 0) {
				throw new RangeError(`detach impulse must be a finite number >= 0, got ${impulse}`);
			}
			core.pending.push({ part: partId, node, impulse });
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
			const hook = rails ? def.updateOnRails : def.update;
			if (hook) hook(makeContext(core, partId, m.id), dt);
		}
	}
}

/** Calls `onStage` on every module of `partId`. */
export function runStageHooks(core: SimCore, partId: EntityId): void {
	for (const m of partOf(core, partId).modules) {
		const hook = moduleDefOf(core, m.id).onStage;
		if (hook) hook(makeContext(core, partId, m.id));
	}
}
