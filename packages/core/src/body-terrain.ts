/**
 * The ground of a body, chosen by data (plan 052, ADR 0067): the sim, the renderer and tools ask the
 * body's `terrain` field, never its parent or its atmosphere. A kind is a height function that lives
 * here and has a GLSL twin in the renderer; a body without `terrain` is a smooth sphere.
 */
import type { BodyDefinition } from './definitions.ts';
import { createMoonTerrainField } from './moon-terrain.ts';
import { createTerrainField, type TerrainField, type TerrainZone } from './terrain.ts';

/** The world's part of a terrain (ADR 0142 point 6): its seed and the flat zones on the body. */
export interface WorldTerrain {
	seed: number;
	/** The sites on this body; empty or absent gives the Legacy zone. */
	zones?: readonly TerrainZone[];
}

/** The terrain kinds a body can name. */
export type BodyTerrainKind = NonNullable<BodyDefinition['terrain']>['kind'];

/** The kind of a body's ground, or `undefined` for a smooth sphere. */
export const terrainKindOf = (body: Pick<BodyDefinition, 'terrain'>): BodyTerrainKind | undefined =>
	body.terrain?.kind;

/**
 * The terrain seed of a hills body (plan 071, ADR 0121 point 1): its own `terrain.seed`; else the
 * world's terrain seed for the home body; else the world's mixed with the body id, so two planets do
 * not share continents. The sim, the renderer's CPU field and its GPU bake all take this one.
 */
export function hillsSeedOf(
	body: Pick<BodyDefinition, 'id' | 'terrain'>,
	worldSeed: number,
	home: boolean
): number {
	if (body.terrain?.kind === 'hills' && body.terrain.seed !== undefined) return body.terrain.seed;
	if (home) return worldSeed;
	let h = 0x811c9dc5;
	for (let i = 0; i < body.id.length; i++) h = Math.imul(h ^ body.id.charCodeAt(i), 0x01000193);
	return ((h ^ worldSeed) >>> 0) % 2_147_483_647;
}

/** The craters seed of a body (0 when it names none). */
export const cratersSeedOf = (body: Pick<BodyDefinition, 'terrain'>): number =>
	body.terrain?.kind === 'craters' ? (body.terrain.seed ?? 0) : 0;

/**
 * The height field of a body: the home planet's hills, craters with the body's seed, or `undefined`
 * (a smooth sphere). Pass it to `createSim({ terrain })`; it is the same function the renderer's
 * passes bake.
 */
export function createBodyTerrainField(
	body: Pick<BodyDefinition, 'radius' | 'terrain'>,
	world?: WorldTerrain
): TerrainField | undefined {
	switch (body.terrain?.kind) {
		case 'hills':
			return createTerrainField({
				radius: body.radius,
				...(world ? { seed: world.seed } : {}),
				...(world?.zones && world.zones.length > 0 ? { zones: world.zones } : {})
			});
		case 'craters':
			// site zones flatten craters ground too (plan 128, ADR 0125 point 1)
			return createMoonTerrainField({
				radius: body.radius,
				seed: body.terrain.seed ?? 0,
				...(world?.zones && world.zones.length > 0 ? { zones: world.zones } : {})
			});
		case undefined:
			return undefined;
	}
}
