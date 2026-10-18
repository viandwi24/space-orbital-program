/**
 * The define-API. Every function is typed identity-plus-sugar: it returns the plain-data (or
 * plain-function) definition that core registers, and exists to give authors inference and
 * compile-time checks. See docs/architecture/plugin-system.md and ADR 0013.
 */
import type {
	ActionGroupDefinition,
	FailureModeDefinition,
	SiteTemplateDefinition,
	AchievementDefinition,
	TechNodeDefinition,
	ScenarioDefinition,
	PanelDefinition,
	ExperimentDefinition,
	SituationDefinition,
	AntennaDefinition,
	BandDefinition,
	GroundStationDefinition,
	SystemVariantDefinition,
	DossierEntryDefinition,
	CategoryDefinition,
	CrewNamesDefinition,
	CrewTraitDefinition,
	AnyPatchDefinition,
	BuildingDefinition,
	ContractDefinition,
	MissionDefinition,
	ObjectiveDefinition,
	DataKindDefinition,
	BasePluginContext,
	BodyDefinition,
	ModuleDefinition,
	ModuleMap,
	PartDefinition,
	PatchDefinition,
	PatchTarget,
	Plugin,
	PluginMeta,
	PluginRef,
	ChargeDefinition,
	PresetDefinition,
	ResourceDefinition,
	RuleDefinition,
	SystemDefinition
} from '@orbital/core';

// ---------------------------------------------------------------------------------------------
// definePlugin
// ---------------------------------------------------------------------------------------------

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
	k: infer I
) => void
	? I
	: never;

/** The `contributes` type of a dependency; id strings contribute nothing. */
type ContributesOf<R> = R extends Plugin<infer C> ? C : unknown;

/** Intersection of the `contributes` of every plugin instance in `Refs` (`unknown` when empty). */
export type MergeContributes<Refs extends readonly PluginRef[]> = [Refs[number]] extends [never]
	? unknown
	: UnionToIntersection<ContributesOf<Refs[number]>>;

/**
 * What `setup` receives: the registration handles, `provide` typed by this plugin's `contributes`,
 * the merged `contributes` of its direct `depends` at the top level, and its `optional` ones
 * (possibly undefined) under `ctx.optional`.
 */
export type PluginContext<
	C extends object = object,
	D extends readonly PluginRef[] = readonly [],
	O extends readonly PluginRef[] = readonly []
> = Omit<BasePluginContext, 'provide' | 'optional'> & {
	provide<K extends keyof C & string>(key: K, impl: C[K]): void;
	readonly optional: Partial<MergeContributes<O>>;
} & MergeContributes<D>;

export interface PluginInput<
	C extends object,
	D extends readonly PluginRef[],
	O extends readonly PluginRef[]
> {
	meta: PluginMeta;
	/** Hard dependencies: plugin instances (types flow into `ctx`) or ids (ordering only). */
	depends?: D;
	/** Soft dependencies: booted first when present; their API is at `ctx.optional`. */
	optional?: O;
	/** Type-level declaration of the API this plugin provides: `{} as { key: Api }`. */
	contributes?: C;
	setup(ctx: PluginContext<C, D, O>): void;
}

export function definePlugin<
	const D extends readonly PluginRef[] = readonly [],
	const O extends readonly PluginRef[] = readonly [],
	C extends object = Record<never, never>
>(input: PluginInput<C, D, O>): Plugin<C> {
	return {
		meta: input.meta,
		depends: input.depends ?? [],
		optional: input.optional ?? [],
		contributes: input.contributes,
		// The typed context is a subtype of BasePluginContext; Plugin.setup is parameter-bivariant.
		setup: input.setup
	};
}

// ---------------------------------------------------------------------------------------------
// defineModule / definePart
// ---------------------------------------------------------------------------------------------

/**
 * `config` is a zod schema: parts are checked against its *input* type at compile time and its
 * parse at load time; hooks see the parsed *output*. Without `config` the module takes none.
 */
