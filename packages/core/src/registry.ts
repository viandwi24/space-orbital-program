/**
 * Typed registry of definitions. Duplicate ids are errors that name both plugins; definitions are
 * frozen on registration so a plugin cannot mutate another plugin's data afterwards.
 */
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
	definitionIdSchema,
	partDefinitionSchema,
	resourceDefinitionSchema
} from './schemas.ts';

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

	return {
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
		entries: () => [...items.values()].map((e) => ({ def: e.def, by: e.by }))
	};
}

/** The set of registries a world/loader uses. Plugins register into these (plan 005). */
export interface Registries {
	parts: Registry<PartDefinition>;
	modules: Registry<ModuleDefinition>;
	resources: Registry<ResourceDefinition>;
	bodies: Registry<BodyDefinition>;
	systems: Registry<SystemDefinition>;
}

export function createRegistries(): Registries {
	return {
		parts: createRegistry<PartDefinition>('part', { schema: partDefinitionSchema }),
		modules: createRegistry<ModuleDefinition>('module'),
		resources: createRegistry<ResourceDefinition>('resource', { schema: resourceDefinitionSchema }),
		bodies: createRegistry<BodyDefinition>('body', { schema: bodyDefinitionSchema }),
		systems: createRegistry<SystemDefinition>('system')
	};
}
