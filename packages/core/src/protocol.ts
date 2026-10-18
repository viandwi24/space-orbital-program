/**
 * Sim <-> host protocol (simulation.md). Plain data only, so it works in-process and over
 * `postMessage`. Hosts read `Snapshot`s and send `Command`s; they never mutate sim state.
 */
import type { LinkBudget } from './comms.ts';
import type { MilestoneRecord } from './milestones.ts';
import type { RangeSnapshot } from './range-safety.ts';
import type { ReliabilitySnapshot } from './reliability.ts';
import type { OrbitalElements } from '@orbital/kepler';
import type { BodyId, EntityId, PartId } from './ids.ts';
import type { Quat, Vec3 } from './math.ts';

export type VesselMode = 'flight' | 'on-rails';

/**
 * Stability assist modes (plan 042, ADR 0049). `hold` keeps the attitude held when it was chosen
 * (or released from manual input); the others point the nose at a direction. `maneuver` points at
 * the burn vector of the earliest maneuver node (plan 045, ADR 0056); `target` and `anti-target`
 * point at the vessel's target and away from it (plan 035, ADR 0064).
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
	'maneuver',
	'target',
	'anti-target'
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

/**
 * What a vessel can aim at (plan 035, ADR 0064): another body, or another vessel (debris included).
 * Vessel ids are entity ids, body ids are definition ids.
 */
export type TargetRef = { kind: 'body'; id: BodyId } | { kind: 'vessel'; id: EntityId };

/** Closest approach of the vessel's current orbit to its target within the next revolution (or 10 days). */
export interface TargetApproach {
	/** Sim time of the closest approach, s. */
	time: number;
	/** Distance between the two centres of mass (a body's centre) then, m. */
	distance: number;
	/** Speed of the target relative to the vessel then, m/s. */
	relativeSpeed: number;
}

/**
 * The vessel's target as the sim resolves it. `position` and `velocity` are the target's minus the
 * vessel's centre of mass, in the shared inertial axes (the same axes in every body's frame, ADR
 * 0051), so they mean the same whichever sphere of influence either is in. `approach` is null when
 * the two do not orbit the same body (or the orbit is not a conic).
 */
export type TargetSnapshot = TargetRef & {
	/** Display name: the vessel's name, or the body's definition id. */
	name: string;
	position: Vec3;
	velocity: Vec3;
	/** Length of `position`, m. */
	distance: number;
	/** Length of `velocity`, m/s. */
	relativeSpeed: number;
	approach: TargetApproach | null;
};

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
	/**
	 * Connector parts (ADR 0071) whose far end is still attached: the part it lands on and the
	 * point on its surface, relative to the vessel root's origin in the inertial (BCI) axes like
	 * `position`. Absent for other parts and once a split cut the link.
	 */
	link?: { peer: EntityId; point: Vec3 };
}

