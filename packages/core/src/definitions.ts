/**
 * Minimal definition shapes stored in the registries. Plan 005 (`@orbital/sdk`) layers the typed
 * `define*` functions on top of these; the data-only kinds (resource, body, part) are validated
 * by the schemas in `schemas.ts`.
 */
import type * as z from 'zod';
import type { EntityId } from './ids.ts';
import type { EventBus, EventMap } from './events.ts';
import type { PhysicsBackend } from './physics-backend.ts';
import type { Registry } from './registry.ts';
import type { World } from './world.ts';
import type {
	bodyDefinitionSchema,
	partDefinitionSchema,
	resourceDefinitionSchema
} from './schemas.ts';

export type ResourceDefinition = z.infer<typeof resourceDefinitionSchema>;
export type BodyDefinition = z.infer<typeof bodyDefinitionSchema>;
/** Part as pure data: modules are referenced by module id plus an (unchecked here) config. */
export type PartDefinition = z.infer<typeof partDefinitionSchema>;

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

/** What a module hook sees. Built by the sim (plan 007) per part instance and step. */
export interface ModuleContext<Config = unknown, State = unknown> {
	readonly world: World;
	readonly events: EventBus<EventMap>;
	readonly registries: ReadonlyRegistries;
	readonly physics: PhysicsBackend;
	/** The part entity this module instance belongs to. */
	readonly entity: EntityId;
	/** The part's config for this module, after zod parsing (defaults applied). */
	readonly config: Config;
	/** Serializable per-instance state, created by `ModuleDefinition.state`. Hooks mutate it. */
	state: State;
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
	/** Fresh per-instance state. Must return plain serializable data. */
	state?: () => State;
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
