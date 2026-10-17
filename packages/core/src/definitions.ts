/**
 * Minimal definition shapes stored in the registries. Plan 005 (`@orbital/sdk`) layers the typed
 * `define*` functions on top of these; the data-only kinds (resource, body, part) are validated
 * by the schemas in `schemas.ts`.
 */
import type * as z from 'zod';
import type { EntityId } from './ids.ts';
import type { EventBus, EventMap } from './events.ts';
import type { Vec3 } from './math.ts';
import type { PhysicsBackend } from './physics-backend.ts';
import type { Registry } from './registry.ts';
import type { Rng } from './rng.ts';
import type { ContractDefinition, MissionDefinition, ObjectiveDefinition } from './objectives.ts';
import type { CrewNamesDefinition, CrewTraitDefinition } from './crew.ts';
import type { DataKindDefinition, DataStorage, NewDataItem } from './data.ts';
import type { ActionGroupDefinition } from './action-groups.ts';
import type { PresetDefinition, RuleDefinition, RuleValue } from './rules.ts';
import type { BuildingDefinition } from './buildings.ts';
import type { SiteTemplateDefinition } from './site-templates.ts';
import type { ExperimentDefinition, SituationDefinition } from './science.ts';
import type { ChargeDefinition } from './economy.ts';
import type { World } from './world.ts';
import type {
	bodyDefinitionSchema,
	moduleInfoSchema,
	partDefinitionSchema,
	partShapeSchema,
	partVisualSchema,
	resourceDefinitionSchema
} from './schemas.ts';

export type ResourceDefinition = z.infer<typeof resourceDefinitionSchema>;
export type BodyDefinition = z.infer<typeof bodyDefinitionSchema>;
/** Part as pure data: modules are referenced by module id plus an (unchecked here) config. */
export type PartDefinition = z.infer<typeof partDefinitionSchema>;
export type PartShape = z.infer<typeof partShapeSchema>;
export type PartVisual = z.infer<typeof partVisualSchema>;
/** What a module tells tools about itself (`ModuleDefinition.describe`, ADR 0033). */
export type ModuleInfo = z.infer<typeof moduleInfoSchema>;
export type EngineInfo = NonNullable<ModuleInfo['engine']>;
export type SeparatorInfo = NonNullable<ModuleInfo['separator']>;

/**
 * Open interface: plugins map a resource id to extra info by module augmentation
 * (`declare module '@orbital/sdk' { interface ResourceMap { 'acme.uranium': {...} } }`).
 */
export interface ResourceMap {}
/** Known augmented resource ids; plain strings stay accepted where a resource id is expected. */
export type ResourceKey = Extract<keyof ResourceMap, string>;

/**
 * Open interface: maps a module id to the *input* type of its part config. Lets data-form parts
 * (`['acme.reactor', { ... }]`) be type-checked in `definePart`.
 */
export interface ModuleMap {}

/**
 * Parameter-bivariant function type. Hooks use it so a `ModuleDefinition<Cfg, Cfg, State>` is
 * assignable to the erased `ModuleDefinition` stored in the registry without casts.
 */
export type Bivariant<F extends (...args: never[]) => unknown> = {
	bivarianceHack(...args: Parameters<F>): ReturnType<F>;
}['bivarianceHack'];

/** Read-only view of a registry (no `register`); what running code gets. */
export type ReadonlyRegistry<T extends { id: string }> = Omit<Registry<T>, 'register'>;
export interface ReadonlyRegistries {
	parts: ReadonlyRegistry<PartDefinition>;
	modules: ReadonlyRegistry<ModuleDefinition>;
	resources: ReadonlyRegistry<ResourceDefinition>;
	bodies: ReadonlyRegistry<BodyDefinition>;
	systems: ReadonlyRegistry<SystemDefinition>;
	rules: ReadonlyRegistry<RuleDefinition>;
	presets: ReadonlyRegistry<PresetDefinition>;
	charges: ReadonlyRegistry<ChargeDefinition>;
	/** Objectives, contracts and missions (plan 098, ADR 0175). */
	objectives: ReadonlyRegistry<ObjectiveDefinition>;
	contracts: ReadonlyRegistry<ContractDefinition>;
	missions: ReadonlyRegistry<MissionDefinition>;
	/** Data kinds (plan 083, ADR 0172). */
	dataKinds: ReadonlyRegistry<DataKindDefinition>;
	/** Action groups (plan 110, ADR 0174). */
	actionGroups: ReadonlyRegistry<ActionGroupDefinition>;
	buildings: ReadonlyRegistry<BuildingDefinition>;
	/** Site templates (plan 092, ADR 0177). */
	siteTemplates: ReadonlyRegistry<SiteTemplateDefinition>;
	/** Science (plan 103, ADR 0178). */
	situations: ReadonlyRegistry<SituationDefinition>;
	experiments: ReadonlyRegistry<ExperimentDefinition>;
	/** Crew traits and name syllables (plan 106, ADR 0176). */
	crewTraits: ReadonlyRegistry<CrewTraitDefinition>;
	crewNames: ReadonlyRegistry<CrewNamesDefinition>;
}