export interface VesselSnapshot {
	id: EntityId;
	/**
	 * Present while the vessel can be recovered (landed or splashed and at rest; plan 095): what
	 * `recover-vessel` would credit, for the HUD to show before the player confirms.
	 */
	recovery?: { value: number; factor: number; distance: number | null; credit: number };
	/** The vessel's name (the design's, or "<name> (debris)" for a piece that broke off; plan 035). Always set by the sim; optional so older hosts' fixtures stay valid. */
	name?: string;
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
	/** The vessel's target (plan 035); absent without one. */
	target?: TargetSnapshot;
	/** Crew aboard (plan 106): who sits in which part, with their ability factors. */
	crew?: Array<{
		member: string;
		part: EntityId;
		/** Quality factors, times `performance` (plan 107). */
		abilities: Record<string, number>;
		/** Crew simulation (plan 107, ADR 0181): present when the aspect is on. */
		morale?: number;
		fatigue?: number;
		dose?: number;
		performance?: number;
		shortages?: Array<{ resource: string; since: number }>;
		glocUntil?: number;
	}>;
	/** Life support prediction (plan 107, ADR 0181 point 8); absent with it off or nobody aboard. */
	lifeSupport?: {
		mode: 'simple' | 'full';
		crew: number;
		consumables: Array<{ resource: string; amount: number; rate: number; timeLeft: number }>;
	};
	/** Experiments aboard (plan 103): state, reason and progress; the vessel's situation. */
	science?: {
		situation: string | null;
		/** The region under the vessel (plan 104, ADR 0180 point 3). */
		region: string;
		experiments: Array<{
			part: EntityId;
			experiment: string;
			state: 'READY' | 'RUNNING' | 'PAUSED' | 'INVALID';
			reason?: string;
			progress: number;
		}>;
	};
	/**
	 * Part actions of a vessel in flight (plan 110, ADR 0174): group states and the changing part of
	 * each descriptor as `[part, module, action, value, enabled]`; the rest comes from `describe`.
	 */
	actions?: {
		groups: Array<{ id: string; state: 'on' | 'off' | 'mixed' | 'none'; parts: number }>;
		states: Array<[EntityId, string, string, boolean | number | string | null, boolean]>;
	};
	/** Data storage use (plan 083): bits used and in all, and the item count; only with storage. */
	data?: { used: number; capacity: number; items: number };
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
	/** The world's rule values, every registered rule (plan 078); the same object until a change. */
	rules?: Readonly<Record<string, boolean | number | string>>;
	/** Started objectives, active and finished (plan 098, ADR 0175). */
	objectives?: Array<{
		id: string;
		source: { kind: 'contract' | 'mission'; id: string };
		status: 'active' | 'done' | 'failed';
		progress: number;
		leaves: Array<{
			path: string;
			objective: string;
			status: 'active' | 'done' | 'failed';
			progress: number;
		}>;
	}>;
	/** Science subjects of the world (plan 103, ADR 0178); absent before the first result. */
	science?: Array<{ id: string; count: number; produced: number; credited: number; cap: number }>;
	/** The world's firsts (plan 102, ADR 0147); absent while there are none. */
	milestones?: MilestoneRecord[];
	/** The tech tree's state (plan 105, ADR 0154 point 3); absent while nothing was researched and the tree is off. */
	tech?: { enabled: boolean; researched: string[] };
	/** Range safety (plan 127, ADR 0155 point 6); absent when the rule is off. */
	range?: RangeSnapshot;
	/** Part reliability (plan 130, ADR 0156 point 8); absent when the rule is off. */
	reliability?: ReliabilitySnapshot;
	/** The crew roster (plan 106, ADR 0176); absent before anyone is hired. */
	crew?: Array<{
		id: string;
		name: string;
		profession: 'pilot' | 'engineer' | 'scientist' | 'tourist';
		traits: string[];
		xp: number;
		level: number;
		status: 'available' | 'assigned' | 'missing' | 'lost';
		vessel?: EntityId;
		places: string[];
	}>;
	/** Balances (plan 095); `enabled` false when the economy rule is off or absent. */
	economy?: { enabled: boolean; funds: number; science: number; reputation: number };
	/** Each site's buildings and road cells (plan 090). */
	/**
	 * The comms network (plan 114, ADR 0179 point 9): stations (system-relative position, like
	 * `bodies`) and each vessel's link; absent with `stock.comms` off.
	 */
	network?: {
		stations: Array<{ id: string; label: string; body: string; position: Vec3; range: number }>;
		vessels: Array<{
			vessel: EntityId;
			to: string | null;
			reason: string | null;
			control: 'full' | 'partial' | 'none';
			blackout: number;
			/** Downlink rate, bit/s (plan 116, ADR 0185): 0 below the ladder; null without a budget. */
			rate: number | null;
			/** Margin at the ladder's first step, dB; null without a budget. */
			margin: number | null;
		}>;
		/**
		 * The full budget of the vessel picked by `comms-inspect` (ADR 0185 point 9); `budget` is null
		 * without a link, or when no antenna pair has a known common band.
		 */
		inspector?: { vessel: EntityId; to: string | null; budget: LinkBudget | null };
	};
	/** The world tick's day (the day last entered, ADR 0171), for construction ready days (plan 096). */
	day?: number;
	sites?: Array<{
		id: string;
		buildings: Array<{
			id: string;
			kind: string;
			cell: { i: number; j: number };
			rotation: 0 | 90 | 180 | 270;
			level: number;
			state: 'active' | 'planned' | 'building' | 'upgrading';
			/** Tick day on which construction is done (plan 096, ADR 0123). */
			readyDay?: number;
		}>;
		roads: Array<{ i: number; j: number }>;
	}>;
}

