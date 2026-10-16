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
import type { World } from './world.ts';
import type {
	bodyDefinitionSchema,
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
	 * Resources reachable from this part according to each resource's `flowMode` (and parts'
	 * `crossfeed`). Amounts are in the resource's unit; `withdraw`/`deposit` return what moved.
	 */
	readonly resources: {
		amount(resource: string): number;
		withdraw(resource: string, amount: number): number;
		deposit(resource: string, amount: number): number;
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
	 * Fresh per-instance state, created from the part's parsed config (ADR 0014). Must return plain
	 * serializable data. A factory that ignores the argument is valid. Method syntax (bivariant
	 * parameter) rather than `Bivariant<...>` so `State` is still inferred from the return type.
	 */
	state?(config: Out): State;
	/** The part's stage fires (engine ignites, decoupler separates). */
	onStage?: Bivariant<(ctx: ModuleContext<Out, State>) => void>;
	/** Every fixed step while the owning vessel is in flight mode. */
	update?: Bivariant<(ctx: ModuleContext<Out, State>, dt: number) => void>;
	/** Every step while on rails (e.g. resource generation). Must not use the physics backend. */
	updateOnRails?: Bivariant<(ctx: ModuleContext<Out, State>, dt: number) => void>;
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
	 * Re-entry heating (plan 014, ADR 0023). Called every flight step in which the airflow puts power
	 * on the part, before the skin is warmed. Return the power in W the module carries away (an
	 * ablating shield burning its ablator); it is clamped to `0..heat.power`. The hook may change
	 * `ctx.state`.
	 */
	absorbHeat?: Bivariant<(ctx: ModuleContext<Out, State>, heat: HeatLoad, dt: number) => number>;
	/** The JSON-compatible view of `state` that snapshots expose to the UI. */
	snapshot?: Bivariant<(state: State) => unknown>;
}

export type SystemPhase = 'pre-physics' | 'post-physics';

/** Third argument of `SystemDefinition.update`: what a system may read besides the world. */
export interface SystemContext {
	readonly registries: ReadonlyRegistries;
	readonly events: EventBus<EventMap>;
}

export interface SystemDefinition {
	id: string;
	phase: SystemPhase;
	update(world: World, dt: number, ctx: SystemContext): void;
}
