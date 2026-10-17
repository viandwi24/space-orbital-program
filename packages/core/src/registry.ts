/**
 * Typed registry of definitions. Duplicate ids are errors that name both plugins; definitions are
 * frozen on registration so a plugin cannot mutate another plugin's data afterwards.
 */
import { achievementDefinitionSchema, type AchievementDefinition } from './milestones.ts';
import * as z from 'zod';
import type {
	BodyDefinition,
	ModuleDefinition,
	PartDefinition,
	ResourceDefinition,
	SystemDefinition
} from './definitions.ts';
import {
	bodyDefinitionSchema,
	actionGroupDefinitionSchema,
	definitionIdSchema,
	partDefinitionSchema,
	resourceDefinitionSchema
} from './schemas.ts';
import {
	presetDefinitionSchema,
	ruleDefinitionSchema,
	type PresetDefinition,
	type RuleDefinition
} from './rules.ts';
import { buildingDefinitionSchema, type BuildingDefinition } from './buildings.ts';
import { siteTemplateDefinitionSchema, type SiteTemplateDefinition } from './site-templates.ts';
import {
	experimentDefinitionSchema,
	situationDefinitionSchema,
	type ExperimentDefinition,
	type SituationDefinition
} from './science.ts';
import { chargeDefinitionSchema, type ChargeDefinition } from './economy.ts';
import {
	contractDefinitionSchema,
	missionDefinitionSchema,
	objectiveDefinitionSchema,
	type ContractDefinition,
	type MissionDefinition,
	type ObjectiveDefinition
} from './objectives.ts';
import { dataKindDefinitionSchema, type DataKindDefinition } from './data.ts';
import type { ActionGroupDefinition } from './action-groups.ts';
import {
	crewNamesDefinitionSchema,
	crewTraitDefinitionSchema,
	type CrewNamesDefinition,
	type CrewTraitDefinition
} from './crew.ts';

export class RegistryError extends Error {
	constructor(
		message: string,
		readonly kind: string,
		readonly id: string,
		/** Plugin that already owns `id` (duplicate errors only). */
		readonly existingBy?: string,
		/** Plugin whose registration was refused. */
		readonly attemptedBy?: string
	) {
		super(message);
		this.name = 'RegistryError';
	}
}

export type RegistryEntry<T> = { def: T; by: string };

export interface Registry<T extends { id: string }> {
	readonly kind: string;
	/** Validate, freeze and store. Throws `RegistryError` on invalid or duplicate definitions. */
	register(def: T, byPlugin: string): T;
	get(id: string): T | undefined;
	has(id: string): boolean;
	/** Plugin that registered `id`. */
	owner(id: string): string | undefined;
	/** Definitions in registration order. */
	list(): T[];
	/** Definitions with their registering plugin, in registration order. */
	entries(): RegistryEntry<T>[];
	/** Schema check without storing: the error message, or undefined when `def` is valid. */
	validate(def: T): string | undefined;
}

const replacers = new WeakMap<object, (def: { id: string }) => unknown>();

/**
 * Swap the stored definition of `def.id` for `def` (validated, frozen), keeping its owner and
 * position. Loader-only (patches, ADR 0170): it is not on `Registry`, so the read-only views handed
 * to modules and systems cannot reach it, and the SDK does not export it.
 */
export function replaceDefinition<T extends { id: string }>(registry: Registry<T>, def: T): T {
	const replace = replacers.get(registry);
	if (!replace)
		throw new Error(
			`replaceDefinition: registry "${registry.kind}" was not made by createRegistry`
		);
	replace(def);
	return def;
}

export type RegistryOptions = {
	/** Checked with `safeParse` on register; the original (not the parsed copy) is stored. */
	schema?: z.ZodType;
};

/**
 * Freezes plain objects and arrays recursively. Functions and class instances (e.g. zod schemas)
 * are left alone: freezing library internals can break them.
 */
export function deepFreeze<T>(value: T): T {
	if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
	const proto: unknown = Object.getPrototypeOf(value);
	if (proto !== Object.prototype && proto !== null && !Array.isArray(value)) return value;
	Object.freeze(value);
	for (const v of Object.values(value)) deepFreeze(v);
	return value;
}

