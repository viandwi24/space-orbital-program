/**
 * Procedural contracts (plan 099, ADRs 0098 point 4 and 0186): templates, the blueprints they
 * generate, offers and the generator's saved state, and the launch-cost estimate behind each
 * offer's expected value. Plain data and pure functions; environment-neutral.
 */
import * as z from 'zod';
import { CURRENCIES } from './economy.ts';
import { objectiveNodeSchema, type ObjectiveNode, type RewardEntry } from './objectives.ts';
import { definitionIdSchema } from './schemas.ts';

/** Offers at once (ADR 0186 point 2). */
export const CONTRACT_OFFER_CAP = 5;
/** Days an offer stays before it expires. */
export const CONTRACT_OFFER_DAYS = 10;
/** Default days a declined offer's key stays out. */
export const CONTRACT_COOLDOWN_DAYS = 15;
/** Default reputation each prestige tier needs (tiers 1, 2, 3). */
export const CONTRACT_TIER_REPUTATION = [0, 100, 300] as const;
/**
 * Funds per (m/s)² of the launch-cost estimate (ADR 0186 point 7): the career bot's two-stage
 * rocket (about 26 000 funds) at the stock Δv to low orbit (about 3 400 m/s).
 */
export const CONTRACT_COST_PER_DV2 = 26_000 / 3_400 ** 2;
/** Ledger cause of an advance. */
export const CONTRACT_ADVANCE_CAUSE = 'contract.advance';
/** The rule that switches the generator (ADR 0186 point 2). */
export const CONTRACT_RULE = 'stock.contracts';

/** An estimate of what launching a mission of `deltaV` m/s costs, in funds. */
export const estimatedLaunchCost = (deltaV: number): number =>
	Math.round(CONTRACT_COST_PER_DV2 * Math.max(0, deltaV) ** 2);

/** A body as a template sees it. */
export interface ContractBodyView {
	id: string;
	label: string;
	/** Parent body id; null for the root. */
	parent: string | null;
	/** m. */
	radius: number;
	/** m³/s². */
	mu: number;
	/** Semi-major axis around the parent, m; 0 for the root. */
	a: number;
}

/** The next Hohmann window to a body (ADR 0186 point 6). */
export interface TransferWindowView {
	/** Sim time of the departure, s (now or later). */
	departure: number;
	/** Half the transfer ellipse's period, s. */
	travel: number;
}

export interface ContractTemplateContext {
	/** A draw in [0, 1) from the generator's stream. */
	random(): number;
	/** The home body. */
	home: ContractBodyView;
	bodies: readonly ContractBodyView[];
	reputation: number;
	/** Sim time, s. */
	time: number;
	/** The world-tick day. */
	day: number;
	/** Length of a world-tick day, s. */
	dayLength: number;
	/** The next window from the home body to a sibling of it, or null (not a sibling). */
	window(target: string): TransferWindowView | null;
}

/** What a template makes (ADR 0186 point 1). */
export interface ContractBlueprint {
	/** Same key, same job: used for de-duplication and the decline cooldown. */
	key: string;
	title: string;
	brief: string;
	objectives: ObjectiveNode;
	advance: RewardEntry[];
	reward: RewardEntry[];
	penalty: RewardEntry[];
	/** Seconds after acceptance. */
	deadline: number;
	/** The template's estimate of the mission's Δv, m/s. */
	deltaV: number;
}

export interface ContractTemplateDefinition {
	/** `<plugin>.<name>`. */
	id: string;
	label: string;
	/** Prestige, 1 to 3. */
	tier: 1 | 2 | 3;
	/** Default `CONTRACT_TIER_REPUTATION[tier - 1]`. */
	minReputation?: number;
	/** Pick weight (default 1). */
	weight?: number;
	/** At most this many of its offers at once (default 1). */
	maxOffers?: number;
	/** Days a declined offer's key stays out (default `CONTRACT_COOLDOWN_DAYS`). */
	cooldownDays?: number;
	generate(ctx: ContractTemplateContext): ContractBlueprint | null;
}

