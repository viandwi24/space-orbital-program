import RAPIER from '@dimforge/rapier3d-compat';
import type {
	BodyDesc,
	BodyHandle,
	ContactPoint,
	JointHandle,
	MassPlacement,
	PhysicsBackend,
	PrimitiveShape,
	Quat,
	Transform,
	Vec3,
	Velocity
} from '@orbital/core';
import { assertBodyParams, deriveInertia } from './inertia.ts';

export interface RapierBackendOptions {
	/** Rapier constraint-solver iterations per step (Rapier default 4). */
	solverIterations?: number;
}

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };
const IDENTITY: Quat = { x: 0, y: 0, z: 0, w: 1 };

interface BodyRecord {
	body: RAPIER.RigidBody;
	shape: BodyDesc['shape'];
	joints: Set<number>;
	/** Colliders in creation order (index = `ContactPoint.shape`). */
	colliders: RAPIER.Collider[];
}
interface JointRecord {
	joint: RAPIER.ImpulseJoint;
	a: number;
	b: number;
}

/**
 * Creates a PhysicsBackend on Rapier (0.21, compat build). Async because the compat build
 * must `await RAPIER.init()` first (docs/research/rapier.md).
 *
 * Gravity is zero inside Rapier; `sim` applies it as forces. Rapier's `addForce` persists until
 * reset, so every body touched by `applyForce`/`applyTorque` is reset after each `step`
 * (the interface's one-step force lifetime).
 */
