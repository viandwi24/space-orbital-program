/**
 * Sim <-> host protocol (simulation.md). Plain data only, so it works in-process and over
 * `postMessage`. Hosts read `Snapshot`s and send `Command`s; they never mutate sim state.
 */
import type { ControlChannel, ScriptProgramView } from './programs.ts';
import type { LinkBudget, RouteMode } from './comms.ts';
import type { ContractsSnapshot } from './contracts.ts';
import type { MilestoneRecord } from './milestones.ts';
import type { StrategiesSnapshot } from './strategies.ts';
import type { AgenciesSnapshot } from './agencies.ts';
import type { DiscoverySnapshot } from './discovery.ts';
import type { RangeSnapshot } from './range-safety.ts';
import type { ReliabilitySnapshot } from './reliability.ts';
import type { OrbitalElements } from '@orbital/kepler';
import type { BodyId, EntityId, PartId } from './ids.ts';
import type { Quat, Vec3 } from './math.ts';
import type { AutopilotLast, AutopilotSettingValue, AutopilotSnapshot } from './autopilots.ts';
import type { VesselSituation } from './world-query.ts';
import type { OverlayLayer } from './overlays.ts';

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
	'anti-target',
	/** Wings level and the nose on the horizon (plan 063, ADR 0161 point 5). */
	'level',
	/** The control part's nose along a free direction (plan 310, ADR 0271 point 2): autopilots and scripts. */
	'direction',
	/**
	 * Re-entry (plan 361, ADR 0303): belly first, the nose `REENTRY_AOA` above the airflow, wings
	 * level, as the Shuttle came home.
	 */
	'reentry'
] as const;

/** The angle of attack the `reentry` mode holds, degrees (plan 361). */
export const REENTRY_AOA = 40;
export type SasMode = (typeof SAS_MODES)[number];

/** Which velocity prograde/retrograde follow: relative to the rotating ground, or the inertial one. */
export type SasReference = 'surface' | 'orbit';

export interface SasSnapshot {
	mode: SasMode;
	reference: SasReference;
	/** Angle between the nose (or, for `hold`, the attitude) and its target, rad; 0 when off or without a direction. */
	error: number;
	/**
	 * Angular acceleration the vessel can give its nose, rad/s² (plan 310): its torque over its
	 * inertia, slowest axis. In flight with SAS on; the HUD shows "low torque" when it is small.
	 */
	accel?: number;
	/** The direction `direction` points the nose along (inertial axes, unit); absent in the other modes. */
	direction?: Vec3;
}

/** How near a suit must be to a part to take the sample it holds, m (plan 260). */
export const EVA_TAKE_RANGE = 3;

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

/** A vessel's type for the fleet list (plan 223, ADR 0208): the player's, or guessed from its parts. */
export const VESSEL_TYPES = [
	'debris',
	'probe',
	'rover',
	'lander',
	'ship',
	'station',
	'base',
	'plane',
	'relay',
	'eva',
	'flag'
] as const;
export type VesselType = (typeof VESSEL_TYPES)[number];

/** Debris kept in a world by default (plan 223; KSP's default). */
export const DEFAULT_DEBRIS_CAP = 250;

/** A vessel within this many metres of a launch spot along the ground occupies it (plan 318, ADR 0274). */
export const PAD_CLEAR_RADIUS = 40;
/** ... and with its centre of mass below this height above the ground, m. */
export const PAD_CLEAR_HEIGHT = 100;

/** What an alarm waits for (plan 224, ADR 0223): its time is worked out once, when it is set. */
export type AlarmKind = 'time' | 'apoapsis' | 'periapsis' | 'soi' | 'node' | 'transfer';

/**
 * A user alarm (plan 224, ADR 0223): it stops any warp at `time` and fires once, for any vessel,
 * focused or not. A fired alarm leaves the list.
 */
export interface AlarmSnapshot {
	/** `alarm.<n>`, given by the sim. */
	id: string;
	name: string;
	/** Sim time it fires, s. */
	time: number;
	kind: AlarmKind;
	/** The vessel whose event it waits for (apsis, sphere change, node), or the one it was set for. */
	vessel?: EntityId;
	/** The destination of a transfer-window alarm. */
	body?: string;
	/** Seconds before the event an apsis or node alarm fires (plan 247): the alarm follows burns by it. */
	lead?: number;
}

/**
 * What a vessel can aim at (plan 035, ADR 0064): another body, or another vessel (debris included).
 * Vessel ids are entity ids, body ids are definition ids.
 */
export type TargetRef =
	| { kind: 'body'; id: BodyId }
	/** `part`: a docking port of that vessel to dock at (plan 222): the snapshot adds `port`. */
	| { kind: 'vessel'; id: EntityId; part?: EntityId };

/**
 * How the vessel's own port lines up with the targeted port (plan 222, ADR 0218): the angle
 * between the two faces, the target face's distance from the own port's axis, the distance between
 * the faces, and their closing speed (positive closing). Present while both vessels share a
 * flight frame and the vessel has a free port of the same size.
 */
