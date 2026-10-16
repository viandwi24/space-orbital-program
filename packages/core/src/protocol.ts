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
	/**
	 * Part origin minus the vessel root's origin, expressed in the inertial (BCI) axes, i.e. already
	 * rotated by the vessel's attitude (NOT in the vessel body frame).
	 */
	position: Vec3;
	/** The part's absolute orientation (the rotation from part-local axes to BCI axes). */
	orientation: Quat;
	/** Per-module UI state keyed by module id (output of each module's `snapshot`). */
	modules: Record<string, unknown>;
	/** Skin temperature, K (plan 014). Always set by the sim; optional so older hosts' fixtures stay valid. */
	temperature?: number;
}

export interface VesselSnapshot {
	id: EntityId;
	mode: VesselMode;
	/** Body whose sphere of influence the vessel is in; `position`/`velocity` are relative to it (BCI). */
	soi: BodyId;
	/** Origin of the vessel's root part. */
	position: Vec3;
	velocity: Vec3;
	/** Orientation of the root part (all parts share it until a joint flexes in flight). */
	orientation: Quat;
	parts: PartSnapshot[];
	/** Orbit of the centre of mass; present when expressible with elements (not near-parabolic/radial). */
	orbit?: OrbitalElements;
	/**
	 * True on surface rails (ADR 0024): `mode` is `on-rails`, the vessel is fixed to the rotating
	 * ground (its pose turns with the body's `rotation`) and there is no `orbit`.
	 */
	surface?: boolean;
	/**
	 * Height, m, of the ground above the body's reference sphere under the root part (ADR 0043).
	 * Present only when the sim was created with terrain; radar altitude is the vessel's altitude
	 * minus this.
	 */
	terrainHeight?: number;
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
 * Vessel design (`formatVersion` 1 or 2, ADR 0016 and 0034): a flat list of part instances with
 * parent links, plus the staging sequence. Plain JSON, so the VAB can save/load it.
 * `resolveVesselDesign` (design.ts) validates it against the registries; `migrateVesselDesign`
 * turns version 1 into version 2 (radial links and symmetry groups need 2).
 */
export interface DesignLink {
	index: number;
	parentNode: string;
	node: string;
	radial?: { angle: number; y: number };
}

export interface VesselDesign {
	formatVersion: 1 | 2;
	name: string;
	parts: Array<{
		/** Index of this part within the design (unique, any non-negative integer); referenced by `parent` and `stages`. */
		index: number;
		part: PartId;
		/**
		 * `null` for the root (exactly one part). `parentNode` is a node of the parent, `node` one of
		 * this part. A radial link (version 2) has `parentNode` `"surface"` and `radial`: the child's
		 * `node` touches the side of the cylindrical parent at that azimuth and height (ADR 0034).
		 */
		parent: DesignLink | null;
		/** Symmetry group (version 2): parts made together by the editor share the number. The sim ignores it. */
		symmetry?: number;
	}>;
	/** `stages[k]` lists the part indices whose modules' `onStage` runs for the k-th `stage` command. */
	stages: number[][];
}

/** Where `load-vessel` puts the vessel. Defaults to the surface of the root body at latitude 0, longitude 0. */
export type VesselPlacement =
	| {
			kind: 'surface';
			body?: BodyId;
			/** rad; default 0. */
			latitude?: number;
			/** rad, right-handed about +Y from +X; default 0. */
			longitude?: number;
	  }
	| {
			kind: 'state';
			body?: BodyId;
			/** Centre of mass position and velocity in the body-centred inertial frame. */
			position: Vec3;
			velocity: Vec3;
			/** Attitude of the vessel root; identity when omitted. */
			orientation?: Quat;
	  };

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
	| { type: 'load-vessel'; design: VesselDesign; placement?: VesselPlacement };

/** What `Sim.dispatch` returns: accepted (with the new vessel id for `load-vessel`) or refused with a reason. */
export type CommandResult = { ok: true; vessel?: EntityId } | { ok: false; reason: string };

export type CommandType = Command['type'];