export function defineModule<In = undefined, Out = undefined, State = undefined>(
	def: ModuleDefinition<In, Out, State>
): ModuleDefinition<In, Out, State> {
	return def;
}

type ModuleId = Extract<keyof ModuleMap, string>;
type ModuleRef = ModuleDefinition | ModuleId;

/** `[module, config]` for a module with a config schema; `[module]` for one without. */
type ModuleEntry<R> = R extends ModuleId
	? readonly [R, ModuleMap[R]]
	: R extends ModuleDefinition<infer In, infer _Out, infer _State>
		? [In] extends [undefined]
			? readonly [R] | readonly [R, undefined]
			: readonly [R, In]
		: never;

export interface PartInput<M extends readonly ModuleRef[]> extends Omit<PartDefinition, 'modules'> {
	modules?: { [K in keyof M]: ModuleEntry<M[K]> };
}

/** Loose shape the implementation works on; the generic overload above it does the checking. */
interface PartInputLoose extends Omit<PartDefinition, 'modules'> {
	modules?: readonly (readonly [ModuleRef, unknown?])[];
}

/**
 * A part is pure data. Module objects are resolved to their ids, giving the same
 * `[moduleId, config]` form a JSON part has; configs are stored as written.
 */
export function definePart<const M extends readonly ModuleRef[] = readonly []>(
	def: PartInput<M>
): PartDefinition;
export function definePart(def: PartInputLoose): PartDefinition {
	const { modules, ...rest } = def;
	if (!modules) return rest;
	return {
		...rest,
		modules: modules.map(([ref, config]) => [typeof ref === 'string' ? ref : ref.id, config])
	};
}

// ---------------------------------------------------------------------------------------------
// defineResource / defineBody / defineSystem
// ---------------------------------------------------------------------------------------------

export const defineResource = (def: ResourceDefinition): ResourceDefinition => def;
export const defineBody = (def: BodyDefinition): BodyDefinition => def;
export const defineSystem = (def: SystemDefinition): SystemDefinition => def;

// ---------------------------------------------------------------------------------------------
// defineRule / definePreset
// ---------------------------------------------------------------------------------------------

/**
 * A world rule (plan 078, ADRs 0094 and 0111): a typed value per world, with a default and
 * optional values per preset. Register it with `ctx.rules.register(...)`; systems read the world's
 * value with `ctx.rules.get(id)`. `changeable: false` makes it an identity rule, fixed at creation.
 */
export const defineRule = <const R extends RuleDefinition>(def: R): R => def;

/** A named set of rule values a world is created with (Sandbox, Science, Career, ...). */
export const definePreset = (def: PresetDefinition): PresetDefinition => def;

// ---------------------------------------------------------------------------------------------
// defineBuilding
// ---------------------------------------------------------------------------------------------

/**
 * A building kind (plan 090, ADRs 0097 and 0115): footprint in 10 m cells, entrances, levels,
 * capabilities. Register it with `ctx.buildings.register(...)`; `canPlace` decides where it fits.
 */
export const defineBuilding = (def: BuildingDefinition): BuildingDefinition => def;

// ---------------------------------------------------------------------------------------------
// defineCharge
// ---------------------------------------------------------------------------------------------

/**
 * A recurring income or cost on the world tick (plan 095, ADR 0113): `amount` every `everyDays`,
 * optionally only `when` a rule has a value and scaled by numeric rules. Register it with
 * `ctx.charges.register(...)`; its id is the cause of its ledger entries.
 */
export const defineCharge = (def: ChargeDefinition): ChargeDefinition => def;

// ---------------------------------------------------------------------------------------------
// definePatch
// ---------------------------------------------------------------------------------------------

/**
 * A typed patch over another plugin's parts, resources or bodies (ADRs 0104, 0170). Register it in
 * `setup` with `ctx.patches.register(...)`; it applies once at load, after every plugin booted, and
 * is shown in the load report and the mod manager. `target` types the `where` predicate.
 */