export interface PortAlignment {
	/** The own port (the control part when it is a port, else the nearest free port of that size). */
	port: EntityId;
	/** Degrees between the own face direction and the reverse of the target's. */
	angle: number;
	/** m. */
	offset: number;
	distance: number;
	/** m/s, positive while the faces close. */
	closing: number;
}

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
	/** A targeted docking port's alignment (plan 222); absent without one or out of range. */
	port?: PortAlignment;
};

/**
 * One resource of a part's stores, or of the whole vessel (plan 213). `rate` is the net flow,
 * units/s, smoothed over about a second (negative while it drains); `timeToEmpty` is
 * `amount / -rate` while it drains, else null.
 */
export interface ResourceSnapshot {
	resource: string;
	amount: number;
	capacity: number;
	rate: number;
	timeToEmpty: number | null;
	/** Every store of it is flow-locked (for the vessel: all of them). */
	locked: boolean;
}

/** A running `transfer` (plan 213). */
export interface TransferSnapshot {
	resource: string;
	from: EntityId[];
	to: EntityId[];
	/** Units/s asked for. */
	rate: number;
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
	/** The temperature at which the part fails, K (plan 212): the bars draw `temperature` over it. */
	maxTemperature?: number;
	/** Index of the part in its vessel's design (plan 221): the HUD maps parts to the design record. */
	index?: number;
	/**
	 * Connector parts (ADR 0071) whose far end is still attached: the part it lands on and the
	 * point on its surface, relative to the vessel root's origin in the inertial (BCI) axes like
	 * `position`. Absent for other parts and once a split cut the link.
	 */
	link?: { peer: EntityId; point: Vec3 };
	/**
	 * A winch's rope (plan 313, ADR 0272): the socket part and vessel it is tied to, where it
	 * leaves this part and where it ties on to the socket (each in its own part's frame, m), its
	 * length and the pull on it (N). Absent without a rope out.
	 */
	tether?: {
		peer: EntityId;
		peerVessel: EntityId;
		anchor: Vec3;
		peerAnchor: Vec3;
		length: number;
		tension: number;
	};
	/** The part's stores by resource (plan 213); absent for a part without one. */
	resources?: ResourceSnapshot[];
}

/**
 * A docking port's face (plan 222, ADR 0218): the point and outward direction of its docking node,
 * relative to the vessel root's origin in the inertial (BCI) axes like `PartSnapshot.position`.
 */
export interface PortSnapshot {
	part: EntityId;
	/** Node size, m (0.625, 1.25, 2.5). */
	size: number;
	/** The face node is free: it can dock (or is cooling down after an undock). */
	free: boolean;
	position: Vec3;
	/** Unit, pointing out of the face. */
	direction: Vec3;
	/** The part's absolute orientation (the port frame's axes; the face is along `direction`). */
	orientation: Quat;
}

