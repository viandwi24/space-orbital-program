/**
 * Markets and production in the sim (plan 097, ADR 0124): markets open with the economy, launch fuel
 * comes from the launch site's storage then the market, recipes fill site storage on the world
 * tick, `market-buy` and `market-sell`, and the snapshot view. The model is core's `market.ts`.
 */
import {
	designContents,
	freshMarket,
	isTraded,
	marketTick,
	siteCapacity,
	sitesOf,
	storedUnits,
	workingLevel,
	type CommandResult,
	type CommodityDefinition,
	type MarketParams,
	type MarketState,
	type VesselDesign
} from '@orbital/core';
import type { SimCore } from './core.ts';
import { drill, routesTick } from './bases.ts';
import {
	chargeLaunch,
	costMultiplier,
	economyOn,
	launchCost,
	launchRefusal,
	record
} from './economy.ts';

export const MARKET_CAUSES = { buy: 'stock.market-buy', sell: 'stock.market-sell' } as const;

const refuse = (reason: string): CommandResult => ({ ok: false, reason });
const traded = (core: SimCore): Array<CommodityDefinition & { market: MarketParams }> =>
	core.registries.commodities.list().filter(isTraded);

/** The market of a traded commodity, opened at base price and target stock (ADR 0124 point 2). */
function marketOf(core: SimCore, def: CommodityDefinition & { market: MarketParams }): MarketState {
	const markets = (core.economy.markets ??= {});
	return (markets[def.id] ??= freshMarket(def));
}

/** Today's price of a traded commodity, funds per unit, after the cost multiplier. */
export const priceOf = (
	core: SimCore,
	def: CommodityDefinition & { market: MarketParams }
): number => marketOf(core, def).price * costMultiplier(core);

const storageOf = (core: SimCore, site: string): Record<string, number> => {
	const storage = (core.economy.storage ??= {});
	return (storage[site] ??= {});
};

/** A site's storage capacity in commodity units, 0 without a storage building (ADR 0124 point 4). */
function capacityOf(core: SimCore, siteId: string): number {
	const site = sitesOf(core.info).find((s) => s.id === siteId);
	return site ? (siteCapacity(site, core.registries.buildings, 'storage') ?? 0) : 0;
}

export interface LaunchQuote {
	/** The parts and any contents no commodity covers, at their static prices. */
	parts: number;
	fuel: Array<{ commodity: string; need: number; fromStorage: number; buy: number; price: number }>;
	total: number;
}

/** What a launch of `design` from `site` costs with markets open (ADR 0124 point 6). */
export function launchQuote(
	core: SimCore,
	design: VesselDesign,
	site: string | undefined
): LaunchQuote {
	const k = costMultiplier(core);
	const contents = designContents(design, core.registries);
	const held = site ? (core.economy.storage?.[site] ?? {}) : {};
	let parts = launchCost(core, design);
	const fuel: LaunchQuote['fuel'] = [];
	for (const def of traded(core)) {
		if (!def.resource) continue;
		const need = contents.get(def.resource) ?? 0;
		if (need <= 0) continue;
		// the static price of these contents leaves the parts entry (ADR 0124 point 6)
		parts -= need * (core.registries.resources.get(def.resource)?.price ?? 0) * k;
		const fromStorage = Math.min(need, held[def.id] ?? 0);
		const buy = need - fromStorage;
		fuel.push({ commodity: def.id, need, fromStorage, buy, price: priceOf(core, def) });
	}
	const total = parts + fuel.reduce((s, f) => s + f.buy * f.price, 0);
	return { parts: Math.max(0, parts), fuel, total };
}

/** Markets are open with the economy on and a traded commodity registered. */
export const marketsOpen = (core: SimCore): boolean => economyOn(core) && traded(core).length > 0;

/** The funds refusal of a launch, priced through the markets when they are open. */
export function refuseLaunch(
	core: SimCore,
	design: VesselDesign,
	site: string | undefined
): string | undefined {
	if (!marketsOpen(core)) return launchRefusal(core, design);
	const cost = launchQuote(core, design, site).total;
	const funds = core.economy.balances.funds;
	return cost > funds
		? `Not enough funds: needs ${Math.ceil(cost)}, has ${Math.floor(funds)}`
		: undefined;
}