/** Vessel-wide control input set by `throttle` and `attitude` commands. */
export interface VesselControl {
	/** 0..1. */
	readonly throttle: number;
	/** Attitude demand about the vessel body axes, each -1..1: pitch about +X, roll about +Y (the long axis), yaw about +Z. */
	readonly pitch: number;
	readonly roll: number;
	readonly yaw: number;
}

/** Ambient conditions at the part. Vacuum (all zero) outside the atmosphere. */
export interface Ambient {
	/** Static pressure, Pa. */
	readonly pressure: number;
	/** Air density, kg/m³. */
	readonly density: number;
	/** Height above the body's reference sphere, m. */
	readonly altitude: number;
}

/**
 * What a module hook may ask of the vessel its part belongs to (ADR 0015). Everything is
 * expressed from the part's point of view; the sim owns bodies, joints and the resource graph.
 */
export interface VesselApi {
	/** Simulation time, s. */
	readonly time: number;
	readonly control: VesselControl;
	readonly ambient: Ambient;
	/**
	 * Force in N, in the part's local frame, at `point` (a local-frame position in metres; the part
	 * origin when omitted). Acts for the current step only, so call it every step. Flight mode only:
	 * throws on rails.
	 */
	applyForce(force: Vec3, point?: Vec3): void;
	/** Torque in N·m in the part's local frame; same lifetime and mode rules as `applyForce`. */
	applyTorque(torque: Vec3): void;
	/**
	 * Velocity relative to the air (the atmosphere turns with the body) of `point`, a part-frame
	 * position in metres (the part origin when omitted), expressed in the part frame, m/s. Includes
	 * the vessel's rotation. Flight mode only: throws on rails (ADR 0035).
	 */
	airVelocity(point?: Vec3): Vec3;
	/**
	 * The centre of mass of the vessel's body, in the part frame, m (moves as propellant burns).
	 * Steering parts need it for their lever arm (ADR 0045). Flight mode only: throws on rails.
	 */
	readonly centreOfMass: Vec3;
	/**
	 * The attitude demand as a torque direction in the part frame: `x` pitch, `y` roll, `z` yaw,
	 * each -1..1 (`control` rotated by the part's yaw). Available in both modes (ADR 0045).
	 */
	readonly torqueDemand: Vec3;
	/**
	 * Resources reachable from this part according to each resource's `flowMode` (and parts'
	 * `crossfeed`). Amounts are in the resource's unit; `withdraw`/`deposit` return what moved.
	 */
	readonly resources: {
		amount(resource: string): number;
		withdraw(resource: string, amount: number): number;
		deposit(resource: string, amount: number): number;
	};
	/**
	 * Data storage of the whole vessel (plan 083, ADR 0172): `store` puts the item on the first
	 * storage with room and returns its id, or drops it (`data:dropped`) and returns undefined.
	 */
	/** The vessel's science situation (plan 103, ADR 0178 point 6), or undefined when none matches. */
	situation(): string | undefined;
	/**
	 * Science (plan 103, ADR 0178): `result` makes a result of `experiment` in the current situation
	 * and returns its subject and value (undefined when no situation matches); `credit` credits a
	 * subject (a recovered sample).
	 */
	readonly science: {
		result(experiment: string): { subject: string; value: number } | undefined;
		credit(subject: string, value: number): void;
	};
	readonly data: {
		store(item: NewDataItem): string | undefined;
		/** Bits stored on the vessel. */
		used(): number;
		/** Bits the vessel's storages hold in all. */
		capacity(): number;
	};
	/**
	 * Sever the attachment at this part's attach node `node`: whatever hangs off it leaves as its
	 * own vessel. `impulse` (N·s, default 0) pushes the two halves apart along the node direction,
	 * equal and opposite. Applied by the sim after the current hook returns. No effect when nothing
	 * is attached at `node`.
	 */
	detach(node: string, impulse?: number): void;
}

