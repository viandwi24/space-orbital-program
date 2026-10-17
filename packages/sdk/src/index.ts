/**
 * @orbital/sdk — the public mod SDK. Mods import ONLY from this package.
 * Stable surface — changes follow docs/conventions/versioning.md.
 *
 * Plugin authors: definePlugin / defineModule / definePart / defineResource / defineBody /
 * defineSystem / definePatch / defineRule / definePreset / defineDataKind / defineActionGroup / defineObjective / defineContract / defineMission (`./define.ts`), plus `z` for module config schemas. Hosts and tests boot plugins
 * with `loadPlugins`. Everything else re-exported here is a type or helper a mod may need.
 */
export * from './define.ts';

export * as z from 'zod';

export {
	API_VERSION,
	describeModule,
	loadPlugins,
	parseModuleConfig,
	PluginError,
	RegistryError,
	SEA_LEVEL_PRESSURE,
	STANDARD_GRAVITY,
	thrustAtPressure
} from '@orbital/core';
export { satisfies as apiSatisfies } from '@orbital/core';
export { PATCH_TARGETS } from '@orbital/core';
export { actionArgumentProblem, customGroupId, groupState, MAX_CUSTOM_GROUPS } from '@orbital/core';
export { evaluateObjectives, objectiveNodeSchema } from '@orbital/core';
export {
	dataItemSchema,
	dataKindDefinitionSchema,
	dataValueAt,
	dataValueFactor
} from '@orbital/core';
export { DEFAULT_PRESET, IDENTITY_RULES, ruleValueProblem } from '@orbital/core';
export {
	buildingDefinitionSchema,
	canPlace,
	CELL_SIZE,
	footprint,
	LEGACY_LAYOUT,
	LEGACY_SITE,
	sitesOf
} from '@orbital/core';
export {
	CURRENCIES,
	ECONOMY_CAUSES,
	ECONOMY_RULES,
	chargeDefinitionSchema,
	designCost,
	projectBalances,
	recoveryFactor
} from '@orbital/core';
// Calendars (plan 081, ADR 0141): a system pack's tests check the date its root body's calendar shows.
export { calendarOf, formatDate, epochFromUtc } from '@orbital/core';
export type { Calendar, CalendarDate, CalendarSpec, Epoch } from '@orbital/core';

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
	GRAVITATIONAL_CONSTANT,
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
	partVisualSchema,
	moduleInfoSchema,
	resourceDefinitionSchema,
	bodyDefinitionSchema,
	ruleDefinitionSchema,
	presetDefinitionSchema
} from '@orbital/core';

export type {
	Ambient,
	BasePluginContext,
	BodyDefinition,
	BodyId,
	EntityId,
	EventBus,
	EngineInfo,
	HeatLoad,
	LoadOptions,
	LoadReport,
	LoadResult,
	ModuleCollider,
	ModuleContext,
	ModuleDefinition,
	ModuleId,
	ModuleInfo,
	PartDefinition,
	PartId,
	PartShape,
	PartVisual,
	AnyPatchDefinition,
	PatchChange,
	PatchDefinition,
	PatchOp,
	PatchReport,
	PatchSelect,
	PatchTarget,
	Provenance,
	PresetDefinition,
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
	ResourceStore,
	Rng,
	Balances,
	BuildingDefinition,
	BuildingLevel,
	Cell,
	PlacedBuilding,
	PlaceReason,
	PlaceResult,
	Rotation,
	ChargeDefinition,
	Currency,
	DesignCost,
	LedgerEntry,
	RuleDefinition,
	RuleReader,
	RuleValue,
	SeparatorInfo,
	SystemContext,
	SystemDefinition,
	SystemId,
	SystemPhase,
	WorldTick,
	ContractDefinition,
	MissionDefinition,
	ObjectiveDefinition,
	ObjectiveNode,
	ObjectiveResult,
	ObjectiveStatus,
	ObjectiveTrigger,
	ObjectiveView,
	ObjectiveVesselView,
	RewardEntry,
	TrajectoryCapabilities,
	TrajectoryModel,
	TrajectoryProvider,
	ActionGroupDefinition,
	ActionKind,
	DesignActionGroup,
	GroupState,
	PartActionDescriptor,
	DataItem,
	DataKindDefinition,
	DataStorage,
	DataStorageState,
	NewDataItem,
	Quat,
	Transform,
	Vec3,
	VesselApi,
	VesselControl,
	ComponentType,
	World
} from '@orbital/core';
