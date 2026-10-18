/**
 * Economy core (plan 095, ADRs 0098 and 0113): the ledger, scheduled charges, the value of a
 * design and of recovered parts, and the projection. Pure functions; the sim owns the state.
 */
import * as z from 'zod';
import type { ModuleDefinition, PartDefinition, ResourceDefinition } from './definitions.ts';
import { definitionIdSchema } from './schemas.ts';
import type { VesselDesign } from './protocol.ts';
import type { RuleValue } from './rules.ts';
import {
	marketStateSchema,
	siteStorageSchema,
	type MarketState,
	type SiteStorage
} from './market.ts';

export const CURRENCIES = ['funds', 'science', 'reputation'] as const;
export type Currency = (typeof CURRENCIES)[number];
export type Balances = Record<Currency, number>;

export interface LedgerEntry {
	/** Sim time of the entry, s. */
	time: number;
	currency: Currency;
	/** Signed: income positive, cost negative. */
	amount: number;
	/** Registered id of what caused it (`economy.launch`, a charge id, ...). */
	cause: string;
	/** What it was about: a design name, a vessel id. */
	ref?: string;
}

/** `SimSave.economy` (optional in format 5, ADR 0113 point 1). */
export interface SaveEconomy {
	balances: Balances;
	entries: LedgerEntry[];
	/** Traded commodities (plan 097, ADR 0124 point 2); absent until a market opens. */
	markets?: Record<string, MarketState>;
	/** Commodities held at each site (plan 097); absent until something is stored. */
	storage?: SiteStorage;
	/** Supply routes (plan 128, ADR 0125 point 6); absent until one is made. */
	routes?: SupplyRoute[];
}

export interface SupplyRoute {
	id: string;
	from: string;
	to: string;
	commodity: string;
	amount: number;
	/** Tick day of the next transfer window. */
	nextDay: number;
}

/** The rules the sim reads (ADR 0113 point 4); stock registers them. */
export const ECONOMY_RULES = {
	enabled: 'stock.economy',
	costMultiplier: 'stock.cost-multiplier',
	agencyType: 'stock.agency-type',
	startingFunds: 'stock.starting-funds'
} as const;

/** Causes the sim writes itself. */
export const ECONOMY_CAUSES = {
	launch: 'economy.launch',
	recovery: 'economy.recovery',
	reputationDecay: 'economy.reputation-decay',
	construction: 'economy.construction',
	upkeep: 'economy.upkeep'
} as const;

export const REPUTATION_LIMIT = 1_000;
/** Reputation relaxes toward 0 with this time constant, applied every `REPUTATION_DECAY_EVERY` days. */
export const REPUTATION_TAU_DAYS = 365;
export const REPUTATION_DECAY_EVERY = 30;

/** A recurring income or cost (ADR 0113 point 3). */
export interface ChargeDefinition {
	/** `<plugin>.<name>`; also the cause of its entries. */
	id: string;
	label: string;
	currency: Currency;
	/** Per application, signed. */
	amount: number;
	/** Applied on each world tick whose day is a positive multiple of this. */
	everyDays: number;
	/** Only while this rule has this value. */
	when?: { rule: string; equals: RuleValue };
	/** Numeric rules multiplied into the amount (missing or non-numeric rules count as 1). */
	scaleBy?: string[];
	/** A strategy multiplier key scaling the amount (plan 101, ADR 0187; stock: `budget`). */
	multiplier?: string;
}

export const chargeDefinitionSchema = z.object({
	id: definitionIdSchema,
	label: z.string().min(1),
	currency: z.enum(CURRENCIES),
	amount: z.number().refine(Number.isFinite, 'expected a finite number'),
	everyDays: z.int().positive(),
	when: z
		.object({ rule: z.string().min(1), equals: z.union([z.boolean(), z.number(), z.string()]) })
		.optional(),
	scaleBy: z.array(z.string().min(1)).optional(),
	multiplier: z.string().min(1).optional()
});

const finite = z.number().refine(Number.isFinite, 'expected a finite number');
export const saveEconomySchema = z.object({
	balances: z.object({ funds: finite, science: finite, reputation: finite }),
	entries: z.array(
		z.object({
			time: finite,
			currency: z.enum(CURRENCIES),
			amount: finite,
			cause: z.string().min(1),
			ref: z.string().optional()
		})
	),
	markets: z.record(z.string(), marketStateSchema).optional(),
	storage: siteStorageSchema.optional(),
	routes: z
		.array(
			z.object({
				id: z.string().min(1),
				from: z.string().min(1),
				to: z.string().min(1),
				commodity: z.string().min(1),
				amount: z.number().positive(),
				nextDay: z.int()
			})
		)
		.optional()
});

type RuleLookup = (id: string) => RuleValue | undefined;

/** A strategy multiplier by key (1 for none). */
export type MultiplierLookup = (key: string) => number;

/** The amount a charge writes today, or null when it does not apply on `day`. */
export function chargeOn(
	charge: ChargeDefinition,
	day: number,
	rule: RuleLookup,
	multiplier?: MultiplierLookup
): number | null {
	if (day <= 0 || day % charge.everyDays !== 0) return null;
	if (charge.when && rule(charge.when.rule) !== charge.when.equals) return null;
	let amount = charge.amount;
	for (const id of charge.scaleBy ?? []) {
		const v = rule(id);
		if (typeof v === 'number') amount *= v;
	}
	if (charge.multiplier && multiplier) amount *= multiplier(charge.multiplier);
	return amount;
}

/** Reputation after one decay step of `REPUTATION_DECAY_EVERY` days. */
export const decayedReputation = (reputation: number): number =>
	reputation * Math.exp(-REPUTATION_DECAY_EVERY / REPUTATION_TAU_DAYS);