export interface VesselSnapshot {
	id: EntityId;
	/** The agency that owns it (plan 126, ADR 0190 point 3); absent for the player's. */
	owner?: string;
	/**
	 * Present while the vessel can be recovered (landed or splashed and at rest; plan 095): what
	 * `recover-vessel` would credit, for the HUD to show before the player confirms.
	 */
	recovery?: {
		value: number;
		factor: number;
		distance: number | null;
		/** Funds paid; with markets open the traded contents go to `site`'s storage (`stored`). */
		credit: number;
		stored?: Array<{ commodity: string; amount: number }>;
		site?: string;
	};
	/**
	 * Present while the vessel takes no control commands (ADR 0109; plan 208, ADR 0214): it has no
	 * control source, or every source needs power the vessel has run out of.
	 */
	uncontrolled?: 'no-source' | 'no-crew' | 'no-power';
	/** RCS is on (plan 211); absent while off. */
	rcs?: true;
	/** Totals over the vessel's stores by resource (plan 213), resource id order. */
	resources?: ResourceSnapshot[];
	/** Running transfers (plan 213). */
	transfers?: TransferSnapshot[];
	/** The vessel's docking ports (plan 222): the target list and the Locked camera (plan 226) read them. */
	ports?: PortSnapshot[];
	/** Its type (plan 223): set by the player, else guessed from its parts. Always set by the sim. */
	type?: VesselType;
	/** The vessel's name (the design's, numbered when taken, or "<name> debris" for a piece that broke off; plan 035, ADR 0252). Always set by the sim; optional so older hosts' fixtures stay valid. */
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
	/** Held still during rails warp (plan 206, ADR 0202 point 7): no orbit while it lasts. */
	frozen?: boolean;
	/**
	 * Where the vessel stands at a site (plan 318, ADR 0274): metres east and north of the site
	 * centre on its tangent plane (as `SitePad`), while its centre of mass is within the site's flat
	 * radius and below `PAD_CLEAR_HEIGHT` above the ground. A launch spot within `PAD_CLEAR_RADIUS`
	 * of it is occupied. Absent elsewhere.
	 */
	atSite?: { site: string; east: number; north: number };
	/** Sim time of liftoff (plan 200); absent while it waits on the pad (the "pre-launch" situation). */
	launchedAt?: number;
	/** Resting on water (plan 246): a splashdown, not a landing; absent otherwise. */
	splashed?: boolean;
	/** The coarse situation (plan 343, ADR 0292 point 2). Always set by the sim; optional for older fixtures. */
	situation?: VesselSituation;
	/**
	 * Mass, kg, and drag area C_d·A, m² (plan 347, ADR 0296 point 6): measured along the airflow
	 * while in air, else an estimate along the vessel's axis. Always set by the sim.
	 */
	aero?: { mass: number; dragArea: number };
	/** The trim on each axis, -1..1 (plan 245); absent while all three are zero. */
	trim?: { pitch: number; yaw: number; roll: number };
	/**
	 * Channels the player holds against a program right now (plan 320, ADR 0276 point 4); absent
	 * when none, or when the vessel has no program.
	 */
	override?: ControlChannel[];
	/** The player script running on this vessel (ADR 0276 point 6); absent when none. */
	script?: ScriptProgramView;
	/** Stages fired so far (plan 221): the HUD of a vessel it switched to starts from it. */
	nextStage?: number;
	/** "Control from here" (plan 221): the part SAS and the navball follow; absent for the root. */
	controlPart?: EntityId;
	/**
	 * Height, m, of the ground above the body's reference sphere under the root part (ADR 0043).
	 * Present only when the sim was created with terrain; radar altitude is the vessel's altitude
	 * minus this.
	 */
	terrainHeight?: number;
	/** Mach number of the root part's airspeed (plan 212); absent out of the air. */
	mach?: number;
	/**
	 * The part nearest its temperature limit (plan 212, ADR 0204 point 6), when above half of it:
	 * `fraction` is its temperature over its limit.
	 */
	hottest?: { part: EntityId; fraction: number };
	/** Stability assist state (plan 042). Always set by the sim; optional so older hosts' fixtures stay valid. */
	sas?: SasSnapshot;
	/** Maneuver nodes in time order (plan 045). Always set by the sim; optional so older hosts' fixtures stay valid. */
	nodes?: ManeuverNodeSnapshot[];
	/** The vessel's target (plan 035); absent without one. */
	target?: TargetSnapshot;
	/** The engaged autopilot (plan 310, ADR 0271 point 5); absent without one. */
	autopilot?: AutopilotSnapshot;
	/** The last autopilot run and why it ended, or a refused engage (ADR 0285 point 4). */
	autopilotLast?: AutopilotLast;
	/** Settings stored per autopilot id (ADR 0285 point 3); absent when none were set. */
	autopilotSettings?: Record<string, Record<string, AutopilotSettingValue>>;
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
		/**
		 * Seconds of the pod's own rations left (ADR 0323), already in each `timeLeft`; absent
		 * without a command seat. Infinite before launch.
		 */
		rationsLeft?: number;
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
		/**
		 * Science results stored aboard (plan 191, ADR 0194): the item, its subject, the value made and
		 * the transmit factor; transmitting credits `value × factor`.
		 */
		stored?: Array<{ item: string; subject: string; value: number; factor: number }>;
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
	/** The warp limit for the watched vessel (plan 206). Always set by the sim; optional for older fixtures. */
	warpLimit?: WarpLimitSnapshot;
	/** The clock is paused (plan 205); absent while it runs. */
	paused?: boolean;
	/** User alarms in time order (plan 224); absent while there are none. */
	alarms?: AlarmSnapshot[];
	/** The world's debug state (plan 203). Always set by the sim; optional so older hosts' fixtures stay valid. */
	debug?: DebugSnapshot;
	/** The world's rule values, every registered rule (plan 078); the same object until a change. */
	rules?: Readonly<Record<string, boolean | number | string>>;
	/** Mod stores by id (plan 343, ADR 0292 point 4); absent while none was written. */
	stores?: Readonly<Record<string, unknown>>;
	/** Overlays sim systems published (plan 347, ADR 0296 point 3), by overlay id; never saved. */
	overlays?: Readonly<Record<string, OverlayLayer>>;
	/** Contract slots, offers and accepted generated contracts (plan 099, ADR 0186); absent before any. */
	contracts?: ContractsSnapshot;
	/** Strategy slots, multipliers and the strategies on offer (plan 101, ADR 0187); with the economy on. */
	strategies?: StrategiesSnapshot;
	/** Rival agencies and their news (plan 126, ADR 0190); absent when none runs. */
	agencies?: AgenciesSnapshot;
	/** Facts, datasets, claims and lab slots (plan 129, ADR 0192 point 8); with discovery on. */
	discovery?: DiscoverySnapshot;
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
	economy?: {
		enabled: boolean;
		funds: number;
		science: number;
		reputation: number;
		/** The loan (ADR 0324): owed, the most that can be owed, interest per `everyDays` days. */
		loan?: { owed: number; limit: number; interest: number; everyDays: number };
		/** Commodities with today's price (plan 097, ADR 0124 point 8); absent with the economy off. */
		markets?: Array<{
			id: string;
			label: string;
			unit: string;
			base: number;
			price: number;
			stock: number;
			/** The last 90 daily prices, oldest first. */
			history: number[];
		}>;
		/** Commodities held at sites with storage. */
		storage?: Array<{ site: string; capacity: number; items: Record<string, number> }>;
		/** Supply routes (plan 128, ADR 0125 point 6) with the tick day of their next window. */
		routes?: Array<{
			id: string;
			from: string;
			to: string;
			commodity: string;
			amount: number;
			nextDay: number;
		}>;
	};
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
			/** Hop ids from the vessel to its control point (plan 117, ADR 0188); empty without a link. */
			route: string[];
			/** Light time along the route, s; null without a link. */
			latency: number | null;
			/** The route mode. */
			mode: RouteMode;
			/** The first hop's channel, encryption and interference loss, dB (plan 120, ADR 0191). */
			channel: number | null;
			encrypted: boolean;
			interference: number;
		}>;
		/**
		 * The full budget of the vessel picked by `comms-inspect` (ADR 0185 point 9); `budget` is null
		 * without a link, or when no antenna pair has a known common band.
		 */
		inspector?: { vessel: EntityId; to: string | null; budget: LinkBudget | null };
		/** Licensed channels beyond each band's channel 0 (plan 120, ADR 0191 point 2). */
		licences: Array<{ band: string; channel: number }>;
		/**
		 * Firsts that may still be broadcast live (plan 121, ADR 0193 point 5): until when, and the
		 * route rate the vessel has now (null: no route).
		 */
		broadcasts: Array<{
			milestone: string;
			label: string;
			vessel: EntityId;
			until: number;
			rate: number | null;
			needs: number;
		}>;
		/**
		 * Radios with queued data (plan 119, ADR 0189 point 6): each item with its sent bits and an
		 * estimated delivery time; `nextContact` for a holder without a route (null: none in a day).
		 */
		queues?: Array<{
			vessel: EntityId;
			/** A relay holding it for another vessel (store-and-forward), else null. */
			custody: string | null;
			nextContact: number | null;
			items: Array<{
				id: string;
				kind: string;
				bits: number;
				sent: number;
				origin: EntityId;
				/** Sim time it should be delivered at the current rate; null when unknown. */
				eta: number | null;
			}>;
		}>;
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
			/** Funds a tour building gives back on removal (ADR 0314 point 4). */
			refund?: number;
		}>;
		roads: Array<{ i: number; j: number }>;
		/** Outposts (plan 128, ADR 0125 point 4). */
		members?: EntityId[];
		/** The site's body (plan 128): another body's site is a base. */
		body?: string;
	}>;
}

