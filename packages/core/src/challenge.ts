/**
 * Challenge files (plan 131, ADR 0159 points 5 and 6): a world to play (preset, rules, system,
 * site), a goal milestone and score axes; scored locally against the player's own history.
 */
import * as z from 'zod';
import { definitionIdSchema } from './schemas.ts';

export const CHALLENGE_FORMAT = 'orbital-challenge';
export const CHALLENGE_FORMAT_VERSION = 1;

export const SCORE_AXES = ['cost', 'mass', 'time', 'dv-margin'] as const;
export type ScoreAxis = (typeof SCORE_AXES)[number];

/** Unit and direction of each axis: lower is better except the Δv margin. */
export const AXIS_INFO: Record<
	ScoreAxis,
	{ label: string; unit: string; better: 'lower' | 'higher' }
> = {
	cost: { label: 'Cost', unit: 'funds', better: 'lower' },
	mass: { label: 'Launch mass', unit: 'kg', better: 'lower' },
	time: { label: 'Time', unit: 's', better: 'lower' },
	'dv-margin': { label: 'Δv margin', unit: 'm/s', better: 'higher' }
};

export interface ChallengeFile {
	format: typeof CHALLENGE_FORMAT;
	formatVersion: number;
	id: string;
	title: string;
	description?: string;
	preset: string;
	rules: Record<string, boolean | number | string>;
	system?: { id: string; variant?: string };
	siteTemplate?: string;
	/** A milestone id (`orbit:stock.home`, `landing:stock.cinder`). */
	goal: string;
	axes: ScoreAxis[];
}

export const challengeFileSchema = z.object({
	format: z.literal(CHALLENGE_FORMAT),
	formatVersion: z.int().min(1),
	id: definitionIdSchema,
	title: z.string().min(1),
	description: z.string().optional(),
	preset: z.string().min(1),
	rules: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])),
	system: z.object({ id: z.string().min(1), variant: z.string().optional() }).optional(),
	siteTemplate: z.string().optional(),
	goal: z.string().min(1),
	axes: z.array(z.enum(SCORE_AXES)).min(1)
});

export function readChallenge(
	text: string
): { ok: true; challenge: ChallengeFile } | { ok: false; reason: string } {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return { ok: false, reason: 'not a challenge file (not JSON)' };
	}
	if ((raw as { format?: unknown })?.format !== CHALLENGE_FORMAT)
		return { ok: false, reason: 'not a challenge file' };
	if (((raw as { formatVersion?: number }).formatVersion ?? 0) > CHALLENGE_FORMAT_VERSION)
		return { ok: false, reason: 'this challenge is from a newer version: update the game' };
	const parsed = challengeFileSchema.safeParse(raw);
	if (!parsed.success)
		return {
			ok: false,
			reason: `damaged challenge: ${parsed.error.issues[0]?.path.join('.') ?? ''}`
		};
	return { ok: true, challenge: parsed.data as ChallengeFile };
}

/** What a finished run measured. */
export interface RunMeasure {
	cost: number;
	mass: number;
	time: number;
	dvMargin: number;
}

export type Score = { axis: ScoreAxis; value: number };

/** The score on each of the challenge's axes. */
export const scoreRun = (challenge: Pick<ChallengeFile, 'axes'>, run: RunMeasure): Score[] =>
	challenge.axes.map((axis) => ({
		axis,
		value:
			axis === 'cost'
				? run.cost
				: axis === 'mass'
					? run.mass
					: axis === 'time'
						? run.time
						: run.dvMargin
	}));

/** The best value per axis over a history of scored runs. */
export function bestScores(history: readonly Score[][]): Partial<Record<ScoreAxis, number>> {
	const best: Partial<Record<ScoreAxis, number>> = {};
	for (const run of history)
		for (const s of run) {
			const b = best[s.axis];
			const higher = AXIS_INFO[s.axis].better === 'higher';
			if (b === undefined || (higher ? s.value > b : s.value < b)) best[s.axis] = s.value;
		}
	return best;
}
