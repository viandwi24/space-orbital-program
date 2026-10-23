/**
 * Blueprints by id from the loaded plugins (ADR 0316): the lessons, tests and tools that need one
 * design read it here instead of building it. Old ids resolve (`resolveBlueprintId`).
 */
import type { BlueprintDefinition, VesselDesign } from '@orbital/core';
import { loadContent } from './catalog';
import { resolveBlueprintId } from './editor/blueprints';

/** The registered blueprint `id` (or its id from before ADR 0316), or undefined. */
export function registeredBlueprint(
	id: string,
	blueprints: readonly BlueprintDefinition[] = loadContent().blueprints
): BlueprintDefinition | undefined {
	const found = resolveBlueprintId(id, blueprints);
	return found === undefined ? undefined : blueprints.find((b) => b.id === found);
}

/** The design of a registered blueprint; throws when no plugin registers it. */
export function blueprintDesign(
	id: string,
	blueprints?: readonly BlueprintDefinition[]
): VesselDesign {
	const b = registeredBlueprint(id, blueprints);
	if (!b) throw new Error(`no plugin registers the blueprint "${id}"`);
	return structuredClone(b.design);
}