/**
 * Vessel design (`formatVersion` 1 to 5, ADR 0016, 0034, 0071, 0258 and 0333): a flat list of part
 * instances with parent links, plus the staging sequence. Plain JSON, so the VAB can save/load it.
 * `resolveVesselDesign` (design.ts) validates it against the registries; `migrateVesselDesign`
 * turns older versions into version 4 (radial links and symmetry groups need 2; tilts, links and
 * radial links to boxes need 3; offsets need 4).
 */
export interface DesignLink {
	index: number;
	parentNode: string;
	node: string;
	radial?: { angle: number; y: number };
	/**
	 * A surface link (plan 244, ADR 0235; `parentNode` `"surface"`, version 3): the child's `node` lies
	 * at `point` of the parent's own frame, its direction against `normal`. For a place a radial link
	 * cannot name: the top or bottom face of a part, or the slope of a cone.
	 */
	surface?: { point: [number, number, number]; normal: [number, number, number] };
}

/*
 * An inverse link (plan 358, ADR 0333; version 5) is a `DesignLink` with a real `parentNode` and
 * `node` `"surface"`, and `surface` in the CHILD's frame: the child touches the parent's node with
 * its own surface at `point`, its outward `normal` against the node's direction (the twist is the
 * part's `tilt`). It is the other way round of a surface link, for a part that hangs by a node of
 * its parent but must lie on a surface of its own: the Root tool writes it when a booster on a
 * radial decoupler becomes the root.
 */

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

/**
 * A part's shift from its attach point, metres, in the parent part's axes (version 4, ADR 0258):
 * applied after the attach transform and before the tilt, so the part keeps its turn and pivots
 * about the moved attach point. Children move with it. The root ignores it.
 */
