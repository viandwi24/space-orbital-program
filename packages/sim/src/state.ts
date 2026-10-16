/**
 * Sim state. Everything that persists between steps and is plain data lives in the world as
 * components (ADR 0010); handles into the physics backend are runtime-only and live in
 * `FlightFrame`s, never in the world.
 */
import {
	defineComponent,
	type BodyHandle,
	type ComponentType,
	type EntityId,
	type PhysicsBackend,
	type Quat,
	type SasMode,
	type SasReference,
	type Vec3,
	type VesselMode
} from '@orbital/core';
import type { OrbitalElements } from '@orbital/kepler';

/** Control input of one vessel, set by commands. */
export interface ControlState {
	throttle: number;
	pitch: number;
	roll: number;
	yaw: number;
}

/**
 * Motion of the centre of mass while on rails: elements, or the raw state vector at `t0` when the
 * orbit cannot be expressed with elements (near-parabolic), or fixed to the rotating ground
 * (`surface`, ADR 0024): the centre of mass `r` and root orientation `q` in the body-fixed frame.
 */
export type RailsState =
	| { kind: 'elements'; elements: OrbitalElements }
	| { kind: 'state'; r: Vec3; v: Vec3; t0: number }
	| { kind: 'surface'; r: Vec3; q: Quat };

/**
 * Stability assist state of one vessel (plan 042, ADR 0049). Plain data, so a save serialises it
 * with the vessel. `demand` is the attitude demand of the last step (x pitch, y roll, z yaw) and
 * only counts while `active`.
 */
export interface SasState {
	mode: SasMode;
	reference: SasReference;
	/** Attitude `hold` keeps, BCI. Follows the vessel while the player steers or the rate settles. */
	hold: Quat;
	/** True while `hold` waits for the angular rate to die down after manual input or switching on. */
	settling: boolean;
	/** Integral of the error, as an angular acceleration (rad/s^2) per axis. */
	integral: Vec3;
	/** Pointing error of the last step, rad. */
	error: number;
	/** Settled: the assist outputs nothing until the error grows (see `QUIET_*` in sas.ts). */
	quiet: boolean;
	active: boolean;
	demand: Vec3;
}

export const newSas = (): SasState => ({
	mode: 'off',
	reference: 'surface',
	hold: { x: 0, y: 0, z: 0, w: 1 },
	settling: false,
	integral: { x: 0, y: 0, z: 0 },
	error: 0,
	quiet: false,
	active: false,
	demand: { x: 0, y: 0, z: 0 }
});

export interface VesselState {
	name: string;
	mode: VesselMode;
	/** Id of the body whose sphere of influence the vessel is in. */
	soi: string;
	/** The part whose origin and orientation define the vessel's pose. */
	root: EntityId;
	/** Part entities, ascending. */
	parts: EntityId[];
	control: ControlState;
	/** Stability assist (plan 042). */
	sas: SasState;
	/** Part entities per stage, in firing order. */
	stages: EntityId[][];
	nextStage: number;
	/** Centre of mass, BCI. Authoritative on rails; refreshed after every flight step. */
	com: Vec3;
	/** Centre-of-mass velocity, BCI. */
	velocity: Vec3;
	/** Root orientation. Frozen on orbital rails; on surface rails it is stale: use `orientationOf`. */
	orientation: Quat;
	/** Present exactly when `mode` is `on-rails`. */
	rails: RailsState | null;
	/** Seconds in flight without any force or torque applied. */
	idle: number;
	/** In contact with the ground tile during the last step (ADR 0019). */
	landed: boolean;
	/** Seconds spent landed, force-free and at rest relative to the ground (ADR 0024). */
	rest: number;
}

/**
 * The control modules see: the player's input, or the assist's demand when SAS is on, produced a
 * demand this step and the player holds no attitude input (ADR 0049). Throttle is always the player's.
 */
export function effectiveControl(vessel: VesselState): ControlState {
	const { sas, control } = vessel;
	if (!sas.active) return control;
	return {
		throttle: control.throttle,
		pitch: sas.demand.x,
		roll: sas.demand.y,
		yaw: sas.demand.z
	};
}

export interface Attachment {
	/** This part's node. */
	node: string;
	peer: EntityId;
	/** The peer's node. */
	peerNode: string;
}

export interface PartState {
	vessel: EntityId;
	/** Index in the design the part came from. */
	index: number;
	definition: string;
	/** Origin in the design frame (design root at the origin), m. Never changes. */
	designPos: Vec3;
	/** Turn about the design +Y axis, rad (radial parts face their parent, ADR 0034). */
	yaw: number;
	attachments: Attachment[];
	/** Skin temperature, K (ADR 0023). */
	temperature: number;
	/** Module instances in definition order, with parsed configs. */
	modules: Array<{ id: string; config: unknown }>;
}

export const VESSEL: ComponentType<VesselState> = defineComponent<VesselState>('sim.vessel');
export const PART: ComponentType<PartState> = defineComponent<PartState>('sim.part');

const moduleTokens = new Map<string, ComponentType<unknown>>();
/** Component token holding one module's state on a part entity: `sim.module-state:<module id>`. */
export function moduleStateToken(moduleId: string): ComponentType<unknown> {
	let token = moduleTokens.get(moduleId);
	if (!token) {
		token = defineComponent<unknown>(`sim.module-state:${moduleId}`);
		moduleTokens.set(moduleId, token);
	}
	return token;
}

/**
 * The one rigid body of a flight vessel (ADR 0018): a collider per part, the body origin at the
 * root part's origin. `mass`, `com` (body frame, relative to the origin) and `masses` are what was
 * last handed to the backend.
 */
export interface FlightBody {
	handle: BodyHandle;
	mass: number;
	com: Vec3;
	/** Principal moments of inertia about the centre of mass and the rotation to their axes, last pushed. */
	inertia: Vec3;
	inertiaFrame: Quat;
	/** Mass per part last pushed to the backend. */
	masses: Map<EntityId, number>;
	/** The part each collider belongs to, by collider index (own box first, module colliders after). */
	shapeParts: EntityId[];
	/** Identifies the module-contributed colliders the body was built with (see `collectColliders`). */
	signature: string;
}

/** The kinematic slab standing in for the ground under one vessel (ADR 0019). */
export interface GroundTile {
	handle: BodyHandle;
	/** Unit normal of the tile's top face (away from the body's centre), BCI axes. */
	up: Vec3;
}

/** A physics backend with its local frame (runtime only, not serialisable). */
export interface FlightFrame {
	readonly id: number;
	readonly backend: PhysicsBackend;
	inUse: boolean;
	/** Id of the body whose body-centred frame `origin` and `velocity` are in (ADR 0051). */
	soi: string;
	/** BCI position of the local origin, m. */
	origin: Vec3;
	/** BCI velocity of the local frame, m/s; local velocities are relative to it. */
	velocity: Vec3;
	/** Vessels simulated in this frame, ascending ids. */
	vessels: EntityId[];
	/** Per vessel, in creation order. */
	bodies: Map<EntityId, FlightBody>;
	/** Ground tile per vessel close to the ground. */
	tiles: Map<EntityId, GroundTile>;
}
