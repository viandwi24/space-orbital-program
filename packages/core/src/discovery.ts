/**
 * Discovery science (plan 129, ADRs 0099 point 5 and 0192): fact kinds, the hidden facts from the
 * world seed, data levels, the review score and the save and snapshot shapes. Plain data and pure
 * functions; environment-neutral.
 */
import * as z from 'zod';
import { createRng, streamSeed, type Rng } from './rng.ts';
import { definitionIdSchema } from './schemas.ts';

/** The world rule that turns discovery on (ADR 0099 point 5). */
export const DISCOVERY_RULE = 'stock.science-depth';
export const DISCOVERY_ON = 'discovery';

export interface DiscoveryFactDefinition {
	/** `<plugin>.<name>`. */
	id: string;
	label: string;
	/** Unit of the value, as text ("%", "μT", "km"). */
	unit: string;
	/** Probability that a body has it (0..1). */
	chance: number;
	/** The value when present, `[min, max]`; an absent fact has value 0. */
	range: readonly [number, number];
	/** A claim within this of the truth is correct. */
	tolerance: number;
	/** Raw error, one standard deviation, in `unit`. */
	resolution: number;
	/** Data experiments whose results measure it. */
	instruments: readonly string[];
}

const positive = z.number().refine((v) => Number.isFinite(v) && v > 0, 'must be finite and > 0');

export const discoveryFactDefinitionSchema = z
	.object({
		id: definitionIdSchema,
		label: z.string().min(1),
		unit: z.string(),
		chance: z.number().min(0).max(1),
		range: z.tuple([z.number(), z.number()]),
		tolerance: positive,
		resolution: positive,
		instruments: z.array(z.string().min(1)).min(1)
	})
	.refine((d) => d.range[0] > 0 && d.range[1] >= d.range[0], 'range must be 0 < min <= max');

export const DATA_LEVELS = ['raw', 'calibrated', 'derived'] as const;
export type DataLevel = (typeof DATA_LEVELS)[number];

/** The error of each level as a fraction of the raw error (ADR 0192 point 5). */
export const LEVEL_ERROR: Record<DataLevel, number> = { raw: 1, calibrated: 0.5, derived: 0.25 };
/** Days of lab work to reach a level. */
export const DISCOVERY_PROCESS_DAYS: Record<Exclude<DataLevel, 'raw'>, number> = {
	calibrated: 2,
	derived: 5
};
/** Days from a claim to its review. */
export const DISCOVERY_REVIEW_DAYS = 3;
/** Reputation of a correct claim at full confidence. */
export const DISCOVERY_REPUTATION = 20;
/** A correct claim of a fact someone already has priority on gains this fraction. */
export const DISCOVERY_SECOND_FACTOR = 0.25;
export const DISCOVERY_CAUSE = 'discovery.review';
export const DISCOVERY_MIN_CONFIDENCE = 0.5;

/** The data item meta key of a measurement of `fact`. */
export const measurementKey = (fact: string): string => `discovery:${fact}`;

export const nextLevel = (level: DataLevel): Exclude<DataLevel, 'raw'> | undefined =>
	level === 'raw' ? 'calibrated' : level === 'calibrated' ? 'derived' : undefined;

/**
 * The hidden value of `fact` on `body` (ADR 0192 point 2): its own stream, so adding a body or a
 * kind moves nothing else. 0 = absent.
 */
export function factValue(seed: number, body: string, fact: DiscoveryFactDefinition): number {
	const rng = createRng(streamSeed(seed, `discovery.fact:${body}:${fact.id}`));
	const present = rng.next() < fact.chance;
	const value = rng.range(fact.range[0], fact.range[1]);
	return present ? value : 0;
}

/** One standard normal draw (Box–Muller over two uniforms). */
export function normal(rng: Rng): number {
	const u = 1 - rng.next(); // (0, 1]
	const v = rng.next();
	return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * The reputation of a reviewed claim (ADR 0192 point 6): the scaled Brier score, proper, 0 at
 * confidence 0.5; a correct claim without priority gains `DISCOVERY_SECOND_FACTOR` of it.
 */
export function reviewScore(correct: boolean, confidence: number, priority: boolean): number {
	const o = correct ? 1 : 0;
	const score = DISCOVERY_REPUTATION * (1 - 4 * (o - confidence) ** 2);
	return correct && !priority && score > 0 ? score * DISCOVERY_SECOND_FACTOR : score;
}

export interface DiscoveryDataset {
	id: string;
	body: string;
	fact: string;
	level: DataLevel;
	value: number;
	/** One standard deviation at this level. */
	sigma: number;
	/** In the lab: the level it is becoming and when it is done. */
	processing?: { to: Exclude<DataLevel, 'raw'>; until: number };
}

export type ClaimVerdict = 'accepted' | 'rejected';

export interface DiscoveryClaim {
	id: string;
	body: string;
	fact: string;
	value: number;
	confidence: number;
	made: number;
	due: number;
	/** Set by the review. */
	verdict?: ClaimVerdict;
	/** The first accepted claim of its fact. */
	priority?: boolean;
	reputation?: number;
}

export interface SaveDiscovery {
	/** The `discovery` stream's PRNG state. */
	rng: number;
	/** Next id number of a dataset or claim. */
	next: number;
	data: DiscoveryDataset[];
	claims: DiscoveryClaim[];
}

const finite = z.number().refine(Number.isFinite, 'must be finite');
const level = z.enum(DATA_LEVELS);

export const saveDiscoverySchema = z.object({
	rng: z.number().int().min(0),
	next: z.number().int().min(1),
	data: z.array(
		z.object({
			id: z.string().min(1),
			body: z.string().min(1),
			fact: z.string().min(1),
			level,
			value: finite,
			sigma: finite,
			processing: z.object({ to: z.enum(['calibrated', 'derived']), until: finite }).optional()
		})
	),
	claims: z.array(
		z.object({
			id: z.string().min(1),
			body: z.string().min(1),
			fact: z.string().min(1),
			value: finite,
			confidence: z.number().min(0).max(1),
			made: finite,
			due: finite,
			verdict: z.enum(['accepted', 'rejected']).optional(),
			priority: z.boolean().optional(),
			reputation: finite.optional()
		})
	)
});

/** A fact of a body as the player may see it: never the truth of an open fact. */
export interface DiscoveryFactView {
	body: string;
	fact: string;
	label: string;
	unit: string;
	tolerance: number;
	/** `settled` once a claim of it was accepted; `value` is that claim's. */
	status: 'open' | 'settled';
	value?: number;
}

/** `Snapshot.discovery`, with discovery on (ADR 0192 point 8). */
export interface DiscoverySnapshot {
	facts: DiscoveryFactView[];
	data: DiscoveryDataset[];
	claims: DiscoveryClaim[];
	/** Datasets the lab may process at once; null = no limit. */
	labSlots: number | null;
	processing: number;
}
