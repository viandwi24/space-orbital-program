/**
 * Science core (plan 103, ADRs 0099 and 0178): situations as data, experiments, subjects and the
 * value curve. Plain data and pure functions; environment-neutral.
 */
import * as z from 'zod';
import { definitionIdSchema } from './schemas.ts';

/** What a situation is decided from (ADR 0178 point 1). */
export interface SituationView {
	landed: boolean;
	/** Landed where the ground is at or below sea level, on a body with an atmosphere. */
	splashed: boolean;
	/** Height above the body's radius, m. */
	altitude: number;
	/** 0 without an atmosphere. */
	atmosphereHeight: number;
	flyingHigh: number;
	spaceHigh: number;
}

export interface SituationDefinition {
	/** `<plugin>.<name>` (`stock.landed`, ...). */
	id: string;
	label: string;
	/** Lower first; the first that matches is the situation. */
	order: number;
	matches(view: SituationView): boolean;
}

export const EXPERIMENT_KINDS = ['data', 'sample'] as const;

export interface ExperimentDefinition {
	id: string;
	label: string;
	kind: (typeof EXPERIMENT_KINDS)[number];
	/** Situation ids it may run in. */
	situations: readonly string[];
	/** Science of the first result in a subject, before the body multiplier. */
	baseValue: number;
	/** Each further result is worth this fraction of the one before (0..1). */
	repeatFactor: number;
	/** Cap of a subject as a multiple of `baseValue` (default 3). */
	capFactor?: number;
	/** Seconds a run takes. */
	duration: number;
	/** Electric charge per second while running (default 0). */
	power?: number;
	/** Data size, bits (kind `data`). */
	bits?: number;
	/** Sample mass, kg (kind `sample`; data only for now). */
	mass?: number;
	/** Fraction of the value a transmission credits (kind `data`). */
	transmitFactor: number;
}

export const situationDefinitionSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
	order: z.number(),
	matches: z.custom<(v: SituationView) => boolean>(
		(v) => typeof v === 'function',
		'matches must be a function'
	)
});

export const experimentDefinitionSchema = z
	.object({
		id: definitionIdSchema,
		label: z.string().min(1),
		kind: z.enum(EXPERIMENT_KINDS),
		situations: z.array(z.string().min(1)).min(1),
		baseValue: z.number().positive(),
		repeatFactor: z.number().min(0).max(1),
		capFactor: z.number().positive().optional(),
		duration: z.number().nonnegative(),
		power: z.number().nonnegative().optional(),
		bits: z.number().positive().optional(),
		mass: z.number().positive().optional(),
		transmitFactor: z.number().min(0).max(1)
	})
	.refine((e) => e.kind !== 'data' || e.bits !== undefined, 'a data experiment needs bits')
	.refine((e) => e.kind !== 'sample' || e.mass !== undefined, 'a sample experiment needs a mass');

/** A body's science data (ADR 0178 point 2). */
export interface BodyScience {
	flyingHigh: number;
	spaceHigh: number;
	multiplier: number;
}

/** The body's thresholds and multiplier, with the defaults of ADR 0178 point 2. */
export function bodyScience(body: {
	radius: number;
	atmosphere?: { height: number } | undefined;
	science?: Partial<BodyScience> | undefined;
}): BodyScience {
	const atmo = body.atmosphere?.height ?? 0;
	return {
		flyingHigh: body.science?.flyingHigh ?? atmo / 4,
		spaceHigh: body.science?.spaceHigh ?? Math.max(atmo, 0.4 * body.radius),
		multiplier: body.science?.multiplier ?? 1
	};
}

/** The first situation by order that matches, or undefined. */
export function situationOf(
	situations: readonly SituationDefinition[],
	view: SituationView
): SituationDefinition | undefined {
	return sortSituations(situations).find((s) => s.matches(view));
}

/** Situations by `order`, then id. */
export const sortSituations = (situations: readonly SituationDefinition[]): SituationDefinition[] =>
	[...situations].sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));

/** Region of every subject until plan 104. */
export const GLOBAL_REGION = 'global';

export const subjectId = (
	experiment: string,
	body: string,
	situation: string,
	region = GLOBAL_REGION
): string => `${experiment}@${body}:${situation}:${region}`;

export interface ScienceSubject {
	id: string;
	experiment: string;
	body: string;
	situation: string;
	region: string;
	/** Results made. */
	count: number;
	/** Value given to results so far. */
	produced: number;
	/** Value credited so far. */
	credited: number;
	cap: number;
}

export const subjectCap = (
	e: Pick<ExperimentDefinition, 'baseValue' | 'capFactor'>,
	multiplier: number
): number => e.baseValue * multiplier * (e.capFactor ?? 3);

/** The value of the next result in `subject` (ADR 0178 point 4). */
export function nextValue(
	e: Pick<ExperimentDefinition, 'baseValue' | 'repeatFactor'>,
	multiplier: number,
	subject: Pick<ScienceSubject, 'count' | 'produced' | 'cap'>
): number {
	const raw = e.baseValue * multiplier * e.repeatFactor ** subject.count;
	return Math.max(0, Math.min(subject.cap - subject.produced, raw));
}

/** `SimSave.science` (optional in format 5, ADR 0178 point 8). */
export interface SaveScience {
	subjects: ScienceSubject[];
}

export const saveScienceSchema = z.object({
	subjects: z.array(
		z.object({
			id: z.string().min(1),
			experiment: z.string().min(1),
			body: z.string().min(1),
			situation: z.string().min(1),
			region: z.string().min(1),
			count: z.int().min(0),
			produced: z.number().nonnegative(),
			credited: z.number().nonnegative(),
			cap: z.number().nonnegative()
		})
	)
});

export const EXPERIMENT_STATES = ['READY', 'RUNNING', 'PAUSED', 'INVALID'] as const;
export type ExperimentStatus = (typeof EXPERIMENT_STATES)[number];

/** Rules the sim reads for science credit (ADR 0178 point 7). */
export const SCIENCE_RULES = {
	techTree: 'stock.tech-tree',
	multiplier: 'stock.science-multiplier'
} as const;

/** Data item kind of a science result (ADR 0178 point 5). */
export const SCIENCE_DATA_KIND = 'stock.science';