/** Pay a launch: through the markets when they are open, else as plan 095 does. */
export function payLaunch(core: SimCore, design: VesselDesign, site: string | undefined): void {
	if (marketsOpen(core)) chargeLaunchWithMarkets(core, design, site);
	else chargeLaunch(core, design);
}

/** The launch site of a placement: its site, else the primary site. */
export const launchSiteOf = (
	core: SimCore,
	placement: { kind: string; site?: string } | undefined
): string | undefined =>
	placement?.kind === 'site' && placement.site ? placement.site : sitesOf(core.info)[0]?.id;

/** Pay a launch with markets open: the parts, then the fuel taken from storage or bought. */
export function chargeLaunchWithMarkets(
	core: SimCore,
	design: VesselDesign,
	site: string | undefined
): void {
	const quote = launchQuote(core, design, site);
	if (quote.parts > 0) record(core, 'funds', -quote.parts, 'economy.launch', design.name);
	for (const f of quote.fuel) {
		if (f.fromStorage > 0 && site) storageOf(core, site)[f.commodity]! -= f.fromStorage;
		if (f.buy <= 0) continue;
		const def = core.registries.commodities.get(f.commodity)!;
		if (isTraded(def)) marketOf(core, def).stock -= f.buy;
		record(
			core,
			'funds',
			-f.buy * f.price,
			MARKET_CAUSES.buy,
			tradeRef(f.commodity, f.buy, f.price)
		);
	}
}

const tradeRef = (commodity: string, amount: number, price: number): string =>
	`${commodity} ×${round(amount)} @${round(price, 4)}`;
const round = (v: number, digits = 2): number => Math.round(v * 10 ** digits) / 10 ** digits;

function tradeCheck(
	core: SimCore,
	command: { commodity: string; amount: number; site: string }
): { def: CommodityDefinition & { market: MarketParams } } | { reason: string } {
	if (!economyOn(core)) return { reason: 'markets are closed: the economy is off in this world' };
	const def = core.registries.commodities.get(command.commodity);
	if (!def) return { reason: `unknown commodity "${command.commodity}"` };
	if (!isTraded(def)) return { reason: `${def.label} has a fixed price and is not traded yet` };
	if (!sitesOf(core.info).some((s) => s.id === command.site))
		return { reason: `unknown site "${command.site}"` };
	if (!(command.amount > 0)) return { reason: 'the amount must be more than 0' };
	return { def };
}

/** `market-buy` (ADR 0124 point 7): today's price into the site's storage. */
export function marketBuy(
	core: SimCore,
	command: { commodity: string; amount: number; site: string }
): CommandResult {
	const check = tradeCheck(core, command);
	if ('reason' in check) return refuse(check.reason);
	const price = priceOf(core, check.def);
	const cost = price * command.amount;
	const funds = core.economy.balances.funds;
	if (cost > funds)
		return refuse(`Not enough funds: needs ${Math.ceil(cost)}, has ${Math.floor(funds)}`);
	const held = storageOf(core, command.site);
	const room = capacityOf(core, command.site) - storedUnits(held);
	if (command.amount > room) {
		return refuse(`not enough storage at the site: room for ${Math.max(0, Math.floor(room))} u`);
	}
	marketOf(core, check.def).stock -= command.amount;
	held[check.def.id] = (held[check.def.id] ?? 0) + command.amount;
	record(core, 'funds', -cost, MARKET_CAUSES.buy, tradeRef(check.def.id, command.amount, price));
	return { ok: true };
}

/** `market-sell` (ADR 0124 point 7): from the site's storage at today's price. */
export function marketSell(
	core: SimCore,
	command: { commodity: string; amount: number; site: string }
): CommandResult {
	const check = tradeCheck(core, command);
	if ('reason' in check) return refuse(check.reason);
	const held = storageOf(core, command.site);
	const have = held[check.def.id] ?? 0;
	if (command.amount > have) {
		return refuse(`the site holds ${Math.floor(have)} u of ${check.def.label}`);
	}
	const price = priceOf(core, check.def);
	marketOf(core, check.def).stock += command.amount;
	held[check.def.id] = have - command.amount;
	record(
		core,
		'funds',
		price * command.amount,
		MARKET_CAUSES.sell,
		tradeRef(check.def.id, command.amount, price)
	);
	return { ok: true };
}

