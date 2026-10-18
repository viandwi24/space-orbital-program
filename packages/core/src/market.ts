/**
 * Markets and production (plan 097, ADR 0124): commodities and recipes as data, the market model
 * run once per world tick, and the market and storage state the ledger saves. Pure functions; the
 * sim owns the state.
 */
import * as z from 'zod';
import { definitionIdSchema } from './schemas.ts';

export interface MarketParams {
	/** The stock world demand relaxes toward, units. */
	target: number;
	/** Price exponent of `target / stock`. */
	elasticity: number;
	/** Largest price change per tick, a fraction of the old price. */
	cap: number;
	/** Lowest and highest price, fractions of the base price. */
	floor: number;
	ceiling: number;
	/** Time constant of the relaxation, days. */
	relaxDays: number;
}

export interface CommodityDefinition {
	/** `<plugin>.<name>`. */
	id: string;
	label: string;
	unit: string;
	/** Funds per unit at the target stock. */
	basePrice: number;
	/** The resource whose launch contents this commodity prices (ADR 0124 point 6). */
	resource?: string;
	/** A traded market, or a fixed price with no trade yet. */
	market: MarketParams | 'fixed';
}

export interface RecipeDefinition {
	/** `<plugin>.<name>`. */
	id: string;
	label: string;
	/** The building kind that runs it. */
	building: string;
	/** Per day at production factor 1 (ADR 0124 point 1); `power` is kW, not traded. */
	inputs: Record<string, number>;
	outputs: Record<string, number>;
}

const finite = z.number().refine(Number.isFinite, 'expected a finite number');
const positive = z.number().positive();

export const marketParamsSchema = z
	.object({
		target: positive,
		elasticity: z.number().nonnegative(),
		cap: z.number().positive().max(1),
		floor: positive,
		ceiling: positive,
		relaxDays: positive
	})
	.refine((m) => m.floor <= 1 && m.ceiling >= 1, 'floor must be at most 1 and ceiling at least 1');

export const commodityDefinitionSchema = z.object({
	id: definitionIdSchema,
	label: z.string().min(1),
	unit: z.string().min(1),
	basePrice: z.number().nonnegative(),
	resource: z.string().min(1).optional(),
	market: z.union([z.literal('fixed'), marketParamsSchema])
});

export const recipeDefinitionSchema = z.object({
	id: definitionIdSchema,
	label: z.string().min(1),
	building: z.string().min(1),
	inputs: z.record(z.string(), z.number().nonnegative()),
	outputs: z.record(z.string(), z.number().positive())
});

/** One traded commodity's state (`SimSave.economy.markets`). */
export interface MarketState {
	price: number;
	/** Units the world holds; buying takes from it, selling adds to it. */
	stock: number;
	/** The last `HISTORY_DAYS` daily prices, oldest first. */
	history: number[];
}

export const HISTORY_DAYS = 90;

export const marketStateSchema = z.object({
	price: finite,
	stock: finite,
	history: z.array(finite)
});
/** Site id to commodity id to units. */
export const siteStorageSchema = z.record(z.string(), z.record(z.string(), finite));
export type SiteStorage = Record<string, Record<string, number>>;

/** A market as it opens (ADR 0124 point 2). */
export const freshMarket = (def: CommodityDefinition & { market: MarketParams }): MarketState => ({
	price: def.basePrice,
	stock: def.market.target,
	history: []
});

export const isTraded = (
	def: CommodityDefinition
): def is CommodityDefinition & { market: MarketParams } => def.market !== 'fixed';

/** The price the stock alone gives, before the daily cap (ADR 0124 point 3, steps 2). */
export function rawPrice(base: number, m: MarketParams, stock: number): number {
	const raw = base * Math.pow(m.target / Math.max(stock, 1), m.elasticity);
	return Math.min(m.ceiling * base, Math.max(m.floor * base, raw));
}

/** One world tick of a market: relax the stock, price it, cap the move, keep the history. */
export function marketTick(state: MarketState, base: number, m: MarketParams): MarketState {
	const stock = state.stock + (m.target - state.stock) * (1 - Math.exp(-1 / m.relaxDays));
	const raw = rawPrice(base, m, stock);
	const step = m.cap * state.price;
	const price = Math.min(state.price + step, Math.max(state.price - step, raw));
	const history = [...state.history, price].slice(-HISTORY_DAYS);
	return { price, stock, history };
}

/** Units in a site's storage over all commodities. */
export const storedUnits = (items: Readonly<Record<string, number>> | undefined): number =>
	Object.values(items ?? {}).reduce((s, v) => s + v, 0);