export function definePatch<const K extends PatchTarget>(
	def: PatchDefinition<K>
): AnyPatchDefinition {
	return def as AnyPatchDefinition;
}

// ---------------------------------------------------------------------------------------------
// defineDataKind
// ---------------------------------------------------------------------------------------------

/**
 * A kind of data item (plan 083, ADR 0172): `priority` (integer, lower first) and an optional
 * `valueCurve` of `[ageSeconds, factor]` points. Register it with `ctx.dataKinds.register(...)`.
 */
export const defineDataKind = (def: DataKindDefinition): DataKindDefinition => def;

// ---------------------------------------------------------------------------------------------
// defineActionGroup
// ---------------------------------------------------------------------------------------------

/**
 * A group of part actions (plan 110, ADR 0174): a descriptor joins it by `group`, and one
 * `action-group` command applies an action to every part of it. Register with `ctx.actionGroups`.
 */
export const defineActionGroup = (def: ActionGroupDefinition): ActionGroupDefinition => def;

// ---------------------------------------------------------------------------------------------
// defineObjective / defineContract / defineMission
// ---------------------------------------------------------------------------------------------

/**
 * A deterministic objective primitive (plan 098, ADR 0175): `evaluate(params, view, prior)` is
 * pure over the read-only view and its own prior result. Register with `ctx.objectives`.
 */
export const defineObjective = <P>(def: ObjectiveDefinition<P>): ObjectiveDefinition =>
	def as unknown as ObjectiveDefinition;

/** A contract: an objective tree with rewards, penalties, a deadline and prerequisites. */
export const defineContract = (def: ContractDefinition): ContractDefinition => def;

/** A mission: an objective tree with rewards and prerequisites (the story line, plan 100). */
export const defineMission = (def: MissionDefinition): MissionDefinition => def;
// defineCrewTrait / defineCrewNames
// ---------------------------------------------------------------------------------------------

/**
 * A crew trait (plan 106, ADR 0176): factors on ability keys only, which change quality and never
 * unlock a tool (ADR 0098). Register with `ctx.crewTraits`.
 */
export const defineCrewTrait = (def: CrewTraitDefinition): CrewTraitDefinition => def;

/** Syllables crew names are drawn from (two first, two or three last). Register with `ctx.crewNames`. */
export const defineCrewNames = (def: CrewNamesDefinition): CrewNamesDefinition => def;

// ---------------------------------------------------------------------------------------------
// defineSiteTemplate
// ---------------------------------------------------------------------------------------------

/**
 * A quick-start site (plan 092, ADR 0177): a latitude band and optional coast, inland, island and
 * elevation criteria, resolved against each world's terrain. Register with `ctx.siteTemplates`.
 */
export const defineSiteTemplate = (def: SiteTemplateDefinition): SiteTemplateDefinition => def;
// defineExperiment / defineSituation
// ---------------------------------------------------------------------------------------------

/**
 * A science experiment (plan 103, ADR 0178): data or a sample, the situations it runs in, its base
 * value and diminishing repeats. Register with `ctx.experiments`; a part runs it through the
 * `stock.experiment` module.
 */
export const defineExperiment = (def: ExperimentDefinition): ExperimentDefinition => def;

/** A science situation: `matches(view)` is pure, the lowest `order` that matches wins. */
export const defineSituation = (def: SituationDefinition): SituationDefinition => def;

// ---------------------------------------------------------------------------------------------
// defineAntenna / defineGroundStation
// ---------------------------------------------------------------------------------------------

/**
 * An antenna (plan 114, ADR 0179): kind, range rating (m) and transmit power (W). Register with
 * `ctx.antennas`; a part carries it through the `stock.antenna` module.
 */
export const defineAntenna = (def: AntennaDefinition): AntennaDefinition => def;

/**
 * A radio band (plan 116, ADR 0185): frequency (Hz) and the receivers' noise temperature (K). An
 * antenna names its band (`band`) and gives a `gain` (dBi) or a dish `aperture` (m). Register with
 * `ctx.bands`.
 */
