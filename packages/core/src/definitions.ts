/**
 * Minimal definition shapes stored in the registries. Plan 005 (`@orbital/sdk`) layers the typed
 * `define*` functions on top of these; the data-only kinds (resource, body, part) are validated
 * by the schemas in `schemas.ts`.
 */
import type * as z from 'zod';
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

/** Module: behaviour is defined by plan 005; core only needs the id and the config schema. */
export interface ModuleDefinition {
	id: string;
	/** zod schema for the per-part config; checked by the loader against each part using it. */
	config?: z.ZodType;
	/** Ids of modules that must be present on the same part. */
	requires?: readonly string[];
}

export type SystemPhase = 'pre-physics' | 'post-physics';

export interface SystemDefinition {
	id: string;
	phase: SystemPhase;
	update(world: World, dt: number): void;
}
