/**
 * @orbital/sdk — the public mod SDK. Mods import ONLY from this package.
 * Stable surface — changes follow docs/conventions/versioning.md.
 *
 * Plugin authors: definePlugin / defineModule / definePart / defineResource / defineBody /
 * defineSystem (`./define.ts`), plus `z` for module config schemas. Hosts and tests boot plugins
 * with `loadPlugins`. Everything else re-exported here is a type or helper a mod may need.
 */
export * from './define.ts';

export * as z from 'zod';

export {
	API_VERSION,
	loadPlugins,
	parseModuleConfig,
	PluginError,
	RegistryError
} from '@orbital/core';
export { satisfies as apiSatisfies } from '@orbital/core';

// Units and ids (SI helpers, validated brands).
export {
	m,
	km,
	kg,
	tonnes,
	newtons,
	kN,
	seconds,
	minutes,
	hours,
	days,
	deg,
	toDegrees,
	partId,
	moduleId,
	resourceId,
	bodyId,
	systemId,
	pluginId,
	entityId
} from '@orbital/core';

// World access for module state and systems.
export { defineComponent, createRng } from '@orbital/core';
// Test support: a mod's tests build a ModuleContext from a real world and event bus (ADR 0014).
export { createWorld, createEventBus } from '@orbital/core';

// Open interfaces plugins extend by module augmentation (see docs/architecture/plugin-system.md).
export type { EventMap, ResourceMap, ModuleMap, ResourceKey } from '@orbital/core';

// Schemas for data-form definitions (JSON parts etc.).
export {
	partDefinitionSchema,
	partShapeSchema,
	resourceDefinitionSchema,
	bodyDefinitionSchema
} from '@orbital/core';

export type {
	BasePluginContext,
	BodyDefinition,
	BodyId,
	EntityId,
	EventBus,
	LoadOptions,
	LoadReport,
	LoadResult,
	ModuleContext,
	ModuleDefinition,
	ModuleId,
	PartDefinition,
	PartId,
	PartShape,
	PhysicsBackend,
	Plugin,
	PluginId,
	PluginMeta,
	PluginRef,
	ReadonlyRegistries,
	ReadonlyRegistry,
	Registrar,
	RegistryKind,
	ResourceDefinition,
	Registries,
	ResourceId,
	Rng,
	SystemContext,
	SystemDefinition,
	SystemId,
	SystemPhase,
	Quat,
	Transform,
	Vec3,
	ComponentType,
	World
} from '@orbital/core';