export interface DesignOffset {
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
	formatVersion: 1 | 2 | 3 | 4 | 5;
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
		/**
		 * The group is a mirror pair (plan 217, ADR 0207 point 2): this member is the reflection of the
		 * other across the vessel's YZ plane. Any version; the editor reads it, the sim ignores it.
		 */
		mirror?: true;
		/** Rotation of the part about its parent's axes (version 3). Absent: none. */
		tilt?: DesignTilt;
		/** Shift of the part from its attach point in the parent's axes (version 4, ADR 0258). Absent: none. */
		offset?: DesignOffset;
		/** Connector parts only (version 3): where the part's other end lands (struts and fuel lines, ADR 0071). */
		link?: DesignEnd;
		/**
		 * Per-part module settings (plan 219, ADR 0224): by module id, fields merged over the part
		 * definition's module config and parsed by the module's schema (a fairing's sections).
		 */
		settings?: Record<string, Record<string, unknown>>;
	}>;
	/** `stages[k]` lists the part indices whose modules' `onStage` runs for the k-th `stage` command. */
	stages: number[][];
	/** An aircraft starts level on a runway, nose along it (plan 063, ADR 0161 point 3). */
	aircraft?: boolean;
	/**
	 * Free placement (plan 279, ADR 0258 point 4): the Hangar lets a moved part leave its parent's
	 * reach. Any version; the editor reads it, the sim ignores it (the vessel is one rigid body).
	 */
	freePlacement?: true;
	/** Custom action groups (plan 110, ADR 0174): slot 1..10, members by part index; slot 0 is the Abort group (plan 245, ADR 0233). Any version. */
	groups?: Array<{
		slot: number;
		label: string;
		members: Array<{ part: number; module: string; action: string }>;
	}>;
	/**
	 * Crew seated in the Hangar (plan 218, ADR 0225): roster member ids by part index. The Launch
	 * screen starts from it; the sim ignores it (crew board through the launch choice).
	 */
	crew?: Array<{ member: string; part: number }>;
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
			/**
			 * A spot of the site instead of a pad, m east and north of its centre: a pad or runway
			 * building's centre from the Launch screen (plan 236, ADR 0229 point 6).
			 */
			at?: { east: number; north: number };
	  };

/**
 * Debug cheats (plan 203, ADR 0200 point 2): switches in the world's state that the sim reads.
 * `unbreakable-joints` has no effect until joints can break; it is kept for parity with KSP.
 */
export const DEBUG_CHEATS = [
	'infinite-fuel',
	'infinite-electricity',
	'infinite-monopropellant',
	'no-crash-damage',
	'ignore-temperature',
	'unbreakable-joints',
	'comms-without-signal',
	'infinite-life-support',
	'instant-construction'
] as const;
export type DebugCheat = (typeof DEBUG_CHEATS)[number];

/** Who may use the debug tools in a world (rule `stock.debug-tools`, ADR 0213 point 1). */
export type DebugAccess = 'always' | 'opt-in' | 'locked';

/** Where `debug-set-orbit` puts a vessel: elements around a body, epoch now (rad and m). */
export interface DebugOrbit {
	body: BodyId;
	/** Semi-major axis, m (negative for a hyperbola). */
	a: number;
	e: number;
	i: number;
	raan: number;
	argp: number;
	/** Mean anomaly now, rad. */
	m0: number;
}

/** Where `debug-set-location` puts a vessel (ADR 0200 point 4). Angles in rad; altitude above the reference sphere, m. */
export type DebugLocation =
	| { kind: 'site'; site: string; pad?: number }
	| { kind: 'surface'; body?: BodyId; latitude: number; longitude: number }
	| {
			/** In the air at `altitude`, moving `speed` m/s relative to the ground towards `heading` (from north), climbing at `climb` rad. */
			kind: 'air';
			body?: BodyId;
			latitude: number;
			longitude: number;
			altitude: number;
			speed: number;
			heading?: number;
			climb?: number;
	  };

/** The world's debug state as the sim reports it (plan 203, ADR 0213). */
export interface DebugSnapshot {
	access: DebugAccess;
	/** Debug mode is on (always true where access is `always`). */
	mode: boolean;
	/** Whether a debug command is accepted now: `always`, or `opt-in` with the mode on. */
	allowed: boolean;
	/** The world used a debug tool at least once; never cleared. */
	usedCheats: boolean;
	cheats: DebugCheat[];
}

