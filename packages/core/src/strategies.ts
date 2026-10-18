/**
 * Strategies (plan 101, ADRs 0098 point 5 and 0187): the declared multiplier keys and their
 * bounds, strategy definitions, how active strategies combine, and their upkeep as a charge.
 * Plain data and pure functions; environment-neutral.
 */
import * as z from 'zod';
import type { ChargeDefinition } from './economy.ts';
import { definitionIdSchema } from './schemas.ts';

/** Every key a strategy may scale, with its bounds and where it acts (ADR 0187 point 1). */
export const STRATEGY_KEYS = {
	'launch-cost': { label: 'Launch cost', min: 0.75, max: 1.25 },
	recovery: { label: 'Recovery value', min: 0.75, max: 1.5 },
	science: { label: 'Science', min: 0.5, max: 1.5 },
	reputation: { label: 'Reputation gains', min: 0.5, max: 1.5 },
	'contract-funds': { label: 'Contract funds', min: 0.5, max: 1.5 },
	budget: { label: 'Budget', min: 0.8, max: 1.2 }
} as const;
export type StrategyKey = keyof typeof STRATEGY_KEYS;
export const STRATEGY_KEY_IDS = Object.keys(STRATEGY_KEYS) as StrategyKey[];

/** Default days an ended strategy stays out. */
export const STRATEGY_COOLDOWN_DAYS = 30;
/** Upkeep is charged every this many days, like the other monthly charges. */
export const STRATEGY_UPKEEP_DAYS = 30;
/** The agency rule that picks the strategies on offer (ADR 0096 point 5). */
export const AGENCY_TYPE_RULE = 'stock.agency-type';

export interface StrategyDefinition {
	/** `<plugin>.<name>`. */
	id: string;
	label: string;
	description: string;
	/** Each factor within its key's bounds (checked at load). */
	effects: Array<{ key: StrategyKey; factor: number }>;
	/** Funds per `STRATEGY_UPKEEP_DAYS` days, booked negative. */
	upkeep: number;
	/** Offered only to these values of `stock.agency-type` (default: all). */
	agencyTypes?: string[];
	/** Days an ended strategy stays out (default `STRATEGY_COOLDOWN_DAYS`). */
	cooldownDays?: number;
}

export const strategyDefinitionSchema = z.object({
	id: definitionIdSchema,
	label: z.string().min(1),
	description: z.string(),
	effects: z
		.array(
			z
				.object({
					key: z.enum(STRATEGY_KEY_IDS as [StrategyKey, ...StrategyKey[]]),
					factor: z.number().positive()
				})
				.superRefine((e, ctx) => {
					const { min, max } = STRATEGY_KEYS[e.key];
					if (e.factor < min || e.factor > max)
						ctx.addIssue({
							code: 'custom',
							message: `factor ${e.factor} is outside ${e.key}'s bounds ${min}..${max}`
						});
				})
		)
		.min(1),
	upkeep: z.number().nonnegative(),
	agencyTypes: z.array(z.string().min(1)).min(1).optional(),
	cooldownDays: z.number().nonnegative().optional()
});

/** Each key's multiplier: the product of the factors on it, clamped to its bounds (ADR 0187 point 3). */
export function strategyMultipliers(
	active: readonly Pick<StrategyDefinition, 'effects'>[]
): Record<StrategyKey, number> {
	const out = Object.fromEntries(STRATEGY_KEY_IDS.map((k) => [k, 1])) as Record<
		StrategyKey,
		number
	>;
	for (const s of active) for (const e of s.effects) out[e.key] *= e.factor;
	for (const k of STRATEGY_KEY_IDS)
		out[k] = Math.min(STRATEGY_KEYS[k].max, Math.max(STRATEGY_KEYS[k].min, out[k]));
	return out;
}

/** The charge a strategy's upkeep is (ADR 0187 point 4). */
export const strategyUpkeepCharge = (
	s: Pick<StrategyDefinition, 'id' | 'label' | 'upkeep'>
): ChargeDefinition => ({
	id: s.id,
	label: `${s.label} upkeep`,
	currency: 'funds',
	amount: -s.upkeep,
	everyDays: STRATEGY_UPKEEP_DAYS
});

/** Whether a strategy is offered to an agency type. */
export const offeredTo = (s: Pick<StrategyDefinition, 'agencyTypes'>, agency: unknown): boolean =>
	!s.agencyTypes || (typeof agency === 'string' && s.agencyTypes.includes(agency));

/** The saved strategy state (ADR 0187 point 7). */
export interface SaveStrategies {
	active: Array<{ id: string; since: number }>;
	cooldowns: Array<{ id: string; until: number }>;
}

const finite = z.number().refine(Number.isFinite, 'must be finite');
export const saveStrategiesSchema = z.object({
	active: z.array(z.object({ id: definitionIdSchema, since: finite })),
	cooldowns: z.array(z.object({ id: definitionIdSchema, until: finite }))
});

/** `Snapshot.strategies`. */
export interface StrategiesSnapshot {
	/** Strategy slots; null = no limit. */
	slots: number | null;
	used: number;
	multipliers: Record<StrategyKey, number>;
	offered: Array<{
		id: string;
		label: string;
		description: string;
		effects: Array<{ key: StrategyKey; label: string; factor: number; min: number; max: number }>;
		upkeep: number;
		active: boolean;
		/** Sim time its cooldown ends; null when not cooling down. */
		coolingUntil: number | null;
	}>;
}
