/**
 * Systems and scale variants (plan 124, ADR 0184): a plugin that registers a variant owns its
 * bodies as a system; the loader keeps the chosen system's bodies and applies the chosen variant's
 * patches.
 */
import * as z from 'zod';
import type { AnyPatchDefinition } from './patch.ts';
import { definitionIdSchema } from './schemas.ts';
import { illustrationSchema, type Illustrated } from './illustration.ts';

/** Id of the system made of every body no declared system owns. */
export const STOCK_SYSTEM = 'stock';

export interface SystemVariantDefinition extends Illustrated {
	/** `<plugin>.<name>`. */
	id: string;
	/** The declaring plugin's id: the system. */
	system: string;
	/** The variant's name in `WorldInfo.variant` (`1:1`, `rescaled`). */
	variant: string;
	label: string;
	description: string;
	/** Body a world without a site on a loaded body starts on. */
	home: string;
	/** What Create World shows: Δv to a low orbit (m/s) and a transfer to the home's moon (s). */
	facts: { dvToOrbit: number; moonTransfer?: number; notes?: string };
	/** Applied only in worlds of this variant, like any patch of the declaring plugin (ADR 0170). */
	patches?: readonly AnyPatchDefinition[];
}

export const systemVariantDefinitionSchema = z.object({
	id: definitionIdSchema,
	system: z.string().min(1),
	variant: z.string().min(1),
	label: z.string().min(1),
	description: z.string().min(1),
	home: definitionIdSchema,
	facts: z.object({
		dvToOrbit: z.number().positive(),
		moonTransfer: z.number().positive().optional(),
		notes: z.string().optional()
	}),
	patches: z
		.array(z.custom<AnyPatchDefinition>((v) => typeof v === 'object' && v !== null))
		.optional(),
	illustration: illustrationSchema.optional(),
	icon: illustrationSchema.optional()
});

/** What `loadPlugins` is told about the world (ADR 0184 point 2). */
export interface SystemChoice {
	id: string;
	variant?: string;
}
