/**
 * Milestones and achievements (plan 102, ADR 0147): the firsts a world records, what a first pays,
 * and achievements as data matched against records. Plain data and pure functions.
 */
import * as z from 'zod';
import { definitionIdSchema } from './schemas.ts';

/** The kinds that exist now (ADR 0147 point 1); later systems add more. */
export const MILESTONE_KINDS = ['launch', 'orbit', 'flyby', 'landing', 'return', 'eva'] as const;
export type MilestoneKind = (typeof MILESTONE_KINDS)[number];

/** One first in a world. `id` is the kind, `crewed-` when crew was aboard, and the body: `crewed-orbit:stock.home`. */
export interface MilestoneRecord {
	id: string;
	kind: MilestoneKind;
	/** Absent for `launch`. */
	body?: string;
	crewed: boolean;
	/** The vessel that made it (an entity id at the time). */
	vessel: number;
	/** Sim time, s. */
	time: number;
}

/** Saved milestones (optional in format 5, ADR 0147 point 3). */
export interface SaveMilestones {
	records: MilestoneRecord[];
	/** Places (`orbit:<body>`, `flyby:<body>`, `landing:<body>`) each live vessel has been since launch. */
	visits: Record<string, string[]>;
}

export const milestoneRecordSchema = z.object({
	id: z.string().min(1),
	kind: z.enum(MILESTONE_KINDS),
	body: z.string().min(1).optional(),
	crewed: z.boolean(),
	vessel: z.int().min(0),
	time: z.number().finite().min(0)
});

export const saveMilestonesSchema = z.object({
	records: z.array(milestoneRecordSchema),
	visits: z.record(z.string().regex(/^\d+$/), z.array(z.string().min(1)))
});

/** The id of a first (ADR 0147 point 1). */
export function milestoneId(
	kind: MilestoneKind,
	body: string | undefined,
	crewed: boolean
): string {
	const k = crewed ? `crewed-${kind}` : kind;
	return body === undefined ? k : `${k}:${body}`;
}

/** Reputation for a first (ADR 0147 point 5): base per kind, doubled away from home, +50 % crewed. */
export const MILESTONE_REPUTATION: Readonly<Record<MilestoneKind, number>> = {
	launch: 5,
	orbit: 10,
	flyby: 15,
	landing: 20,
	return: 10,
	// the first time a member steps out at a body (plan 109, ADR 0120 point 6)
	eva: 10
};

export function milestoneReputation(
	record: Pick<MilestoneRecord, 'kind' | 'body' | 'crewed'>,
	home: string
): number {
	const base = MILESTONE_REPUTATION[record.kind];
	const away = record.body !== undefined && record.body !== home ? 2 : 1;
	return base * away * (record.crewed ? 1.5 : 1);
}

/** The ledger cause of a milestone's reputation. */
export const MILESTONE_CAUSE = 'milestone';

// ---- achievements (ADR 0147 point 6) ----

export interface AchievementCriteria {
	milestone: MilestoneKind;
	/** `home`, `away` (any other body) or a body id; absent = any. */
	body?: string;
	/** true = a crewed record only; absent = either. */
	crewed?: boolean;
}

export interface AchievementDefinition {
	/** `<plugin>.<name>`. */
	id: string;
	label: string;
	description: string;
	/** Not listed until unlocked. */
	hidden?: boolean;
	criteria: AchievementCriteria;
}

export const achievementDefinitionSchema = z.object({
	id: definitionIdSchema,
	label: z.string().min(1),
	description: z.string().min(1),
	hidden: z.boolean().optional(),
	criteria: z.strictObject({
		milestone: z.enum(MILESTONE_KINDS),
		body: z.string().min(1).optional(),
		crewed: z.boolean().optional()
	})
});

/** Whether a record unlocks an achievement; `home` is the world's home body id. */
export function achievementMatches(
	a: Pick<AchievementDefinition, 'criteria'>,
	r: Pick<MilestoneRecord, 'kind' | 'body' | 'crewed'>,
	home: string
): boolean {
	const c = a.criteria;
	if (c.milestone !== r.kind) return false;
	if (c.crewed === true && !r.crewed) return false;
	if (c.body === undefined) return true;
	if (r.body === undefined) return false;
	if (c.body === 'home') return r.body === home;
	if (c.body === 'away') return r.body !== home;
	return r.body === c.body;
}
