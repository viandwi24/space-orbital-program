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
	'suborbital',
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
	/**
	 * The systems it is designed for (plan 380, ADR 0317), each with its own design if it needs one
	 * (a Kronos V the size of the real Saturn V for Sol 1:1). Absent: the stock system only. Parts are
	 * the same in every system; the system sets the difficulty.
	 */
	systems?: readonly BlueprintSystem[];
}

/** One system a blueprint is designed for. */
export interface BlueprintSystem {
	/** The system id: `stock`, `sol`. */
	system: string;
	/** One variant (`1:1`, `rescaled`); absent: every variant of the system. */
	variant?: string;
	/** A design of its own for this system; absent: the blueprint's `design`. */
	design?: VesselDesign;
}

/** The systems a blueprint lists, or stock alone when it lists none. */
export const blueprintSystems = (
	b: Pick<BlueprintDefinition, 'systems'>
): readonly BlueprintSystem[] => b.systems ?? [{ system: 'stock' }];

const matches = (s: BlueprintSystem, system: string, variant?: string): boolean =>
	s.system === system && (s.variant === undefined || s.variant === variant);

/** Whether the blueprint is designed for this system and variant. */
export function blueprintFits(
	b: Pick<BlueprintDefinition, 'systems'>,
	system: string,
	variant?: string
): boolean {
	return blueprintSystems(b).some((s) => matches(s, system, variant));
}

/**
 * The design to build in this system: the most specific entry's own design (a variant entry over a
 * system-wide one), else the blueprint's `design`.
 */
export function blueprintDesignFor(
	b: Pick<BlueprintDefinition, 'systems' | 'design'>,
	system: string,
	variant?: string
): VesselDesign {
	const all = blueprintSystems(b).filter((s) => matches(s, system, variant) && s.design);
	const best = all.find((s) => s.variant !== undefined) ?? all[0];
	return best?.design ?? b.design;
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
	design: vesselDesignSchema,
	systems: z
		.array(
			z.object({
				system: z.string().min(1),
				variant: z.string().min(1).optional(),
				design: vesselDesignSchema.optional()
			})
		)
		.min(1)
		.optional()
});
