/**
 * Plugin runtime shape, context and loader (plan 005, ADR 0013). The SDK's `definePlugin` builds
 * `Plugin` values with full type inference; this file is what actually validates, orders and boots
 * them, so it only needs the erased shapes.
 */
import * as z from 'zod';
import { API_VERSION } from './version.ts';
import type {
	BodyDefinition,
	Bivariant,
	ModuleDefinition,
	PartDefinition,
	ResourceDefinition,
	SystemDefinition
} from './definitions.ts';
import { createEventBus, type EventBus, type EventMap } from './events.ts';
import { pluginIdSchema } from './schemas.ts';
import {
	applyPatches,
	PATCH_TARGETS,
	type AnyPatchDefinition,
	type PatchReport,
	type PatchSource,
	type Provenance
} from './patch.ts';
import { createRegistries, createRegistry, RegistryError, type Registries } from './registry.ts';
import { ruleValueProblem, type PresetDefinition, type RuleDefinition } from './rules.ts';
import type { BuildingDefinition } from './buildings.ts';
import type { SiteTemplateDefinition } from './site-templates.ts';
import type { ExperimentDefinition, SituationDefinition } from './science.ts';
import type { AntennaDefinition, GroundStationDefinition } from './comms.ts';
import type { ChargeDefinition } from './economy.ts';
import type { DataKindDefinition } from './data.ts';
import type { ActionGroupDefinition } from './action-groups.ts';
import {
	leavesOf,
	type ContractDefinition,
	type MissionDefinition,
	type ObjectiveDefinition
} from './objectives.ts';
import type { CrewNamesDefinition, CrewTraitDefinition } from './crew.ts';
import { parseVersion, satisfies } from './semver.ts';

export class PluginError extends Error {
	constructor(
		message: string,
		/** Plugin the error is about, when there is one. */
		readonly plugin?: string,
		options?: { cause?: unknown }
	) {
		super(message, options);
		this.name = 'PluginError';
	}
}

export interface PluginMeta {
	/** Lower-case kebab segments joined by "." (e.g. `acme.nuclear`). Also the `by` of registrations. */
	id: string;
	/** `x.y.z`. */
	version: string;
	/** Range of the mod API this plugin was written for (`^0.1`), checked against `API_VERSION`. */
	api: string;
	title?: string;
}

/** A dependency: a plugin instance (typed) or a plugin id (ordering/presence only). */
export type PluginRef = string | Plugin;

/** Registration handle bound to the calling plugin; registrations are attributed to it. */
export interface Registrar<T> {
	register(def: T): T;
}

/** The part of the plugin context that does not depend on a plugin's declared types. */
export interface BasePluginContext {
	readonly meta: PluginMeta;
	/** Shared bus; plugins add event names by module augmentation of `EventMap`. */
	readonly events: EventBus<EventMap>;
	readonly parts: Registrar<PartDefinition>;
	readonly modules: Registrar<ModuleDefinition>;
	readonly resources: Registrar<ResourceDefinition>;
	readonly bodies: Registrar<BodyDefinition>;
	readonly systems: Registrar<SystemDefinition>;
	/** World rules and presets (plan 078, ADR 0111). */
	readonly rules: Registrar<RuleDefinition>;
	readonly presets: Registrar<PresetDefinition>;
	/** Scheduled income and costs on the world tick (plan 095, ADR 0113). */
	readonly charges: Registrar<ChargeDefinition>;
	/** Objectives, contracts and missions (plan 098, ADR 0175). */
	readonly objectives: Registrar<ObjectiveDefinition>;
	readonly contracts: Registrar<ContractDefinition>;
	readonly missions: Registrar<MissionDefinition>;
	/** Data kinds (plan 083, ADR 0172). */
	readonly dataKinds: Registrar<DataKindDefinition>;
	/** Buildings (plan 090, ADR 0115). */
	readonly buildings: Registrar<BuildingDefinition>;
	/** Site templates (plan 092, ADR 0177). */
	readonly siteTemplates: Registrar<SiteTemplateDefinition>;
	/** Science (plan 103, ADR 0178). */
	readonly situations: Registrar<SituationDefinition>;
	readonly experiments: Registrar<ExperimentDefinition>;
	/** Comms (plan 114, ADR 0179). */
	readonly antennas: Registrar<AntennaDefinition>;
	readonly groundStations: Registrar<GroundStationDefinition>;
	/** Action groups (plan 110, ADR 0174). */
	readonly actionGroups: Registrar<ActionGroupDefinition>;
	/** Crew traits and name syllables (plan 106, ADR 0176). */
	readonly crewTraits: Registrar<CrewTraitDefinition>;
	readonly crewNames: Registrar<CrewNamesDefinition>;
	/**
	 * Typed data patches over other plugins' parts, resources and bodies (ADR 0170), applied once
	 * after every plugin booted.
	 */
	readonly patches: Registrar<AnyPatchDefinition>;
	/** Optional dependencies that are loaded, keyed like their `contributes`. */
	readonly optional: Readonly<Record<string, unknown>>;
	/** Supply the implementation of a `contributes` key. Each key can be provided once, by one plugin. */
	provide(key: string, impl: unknown): void;
}

