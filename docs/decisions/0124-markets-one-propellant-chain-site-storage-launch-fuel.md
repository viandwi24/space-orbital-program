# 0124 — Markets: one propellant chain, site storage, launch fuel from storage then market

**Status:** accepted
**Date:** 2026-10-18
**Plan:** [097](../plans/097-markets-and-production.md)
**Builds on:** ADR 0098 points 1 and 2 and its guardrails, ADR 0113 (ledger, charges, costs), ADR 0123 (building levels, upkeep, capacity keys), ADR 0171 (world tick)

## Context

Plan 097 fixes the commodity and recipe shapes and the market model's numbers. Three things it leaves open meet what plans 095 and 096 built:

- Upkeep is charged every 30 days and may take funds below zero (ADR 0123 point 5). The plan's gate "upkeep paid that day" has no daily charge to look at.
- No stock building supplies power: every level draws (`power` ≥ 0).
- The plan does not say where storage and market state live, or when a trade moves the market.

## Decision

1. **Commodities and recipes are registries.**
   - `defineCommodity { id, label, unit, basePrice, resource?, market: { target, elasticity, cap, floor, ceiling, relaxDays } | 'fixed' }`.
   - `defineRecipe { id, label, building, inputs, outputs }`, with amounts per day at the production factor 1.
   - A recipe's rate is scaled by the building level's `production` capacity (stock propellant plant: 1, 2 and 4).
   - Fixed commodities have a price and cannot be traded yet (`market-buy` refuses them).
2. **Market state lives in the ledger's save.**
   - `SimSave.economy.markets[commodity] = { price, stock, history }`, where `history` is the last 90 daily prices.
   - `SimSave.economy.storage[site][commodity] = amount`.
   - Both fields are optional and additive, so the save format does not change.
   - Markets start on the first world tick or the first trade with the economy on, at `{ price: base, stock: target }`.
   - Worlds with the economy off never write these fields.
3. **A trade moves the market at once; the tick relaxes and prices it.**
   - A buy takes units out of the market stock at today's price; a sale puts them in.
   - On each world tick the market model runs once per traded commodity:
     1. relax the stock toward the target: `stock += (target − stock)(1 − e^(−1/relaxDays))`;
     2. compute the raw price: `raw = base (target / max(stock, 1))^elasticity`, clamped to `[floor, ceiling] × base`;
     3. move the price by at most `cap ×` the old price.
   - The model is pure (`core/market.ts`) and draws no random numbers, so a resumed world prices the same.
4. **Site storage.**
   - A site holds commodities up to its `storage` capacity (ADR 0123), counted in commodity units over all commodities. The `CAPACITY` unit of `storage` becomes `u`.
   - A site with no storage building holds nothing: production and purchases into storage need one.
5. **Production gate.**
   - On each world tick, every working building that has a recipe adds its outputs to its site's storage, up to capacity.
   - It needs the world out of debt after that tick's charges: funds ≥ 0 after the upkeep, charges and salaries of the day. A day in debt makes nothing, and the Space Center lists it in "Needs attention" ("Production stopped: funds are below zero").
   - Power comes from the site's grid, paid through upkeep; a power budget arrives with off-world bases (plan 128), where no grid exists.
6. **Launch fuel.**
   - At `load-vessel` with markets on, the design's contents of each resource-backed commodity come from the launch site's storage first; the rest is bought at today's price, which moves the market.
   - The ledger shows two entries:
     - `economy.launch`: the parts, plus contents that no commodity covers, at their static price;
     - `stock.market-buy`: the bought fuel, with `ref` = `"<commodity> ×<amount> @<price>"`, one entry per commodity.
   - The refusal for funds uses the same quote.
   - The launch site is the placement's site, else the primary site.
7. **Trades.**
   - `market-buy { commodity, amount, site }` is refused when funds or storage room are short.
   - `market-sell { commodity, amount, site }` is refused when the site's storage holds less than the amount.
   - Ledger causes are `stock.market-buy` and `stock.market-sell`.
8. **Snapshot.** `Snapshot.economy` gains:
   - `markets`: an array of `{ id, label, unit, base, price, stock, history }`;
   - `storage`: an array of `{ site, capacity, items }`.

   The Space Center shows them read-only in a "Market" panel. A trading UI is a later plan.

## Consequences

- The career bot's policy grows: launches buy fuel through the market; from year 2 it builds a propellant plant and sells storage above 5 000 units of each commodity when the price is above base.
- More chains (ore, metals) wait until a human finds this one fun (ADR 0098 guardrail).
- Agencies as market actors come with plan 126.