export function createRegistry<T extends { id: string }>(
	kind: string,
	options: RegistryOptions = {}
): Registry<T> {
	const items = new Map<string, RegistryEntry<T>>();
	const validate = (def: T): string | undefined => {
		if (!options.schema) return undefined;
		const parsed = options.schema.safeParse(def);
		return parsed.success ? undefined : z.prettifyError(parsed.error);
	};

	const registry: Registry<T> = {
		kind,
		register(def, byPlugin) {
			const id = def.id;
			const idCheck = definitionIdSchema.safeParse(id);
			if (!idCheck.success) {
				throw new RegistryError(
					`Cannot register ${kind} "${id}" from plugin "${byPlugin}": ${z.prettifyError(idCheck.error)}`,
					kind,
					id,
					undefined,
					byPlugin
				);
			}
			const existing = items.get(id);
			if (existing) {
				throw new RegistryError(
					`Duplicate ${kind} id "${id}": already registered by plugin "${existing.by}", ` +
						`registered again by plugin "${byPlugin}"`,
					kind,
					id,
					existing.by,
					byPlugin
				);
			}
			if (options.schema) {
				const parsed = options.schema.safeParse(def);
				if (!parsed.success) {
					throw new RegistryError(
						`Invalid ${kind} "${id}" from plugin "${byPlugin}": ${z.prettifyError(parsed.error)}`,
						kind,
						id,
						undefined,
						byPlugin
					);
				}
			}
			deepFreeze(def);
			items.set(id, { def, by: byPlugin });
			return def;
		},
		get: (id) => items.get(id)?.def,
		has: (id) => items.has(id),
		owner: (id) => items.get(id)?.by,
		list: () => [...items.values()].map((e) => e.def),
		entries: () => [...items.values()].map((e) => ({ def: e.def, by: e.by })),
		validate
	};
	replacers.set(registry, (def) => {
		const existing = items.get(def.id);
		if (!existing) {
			throw new RegistryError(
				`Cannot replace ${kind} "${def.id}": it is not registered`,
				kind,
				def.id
			);
		}
		const problem = validate(def as T);
		if (problem) {
			throw new RegistryError(`Invalid ${kind} "${def.id}": ${problem}`, kind, def.id, existing.by);
		}
		existing.def = deepFreeze(def as T);
	});
	return registry;
}

/** The set of registries a world/loader uses. Plugins register into these (plan 005). */
export interface Registries {
	parts: Registry<PartDefinition>;
	modules: Registry<ModuleDefinition>;
	resources: Registry<ResourceDefinition>;
	bodies: Registry<BodyDefinition>;
	systems: Registry<SystemDefinition>;
	/** World rules and presets (plan 078, ADR 0111). */
	rules: Registry<RuleDefinition>;
	presets: Registry<PresetDefinition>;
	/** Scheduled income and costs (plan 095, ADR 0113). */
	charges: Registry<ChargeDefinition>;
	/** Objectives, contracts and missions (plan 098, ADR 0175). */
	objectives: Registry<ObjectiveDefinition>;
	contracts: Registry<ContractDefinition>;
	missions: Registry<MissionDefinition>;
	/** Data kinds (plan 083, ADR 0172). */
	dataKinds: Registry<DataKindDefinition>;
	/** Action groups (plan 110, ADR 0174). */
	actionGroups: Registry<ActionGroupDefinition>;
	/** Buildings (plan 090, ADR 0115). */
	buildings: Registry<BuildingDefinition>;
	/** Site templates (plan 092, ADR 0177). */
	siteTemplates: Registry<SiteTemplateDefinition>;
	/** Science (plan 103, ADR 0178). */
	situations: Registry<SituationDefinition>;
	experiments: Registry<ExperimentDefinition>;
	/** Achievements (plan 102, ADR 0147). */
	achievements: Registry<AchievementDefinition>;
	/** Crew traits and name syllables (plan 106, ADR 0176). */
	crewTraits: Registry<CrewTraitDefinition>;
	crewNames: Registry<CrewNamesDefinition>;
}

export function createRegistries(): Registries {
	return {
		parts: createRegistry<PartDefinition>('part', { schema: partDefinitionSchema }),
		modules: createRegistry<ModuleDefinition>('module'),
		resources: createRegistry<ResourceDefinition>('resource', { schema: resourceDefinitionSchema }),
		bodies: createRegistry<BodyDefinition>('body', { schema: bodyDefinitionSchema }),
		systems: createRegistry<SystemDefinition>('system'),
		rules: createRegistry<RuleDefinition>('rule', { schema: ruleDefinitionSchema }),
		presets: createRegistry<PresetDefinition>('preset', { schema: presetDefinitionSchema }),
		charges: createRegistry<ChargeDefinition>('charge', { schema: chargeDefinitionSchema }),
		dataKinds: createRegistry<DataKindDefinition>('data-kind', {
			schema: dataKindDefinitionSchema
		}),
		actionGroups: createRegistry<ActionGroupDefinition>('action-group', {
			schema: actionGroupDefinitionSchema
		}),
		buildings: createRegistry<BuildingDefinition>('building', { schema: buildingDefinitionSchema }),
		siteTemplates: createRegistry<SiteTemplateDefinition>('site-template', {
			schema: siteTemplateDefinitionSchema
		}),
		situations: createRegistry<SituationDefinition>('situation', {
			schema: situationDefinitionSchema
		}),
		experiments: createRegistry<ExperimentDefinition>('experiment', {
			schema: experimentDefinitionSchema
		}),
		objectives: createRegistry<ObjectiveDefinition>('objective', {
			schema: objectiveDefinitionSchema
		}),
		contracts: createRegistry<ContractDefinition>('contract', { schema: contractDefinitionSchema }),
		missions: createRegistry<MissionDefinition>('mission', { schema: missionDefinitionSchema }),
		achievements: createRegistry<AchievementDefinition>('achievement', {
			schema: achievementDefinitionSchema
		}),
		crewTraits: createRegistry<CrewTraitDefinition>('crew-trait', {
			schema: crewTraitDefinitionSchema
		}),
		crewNames: createRegistry<CrewNamesDefinition>('crew-names', {
			schema: crewNamesDefinitionSchema
		})
	};
}