/**
 * The world tick's market work (ADR 0124 points 3 and 5), after the day's charges: production into
 * site storage while the world is out of debt, then each traded market relaxes and is priced.
 */
export function marketDay(core: SimCore, day: number): void {
	if (!economyOn(core)) return;
	if (core.economy.balances.funds >= 0) {
		// the outposts' drills first, so a base's ISRU plant runs on the day's ice (plan 128, ADR 0125)
		drill(core, (site) => storageOf(core, site));
		produce(core);
	}
	routesTick(
		core,
		day,
		(site) => storageOf(core, site),
		(commodity) => {
			const def = core.registries.commodities.get(commodity);
			return def && isTraded(def) ? priceOf(core, def) : undefined;
		},
		(commodity, amount) => {
			const def = core.registries.commodities.get(commodity);
			if (def && isTraded(def)) marketOf(core, def).stock -= amount;
		}
	);
	for (const def of traded(core)) {
		const markets = (core.economy.markets ??= {});
		markets[def.id] = marketTick(marketOf(core, def), def.basePrice, def.market);
	}
}

function produce(core: SimCore): void {
	const recipes = core.registries.recipes.list();
	if (recipes.length === 0) return;
	for (const site of sitesOf(core.info)) {
		const capacity = capacityOf(core, site.id);
		for (const b of site.buildings ?? []) {
			const at = workingLevel(b);
			if (at === null) continue;
			const levels = core.registries.buildings.get(b.kind)?.levels;
			const factor = levels?.[Math.min(at, levels.length - 1)]?.capacity.production ?? 1;
			for (const recipe of recipes) {
				if (recipe.building !== b.kind) continue;
				const held = storageOf(core, site.id);
				// the share of a full day the stored inputs allow (plan 128, ADR 0125 point 5); power is not stored
				let share = 1;
				for (const [input, perDay] of Object.entries(recipe.inputs)) {
					if (input === 'power' || perDay <= 0) continue;
					share = Math.min(share, (held[input] ?? 0) / (perDay * factor));
				}
				if (share <= 0) continue;
				for (const [input, perDay] of Object.entries(recipe.inputs)) {
					if (input === 'power' || perDay <= 0) continue;
					held[input] = (held[input] ?? 0) - perDay * factor * share;
				}
				for (const [commodity, perDay] of Object.entries(recipe.outputs)) {
					const room = capacity - storedUnits(held);
					const add = Math.min(perDay * factor * share, Math.max(0, room));
					if (add > 0) held[commodity] = (held[commodity] ?? 0) + add;
				}
			}
		}
	}
}

/** `Snapshot.economy.markets` and `.storage` (ADR 0124 point 8); absent with the economy off. */
export function marketSnapshot(core: SimCore):
	| {
			markets: Array<{
				id: string;
				label: string;
				unit: string;
				base: number;
				price: number;
				stock: number;
				history: number[];
			}>;
			storage: Array<{ site: string; capacity: number; items: Record<string, number> }>;
			routes?: Array<{
				id: string;
				from: string;
				to: string;
				commodity: string;
				amount: number;
				nextDay: number;
			}>;
	  }
	| undefined {
	if (!economyOn(core)) return undefined;
	const k = costMultiplier(core);
	const markets = core.registries.commodities.list().map((def) => {
		const m = isTraded(def) ? core.economy.markets?.[def.id] : undefined;
		return {
			id: def.id,
			label: def.label,
			unit: def.unit,
			base: def.basePrice * k,
			price: (m?.price ?? def.basePrice) * k,
			stock: m?.stock ?? (isTraded(def) ? def.market.target : 0),
			history: (m?.history ?? []).map((p) => p * k)
		};
	});
	const storage = sitesOf(core.info)
		.map((s) => ({
			site: s.id,
			capacity: capacityOf(core, s.id),
			items: { ...(core.economy.storage?.[s.id] ?? {}) }
		}))
		.filter((s) => s.capacity > 0 || storedUnits(s.items) > 0);
	const routes = (core.economy.routes ?? []).map((r) => ({ ...r }));
	return { markets, storage, ...(routes.length > 0 ? { routes } : {}) };
}