export async function createRapierBackend(
	options: RapierBackendOptions = {}
): Promise<PhysicsBackend> {
	await RAPIER.init();
	const world = new RAPIER.World(ZERO);
	if (options.solverIterations !== undefined) {
		world.integrationParameters.numSolverIterations = options.solverIterations;
	}

	const bodies = new Map<number, BodyRecord>();
	const joints = new Map<number, JointRecord>();
	// Bodies with pending forces/torques, in insertion order (deterministic).
	const loaded = new Set<number>();
	// Collider handle -> body handle and index within the body (contact readback).
	const colliderOwner = new Map<number, { body: number; shape: number }>();
	let nextBody = 1;
	let nextJoint = 1;
	let disposed = false;

	function live(): void {
		if (disposed) throw new Error('physics: backend has been disposed');
	}
	function rec(handle: BodyHandle): BodyRecord {
		live();
		const r = bodies.get(handle);
		if (!r) throw new Error(`physics: unknown or removed body handle ${handle}`);
		return r;
	}
	function setMassProps(
		r: BodyRecord,
		mass: number,
		inertia: Vec3 | undefined,
		placement: MassPlacement | undefined
	): void {
		assertBodyParams(mass, r.shape, inertia);
		r.body.setAdditionalMassProperties(
			mass,
			placement?.centerOfMass ?? ZERO,
			inertia ?? deriveInertia(r.shape, mass),
			placement?.inertiaFrame ?? IDENTITY,
			true
		);
		// Rapier applies new mass properties at the next step; forces applied before it (the sim's
		// per-step forces at a point) would see the stale centre of mass.
		r.body.recomputeMassPropertiesFromColliders();
	}
	// Density 0: all mass comes from setMassProps so mass/inertia are exactly as requested.
	function colliderOf(s: PrimitiveShape, desc: BodyDesc): RAPIER.ColliderDesc {
		const c = (
			s.type === 'box'
				? RAPIER.ColliderDesc.cuboid(s.halfExtents.x, s.halfExtents.y, s.halfExtents.z)
				: s.type === 'sphere'
					? RAPIER.ColliderDesc.ball(s.radius)
					: RAPIER.ColliderDesc.capsule(s.halfHeight, s.radius)
		).setDensity(0);
		if (desc.friction !== undefined) c.setFriction(desc.friction);
		if (desc.restitution !== undefined) c.setRestitution(desc.restitution);
		return c;
	}

	return {
		createBody(desc) {
			live();
			assertBodyParams(desc.mass, desc.shape, desc.inertia);
			for (const [name, v] of [
				['friction', desc.friction],
				['restitution', desc.restitution]
			] as const) {
				if (v !== undefined && (!Number.isFinite(v) || v < 0)) {
					throw new Error(`physics: ${name} must be a finite number >= 0, got ${v}`);
				}
			}
			const kind = desc.kind ?? 'dynamic';
			const rbDesc =
				kind === 'dynamic'
					? RAPIER.RigidBodyDesc.dynamic()
					: kind === 'kinematic'
						? RAPIER.RigidBodyDesc.kinematicVelocityBased()
						: RAPIER.RigidBodyDesc.fixed();
			rbDesc
				.setTranslation(desc.position.x, desc.position.y, desc.position.z)
				.setRotation(desc.rotation)
				.setCanSleep(false); // sim re-applies forces each step; sleeping would add state to determinism
			const lin = desc.linearVelocity ?? ZERO;
			const ang = desc.angularVelocity ?? ZERO;
			rbDesc.setLinvel(lin.x, lin.y, lin.z).setAngvel(ang);
			const body = world.createRigidBody(rbDesc);
			// Compound: one collider per placed primitive, in list order (determinism).
			const placed =
				desc.shape.type === 'compound'
					? desc.shape.shapes
					: [{ shape: desc.shape, position: ZERO, rotation: IDENTITY }];
			const id = nextBody++;
			const colliders: RAPIER.Collider[] = [];
			for (const p of placed) {
				const c = colliderOf(p.shape, desc).setTranslation(
					p.position.x,
					p.position.y,
					p.position.z
				);
				if (p.rotation) c.setRotation(p.rotation);
				// a shape's own friction wins by the minimum (a wheel against the ground, ADR 0161)
				if ('friction' in p && p.friction !== undefined)
					c.setFriction(p.friction).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min);
				const collider = world.createCollider(c, body);
				colliderOwner.set(collider.handle, { body: id, shape: colliders.length });
				colliders.push(collider);
			}
			const record: BodyRecord = { body, shape: desc.shape, joints: new Set(), colliders };
			setMassProps(record, desc.mass, desc.inertia, desc);
			bodies.set(id, record);
			// Handles are branded numbers minted only here.
			return id as BodyHandle;
		},

		removeBody(handle) {
			const r = rec(handle);
			for (const j of r.joints) {
				const jr = joints.get(j);
				if (!jr) continue;
				bodies.get(jr.a)?.joints.delete(j);
				bodies.get(jr.b)?.joints.delete(j);
				joints.delete(j); // Rapier drops attached joints with the body
			}
			loaded.delete(handle);
			for (const c of r.colliders) colliderOwner.delete(c.handle);
			world.removeRigidBody(r.body);
			bodies.delete(handle);
		},

		createFixedJoint(a, b, frameA, frameB) {
			const ra = rec(a);
			const rb = rec(b);
			if (a === b) throw new Error(`physics: cannot join body ${a} to itself`);
			const data = RAPIER.JointData.fixed(
				frameA.position,
				frameA.rotation,
				frameB.position,
				frameB.rotation
			);
			const joint = world.createImpulseJoint(data, ra.body, rb.body, true);
			// Jointed parts overlap by design; their colliders must not push each other apart.
			joint.setContactsEnabled(false);
			const id = nextJoint++;
			joints.set(id, { joint, a, b });
			ra.joints.add(id);
			rb.joints.add(id);
			return id as JointHandle;
		},

		removeJoint(handle) {
			live();
			const jr = joints.get(handle);
			if (!jr) throw new Error(`physics: unknown or removed joint handle ${handle}`);
			world.removeImpulseJoint(jr.joint, true);
			bodies.get(jr.a)?.joints.delete(handle);
			bodies.get(jr.b)?.joints.delete(handle);
			joints.delete(handle);
		},

		applyForce(handle, force, point) {
			const r = rec(handle);
			if (point) r.body.addForceAtPoint(force, point, true);
			else r.body.addForce(force, true);
			loaded.add(handle);
		},

		applyTorque(handle, torque) {
			rec(handle).body.addTorque(torque, true);
			loaded.add(handle);
		},

		setMass(handle, mass, inertia, placement) {
			setMassProps(rec(handle), mass, inertia, placement);
		},

		step(dt) {
			live();
			if (!Number.isFinite(dt) || dt <= 0) {
				throw new Error(`physics: step dt must be a positive finite number, got ${dt}`);
			}
			world.timestep = dt;
			world.step();
			for (const h of loaded) {
				const r = bodies.get(h);
				if (!r) continue;
				r.body.resetForces(false);
				r.body.resetTorques(false);
			}
			loaded.clear();
		},

		getTransform(handle): Transform {
			const body = rec(handle).body;
			const p = body.translation();
			const q = body.rotation();
			return {
				position: { x: p.x, y: p.y, z: p.z },
				rotation: { x: q.x, y: q.y, z: q.z, w: q.w }
			};
		},

		setTransform(handle, t) {
			const body = rec(handle).body;
			body.setTranslation(t.position, true);
			body.setRotation(t.rotation, true);
		},

		getVelocity(handle): Velocity {
			const body = rec(handle).body;
			const l = body.linvel();
			const a = body.angvel();
			return { linear: { x: l.x, y: l.y, z: l.z }, angular: { x: a.x, y: a.y, z: a.z } };
		},

		setVelocity(handle, v) {
			const body = rec(handle).body;
			body.setLinvel(v.linear, true);
			body.setAngvel(v.angular, true);
		},

		contacts(a, b) {
			rec(a);
			const rb = rec(b);
			const out: ContactPoint[] = [];
			for (const cb of rb.colliders) {
				// Colliders potentially in contact with `cb`; keep those that belong to `a`.
				const others: RAPIER.Collider[] = [];
				world.contactPairsWith(cb, (other) => {
					if (colliderOwner.get(other.handle)?.body === a) others.push(other);
				});
				for (const ca of others) {
					const shape = colliderOwner.get(ca.handle)!.shape;
					world.contactPair(ca, cb, (manifold) => {
						for (let i = 0; i < manifold.numSolverContacts(); i++) {
							const p = manifold.solverContactPoint(i);
							if (!p) continue;
							out.push({
								shape,
								point: { x: p.x, y: p.y, z: p.z },
								distance: manifold.solverContactDist(i)
							});
						}
					});
				}
			}
			return out.sort((x, y) => x.shape - y.shape);
		},

		dispose() {
			if (disposed) return;
			disposed = true;
			world.free();
			bodies.clear();
			joints.clear();
			loaded.clear();
			colliderOwner.clear();
		}
	};
}