/** What a module hook sees. Built by the sim (plan 007) per part instance and call. */
export interface ModuleContext<Config = unknown, State = unknown> {
	readonly world: World;
	readonly events: EventBus<EventMap>;
	readonly registries: ReadonlyRegistries;
	/** The flight frame's backend. Hooks have no body handle: use `vessel` for forces. */
	readonly physics: PhysicsBackend;
	/** The part entity this module instance belongs to. */
	readonly entity: EntityId;
	/** The part's config for this module, after zod parsing (defaults applied). */
	readonly config: Config;
	/** Serializable per-instance state, created by `ModuleDefinition.state`. Hooks mutate it. */
	state: State;
	/** Capabilities of the vessel this part belongs to (ADR 0015). */
	readonly vessel: VesselApi;
}

/**
 * A module that holds resources. The sim sums their mass and routes `VesselApi.resources` through
 * them without knowing the module. Method syntax keeps the typed definition assignable to the
 * erased registry type.
 */
export interface ResourceStore<Config = unknown, State = unknown> {
	/** Ids of the resources this store can hold. */
	resources(config: Config, state: State): readonly string[];
	/** Current amount of `resource`. */
	amount(config: Config, state: State, resource: string): number;
	/** Remove up to `amount`; returns what was taken. */
	withdraw(config: Config, state: State, resource: string, amount: number): number;
	/** Add up to `amount` (bounded by capacity); returns what was accepted. */
	deposit(config: Config, state: State, resource: string, amount: number): number;
}

/**
 * An extra collision box a module adds to its part (landing-leg feet), part frame, metres.
 * Collision only: it carries no mass.
 */
export interface ModuleCollider {
	/** Centre of the box relative to the part origin. */
	offset: Vec3;
	halfExtents: Vec3;
}

/** Heat the airflow delivers to a part this step (what `ModuleDefinition.absorbHeat` receives). */
export interface HeatLoad {
	/** Convective power on the part, W. */
	readonly power: number;
	/** The part's current skin temperature, K. */
	readonly temperature: number;
}

/**
 * Module: reusable behaviour with a config schema and serializable state. Behaviour is functions
 * on the definition; state is plain data held in the world (ADR 0010, boundaries.md).
 * `In` is the config as authors write it (z.input), `Out` what hooks receive (z.output).
 */