export const clampReputation = (r: number): number =>
	Math.max(-REPUTATION_LIMIT, Math.min(REPUTATION_LIMIT, r));

/** Balance per day for `days` days after `fromDay` (index 0 = the end of `fromDay + 1`). */
export function projectBalances(
	balances: Balances,
	charges: readonly ChargeDefinition[],
	rule: RuleLookup,
	fromDay: number,
	days: number,
	/** Strategy multipliers and extra charges such as upkeep (plan 101, ADR 0187 point 4). */
	options: { multiplier?: MultiplierLookup; extra?: readonly ChargeDefinition[] } = {}
): Balances[] {
	const out: Balances[] = [];
	const b = { ...balances };
	const all = [...charges, ...(options.extra ?? [])];
	for (let day = fromDay + 1; day <= fromDay + days; day++) {
		for (const charge of all) {
			const amount = chargeOn(charge, day, rule, options.multiplier);
			if (amount !== null) b[charge.currency] += amount;
		}
		if (day % REPUTATION_DECAY_EVERY === 0) b.reputation = decayedReputation(b.reputation);
		b.reputation = clampReputation(b.reputation);
		out.push({ ...b });
	}
	return out;
}

interface Lookup<T> {
	get(id: string): T | undefined;
}
export interface CostRegistries {
	parts: Lookup<PartDefinition>;
	modules: Lookup<ModuleDefinition>;
	resources: Lookup<ResourceDefinition>;
}

/** Value of a part's contents from module stores and their state (ADR 0113 point 2). */
export function contentsValue(
	modules: ReadonlyArray<{ module: ModuleDefinition; config: unknown; state: unknown }>,
	resources: Lookup<ResourceDefinition>
): number {
	let value = 0;
	for (const { module, config, state } of modules) {
		if (!module.store) continue;
		for (const r of module.store.resources(config, state)) {
			value += module.store.amount(config, state, r) * (resources.get(r)?.price ?? 0);
		}
	}
	return value;
}

export interface DesignCost {
	/** Parts plus contents, funds. */
	total: number;
	parts: number;
	contents: number;
	/** Per design part index: its cost and contents value. */
	byIndex: Map<number, { part: number; contents: number }>;
	/** Part ids without a `cost`. */
	uncosted: string[];
}

/** Units of each resource a design launches with, as the sim fills a new vessel (plan 097). */
export function designContents(
	design: VesselDesign,
	registries: CostRegistries
): Map<string, number> {
	const out = new Map<string, number>();
	for (const entry of design.parts) {
		const def = registries.parts.get(entry.part);
		if (!def) continue;
		for (const [moduleId, raw] of def.modules ?? []) {
			const module = registries.modules.get(moduleId);
			if (!module?.store) continue;
			const parsed = module.config
				? module.config.safeParse(raw)
				: { success: true, data: undefined };
			if (!parsed.success) continue;
			const state = module.state?.(parsed.data);
			for (const r of module.store.resources(parsed.data, state)) {
				out.set(r, (out.get(r) ?? 0) + module.store.amount(parsed.data, state, r));
			}
		}
	}
	return out;
}

/** What a design costs to launch with full tanks, as the sim fills a new vessel. */
export function designCost(design: VesselDesign, registries: CostRegistries): DesignCost {
	const byIndex = new Map<number, { part: number; contents: number }>();
	const uncosted = new Set<string>();
	let parts = 0;
	let contents = 0;
	for (const entry of design.parts) {
		const def = registries.parts.get(entry.part);
		if (!def) continue;
		if (def.cost === undefined) uncosted.add(def.id);
		const fresh: Array<{ module: ModuleDefinition; config: unknown; state: unknown }> = [];
		for (const [moduleId, raw] of def.modules ?? []) {
			const module = registries.modules.get(moduleId);
			if (!module?.store) continue;
			// The parse the loader already passed (plugin.ts `parseModuleConfig`); repeated here to apply defaults.
			const parsed = module.config
				? module.config.safeParse(raw)
				: { success: true, data: undefined };
			if (!parsed.success) continue;
			fresh.push({ module, config: parsed.data, state: module.state?.(parsed.data) });
		}
		const part = def.cost ?? 0;
		const inside = contentsValue(fresh, registries.resources);
		byIndex.set(entry.index, { part, contents: inside });
		parts += part;
		contents += inside;
	}
	return { total: parts + contents, parts, contents, byIndex, uncosted: [...uncosted].sort() };
}

/** Recovery fraction at great-circle distance `d` from the nearest recovery site (ADR 0113 point 6). */
export function recoveryFactor(distance: number, radius: number): number {
	return Math.max(0.1, 0.98 - 0.88 * Math.min(1, distance / (Math.PI * radius)));
}

/** Great-circle distance between two body-fixed unit directions on a sphere of `radius`. */
export function greatCircle(
	a: { x: number; y: number; z: number },
	b: { x: number; y: number; z: number },
	radius: number
): number {
	const dot = a.x * b.x + a.y * b.y + a.z * b.z;
	return radius * Math.acos(Math.max(-1, Math.min(1, dot)));
}

export interface RecoveryQuote {
	value: number;
	factor: number;
	/** Metres to the nearest recovery site; null off the root body. */
	distance: number | null;
	credit: number;
}

export const recoveryQuote = (
	value: number,
	distance: number | null,
	radius: number
): RecoveryQuote => {
	const factor = distance === null ? 0.1 : recoveryFactor(distance, radius);
	return { value, factor, distance, credit: value * factor };
};