/**
 * Vessel design (`formatVersion` 1, 2 or 3, ADR 0016, 0034 and 0071): a flat list of part
 * instances with parent links, plus the staging sequence. Plain JSON, so the VAB can save/load it.
 * `resolveVesselDesign` (design.ts) validates it against the registries; `migrateVesselDesign`
 * turns older versions into version 3 (radial links and symmetry groups need 2; tilts, links and
 * radial links to boxes need 3).
 */
export interface DesignLink {
	index: number;
	parentNode: string;
	node: string;
	radial?: { angle: number; y: number };
}

/**
 * A part's turn about the axes of its parent part, rad (version 3, ADR 0071): the matrix is
 * `Rx(x) Ry(y) Rz(z)` (a vector is turned about Z first), pivoting about the attach point and
 * applied before a radial part turns to face its parent's surface.
 */
export interface DesignTilt {
	x: number;
	y: number;
	z: number;
}

/** The far end of a connector part (version 3): the surface of part `index` at the radial site (`angle`, `y`) of ADR 0034. */
export interface DesignEnd {
	index: number;
	angle: number;
	y: number;
}

export interface VesselDesign {
	formatVersion: 1 | 2 | 3;
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
		/** Rotation of the part about its parent's axes (version 3). Absent: none. */
		tilt?: DesignTilt;
		/** Connector parts only (version 3): where the part's other end lands (struts and fuel lines, ADR 0071). */
		link?: DesignEnd;
	}>;
	/** `stages[k]` lists the part indices whose modules' `onStage` runs for the k-th `stage` command. */
	stages: number[][];
	/** Custom action groups (plan 110, ADR 0174): slot 1..10, members by part index. Any version. */
	groups?: Array<{
		slot: number;
		label: string;
		members: Array<{ part: number; module: string; action: string }>;
	}>;
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
	  }
	| {
			/** On a pad of one of the world's sites (plan 084, ADR 0142 point 5), on the site's body. */
			kind: 'site';
			/** Site id (`WorldInfo.sites`, or `"legacy"` in a world without sites). */
			site: string;
			/** Index into the site's pads; default 0. */
			pad?: number;
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
	/** Select (or with `null` clear) the vessel's target (plan 035, ADR 0064). */
	| { type: 'target-set'; vessel: EntityId; target: TargetRef | null }
	| {
			type: 'load-vessel';
			design: VesselDesign;
			placement?: VesselPlacement;
			/** Crew to seat (plan 106, ADR 0176 point 3): roster ids and design part indices. */
			crew?: Array<{ member: string; part: number }>;
	  }
	/**
	 * Change a world rule (plan 078, ADR 0111). Refused for unknown rules, identity rules (reason
	 * `identity rule`) and values of the wrong type; takes effect from the next step.
	 */
	| { type: 'set-rule'; rule: string; value: boolean | number | string }
	/**
	 * Recover a vessel that is landed or splashed and at rest (plan 095, ADR 0113): credits its
	 * value times the distance factor and removes it.
	 */
	| { type: 'recover-vessel'; vessel: EntityId }
	/** Move a data item to the storage of part `to` on the same vessel (plan 083, ADR 0172). */
	| { type: 'move-data'; vessel: EntityId; item: string; to: EntityId }
	/** Delete a data item from the vessel. */
	| { type: 'delete-data'; vessel: EntityId; item: string }
	/**
	 * Apply an action to every part of a group on the vessel in one dispatch (plan 110, ADR 0174):
	 * a registered group id, or `custom.<slot>` for the vessel's custom group.
	 */
	| { type: 'action-group'; vessel: EntityId; group: string; value?: boolean | number | string }
	/**
	 * Place a building on a site (plan 090, ADR 0115), refused with `canPlace`'s reasons; `id` is a
	 * host UUID. With the economy on it debits level 1's cost and builds until `readyDay` (plan 096,
	 * ADR 0123 point 1).
	 */
	| {
			type: 'place-building';
			site: string;
			kind: string;
			cell: { i: number; j: number };
			rotation: 0 | 90 | 180 | 270;
			id: string;
	  }
	| { type: 'remove-building'; site: string; id: string }
	/** Upgrade a working building one level (plan 096, ADR 0123 point 1): debits the next level's cost. */
	| { type: 'upgrade-building'; site: string; id: string }
	/**
	 * Found a site (plan 092, ADR 0177 point 6): a base with the starter pad; its flat zone shapes the
	 * terrain from the next load. `id` is a host UUID.
	 */
	| {
			type: 'found-site';
			id: string;
			name: string;
			latitude: number;
			longitude: number;
			body?: string;
	  }
	/**
	 * Start the objectives of a contract or mission (plan 098, ADR 0175), optionally bound to one
	 * vessel; refused for an unknown source or unmet prerequisites.
	 */
	| {
			type: 'objective-start';
			source: { kind: 'contract' | 'mission'; id: string };
			vessel?: EntityId;
	  }
	/** Hire a crew member into the roster (plan 106, ADR 0176 point 2). */
	| { type: 'crew-hire'; profession: 'pilot' | 'engineer' | 'scientist' | 'tourist' }
	/** Let an available member go: they leave the roster (contract request of plan 108, ADR 0152 point 4). */
	| { type: 'crew-dismiss'; member: string }
	/** Research a tech node with the world's science (plan 105, ADR 0154 point 2). */
	| { type: 'research'; node: string }
	/** Move a crew member to another part of the same vessel (capacity checked). */
	| { type: 'crew-transfer'; vessel: EntityId; member: string; to: EntityId }
	/** EVA (plan 109, ADR 0120): the member steps out into a suit, a vessel of its own beside the part. */
	| { type: 'crew-eva'; vessel: EntityId; member: string }
	/** The member in `suit` boards `vessel` (a free seat within 50 m); the suit's samples come aboard. */
	| { type: 'crew-board'; suit: EntityId; vessel: EntityId }
	/** Walk a landed vessel that can (its part declares `walk`): heading from north, rad; speed 0 stops. */
	| { type: 'crew-walk'; vessel: EntityId; heading: number; speed: number }
	/** A suit on the ground plants a flag beside it: a kept one-part vessel (ADR 0120 point 5). */
	| { type: 'plant-flag'; vessel: EntityId }
	/** Transmit a science data item (plan 103, ADR 0178 point 7): value × its factor, then it is gone. */
	| { type: 'transmit-data'; vessel: EntityId; item: string }
	/** Carry this vessel's full link budget in `Snapshot.network.inspector` (null: none; ADR 0185). */
	| { type: 'comms-inspect'; vessel: EntityId | null }
	/** Part reliability (plan 130, ADR 0156): the grade the world buys a part model at. */
	| { type: 'set-grade'; part: string; grade: 'economy' | 'standard' | 'proven' }
	/** One trial of every failure mode of a part model on the world's test stand. */
	| { type: 'static-fire'; part: string }
	/** Pay for a fix of an anomaly report: halves its mode's chance on that model. */
	| { type: 'fix-anomaly'; report: string }
	/** An engineer in `suit` repairs a failed module on `part` of `vessel`. */
	| { type: 'repair'; suit: EntityId; vessel: EntityId; part: EntityId };

/** What `Sim.dispatch` returns: accepted (with the new vessel id for `load-vessel`) or refused with a reason. */
export type CommandResult =
	| { ok: true; vessel?: EntityId; /** The node `node-set` created or replaced. */ node?: number }
	| { ok: false; reason: string };

export type CommandType = Command['type'];
