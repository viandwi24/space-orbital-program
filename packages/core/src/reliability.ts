/**
 * Part reliability (plan 130, ADR 0156): failure modes as data on module ids, the chance of a
 * trial from experience, grade, crew and fixes, and the world's reliability state.
 */
import * as z from 'zod';
import { definitionIdSchema } from './schemas.ts';

/** The world rule (stock defines it, off by default). */
export const RELIABILITY_RULE = 'stock.reliability';

/** Ledger causes. */
export const RELIABILITY_CAUSES = {
	staticFire: 'reliability.static-fire',
	fix: 'reliability.fix'
} as const;

export const FAILURE_TRIGGERS = ['stage', 'launch'] as const;
export type FailureTrigger = (typeof FAILURE_TRIGGERS)[number];

export interface FailureModeDefinition {
	id: string;
	label: string;
	/** The module that fails (a module id). */
	module: string;
	/** `stage`: drawn when a part with the module is staged; `launch`: when its vessel is loaded. */
	trigger: FailureTrigger;
	/** Probability per trial of a new, standard part model, 0..1. */
	chance: number;
	/** An engineer on EVA can repair it. */
	repairable: boolean;
	description?: string;
}

export const failureModeDefinitionSchema = z.object({
	id: definitionIdSchema,
	label: z.string().min(1),
	module: definitionIdSchema,
	trigger: z.enum(FAILURE_TRIGGERS),
	chance: z.number().min(0).max(1),
	repairable: z.boolean(),
	description: z.string().optional()
});

export const GRADES = ['economy', 'standard', 'proven'] as const;
export type Grade = (typeof GRADES)[number];

/** Cost and chance factors per grade (ADR 0156 point 5). */
export const GRADE_FACTORS: Record<Grade, { cost: number; chance: number }> = {
	economy: { cost: 0.75, chance: 2 },
	standard: { cost: 1, chance: 1 },
	proven: { cost: 1.5, chance: 0.5 }
};

/** The numbers of ADR 0156 points 3, 6 and 7. */
export const RELIABILITY = {
	/** Experience at which the learning factor is halved. */
	learn: 5,
	/** The learning factor never drops below this. */
	floor: 0.2,
	/** An engineer aboard multiplies the chance by this. */
	engineer: 0.75,
	/** Fixes per model and mode that count. */
	maxFixes: 3,
	/** Static fire cost as a share of the part's cost. */
	staticFire: 0.25,
	/** Anomaly fix cost as a multiple of the part's cost. */
	fix: 2
} as const;

/** Per part model (a part definition id) in a world. */
export interface ModelReliability {
	experience: number;
	grade?: Grade;
	/** Fixes bought per failure mode id. */
	fixes?: Record<string, number>;
}

export interface AnomalyReport {
	id: string;
	/** Part model. */
	part: string;
	mode: string;
	time: number;
	/** The vessel it happened on; absent for a static fire. */
	vessel?: number;
	fixed: boolean;
}

/** An engineer on EVA repairs a failed part from at most this many metres (plan 130). */
export const REPAIR_RANGE = 50;

export interface FailedModule {
	vessel: number;
	part: number;
	module: string;
	mode: string;
}

export interface SaveReliability {
	/** State of the `reliability` stream. */
	rng: number;
	models: Record<string, ModelReliability>;
	reports: AnomalyReport[];
	failed: FailedModule[];
	/** Next report number. */
	next: number;
}

const gradeSchema = z.enum(GRADES);

export const saveReliabilitySchema = z.object({
	rng: z.int().min(0).max(0xffffffff),
	models: z.record(
		z.string().min(1),
		z.object({
			experience: z.int().min(0),
			grade: gradeSchema.optional(),
			fixes: z.record(z.string().min(1), z.int().min(0)).optional()
		})
	),
	reports: z.array(
		z.object({
			id: z.string().min(1),
			part: z.string().min(1),
			mode: z.string().min(1),
			time: z.number().finite(),
			vessel: z.int().min(0).optional(),
			fixed: z.boolean()
		})
	),
	failed: z.array(
		z.object({
			vessel: z.int().min(0),
			part: z.int().min(0),
			module: z.string().min(1),
			mode: z.string().min(1)
		})
	),
	next: z.int().min(0)
});

/** Learning factor of `experience` trials (ADR 0156 point 3). */
export const learning = (experience: number): number =>
	Math.max(RELIABILITY.floor, 1 / (1 + Math.max(0, experience) / RELIABILITY.learn));

/** Chance of one trial of `mode` on a model in this state (ADR 0156 point 3). */
export function trialChance(
	mode: Pick<FailureModeDefinition, 'id' | 'chance'>,
	model: ModelReliability | undefined,
	engineerAboard = false
): number {
	const grade = GRADE_FACTORS[model?.grade ?? 'standard'].chance;
	const fixes = Math.min(RELIABILITY.maxFixes, model?.fixes?.[mode.id] ?? 0);
	const crew = engineerAboard ? RELIABILITY.engineer : 1;
	return Math.min(1, mode.chance * grade * learning(model?.experience ?? 0) * crew * 0.5 ** fixes);
}

/** Reliability of a model at its next trial: the product of `1 − chance` over its modes. */
export const modelReliability = (
	modes: readonly Pick<FailureModeDefinition, 'id' | 'chance'>[],
	model: ModelReliability | undefined
): number => modes.reduce((r, m) => r * (1 - trialChance(m, model)), 1);

/** `Snapshot.reliability` (ADR 0156 point 8). */
export interface ReliabilitySnapshot {
	models: Array<{ part: string; experience: number; grade: Grade; reliability: number }>;
	reports: AnomalyReport[];
	failed: Array<FailedModule & { label: string }>;
}
