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
	type JointHandle,
	type PhysicsBackend,
	type Quat,
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
 * orbit cannot be expressed with elements (near-parabolic).
 */
export type RailsState =
	{ kind: 'elements'; elements: OrbitalElements } | { kind: 'state'; r: Vec3; v: Vec3; t0: number };

/**
 * Launch-pad hold (ADR 0017): while a vessel loaded on the surface cannot lift off (thrust does not
 * exceed weight) its bodies are pinned to these poses, which are fixed in the rotating ground frame
 * (BCI at body rotation angle 0). Without it a stack standing on one point contact would topple.
 */
export interface PadHold {
	poses: Array<{ part: EntityId; position: Vec3; rotation: Quat }>;
}

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
	/** Part entities per stage, in firing order. */
	stages: EntityId[][];
	nextStage: number;
	/** Centre of mass, BCI. Authoritative on rails; refreshed after every flight step. */
	com: Vec3;
	/** Centre-of-mass velocity, BCI. */
	velocity: Vec3;
	/** Root orientation. Frozen on rails. */
	orientation: Quat;
	/** Present exactly when `mode` is `on-rails`. */
	rails: RailsState | null;
	/** Seconds in flight without any force or torque applied. */
	idle: number;
	/** Touched the ground during the last step. */
	landed: boolean;
	/** Set while the vessel is held on the pad; `null` once it lifted off (or never was on one). */
	pad: PadHold | null;
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
	attachments: Attachment[];
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

/** A physics backend with its local frame (runtime only, not serialisable). */
export interface FlightFrame {
	readonly id: number;
	readonly backend: PhysicsBackend;
	inUse: boolean;
	/** BCI position of the local origin, m. */
	origin: Vec3;
	/** BCI velocity of the local frame, m/s; local velocities are relative to it. */
	velocity: Vec3;
	/** Vessels simulated in this frame, ascending ids. */
	vessels: EntityId[];
	bodies: Map<EntityId, BodyHandle>;
	joints: Map<string, JointHandle>;
	/** Mass last handed to the backend per part. */
	masses: Map<EntityId, number>;
}

export const jointKey = (a: EntityId, b: EntityId): string => (a < b ? `${a}-${b}` : `${b}-${a}`);
