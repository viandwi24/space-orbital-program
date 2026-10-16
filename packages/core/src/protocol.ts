/**
 * Sim <-> host protocol (simulation.md). Plain data only, so it works in-process and over
 * `postMessage`. Hosts read `Snapshot`s and send `Command`s; they never mutate sim state.
 */
import type { OrbitalElements } from '@orbital/kepler';
import type { BodyId, EntityId, PartId } from './ids.ts';
import type { Quat, Vec3 } from './math.ts';

export type VesselMode = 'flight' | 'on-rails';

export interface PartSnapshot {
	/** Part instance entity id. */
	id: EntityId;
	/** Definition this instance was created from. */
	definition: PartId;
	/** Relative to the vessel root, in the same orientation as the frame (units-and-frames.md). */
	position: Vec3;
	orientation: Quat;
	/** Per-module UI state keyed by module id (output of each module's `snapshot`). */
	modules: Record<string, unknown>;
}

export interface VesselSnapshot {
	id: EntityId;
	mode: VesselMode;
	/** Body whose sphere of influence the vessel is in; `position`/`velocity` are relative to it (BCI). */
	soi: BodyId;
	position: Vec3;
	velocity: Vec3;
	orientation: Quat;
	parts: PartSnapshot[];
	/** Present when the vessel's orbit is expressible with elements (not near-parabolic/radial). */
	orbit?: OrbitalElements;
}

export interface BodySnapshot {
	id: BodyId;
	/** Position of the body centre in the root-body inertial frame. */
	position: Vec3;
	/** Orientation of the body-fixed frame relative to the inertial frame. */
	rotation: Quat;
}

export interface Snapshot {
	/** Simulation time, seconds since epoch. */
	t: number;
	vessels: VesselSnapshot[];
	bodies: BodySnapshot[];
}

/**
 * Vessel design for `load-vessel`. Provisional minimal shape: plans 006/007 own the real design
 * format and must bump `formatVersion` (versioning.md) if they change it.
 */
export interface VesselDesign {
	formatVersion: 1;
	name: string;
	parts: Array<{
		/** Index of this part within the design; referenced by `parent`. */
		index: number;
		part: PartId;
		parent: { index: number; parentNode: string; node: string } | null;
	}>;
}

export type Command =
	| { type: 'throttle'; vessel: EntityId; value: number }
	| { type: 'attitude'; vessel: EntityId; pitch: number; yaw: number; roll: number }
	| { type: 'stage'; vessel: EntityId }
	| {
			type: 'action';
			vessel: EntityId;
			part: EntityId;
			module: string;
			action: string;
			args?: unknown;
	  }
	| { type: 'warp'; factor: number }
	| { type: 'load-vessel'; design: VesselDesign };

export type CommandType = Command['type'];
