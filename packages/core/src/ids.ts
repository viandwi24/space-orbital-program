/**
 * Branded identifier types. Brands are compile-time only; the runtime value is a plain string or
 * number, so ids stay JSON-serializable. Constructors validate, then brand (the one place a cast
 * is justified: the check immediately above it is what makes the cast true).
 */

declare const brand: unique symbol;
type Brand<T, K extends string> = T & { readonly [brand]: K };

/** Numeric id handed out by a world; never reused within a session. */
export type EntityId = Brand<number, 'EntityId'>;

export type PluginId = Brand<string, 'PluginId'>;
export type PartId = Brand<string, 'PartId'>;
export type ModuleId = Brand<string, 'ModuleId'>;
export type ResourceId = Brand<string, 'ResourceId'>;
export type BodyId = Brand<string, 'BodyId'>;
export type SystemId = Brand<string, 'SystemId'>;

const SEGMENT = '[a-z][a-z0-9]*(?:-[a-z0-9]+)*';
/** Plugin id: one or more dot-separated kebab segments, e.g. `stock`, `acme.nuclear`. */
export const PLUGIN_ID_PATTERN = new RegExp(`^${SEGMENT}(?:\\.${SEGMENT})*$`);
/** Definition id: `<plugin>.<name>` — at least two segments, e.g. `stock.engine-lv`. */
export const DEFINITION_ID_PATTERN = new RegExp(`^${SEGMENT}(?:\\.${SEGMENT})+$`);

export const isPluginId = (s: string): boolean => PLUGIN_ID_PATTERN.test(s);
export const isDefinitionId = (s: string): boolean => DEFINITION_ID_PATTERN.test(s);

function check(kind: string, s: string, ok: boolean, expected: string): void {
	if (!ok) throw new TypeError(`Invalid ${kind} id "${s}": expected ${expected}`);
}

const DEF_EXPECTED = '"<plugin>.<name>" in lower-case kebab-case, e.g. "stock.engine-lv"';

export function entityId(n: number): EntityId {
	check('entity', String(n), Number.isSafeInteger(n) && n >= 0, 'a non-negative integer');
	return n as EntityId;
}

export function pluginId(s: string): PluginId {
	check(
		'plugin',
		s,
		isPluginId(s),
		'lower-case kebab-case segments joined by ".", e.g. "acme.nuclear"'
	);
	return s as PluginId;
}

export function partId(s: string): PartId {
	check('part', s, isDefinitionId(s), DEF_EXPECTED);
	return s as PartId;
}

export function moduleId(s: string): ModuleId {
	check('module', s, isDefinitionId(s), DEF_EXPECTED);
	return s as ModuleId;
}

export function resourceId(s: string): ResourceId {
	check('resource', s, isDefinitionId(s), DEF_EXPECTED);
	return s as ResourceId;
}

export function bodyId(s: string): BodyId {
	check('body', s, isDefinitionId(s), DEF_EXPECTED);
	return s as BodyId;
}

export function systemId(s: string): SystemId {
	check('system', s, isDefinitionId(s), DEF_EXPECTED);
	return s as SystemId;
}