export const contractTemplateDefinitionSchema = z.object({
	id: definitionIdSchema,
	label: z.string().min(1),
	tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
	minReputation: z.number().refine(Number.isFinite, 'must be finite').optional(),
	weight: z.number().positive().optional(),
	maxOffers: z.int().min(1).optional(),
	cooldownDays: z.number().nonnegative().optional(),
	generate: z.custom<(...a: never[]) => unknown>(
		(v) => typeof v === 'function',
		'generate must be a function'
	)
});

const finite = z.number().refine(Number.isFinite, 'must be finite');
const entriesSchema = z.array(z.object({ currency: z.enum(CURRENCIES), amount: finite }));

/** A generated contract, offered or accepted (ADR 0186 point 3). */
export interface ContractOffer {
	/** `gen.<n>`: the objective source id once accepted. */
	id: string;
	template: string;
	tier: 1 | 2 | 3;
	key: string;
	title: string;
	brief: string;
	objectives: ObjectiveNode;
	advance: RewardEntry[];
	reward: RewardEntry[];
	penalty: RewardEntry[];
	/** Seconds after acceptance. */
	deadline: number;
	/** The estimate behind the expected value. */
	estimate: { deltaV: number; cost: number };
	offeredAt: number;
	/** Sim time the offer goes. */
	expires: number;
}

export const contractOfferSchema = z.object({
	id: z.string().regex(/^gen\.\d+$/),
	template: definitionIdSchema,
	tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
	key: z.string().min(1),
	title: z.string().min(1),
	brief: z.string(),
	objectives: objectiveNodeSchema,
	advance: entriesSchema,
	reward: entriesSchema,
	penalty: entriesSchema,
	deadline: finite.refine((d) => d > 0, 'deadline must be positive'),
	estimate: z.object({ deltaV: finite, cost: finite }),
	offeredAt: finite,
	expires: finite
});

/** The generator's saved state (ADR 0186 point 9). */
export interface SaveContracts {
	next: number;
	/** 32-bit stream state. */
	rng: number;
	offers: ContractOffer[];
	/** Generated contracts that were accepted: the objective engine resolves them from here. */
	accepted: ContractOffer[];
	/** Declined keys and the time they may come back. */
	cooldowns: Array<{ key: string; until: number }>;
}

export const saveContractsSchema = z.object({
	next: z.int().min(1),
	rng: z.int().min(0).max(0xffffffff),
	offers: z.array(contractOfferSchema),
	accepted: z.array(contractOfferSchema),
	cooldowns: z.array(z.object({ key: z.string().min(1), until: finite }))
});

/** Funds in a list of entries. */
export const fundsOf = (entries: readonly RewardEntry[]): number =>
	entries.reduce((s, e) => (e.currency === 'funds' ? s + e.amount : s), 0);

/** Advance plus reward funds, less the estimated launch cost (ADR 0186 point 7). */
export const expectedValue = (offer: Pick<ContractOffer, 'advance' | 'reward' | 'estimate'>) =>
	fundsOf(offer.advance) + fundsOf(offer.reward) - offer.estimate.cost;

/** `Snapshot.contracts` (ADR 0186 point 9). */
export interface ContractsSnapshot {
	/** The generator runs (economy and `stock.contracts` on). */
	enabled: boolean;
	/** Active contract slots; null = no limit. */
	slots: number | null;
	/** Active contracts, generated and authored. */
	used: number;
	offers: Array<ContractOffer & { value: number }>;
	/** Accepted generated contracts with their objective instance. */
	contracts: Array<
		ContractOffer & {
			value: number;
			instance: string;
			status: 'active' | 'done' | 'failed';
			acceptedAt: number;
			/** Sim time it fails unfinished. */
			deadlineAt: number;
		}
	>;
}
