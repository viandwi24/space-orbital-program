import type {
	BodyHandle,
	BodyKind,
	BodyShape,
	JointHandle,
	PhysicsBackend,
	Quat,
	Transform,
	Vec3
} from '@orbital/core';
import { assertBodyParams, deriveInertia } from './inertia.ts';

interface MockBody {
	kind: BodyKind;
	shape: BodyShape;
	mass: number;
	inertia: Vec3;
	position: Vec3;
	rotation: Quat;
	linear: Vec3;
	angular: Vec3;
	force: Vec3;
	torque: Vec3;
}

/**
 * Cheap stand-in for tests that do not need Rapier: semi-implicit Euler for dynamic bodies,
 * velocity-only motion for kinematic ones, no collisions, and joints that are recorded and
 * validated but NOT enforced. Torque ignores body rotation (inertia is applied about world axes),
 * so it is only exact for spherical inertia. Compound shapes are accepted but only the mass
 * counts: `centerOfMass` and `inertiaFrame` are ignored (the origin is the centre of mass). Same
 * one-step force lifetime as the real backend.
 */
export function createMockBackend(): PhysicsBackend {
	const bodies = new Map<number, MockBody>();
	const joints = new Map<number, [number, number]>();
	let nextBody = 1;
	let nextJoint = 1;

	function get(h: BodyHandle): MockBody {
		const b = bodies.get(h);
		if (!b) throw new Error(`physics(mock): unknown or removed body handle ${h}`);
		return b;
	}

	return {
		createBody(desc) {
			assertBodyParams(desc.mass, desc.shape, desc.inertia);
			const id = nextBody++;
			bodies.set(id, {
				kind: desc.kind ?? 'dynamic',
				shape: desc.shape,
				mass: desc.mass,
				inertia: desc.inertia ?? deriveInertia(desc.shape, desc.mass),
				position: { ...desc.position },
				rotation: { ...desc.rotation },
				linear: { ...(desc.linearVelocity ?? { x: 0, y: 0, z: 0 }) },
				angular: { ...(desc.angularVelocity ?? { x: 0, y: 0, z: 0 }) },
				force: { x: 0, y: 0, z: 0 },
				torque: { x: 0, y: 0, z: 0 }
			});
			return id as BodyHandle;
		},
		removeBody(h) {
			get(h);
			bodies.delete(h);
			for (const [j, [a, b]] of joints) if (a === h || b === h) joints.delete(j);
		},
		createFixedJoint(a, b) {
			get(a);
			get(b);
			const id = nextJoint++;
			joints.set(id, [a, b]);
			return id as JointHandle;
		},
		removeJoint(h) {
			if (!joints.delete(h)) throw new Error(`physics(mock): unknown joint handle ${h}`);
		},
		applyForce(h, f, point) {
			const b = get(h);
			b.force.x += f.x;
			b.force.y += f.y;
			b.force.z += f.z;
			if (point) {
				const r = {
					x: point.x - b.position.x,
					y: point.y - b.position.y,
					z: point.z - b.position.z
				};
				b.torque.x += r.y * f.z - r.z * f.y;
				b.torque.y += r.z * f.x - r.x * f.z;
				b.torque.z += r.x * f.y - r.y * f.x;
			}
		},
		applyTorque(h, t) {
			const b = get(h);
			b.torque.x += t.x;
			b.torque.y += t.y;
			b.torque.z += t.z;
		},
		setMass(h, mass, inertia) {
			const b = get(h);
			assertBodyParams(mass, b.shape, inertia);
			b.mass = mass;
			b.inertia = inertia ?? deriveInertia(b.shape, mass);
		},
		step(dt) {
			if (!Number.isFinite(dt) || dt <= 0) {
				throw new Error(`physics(mock): step dt must be a positive finite number, got ${dt}`);
			}
			for (const b of bodies.values()) {
				if (b.kind === 'dynamic') {
					b.linear.x += (b.force.x / b.mass) * dt;
					b.linear.y += (b.force.y / b.mass) * dt;
					b.linear.z += (b.force.z / b.mass) * dt;
					b.angular.x += (b.torque.x / b.inertia.x) * dt;
					b.angular.y += (b.torque.y / b.inertia.y) * dt;
					b.angular.z += (b.torque.z / b.inertia.z) * dt;
				}
				b.force = { x: 0, y: 0, z: 0 };
				b.torque = { x: 0, y: 0, z: 0 };
				if (b.kind === 'fixed') continue;
				b.position.x += b.linear.x * dt;
				b.position.y += b.linear.y * dt;
				b.position.z += b.linear.z * dt;
				// q += dt/2 · (ω, 0) ⊗ q, then renormalise.
				const { x, y, z, w } = b.rotation;
				const o = b.angular;
				const h = dt / 2;
				const nx = x + h * (o.x * w + o.y * z - o.z * y);
				const ny = y + h * (o.y * w + o.z * x - o.x * z);
				const nz = z + h * (o.z * w + o.x * y - o.y * x);
				const nw = w + h * (-o.x * x - o.y * y - o.z * z);
				const n = Math.hypot(nx, ny, nz, nw);
				b.rotation = { x: nx / n, y: ny / n, z: nz / n, w: nw / n };
			}
		},
		getTransform(h): Transform {
			const b = get(h);
			return { position: { ...b.position }, rotation: { ...b.rotation } };
		},
		setTransform(h, t) {
			const b = get(h);
			b.position = { ...t.position };
			b.rotation = { ...t.rotation };
		},
		getVelocity(h) {
			const b = get(h);
			return { linear: { ...b.linear }, angular: { ...b.angular } };
		},
		setVelocity(h, v) {
			const b = get(h);
			b.linear = { ...v.linear };
			b.angular = { ...v.angular };
		},
		dispose() {
			bodies.clear();
			joints.clear();
		}
	};
}
