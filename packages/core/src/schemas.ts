/**
 * zod schemas for data crossing a boundary into core (world data, registry definitions). Kept in
 * one file so the SDK can re-export them. zod v4 API (see docs/research/zod.md).
 */
import * as z from 'zod';
import { DEFINITION_ID_PATTERN, PLUGIN_ID_PATTERN } from './ids.ts';

export const definitionIdSchema = z
	.string()
	.regex(DEFINITION_ID_PATTERN, 'expected "<plugin>.<name>" in lower-case kebab-case');
export const pluginIdSchema = z
	.string()
	.regex(PLUGIN_ID_PATTERN, 'expected lower-case kebab-case segments joined by "."');

const entityIndex = z.int().nonnegative();

export const worldDataSchema = z.object({
	formatVersion: z.literal(1),
	nextEntity: entityIndex,
	entities: z.array(entityIndex),
	components: z.record(z.string(), z.record(z.string(), z.unknown()))
});

export const resourceDefinitionSchema = z.object({
	id: definitionIdSchema,
	density: z.number().positive(),
	flowMode: z.enum(['stack', 'vessel', 'none']),
	unit: z.string().min(1)
});

export const bodyDefinitionSchema = z.object({
	id: definitionIdSchema,
	mass: z.number().positive(),
	radius: z.number().positive(),
	rotationPeriod: z.number().positive(),
	atmosphere: z
		.object({
			scaleHeight: z.number().positive(),
			surfacePressure: z.number().nonnegative(),
			height: z.number().positive()
		})
		.optional(),
	parent: definitionIdSchema.optional(),
	orbit: z
		.object({
			a: z.number().positive(),
			e: z.number().nonnegative().lt(1),
			i: z.number(),
			raan: z.number(),
			argp: z.number(),
			m0: z.number(),
			epoch: z.number()
		})
		.optional()
});

const vec3Tuple = z.tuple([z.number(), z.number(), z.number()]);

export const partDefinitionSchema = z.object({
	id: definitionIdSchema,
	title: z.string().min(1),
	mass: z.number().nonnegative(),
	mesh: z.string().optional(),
	attach: z.record(z.string(), z.object({ pos: vec3Tuple, dir: vec3Tuple })).optional(),
	// Entries are [moduleId, config]; the config is validated against the module's schema by the
	// loader (plan 005), which is the only place both registries are visible.
	modules: z.array(z.tuple([definitionIdSchema, z.unknown()])).optional(),
	stagingIcon: z.string().optional()
});
