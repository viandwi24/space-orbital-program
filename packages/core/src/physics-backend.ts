/**
 * Physics adapter interface (ADR 0004). Interface and data types only; `@orbital/physics`
 * implements it (plan 004). All quantities are SI and expressed in the *local physics frame*
 * (units-and-frames.md): float32-safe magnitudes, axes identical to the body-centred inertial frame.
 */
import type { Quat, Transform, Vec3 } from './math.ts';

declare const handleBrand: unique symbol;
export type BodyHandle = number & { readonly [handleBrand]: 'BodyHandle' };
export type JointHandle = number & { readonly [handleBrand]: 'JointHandle' };

/** A single convex primitive; the building block of a compound shape. */
export type PrimitiveShape =
	| { type: 'box'; halfExtents: Vec3 }
	| { type: 'sphere'; radius: number }
	/** Capsule along the local Y axis: `halfHeight` is half the cylindrical section's length. */
	| { type: 'capsule'; halfHeight: number; radius: number };

/** A primitive placed in the body frame. */
export interface ShapePlacement {
	shape: PrimitiveShape;
	/** Offset of the primitive's centre from the body origin, body axes. */
	position: Vec3;
	/** Defaults to identity. */
	rotation?: Quat;
}

export type BodyShape =
	| PrimitiveShape
	/**
	 * Several primitives rigidly fixed to one body (plan 011, ADR 0018). The backend cannot derive
	 * mass properties from it: the caller passes `mass` and `inertia` (and `centerOfMass`).
	 */
	| { type: 'compound'; shapes: ShapePlacement[] };

/**
 * Where the mass sits. Both default to "at the body origin, inertia axes = body axes", which is
 * what every single-primitive body used before compound shapes.
 */
export interface MassPlacement {
	/** Centre of mass in body axes, relative to the body origin, m. */
	centerOfMass?: Vec3;
	/** Rotation from the principal inertia axes to the body axes. */
	inertiaFrame?: Quat;
}

export type BodyKind = 'dynamic' | 'kinematic' | 'fixed';

export interface BodyDesc extends MassPlacement {
	/** Defaults to `'dynamic'`. */
	kind?: BodyKind;
	shape: BodyShape;
	/** kg. */
	mass: number;
	/**
	 * Principal moments of inertia about the centre of mass, kg·m², along the axes given by
	 * `inertiaFrame` (body axes by default). Backend derives it from `shape` if omitted (not
	 * possible for compound shapes).
	 */
	inertia?: Vec3;
	position: Vec3;
	rotation: Quat;
	/** Velocity of the centre of mass, m/s. */
	linearVelocity?: Vec3;
	angularVelocity?: Vec3;
}

export interface Velocity {
	/** Velocity of the centre of mass, m/s. */
	linear: Vec3;
	/** rad/s about the local-frame axes (not body-fixed axes). */
	angular: Vec3;
}

export interface PhysicsBackend {
	createBody(desc: BodyDesc): BodyHandle;
	removeBody(handle: BodyHandle): void;

	/** `frameA`/`frameB` are the joint anchors expressed in each body's own frame. */
	createFixedJoint(a: BodyHandle, b: BodyHandle, frameA: Transform, frameB: Transform): JointHandle;
	removeJoint(handle: JointHandle): void;

	/**
	 * Force in newtons, local-frame axes, applied at `point` (local-frame position; the body's
	 * centre of mass when omitted). Forces act for the *next* `step` only and are then cleared, so
	 * `sim` re-applies them every step.
	 */
	applyForce(handle: BodyHandle, force: Vec3, point?: Vec3): void;
	/** Torque in N·m, local-frame axes; same single-step lifetime as `applyForce`. */
	applyTorque(handle: BodyHandle, torque: Vec3): void;
	/**
	 * Replace the mass properties. `placement` moves the centre of mass (and rotates the inertia
	 * axes); omitted fields reset to the defaults. The velocity of the centre of mass is preserved.
	 */
	setMass(handle: BodyHandle, mass: number, inertia?: Vec3, placement?: MassPlacement): void;

	/** Advance by `dt` seconds. The sim passes a constant dt; backends must not read a clock. */
	step(dt: number): void;

	/** Pose of the body *origin* (not the centre of mass). */
	getTransform(handle: BodyHandle): Transform;
	setTransform(handle: BodyHandle, transform: Transform): void;
	getVelocity(handle: BodyHandle): Velocity;
	setVelocity(handle: BodyHandle, velocity: Velocity): void;

	/** Release native resources (WASM memory). The backend is unusable afterwards. */
	dispose(): void;
}