export type Command =
	| { type: 'throttle'; vessel: EntityId; value: number }
	/** The wheel motors' throttle, -1..1 (plan 307); 0 hands them back to the vessel throttle. */
	| { type: 'wheel-throttle'; vessel: EntityId; value: number }
	| {
			type: 'attitude';
			vessel: EntityId;
			pitch: number;
			yaw: number;
			roll: number;
			/** RCS translation (plan 211), each -1..1 in vessel axes: x right, y forward, z up; kept when absent. */
			translate?: { x: number; y: number; z: number };
	  }
	/** Switch RCS on or off for the vessel (plan 211, ADR 0217). */
	| { type: 'set-rcs'; vessel: EntityId; on: boolean }
	/**
	 * Move `resource` between containers of one vessel (plan 213): from the `from` parts to the `to`
	 * parts at `rate` units/s (the resource's `transferRate`, else 20). It runs until the sources
	 * are empty, the targets full, or `stop` (with `from`/`to` absent) ends the vessel's transfers of
	 * that resource. Locked stores and flow-mode `none` resources are refused.
	 */
	| {
			type: 'transfer';
			vessel: EntityId;
			resource: string;
			from?: EntityId[];
			to?: EntityId[];
			rate?: number;
			stop?: boolean;
	  }
	/** Lock or unlock one resource of a part's stores (plan 213): flow and transfers skip it. */
	| { type: 'set-flow-lock'; vessel: EntityId; part: EntityId; resource: string; locked: boolean }
	| { type: 'stage'; vessel: EntityId }
	/**
	 * Trim (plan 063, ADR 0161 point 4; yaw and roll plan 245, ADR 0233): -1..1 added to the axis's
	 * demand, kept until changed; an omitted axis keeps its value, 0 clears it.
	 */
	| { type: 'trim'; vessel: EntityId; pitch?: number; yaw?: number; roll?: number }
	/** Set the stability assist mode and/or the prograde reference; an omitted field keeps its value (ADR 0049). */
	| {
			type: 'sas';
			vessel: EntityId;
			mode?: SasMode;
			reference?: SasReference;
			/** With mode `direction`: where the control part's nose points, inertial axes (ADR 0271 point 2). */
			direction?: Vec3;
			/** With mode `hold`: the control part's orientation to turn to and hold (ADR 0271 point 2). */
			attitude?: Quat;
	  }
	/** Start an autopilot on the vessel (plan 310, ADR 0271): `params` go to its `start`. */
	| { type: 'autopilot-engage'; vessel: EntityId; autopilot: string; params?: unknown }
	/** Store settings for an autopilot on the vessel (ADR 0285 point 3): merged, then given to `start`. */
	| {
			type: 'autopilot-settings';
			vessel: EntityId;
			autopilot: string;
			settings: Record<string, AutopilotSettingValue>;
	  }
	/** Stop the vessel's autopilot (outcome `disengaged`). */
	| { type: 'autopilot-disengage'; vessel: EntityId }
	/** A mod keybinding without a command was pressed (plan 343, ADR 0292 point 6): emits `mod:key`. */
	| {
			type: 'mod-key';
			key: string;
			vessel?: EntityId;
			/** A few numbers and strings for the mod (plan 366: a map pick's point), at most 16 keys. */
			data?: Record<string, number | string | boolean>;
	  }
	| {
			type: 'action';
			vessel: EntityId;
			part: EntityId;
			module: string;
			action: string;
			args?: unknown;
	  }
	/**
	 * Ask for time warp (plan 206, ADR 0202): granted up to the world's limit, never refused for
	 * being too high; the result says the level granted and why when it is lower. `vessel` is the
	 * one the player watches: vessels within physics range of it limit the warp, others do not.
	 */
	| { type: 'warp'; factor: number; vessel?: EntityId }
	/**
	 * Run the clock up to `time` at about `factor` times real time, slowing down so it stops exactly
	 * there with warp 1 (plan 045, ADR 0056). Needs every vessel on rails, like `warp`.
	 */
	| {
			type: 'warp-to';
			/** Sim time to stop at; or `target`, whose time the sim works out (with its margin). */
			time?: number;
			factor: number;
			target?: WarpTarget;
			vessel?: EntityId;
	  }
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
	/**
	 * Set a user alarm (plan 224, ADR 0223); with the `id` of one it replaces it (the result carries
	 * `alarm`). `time` and `transfer` alarms need `time`; `apoapsis`, `periapsis`, `soi` and `node`
	 * need `vessel` and fire `lead` s before the event (the warp-to margin when absent).
	 */
	| {
			type: 'add-alarm';
			id?: string;
			name?: string;
			kind?: AlarmKind;
			time?: number;
			vessel?: EntityId;
			lead?: number;
			body?: string;
	  }
	| { type: 'remove-alarm'; id: string }
	/** Fleet management (plan 223, ADR 0208): rename a vessel, set its type, or end it. */
	| { type: 'rename-vessel'; vessel: EntityId; name: string }
	| { type: 'set-vessel-type'; vessel: EntityId; vesselType: VesselType }
	/** Remove the vessel; its crew follow the `stock.crew-death` rule as in a crash. */
	| { type: 'terminate-vessel'; vessel: EntityId }
	/**
	 * Most debris the world keeps (a player setting, plan 223): beyond it the oldest goes first; 0
	 * removes debris at once. Not saved: the page sends it at the start of a session.
	 */
	| { type: 'set-debris-cap'; cap: number }
	/**
	 * Terminate every debris vessel of the player (plan 318, ADR 0274), or with `site` only the
	 * debris on that site's body within its flat radius of its centre.
	 */
	| { type: 'clear-debris'; site?: string }
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
			/**
			 * The Space Center tour's building (plan 377, ADR 0314 point 4): what is paid for it is kept
			 * on it as `refund` and given back when it is removed.
			 */
			tour?: boolean;
	  }
	/** Remove a building (plan 096); a building with a `refund` gives its funds back (ADR 0314). */
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
	 * Found a branch space center on the home planet (plan 236, ADR 0229): the site rules of
	 * `found-site`, the branch HQ's cost, and the HQ built over its build days.
	 */
	| {
			type: 'found-branch';
			id: string;
			name: string;
			latitude: number;
			longitude: number;
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
	/** Trade a commodity at today's price into or out of a site's storage (plan 097, ADR 0124 point 7). */
	| { type: 'market-buy'; commodity: string; amount: number; site: string }
	| { type: 'market-sell'; commodity: string; amount: number; site: string }
	/**
	 * Off-world bases (plan 128, ADR 0125): a landed base kit founds a site (`id` a host UUID); a landed
	 * vessel joins a site as an outpost; a supply route moves cargo between sites on each transfer window.
	 */
	| { type: 'deploy-base'; vessel: EntityId; id: string; name: string }
	| { type: 'join-site'; vessel: EntityId; site: string }
	| {
			type: 'create-route';
			id: string;
			from: string;
			to: string;
			commodity: string;
			amount: number;
	  }
	| { type: 'delete-route'; id: string }
	/** Research a tech node with the world's science (plan 105, ADR 0154 point 2). */
	| { type: 'research'; node: string }
	/** Move a crew member to another part of the same vessel (capacity checked). */
	| { type: 'crew-transfer'; vessel: EntityId; member: string; to: EntityId }
	/** EVA (plan 109, ADR 0120): the member steps out into a suit, a vessel of its own beside the part. */
	| { type: 'crew-eva'; vessel: EntityId; member: string }
	/**
	 * The member in `suit` boards `vessel` at a hatch or a ladder (plan 225; within 50 m with
	 * `stock.eva-board-assist`); the suit's samples come aboard.
	 */
	| { type: 'crew-board'; suit: EntityId; vessel: EntityId }
	/**
	 * A suit takes the sample a part of `vessel` holds (plan 260): within reach of the part; the sample
	 * rides in the suit and comes aboard with it at a hatch.
	 */
	| { type: 'crew-take'; suit: EntityId; vessel: EntityId; part: EntityId }
	/** Walk a landed vessel that can (its part declares `walk`): heading from north, rad; speed 0 stops. */
	| { type: 'crew-walk'; vessel: EntityId; heading: number; speed: number }
	/** A suit on the ground plants a flag beside it: a kept one-part vessel (ADR 0120 point 5). */
	| { type: 'plant-flag'; vessel: EntityId }
	/** Transmit a science data item (plan 103, ADR 0178 point 7): value × its factor, then it is gone. */
	| { type: 'transmit-data'; vessel: EntityId; item: string }
	/** Activate a strategy (plan 101, ADR 0187 point 6): agency type, slots and cooldown checked. */
	| { type: 'strategy-activate'; strategy: string }
	/** End an active strategy; its cooldown starts. */
	| { type: 'strategy-end'; strategy: string }
	/** Borrow `amount` funds on the agency's loan, up to its limit (ADR 0324). */
	| { type: 'loan-take'; amount: number }
	/** Repay `amount` of the loan from funds (at most what is owed). */
	| { type: 'loan-repay'; amount: number }
	/** Rent an agency's relay for the comms network (plan 126, ADR 0190 point 4): its rent is booked daily. */
	| { type: 'relay-rent'; vessel: EntityId }
	| { type: 'relay-end-rent'; vessel: EntityId }
	/** Discovery (plan 129, ADR 0192 point 5): start a dataset's next level in the lab. */
	| { type: 'discovery-process'; dataset: string }
	/** Claim a fact's value with a confidence in [0.5, 1]; judged on the world tick (ADR 0192 point 6). */
	| { type: 'discovery-claim'; body: string; fact: string; value: number; confidence: number }
	/** Carry this vessel's full link budget in `Snapshot.network.inspector` (null: none; ADR 0185). */
	| { type: 'comms-inspect'; vessel: EntityId | null }
	/** Buy a channel's licence for this world (plan 120, ADR 0191 point 2). */
	| { type: 'licence-buy'; band: string; channel: number }
	/** Broadcast a world first live (plan 121, ADR 0193 point 5): within the window, with the rate. */
	| { type: 'comms-broadcast'; milestone: string }
	/** Take a queued data item back into storage (plan 119, ADR 0189 point 1); sent bits are lost. */
	| { type: 'transmission-cancel'; vessel: EntityId; item: string }
	/** A vessel's route mode (plan 117, ADR 0188 point 3): Auto, a pinned Manual route, or a policy. */
	| { type: 'comms-route'; vessel: EntityId; mode: RouteMode }
	/** Point a dish (null: Auto). Never refused for lack of signal. */
	| { type: 'antenna-point'; vessel: EntityId; part: EntityId; target: string | null }
	/** Accept a contract offer (plan 099, ADR 0186 point 4): checks the slots, pays the advance. */
	| { type: 'contract-accept'; offer: string }
	/** Decline an offer: it goes, and its key stays out for the template's cooldown. */
	| { type: 'contract-decline'; offer: string }
	/** Cancel an active contract (generated `gen.<n>` or an authored id): it fails, the penalty is booked. */
	| { type: 'contract-cancel'; contract: string }
	/** Part reliability (plan 130, ADR 0156): the grade the world buys a part model at. */
	| { type: 'set-grade'; part: string; grade: 'economy' | 'standard' | 'proven' }
	/** One trial of every failure mode of a part model on the world's test stand. */
	| { type: 'static-fire'; part: string }
	/** Pay for a fix of an anomaly report: halves its mode's chance on that model. */
	| { type: 'fix-anomaly'; report: string }
	/** An engineer in `suit` repairs a failed module on `part` of `vessel`. */
	| { type: 'repair'; suit: EntityId; vessel: EntityId; part: EntityId }
	/**
	 * Pause or resume the world clock (plan 205, ADR 0201 point 5): refused where the rule
	 * `stock.pause-allowed` is false (Career Hardcore). Warp is not a pause and stays allowed.
	 */
	| { type: 'pause'; on: boolean }
	/**
	 * "Control from here" (plan 221, ADR 0208 point 2): SAS, the navball and steering take `part`'s
	 * axes; `null` goes back to the root. The part must be a control source of the vessel.
	 */
	| { type: 'set-control-part'; vessel: EntityId; part: EntityId | null }
	/**
	 * Stop every program on `vessel` (plan 320, ADR 0276 point 5): disengage its autopilot and end
	 * its script. The Delete key and Abort send it for the active vessel.
	 */
	| { type: 'program-stop'; vessel: EntityId; reason?: string }
	/** Record the script now running on `vessel` (ADR 0276 point 6); replaces one already there. */
	| { type: 'script-attach'; vessel: EntityId; name: string; source: string; resumed?: boolean }
	/** Commit the script's `memory` (a plain JSON object, at most `SCRIPT_MEMORY_MAX` as JSON). */
	| { type: 'script-memory'; vessel: EntityId; memory: Record<string, unknown> }
	/** The script on `vessel` ended (Stop, finish, failure): it is no longer saved. */
	| { type: 'script-detach'; vessel: EntityId; reason?: string }
	/** Turn Debug mode on or off in an `opt-in` world (plan 203, ADR 0213); on marks the world "used cheats". */
	| { type: 'debug-mode'; on: boolean }
	/** Switch one cheat (ADR 0200 point 2). */
	| { type: 'debug-cheat'; cheat: DebugCheat; on: boolean }
	/** Add funds, science or reputation; `tech` researches every node of the tree. */
	| { type: 'debug-grant'; funds?: number; science?: number; reputation?: number; tech?: boolean }
	/** Put `vessel` on rails at `orbit`, or spawn `design` there (exactly one of the two). */
	| { type: 'debug-set-orbit'; vessel?: EntityId; design?: VesselDesign; orbit: DebugOrbit }
	/** Put `vessel` landed at a site or coordinates, or in the air with a velocity. */
	| { type: 'debug-set-location'; vessel: EntityId; location: DebugLocation }
	/**
	 * Set the amount of `resource` (every resource when absent) in `part` (every part when absent):
	 * `fraction` of capacity, or an exact `amount` per store.
	 */
	| {
			type: 'debug-set-resource';
			vessel: EntityId;
			part?: EntityId;
			resource?: string;
			fraction?: number;
			amount?: number;
	  }
	/** Set the skin temperature of `part` (every part when absent), K. */
	| { type: 'debug-set-temperature'; vessel: EntityId; part?: EntityId; temperature: number }
	/** Set a crew member's level. */
	| { type: 'debug-set-crew-level'; member: string; level: number }
	/**
	 * EVA v2 (plan 225, ADR 0209): the suit grabs the nearest ladder within reach, or lets go with
	 * `release`.
	 */
	| { type: 'crew-grab'; suit: EntityId; release?: boolean }
	/** A latched suit climbs its ladder: `rate` -1 (down) .. 1 (up), 0 holds still. */
	| { type: 'crew-climb'; suit: EntityId; rate: number }
	/** A standing suit jumps. */
	| { type: 'crew-jump'; suit: EntityId };

/** What a `warp-to` can head for (plan 206, ADR 0202 point 6); a user alarm by id (plan 224). */
export type WarpTarget =
	| { kind: 'apoapsis' | 'periapsis' | 'soi' | 'node'; vessel: EntityId }
	| { kind: 'alarm'; id: string };

/** The time warp levels of the time bar (ADR 0202 point 1): physics up to 10×, rails above. */
export const WARP_LEVELS = [1, 2, 4, 10, 50, 100, 1_000, 10_000] as const;
/** The extra top level of a Sol world (default per owner review, rancangan §15 #5). */
export const SOL_WARP_LEVEL = 100_000;
/** The highest physics warp: above it every vessel in range must be on rails. */
export const PHYSICS_WARP_MAX = 10;

/** The world's warp limit now (plan 206): the highest level allowed and why it is not higher. */
export interface WarpLimitSnapshot {
	max: number;
	/** Null at the world's top level. */
	reason: string | null;
}

/** What `Sim.dispatch` returns: accepted (with the new vessel id for `load-vessel`) or refused with a reason. */
export type CommandResult =
	| {
			ok: true;
			vessel?: EntityId;
			/** The node `node-set` created or replaced. */
			node?: number;
			/** The alarm `add-alarm` set (plan 224). */
			alarm?: string;
			/** Sim time a delayed command applies (signal delay, plan 117, ADR 0188 point 6). */
			queued?: number;
			/** Channels of a program's command dropped because the player holds them (ADR 0276 point 3). */
			overridden?: ControlChannel[];
			/** `warp` and `warp-to` (plan 206): the level granted, and why when it is below the ask. */
			granted?: number;
			limit?: string;
	  }
	| { ok: false; reason: string };

export type CommandType = Command['type'];
