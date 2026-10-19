/**
 * @orbital/sdk — the public mod SDK. Mods import ONLY from this package.
 * Stable surface — changes follow docs/conventions/versioning.md.
 *
 * Plugin authors: definePlugin / defineModule / definePart / defineResource / defineBody /
 * defineSystem / definePatch / defineRule / definePreset / defineDataKind / defineActionGroup / defineObjective / defineContract / defineContractTemplate / defineStrategy / defineAgency / defineDiscoveryFact / defineMission / defineCrewTrait / defineCrewNames / defineSiteTemplate / defineExperiment / defineSituation / defineAntenna / defineBand / defineGroundStation / defineCategory / defineDossierEntry / defineSystemVariant (`./define.ts`), plus `z` for module config schemas. Hosts and tests boot plugins
 * defineSystem / definePatch / defineRule / definePreset / defineDataKind / defineActionGroup / defineObjective / defineContract / defineContractTemplate / defineMission / defineCrewTrait / defineCrewNames / defineSiteTemplate / defineExperiment / defineSituation / defineAntenna / defineBand / defineRoutePolicy / defineGroundStation / defineCategory / defineDossierEntry / defineSystemVariant (`./define.ts`), plus `z` for module config schemas. Hosts and tests boot plugins
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
	STANDARD_ATMOSPHERE_TEMPERATURE,
	STANDARD_GRAVITY,
	thrustAtPressure
} from '@orbital/core';
export { satisfies as apiSatisfies } from '@orbital/core';
export { PATCH_TARGETS } from '@orbital/core';
export { NODE_SIZES, nodeSize, nodeSizeClass, nodeSizesMatch } from '@orbital/core';
export { powerBudget } from '@orbital/core';
export { resolveSiteTemplate, siteConsequences, siteDistance } from '@orbital/core';
export { achievementMatches, MILESTONE_KINDS, milestoneId } from '@orbital/core';
export { GRADES, GRADE_FACTORS, modelReliability, trialChance } from '@orbital/core';
export { PANEL_CONTEXTS, sortPanels } from '@orbital/core';
export { scenarioPlacement } from '@orbital/core';
export { isResearched, lockedParts, nodeOfParts, researchProblem } from '@orbital/core';
export { bodyScience, nextValue, situationOf, subjectCap, subjectId } from '@orbital/core';
export {
	blackoutLevelFromFlux,
	linkRange,
	linkBudget,
	antennaGain,
	dishGain,
	freeSpaceLoss,
	rateForMargin,
	RATE_LADDER,
	BLACKOUT_BADGE_LEVEL
} from '@orbital/core';
export {
	estimatedLaunchCost,
	expectedValue,
	CONTRACT_COST_BASE,
	CONTRACT_COST_PER_DV2
} from '@orbital/core';
export { dossierOf, regionAt, regionsOf } from '@orbital/core';
export { CONSUMABLES, LIFE_SUPPORT_RATES, performanceOf } from '@orbital/core';
// Ephemeris helpers for system packs (plans 123 and 124, ADRs 0183 and 0184).
export {
	AU,
	hohmannTransfer,
	levelAElements,
	SECONDS_PER_CENTURY,
	type LevelARow
} from '@orbital/kepler';
export { poleQuaternion } from '@orbital/core';
export {
	buildingCategoryOf,
	categoryIdOf,
	CATEGORY_SCOPES,
	FALLBACK_BUILDING_CATEGORY,
	scopeOf,
	sortCategories,
	STOCK_CATEGORY_NAMES
} from '@orbital/core';
export { homeBodyOf, positionFromStar, subSolarLatitude } from '@orbital/core';
export { ABILITY_KEYS, abilitiesOf, PROFESSIONS } from '@orbital/core';
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
	STRATEGY_KEYS,
	strategyMultipliers,
	strategyUpkeepCharge,
	factValue,
	reviewScore,
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
	WheelSpec,
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
	ResolvedSite,
	SiteConsequences,
	SiteTemplateCriteria,
	SiteTemplateDefinition,
	AchievementCriteria,
	TechNodeDefinition,
	ScenarioDefinition,
	ScenarioVessel,
	AchievementDefinition,
	FailureModeDefinition,
	FailureTrigger,
	CommodityDefinition,
	MarketParams,
	RecipeDefinition,
	Grade,
	MilestoneKind,
	MilestoneRecord,
	PanelCanvas,
	PanelContext,
	PanelDefinition,
	PanelInput,
	PanelNode,
	ExperimentDefinition,
	ExperimentStatus,
	ScienceSubject,
	SituationDefinition,
	SituationView,
	AntennaDefinition,
	BandDefinition,
	RouteCandidate,
	RouteMode,
	RoutePolicyDefinition,
	ControlState,
	GroundStationDefinition,
	LinkBudget,
	LinkReason,
	SignalState,
	SystemChoice,
	SystemVariantDefinition,
	VesselDesign,
	BodyRegions,
	Dossier,
	DossierEntry,
	DossierEntryDefinition,
	DossierFact,
	RegionInfo,
	LifeSupportMode,
	ScrubberInfo,
	CategoryDefinition,
	CategoryIcon,
	CategoryScope,
	ContractDefinition,
	ContractBlueprint,
	ContractBodyView,
	ContractOffer,
	ContractTemplateContext,
	ContractTemplateDefinition,
	ContractsSnapshot,
	StrategyDefinition,
	AgencyDefinition,
	AgencyMission,
	AgenciesSnapshot,
	StrategyKey,
	DiscoveryClaim,
	DiscoveryDataset,
	DiscoveryFactDefinition,
	DiscoverySnapshot,
	StrategiesSnapshot,
	MissionDefinition,
	ObjectiveDefinition,
	ObjectiveNode,
	ObjectiveResult,
	ObjectiveStatus,
	ObjectiveTrigger,
	ObjectiveView,
	ObjectiveVesselView,
	RewardEntry,
	Abilities,
	AbilityKey,
	CrewMember,
	CrewNamesDefinition,
	CrewTraitDefinition,
	Profession,
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
	PowerBudget,
	PowerInfo,
	World
} from '@orbital/core';
