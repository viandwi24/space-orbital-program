/**
 * Sim <-> host protocol (simulation.md). Plain data only, so it works in-process and over
 * `postMessage`. Hosts read `Snapshot`s and send `Command`s; they never mutate sim state.
 */
import type { OrbitalElements } from '@orbital/kepler';
import type { BodyId, EntityId, PartId } from './ids.ts';
import type { Quat, Vec3 } from './math.ts';

export type VesselMode = 'flight' | 'on-rails';

/**
 * Stability assist modes (plan 042, ADR 0049). `hold` keeps the attitude held when it was chosen
 * (or released from manual input); the others point the nose at a direction. `maneuver` points at
 * the burn vector of the earliest maneuver node (plan 045, ADR 0056); plan 035 may add `target`.
 */
export const SAS_MODES = [
	'off',
	'hold',
	'prograde',
	'retrograde',
	'normal',
	'antinormal',
	'radial-in',
	'radial-out',
	'maneuver'
] as const;
export type SasMode = (typeof SAS_MODES)[number];

/** Which velocity prograde/retrograde follow: relative to the rotating ground, or the inertial one. */
export type SasReference = 'surface' | 'orbit';

export interface SasSnapshot {
	mode: SasMode;
	reference: SasReference;
	/** Angle between the nose (or, for `hold`, the attitude) and its target, rad; 0 when off or without a direction. */
	error: number;
}

/** Largest number of maneuver nodes one vessel keeps (ADR 0056). */
export const MAX_NODES = 8;
/** Largest magnitude of one node component, m/s. */
export const MAX_NODE_DV = 100_000;

/**
 * A maneuver node as the sim resolves it (plan 045, ADR 0056). `prograde`, `normal` and `radial`
 * are the burn that is left in the orbital frame of the path at the node (prograde = unit velocity,
 * normal = unit r x v, radial = prograde x normal): the plan while the vessel coasts, what remains
 * while it burns.
 */
export interface ManeuverNodeSnapshot {
	id: number;
	/** Sim time of the burn, s. */
	time: number;
	prograde: number;
	normal: number;
	radial: number;
	/** Magnitude of the remaining burn, m/s. */
	dv: number;
	/** Body whose frame the node lies in; absent when the path never reaches the node. */
	body?: BodyId;
	/** The remaining burn as a vector in the shared inertial axes, m/s; absent with `body`. */
	vector?: Vec3;
}

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
	/** Stability assist state (plan 042). Always set by the sim; optional so older hosts' fixtures stay valid. */
	sas?: SasSnapshot;
	/** Maneuver nodes in time order (plan 045). Always set by the sim; optional so older hosts' fixtures stay valid. */
	nodes?: ManeuverNodeSnapshot[];
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
	/** Set the stability assist mode and/or the prograde reference; an omitted field keeps its value (ADR 0049). */
	| { type: 'sas'; vessel: EntityId; mode?: SasMode; reference?: SasReference }
	| {
			type: 'action';
			vessel: EntityId;
			part: EntityId;
			module: string;
			action: string;
			args?: unknown;
	  }
	| { type: 'warp'; factor: number }
	/**
	 * Run the clock up to `time` at about `factor` times real time, slowing down so it stops exactly
	 * there with warp 1 (plan 045, ADR 0056). Needs every vessel on rails, like `warp`.
	 */
	| { type: 'warp-to'; time: number; factor: number }
	/**
	 * Create (no `id`; the result carries `node`) or replace a maneuver node of a vessel; the
	 * components are the burn in the orbital frame at the node, m/s.
	 */
	| {
			type: 'node-set';
			vessel: EntityId;
			id?: number;
			time: number;
			prograde: number;
			normal: number;
			radial: number;
	  }
	/** Remove one node, or all of the vessel's nodes without an `id`. */
	| { type: 'node-remove'; vessel: EntityId; id?: number }
	| { type: 'load-vessel'; design: VesselDesign; placement?: VesselPlacement };

/** What `Sim.dispatch` returns: accepted (with the new vessel id for `load-vessel`) or refused with a reason. */
export type CommandResult =
	| { ok: true; vessel?: EntityId; /** The node `node-set` created or replaced. */ node?: number }
	| { ok: false; reason: string };

export type CommandType = Command['type'];