/**
 * Erased runtime plugin. `C` is the phantom type of `contributes`; typed `setup` contexts are
 * produced by the SDK's `definePlugin`, whose callbacks are compatible via parameter bivariance.
 */
export interface Plugin<C extends object = object> {
	readonly meta: PluginMeta;
	readonly depends: readonly PluginRef[];
	readonly optional: readonly PluginRef[];
	/** Type-level only: the API shape this plugin provides. Its runtime value is ignored. */
	readonly contributes?: C;
	readonly setup: Bivariant<(ctx: BasePluginContext) => void>;
}

export const REGISTRY_KINDS = [
	'part',
	'module',
	'resource',
	'body',
	'system',
	'rule',
	'preset',
	'charge',
	'data-kind',
	'action-group',
	'building',
	'site-template',
	'situation',
	'experiment',
	'antenna',
	'ground-station',
	'objective',
	'contract',
	'mission',
	'crew-trait',
	'crew-names'
] as const;
export type RegistryKind = (typeof REGISTRY_KINDS)[number];

export interface LoadReport {
	/** Ids of booted plugins in boot order. */
	order: string[];
	/** Plugins that were not booted, with the reason. */
	disabled: Array<{ id: string; reason: string }>;
	/** What each kind's registry holds from booted plugins, in registration order. */
	registered: Record<RegistryKind, Array<{ id: string; by: string }>>;
	/** Every registered patch in apply order, with what it changed or why it is disabled (ADR 0170). */
	patches: PatchReport[];
	/** Who set each patched field: registering plugin first, then patchers in apply order. */
	provenance: Provenance;
}

export interface LoadOptions {
	/** Registries to fill; created if omitted. */
	registries?: Registries;
	/** Event bus handed to plugins; created if omitted. */
	events?: EventBus<EventMap>;
	/** Mod API version plugins are checked against. Defaults to `API_VERSION`. */
	apiVersion?: string;
}

export interface LoadResult {
	registries: Registries;
	events: EventBus<EventMap>;
	report: LoadReport;
}

const RESERVED_KEYS: ReadonlySet<string> = new Set([
	'meta',
	'events',
	'parts',
	'modules',
	'resources',
	'bodies',
	'systems',
	'rules',
	'presets',
	'charges',
	'objectives',
	'contracts',
	'missions',
	'dataKinds',
	'actionGroups',
	'buildings',
	'siteTemplates',
	'situations',
	'experiments',
	'antennas',
	'groundStations',
	'crewTraits',
	'crewNames',
	'patches',
	'optional',
	'provide'
]);

const refId = (ref: PluginRef): string => (typeof ref === 'string' ? ref : ref.meta.id);

/** Checks one part module config against its module's zod schema (without storing the result). */
export function parseModuleConfig(
	module: ModuleDefinition,
	config: unknown
): { ok: true; value: unknown } | { ok: false; message: string } {
	if (!module.config) {
		return config === undefined
			? { ok: true, value: undefined }
			: { ok: false, message: `module "${module.id}" takes no config` };
	}
	const parsed = module.config.safeParse(config);
	return parsed.success
		? { ok: true, value: parsed.data }
		: { ok: false, message: z.prettifyError(parsed.error) };
}

/**
 * Problems of a part's module list against the module registry: unknown or repeated modules,
 * configs that fail their schema, and unmet `requires`. Empty when the part is consistent.
 */
