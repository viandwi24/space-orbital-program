/**
 * Physics adapter interface (ADR 0004). Interface and data types only; `@orbital/physics`
 * implements it (plan 004). All quantities are SI and expressed in the *local physics frame*
 * (units-and-frames.md): float32-safe magnitudes, axes identical to the body-centred inertial frame.
 */
import type { Quat, Transform, Vec3 } from './math.ts';

declare const handleBrand: unique symbol;
export type BodyHandle = number & { readonly [handleBrand]: 'BodyHandle' };
export type JointHandle = number & { readonly [handleBrand]: 'JointHandle' };

export type BodyShape =
	| { type: 'box'; halfExtents: Vec3 }
	| { type: 'sphere'; radius: number }
	/** Capsule along the local Y axis: `halfHeight` is half the cylindrical section's length. */
	| { type: 'capsule'; halfHeight: number; radius: number };

export type BodyKind = 'dynamic' | 'kinematic' | 'fixed';

export interface BodyDesc {
	/** Defaults to `'dynamic'`. */
	kind?: BodyKind;
	shape: BodyShape;
	/** kg. */
	mass: number;
	/** Principal moments of inertia about the body axes, kg·m². Backend derives it from `shape` if omitted. */
	inertia?: Vec3;
	position: Vec3;
	rotation: Quat;
	linearVelocity?: Vec3;
	angularVelocity?: Vec3;
}

export interface Velocity {
	/** m/s. */
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
	setMass(handle: BodyHandle, mass: number, inertia?: Vec3): void;

	/** Advance by `dt` seconds. The sim passes a constant dt; backends must not read a clock. */
	step(dt: number): void;

	getTransform(handle: BodyHandle): Transform;
	setTransform(handle: BodyHandle, transform: Transform): void;
	getVelocity(handle: BodyHandle): Velocity;
	setVelocity(handle: BodyHandle, velocity: Velocity): void;

	/** Release native resources (WASM memory). The backend is unusable afterwards. */
	dispose(): void;
}