export interface ModuleDefinition<In = unknown, Out = In, State = unknown> {
	id: string;
	/** zod schema for the per-part config; each part using the module is checked against it at load. */
	config?: z.ZodType<Out, In>;
	/** Ids of modules that must also be present on the same part. */
	requires?: readonly string[];
	/** True when a part with this module is a control source: a vessel with one accepts control commands. */
	controlSource?: boolean;
	/** Present when this module holds resources (tanks, batteries); see `ResourceStore`. */
	store?: ResourceStore<Out, State>;
	/**
	 * Present when this module holds data items (plan 083, ADR 0172); its state must carry
	 * `{ items, next }` (`DataStorageState`).
	 */
	dataStorage?: DataStorage<Out>;
	/**
	 * Fresh per-instance state, created from the part's parsed config (ADR 0014). Must return plain
	 * serializable data. A factory that ignores the argument is valid. Method syntax (bivariant
	 * parameter) rather than `Bivariant<...>` so `State` is still inferred from the return type.
	 */
	state?(config: Out): State;
	/** The vessel is recovered (plan 103): credit what the module holds before it is removed. */
	onRecover?: Bivariant<(ctx: ModuleContext<Out, State>) => void>;
	/** The part's stage fires (engine ignites, decoupler separates). */
	onStage?: Bivariant<(ctx: ModuleContext<Out, State>) => void>;
	/** Every fixed step while the owning vessel is in flight mode. */
	update?: Bivariant<(ctx: ModuleContext<Out, State>, dt: number) => void>;
	/** Every step while on rails (e.g. resource generation). Must not use the physics backend. */
	updateOnRails?: Bivariant<(ctx: ModuleContext<Out, State>, dt: number) => void>;
	/**
	 * Closed form over `dt` seconds for a vessel that is not in flight (plan 082, ADR 0171): rate ×
	 * elapsed time. Called on every world tick, when the vessel wakes into flight and before a save,
	 * with the time since the last call. A module with `background` gets no `updateOnRails` calls.
	 */
	background?: Bivariant<(ctx: ModuleContext<Out, State>, dt: number) => void>;
	/** Named operations callable from UI, staging and scripts. */
	actions?: Record<
		string,
		Bivariant<(ctx: ModuleContext<Out, State>, ...args: unknown[]) => unknown>
	>;
	/**
	 * Extra collision boxes of the part for the current state (e.g. deployed landing-leg feet).
	 * Re-read after every dispatched `action` and `stage`; the vessel's physics body is rebuilt
	 * when the result changed. Must be a pure function of config and state (ADR 0019).
	 */
	colliders?: Bivariant<(config: Out, state: State) => readonly ModuleCollider[]>;
	/**
	 * The largest torque this module can add about each part axis right now, N·m, all >= 0: `x`
	 * pitch, `y` roll, `z` yaw (the axes of `VesselApi.torqueDemand`). The stability assist divides
	 * the vessel's total by its inertia to size its demand (ADR 0049). Return zero on an axis the
	 * module cannot steer. Flight mode only; pure of side effects.
	 */
	controlAuthority?: Bivariant<(ctx: ModuleContext<Out, State>) => Vec3>;
	/**
	 * Re-entry heating (plan 014, ADR 0023). Called every flight step in which the airflow puts power
	 * on the part, before the skin is warmed. Return the power in W the module carries away (an
	 * ablating shield burning its ablator); it is clamped to `0..heat.power`. The hook may change
	 * `ctx.state`.
	 */
	absorbHeat?: Bivariant<(ctx: ModuleContext<Out, State>, heat: HeatLoad, dt: number) => number>;
	/**
	 * What the module does, for tools that predict the sim without running it (stage delta-v in the
	 * HUD and the VAB; ADR 0033): an engine's mass flow, thrust curve and propellants, or the attach
	 * node a separator severs. Pure. `state` is the fresh `state(config)` for a design and the
	 * module's `snapshot` view for a live vessel, so read only fields `snapshot` exposes. Tools call it
	 * through `describeModule`, which validates the result against `moduleInfoSchema`.
	 */
	describe?: Bivariant<(config: Out, state: State) => ModuleInfo>;
	/** The JSON-compatible view of `state` that snapshots expose to the UI. */
	snapshot?: Bivariant<(state: State) => unknown>;
}

/**
 * `pre-physics` / `post-physics` run every step; `world-tick` once per game day at the day
 * boundary (plan 082, ADR 0171).
 */
export type SystemPhase = 'pre-physics' | 'post-physics' | 'world-tick';

/** What a `world-tick` system learns about the tick (`SystemContext.tick`). */
export interface WorldTick {
	/** The day being entered (epoch day plus whole days elapsed). */
	readonly day: number;
	/** Sim time of the day boundary, s (exact, also when a flight step ran past it). */
	readonly time: number;
	/** This system's own stream, from the world seed and the system id (ADR 0171 point 6). */
	readonly rng: Rng;
}

/** Third argument of `SystemDefinition.update`: what a system may read besides the world. */
export interface SystemContext {
	readonly registries: ReadonlyRegistries;
	readonly events: EventBus<EventMap>;
	/** The world's rule values (plan 078, ADR 0111); a plain map read. */
	readonly rules: RuleReader;
	/** Set for `world-tick` systems only (plan 082). */
	readonly tick?: WorldTick;
}

/** Read access to a world's rule values. */
export interface RuleReader {
	/** The value of a rule, or undefined when no loaded mod registers it. */
	get(id: string): RuleValue | undefined;
}

export interface SystemDefinition {
	id: string;
	phase: SystemPhase;
	/** `world-tick` order: lower first (default 0), then plugin boot order, then id. */
	order?: number;
	update(world: World, dt: number, ctx: SystemContext): void;
}