export function partModuleProblems(
	part: PartDefinition,
	modules: { get(id: string): ModuleDefinition | undefined }
): string[] {
	const problems: string[] = [];
	const used = new Set<string>();
	for (const [moduleId, config] of part.modules ?? []) {
		if (used.has(moduleId)) {
			problems.push(`module "${moduleId}" is listed twice`);
			continue;
		}
		used.add(moduleId);
		const module = modules.get(moduleId);
		if (!module) {
			problems.push(`unknown module "${moduleId}"`);
			continue;
		}
		const parsed = parseModuleConfig(module, config);
		if (!parsed.ok) problems.push(`config for module "${moduleId}": ${parsed.message}`);
	}
	for (const moduleId of used) {
		for (const required of modules.get(moduleId)?.requires ?? []) {
			if (!used.has(required)) {
				problems.push(`module "${moduleId}" requires module "${required}" on the same part`);
			}
		}
	}
	return problems;
}

/**
 * Validate, order and boot `plugins`.
 *
 * - Duplicate plugin ids, malformed ids, dependency cycles, setup failures and registry errors
 *   (duplicate/invalid definitions) throw; the registries are then in an unspecified state.
 * - Unsupported `api`, bad version, or a missing hard dependency disable the plugin (and,
 *   transitively, its dependents) with a reason in the report.
 * - Order is Kahn's algorithm; ties are broken by position in `plugins`, so it is deterministic.
 * - Patches apply after boot and before the part/module cross-check; a bad patch is disabled with
 *   a reason in `report.patches`, never thrown (ADR 0170).
 */
