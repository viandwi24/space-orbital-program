/**
 * The ground of a body, chosen by data (plan 052, ADR 0067): the sim, the renderer and tools ask the
 * body's `terrain` field, never its parent or its atmosphere. A kind is a height function that lives
 * here and has a GLSL twin in the renderer; a body without `terrain` is a smooth sphere.
 */
import type { BodyDefinition } from './definitions.ts';
import { createMoonTerrainField } from './moon-terrain.ts';
import { createTerrainField, type TerrainField } from './terrain.ts';

/** The terrain kinds a body can name. */
export type BodyTerrainKind = NonNullable<BodyDefinition['terrain']>['kind'];

/** The kind of a body's ground, or `undefined` for a smooth sphere. */
export const terrainKindOf = (body: Pick<BodyDefinition, 'terrain'>): BodyTerrainKind | undefined =>
	body.terrain?.kind;

/** The craters seed of a body (0 when it names none). */
export const cratersSeedOf = (body: Pick<BodyDefinition, 'terrain'>): number =>
	body.terrain?.kind === 'craters' ? (body.terrain.seed ?? 0) : 0;

/**
 * The height field of a body: the home planet's hills, craters with the body's seed, or `undefined`
 * (a smooth sphere). Pass it to `createSim({ terrain })`; it is the same function the renderer's
 * passes bake.
 */
export function createBodyTerrainField(
	body: Pick<BodyDefinition, 'radius' | 'terrain'>
): TerrainField | undefined {
	switch (body.terrain?.kind) {
		case 'hills':
			return createTerrainField({ radius: body.radius });
		case 'craters':
			return createMoonTerrainField({ radius: body.radius, seed: body.terrain.seed ?? 0 });
		case undefined:
			return undefined;
	}
}
