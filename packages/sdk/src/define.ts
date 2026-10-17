/**
 * The define-API. Every function is typed identity-plus-sugar: it returns the plain-data (or
 * plain-function) definition that core registers, and exists to give authors inference and
 * compile-time checks. See docs/architecture/plugin-system.md and ADR 0013.
 */
import type {
	AnyPatchDefinition,
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