export function loadPlugins(plugins: readonly Plugin[], options: LoadOptions = {}): LoadResult {
	const registries = options.registries ?? createRegistries();
	const events = options.events ?? createEventBus<EventMap>();
	const apiVersion = options.apiVersion ?? API_VERSION;

	const byId = new Map<string, Plugin>();
	for (const p of plugins) {
		const id = p.meta.id;
		const check = pluginIdSchema.safeParse(id);
		if (!check.success) {
			throw new PluginError(`Invalid plugin id "${id}": ${z.prettifyError(check.error)}`, id);
		}
		if (byId.has(id)) throw new PluginError(`Duplicate plugin id "${id}" in the load list`, id);
		byId.set(id, p);
	}

	// 1. Per-plugin checks that disable.
	const disabled = new Map<string, string>();
	for (const p of plugins) {
		const { id, version, api } = p.meta;
		if (!parseVersion(version)) {
			disabled.set(id, `invalid version "${version}" (expected "x.y.z")`);
			continue;
		}
		try {
			if (!satisfies(apiVersion, api)) {
				disabled.set(id, `requires mod API "${api}" but this game provides ${apiVersion}`);
			}
		} catch (e) {
			disabled.set(id, `invalid api range: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	// 2. Missing / disabled hard dependencies, to a fixpoint (dependents cascade).
	for (let changed = true; changed;) {
		changed = false;
		for (const p of plugins) {
			if (disabled.has(p.meta.id)) continue;
			for (const dep of p.depends) {
				const depId = refId(dep);
				if (!byId.has(depId)) {
					disabled.set(p.meta.id, `missing dependency "${depId}"`);
				} else if (disabled.has(depId)) {
					disabled.set(p.meta.id, `dependency "${depId}" is disabled (${disabled.get(depId)})`);
				} else continue;
				changed = true;
				break;
			}
		}
	}
	const enabled = plugins.filter((p) => !disabled.has(p.meta.id));

	// 3. Kahn. Edges: dependency -> dependent, for hard deps and for optional deps that are enabled.
	const depsOf = new Map<string, string[]>();
	for (const p of enabled) {
		const ids = [...p.depends, ...p.optional]
			.map(refId)
			.filter((id) => byId.has(id) && !disabled.has(id));
		depsOf.set(p.meta.id, [...new Set(ids)]);
	}
	const remaining = new Map<string, number>();
	for (const p of enabled) remaining.set(p.meta.id, depsOf.get(p.meta.id)!.length);
	const order: Plugin[] = [];
	const done = new Set<string>();
	for (;;) {
		const next = enabled.find((p) => !done.has(p.meta.id) && remaining.get(p.meta.id) === 0);
		if (!next) break;
		done.add(next.meta.id);
		order.push(next);
		for (const q of enabled) {
			if (!done.has(q.meta.id) && depsOf.get(q.meta.id)!.includes(next.meta.id)) {
				remaining.set(q.meta.id, remaining.get(q.meta.id)! - 1);
			}
		}
	}
	if (order.length < enabled.length) {
		throw new PluginError(`Circular plugin dependency: ${describeCycle(enabled, depsOf, done)}`);
	}

	// 4. Boot.
	const patchRegistry = createRegistry<AnyPatchDefinition>('patch');
	const provided = new Map<string, { by: string; impl: unknown }>();
	const providedBy = new Map<string, Map<string, unknown>>();
	for (const p of order) {
		const id = p.meta.id;
		const mine = new Map<string, unknown>();
		providedBy.set(id, mine);
		const registrar = <T extends { id: string }>(registry: {
			register(def: T, by: string): T;
		}): Registrar<T> => ({ register: (def) => registry.register(def, id) });

		const optional: Record<string, unknown> = {};
		for (const dep of p.optional) {
			for (const [k, v] of providedBy.get(refId(dep)) ?? []) optional[k] = v;
		}
		const base: BasePluginContext = {
			meta: p.meta,
			events,
			parts: registrar(registries.parts),
			modules: registrar(registries.modules),
			resources: registrar(registries.resources),
			bodies: registrar(registries.bodies),
			systems: registrar(registries.systems),
			rules: registrar(registries.rules),
			presets: registrar(registries.presets),
			charges: registrar(registries.charges),
			objectives: registrar(registries.objectives),
			contracts: registrar(registries.contracts),
			missions: registrar(registries.missions),
			dataKinds: registrar(registries.dataKinds),
			actionGroups: registrar(registries.actionGroups),
			buildings: registrar(registries.buildings),
			siteTemplates: registrar(registries.siteTemplates),
			situations: registrar(registries.situations),
			experiments: registrar(registries.experiments),
			antennas: registrar(registries.antennas),
			groundStations: registrar(registries.groundStations),
			crewTraits: registrar(registries.crewTraits),
			crewNames: registrar(registries.crewNames),
			patches: {
				register(def) {
					if (!(PATCH_TARGETS as readonly string[]).includes(def.target)) {
						throw new PluginError(
							`Plugin "${id}": patch "${def.id}" targets "${String(def.target)}"; ` +
								`patchable registries are ${PATCH_TARGETS.map((t) => `"${t}"`).join(', ')}`,
							id
						);
					}
					return patchRegistry.register(def, id);
				}
			},
			optional: Object.freeze(optional),
			provide(key, impl) {
				if (RESERVED_KEYS.has(key)) {
					throw new PluginError(
						`Plugin "${id}" cannot provide "${key}": the name is reserved by the plugin context`,
						id
					);
				}
				const existing = provided.get(key);
				if (existing) {
					throw new PluginError(
						`API key "${key}" is already provided by plugin "${existing.by}"; ` +
							`plugin "${id}" tried to provide it again`,
						id
					);
				}
				provided.set(key, { by: id, impl });
				mine.set(key, impl);
			}
		};
		const dependencyApis: Record<string, unknown> = {};
		for (const dep of p.depends) {
			for (const [k, v] of providedBy.get(refId(dep)) ?? []) dependencyApis[k] = v;
		}
		const ctx: BasePluginContext = Object.freeze(Object.assign({}, dependencyApis, base));

		try {
			const result: unknown = p.setup(ctx);
			if (
				result !== undefined &&
				result !== null &&
				typeof (result as { then?: unknown }).then === 'function'
			) {
				throw new PluginError(`Plugin "${id}": async setup is not supported`, id);
			}
		} catch (e) {
			if (e instanceof RegistryError || e instanceof PluginError) throw e;
			throw new PluginError(
				`Plugin "${id}" setup failed: ${e instanceof Error ? e.message : String(e)}`,
				id,
				{ cause: e }
			);
		}
	}

	// 5. Patches (ADR 0170), then cross-check parts against modules (the only point where both
	// registries are complete).
	const bootIndex = new Map(order.map((p, i) => [p.meta.id, i]));
	const patchSources: PatchSource[] = patchRegistry
		.entries()
		.map(({ def, by }) => ({ def, by, bootIndex: bootIndex.get(by)! }));
	const patched = applyPatches({
		patches: patchSources,
		registries: {
			part: registries.parts,
			resource: registries.resources,
			body: registries.bodies,
			building: registries.buildings
		},
		checkEntry: (target, entry) => {
			if (target !== 'part') return undefined;
			const problems = partModuleProblems(entry as PartDefinition, registries.modules);
			return problems.length > 0 ? problems.join('; ') : undefined;
		}
	});

	const problems: string[] = [];
	for (const { def: part, by } of registries.parts.entries()) {
		for (const problem of partModuleProblems(part, registries.modules)) {
			problems.push(`part "${part.id}" (plugin "${by}"): ${problem}`);
		}
	}
	if (problems.length > 0) {
		throw new PluginError(`Invalid part definitions:\n- ${problems.join('\n- ')}`);
	}
	// Preset values against the rules they name (ADR 0111 point 1); a rule not loaded is ignored.
	const presetProblems: string[] = [];
	for (const { def: preset, by } of registries.presets.entries()) {
		for (const [ruleId, value] of Object.entries(preset.values ?? {})) {
			const rule = registries.rules.get(ruleId);
			const why = rule && ruleValueProblem(rule, value);
			if (why)
				presetProblems.push(`preset "${preset.id}" (plugin "${by}"): rule "${ruleId}": ${why}`);
		}
	}
	if (presetProblems.length > 0) {
		throw new PluginError(`Invalid preset definitions:\n- ${presetProblems.join('\n- ')}`);
	}
	// Contract and mission trees against the objectives they use (ADR 0175 point 6).
	const treeProblems: string[] = [];
	for (const [kind, registry] of [
		['contract', registries.contracts],
		['mission', registries.missions]
	] as const) {
		for (const { def, by } of registry.entries()) {
			for (const leaf of leavesOf(def.objectives)) {
				const objective = registries.objectives.get(leaf.objective);
				const where = `${kind} "${def.id}" (plugin "${by}")`;
				if (!objective) {
					treeProblems.push(`${where}: unknown objective "${leaf.objective}"`);
					continue;
				}
				const parsed = objective.params.safeParse(leaf.params ?? {});
				if (!parsed.success) {
					treeProblems.push(
						`${where}: params of "${leaf.objective}": ${z.prettifyError(parsed.error)}`
					);
				}
			}
		}
	}
	if (treeProblems.length > 0) {
		throw new PluginError(
			`Invalid contract or mission definitions:\n- ${treeProblems.join('\n- ')}`
		);
	}

	// 6. Report.
	const booted = new Set(order.map((p) => p.meta.id));
	const section = <T extends { id: string }>(registry: {
		entries(): Array<{ def: T; by: string }>;
	}) =>
		registry
			.entries()
			.filter((e) => booted.has(e.by))
			.map((e) => ({ id: e.def.id, by: e.by }));
	return {
		registries,
		events,
		report: {
			order: order.map((p) => p.meta.id),
			disabled: plugins
				.filter((p) => disabled.has(p.meta.id))
				.map((p) => ({ id: p.meta.id, reason: disabled.get(p.meta.id)! })),
			registered: {
				part: section(registries.parts),
				module: section(registries.modules),
				resource: section(registries.resources),
				body: section(registries.bodies),
				system: section(registries.systems),
				rule: section(registries.rules),
				preset: section(registries.presets),
				charge: section(registries.charges),
				'data-kind': section(registries.dataKinds),
				'action-group': section(registries.actionGroups),
				building: section(registries.buildings),
				'site-template': section(registries.siteTemplates),
				situation: section(registries.situations),
				experiment: section(registries.experiments),
				antenna: section(registries.antennas),
				'ground-station': section(registries.groundStations),
				objective: section(registries.objectives),
				contract: section(registries.contracts),
				mission: section(registries.missions),
				'crew-trait': section(registries.crewTraits),
				'crew-names': section(registries.crewNames)
			},
			patches: patched.patches,
			provenance: patched.provenance
		}
	};
}

/** Walks "depends on" links among the plugins Kahn could not place until one repeats. */
function describeCycle(
	enabled: readonly Plugin[],
	depsOf: ReadonlyMap<string, string[]>,
	done: ReadonlySet<string>
): string {
	const stuck = (id: string) => !done.has(id);
	let current = enabled.find((p) => stuck(p.meta.id))!.meta.id;
	const path: string[] = [];
	for (;;) {
		const at = path.indexOf(current);
		if (at >= 0) return [...path.slice(at), current].join(' -> ') + ' (each depends on the next)';
		path.push(current);
		current = depsOf.get(current)!.find(stuck)!;
	}
}
