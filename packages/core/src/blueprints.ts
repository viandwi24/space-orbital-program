/**
 * Blueprints (plan 285, ADR 0263): ready-made designs a mod ships for the Hangar's Library, with
 * what they are for. The Library lists them beside the game's own under "Mod".
 */
import * as z from 'zod';
import { DEFINITION_ID_PATTERN } from './ids.ts';
import type { VesselDesign } from './protocol.ts';
import { vesselDesignSchema } from './protocol-schemas.ts';

export const BLUEPRINT_GOALS = [
	'orbit',
	'moon',
	'planet',
	'deep-space',
	'station',
	'surface'
] as const;
/** Where the Library files a card (plan 375, ADR 0316); absent: under "Mod". */
export const BLUEPRINT_COLLECTIONS = ['learn', 'missions'] as const;
export type BlueprintCollection = (typeof BLUEPRINT_COLLECTIONS)[number];
export type BlueprintGoal = (typeof BLUEPRINT_GOALS)[number];

export interface BlueprintDefinition {
	/** `<plugin>.<name>`. */
	id: string;
	title: string;
	/** The real craft it follows, if any ("the Saturn V"). */
	inspiredBy?: string;
	goal: BlueprintGoal;
	/** Seats it is built to fill (0: a probe). */
	crew: number;
	/** One or two sentences for the card. */
	summary: string;
	/** `learn` or `missions` files it beside the game's own (ADR 0316); absent: "Mod". */
	collection?: BlueprintCollection;
	design: VesselDesign;
}

export const blueprintDefinitionSchema = z.object({
	id: z
		.string()
		.regex(DEFINITION_ID_PATTERN, 'expected "<plugin>.<name>" in lower-case kebab-case'),
	title: z.string().min(1),
	inspiredBy: z.string().min(1).optional(),
	goal: z.enum(BLUEPRINT_GOALS),
	crew: z.number().int().min(0),
	summary: z.string().min(1),
	collection: z.enum(BLUEPRINT_COLLECTIONS).optional(),
	design: vesselDesignSchema
});