export const defineBand = (def: BandDefinition): BandDefinition => def;

/** A fixed ground station on a body (every world site is one already). Register with `ctx.groundStations`. */
export const defineGroundStation = (def: GroundStationDefinition): GroundStationDefinition => def;

// ---------------------------------------------------------------------------------------------
// defineDossierEntry
// ---------------------------------------------------------------------------------------------

/**
 * A body dossier entry (plan 104, ADR 0180): a fact about a body that science results unlock.
 * Register with `ctx.dossierEntries`.
 */
export const defineDossierEntry = (def: DossierEntryDefinition): DossierEntryDefinition => def;

// ---------------------------------------------------------------------------------------------
// defineCategory
// ---------------------------------------------------------------------------------------------

/**
 * A group of the editor's part catalogue (plan 069, ADR 0146): id, label, an icon (a name from the
 * game's icon set, or `{ path }` SVG path data on the 24 x 24 grid) and an order (stock uses 100 to
 * 800, Other 10 000). Register with `ctx.categories`; a part joins it with `catalog.category`.
 */
export const defineCategory = (def: CategoryDefinition): CategoryDefinition => def;

// ---------------------------------------------------------------------------------------------
// defineAchievement
// ---------------------------------------------------------------------------------------------

/**
 * A local achievement (plan 102, ADR 0147): unlocked in the player's profile, across worlds, when a
 * world records a matching first (`criteria: { milestone, body?, crewed? }`). Register with
 * `ctx.achievements`.
 */
export const defineAchievement = (def: AchievementDefinition): AchievementDefinition => def;

// ---------------------------------------------------------------------------------------------
// definePanel
// ---------------------------------------------------------------------------------------------

/**
 * A dock panel (plan 112, ADR 0149): a declarative view of sections, readouts, meters, switches,
 * buttons, lists and sparklines, each reading a `PanelInput` (snapshot, active vessel, altitude,
 * speed, time) through a pure selector; buttons and switches return a command the sim validates.
 * An optional canvas is drawn through `PanelCanvas`. Register with `ctx.panels`.
 */
export const definePanel = (def: PanelDefinition): PanelDefinition => def;

// ---------------------------------------------------------------------------------------------
// defineScenario
// ---------------------------------------------------------------------------------------------

/**
 * A mission pack (plan 100, ADR 0151): a preset with rule values, the vessels the first flight
 * starts with (in a circular orbit, or on the site's pad) and the missions that start with the
 * world. Create World offers it. Register with `ctx.scenarios`.
 */
export const defineScenario = (def: ScenarioDefinition): ScenarioDefinition => def;

// ---------------------------------------------------------------------------------------------
// defineSystemVariant
// ---------------------------------------------------------------------------------------------

/**
 * A scale variant of the plugin's own system (plan 124, ADR 0184): registering one makes the
 * plugin's bodies a system a world can choose; `patches` apply only in worlds of this variant.
 * Register with `ctx.systemVariants`.
 */
export const defineSystemVariant = (def: SystemVariantDefinition): SystemVariantDefinition => def;

// ---------------------------------------------------------------------------------------------
// defineTechNode
// ---------------------------------------------------------------------------------------------

/**
 * A tech tree node (plan 105, ADR 0154): a tier, a science cost, nodes required first, an optional
 * milestone gate (`orbit:stock.home`), and the parts it unlocks (a part can also name its node with
 * `techNode`). Register with `ctx.techNodes`.
 */
export const defineTechNode = (def: TechNodeDefinition): TechNodeDefinition => def;
// defineFailureMode
// ---------------------------------------------------------------------------------------------

/**
 * A failure mode (plan 130, ADR 0156): a module that can fail, when it is drawn (`stage` or
 * `launch`), its chance per trial of a new standard part model, and whether an engineer can
 * repair it. A failed module stops working. Register with `ctx.failureModes`.
 */
export const defineFailureMode = (def: FailureModeDefinition): FailureModeDefinition => def;
