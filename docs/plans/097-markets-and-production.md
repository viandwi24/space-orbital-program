---
id: 097
title: "Markets and production: one commodity chain first"
status: in-progress
owner: "Agent 1"
depends: [095, 096]
phase: 6
created: 2026-10-17
updated: 2026-10-18
---

# 097 — Markets and production: one commodity chain first

## Goal

Commodities have prices that respond to supply and demand on the world tick with damping and caps; a production building (propellant plant, 090) turns power and upkeep into propellant in site storage; the player buys propellant at market price or makes it, and can sell surplus; services (launch, comms capacity, data, crew seats, insurance) are registered as commodities with fixed prices until their systems exist. The career bot stays inside its band with markets on.

## Context

- ADRs: 0098 (points 1 and 2, guardrails), 0096 (world tick), 0110, 0111, [0124](../decisions/0124-markets-one-propellant-chain-site-storage-launch-fuel.md) (written at claim: state, trade timing, production gate, launch fuel)
- Read: plan 095 (ledger, `vesselCost`, resource `price`, career bot), plan 096 (building levels, upkeep, storage capacity), plan 082 (world tick, PRNG streams), `refs/reverse-engineering-ksp2/beyond/03-world-and-economy-dynamics.md` §2.2.
- Start with one chain (propellant: liquid fuel and oxidizer) and add more only after the first is fun (ADR 0098 guardrail).

## Scope

**In:**
- **`defineCommodity`** `{ id, label, unit, basePrice, resource?, market: { target, elasticity, cap, floor, ceiling, relaxDays } | 'fixed' }`: a commodity tied to a `resource` sets that resource's price for launches (replacing 095's static `price` while markets are on). Stock: `stock.liquid-fuel` and `stock.oxidizer` (resource-backed, base 0.8 and 0.18 as in 095), and fixed-price services `stock.launch-service`, `stock.comms-capacity`, `stock.data`, `stock.crew-seat`, `stock.insurance` (price only, no trade yet).
- **`defineRecipe`** `{ id, building, inputs: Record<commodity|'power', perDay>, outputs: Record<commodity, perDay> }`: stock `stock.propellant-synthesis` in `stock.propellant-plant`, 200 liquid fuel and 245 oxidizer per day at level 1 (×2, ×4 at levels 2, 3), power from the building level (096).
- **Market model** (pure, core `market.ts`), once per world tick for each traded commodity, in this order: (1) world demand relaxes stock toward target, `stock += (target − stock) × (1 − e^(−1/relaxDays))`; (2) the day's player trades and production change `stock`; (3) `raw = base × (target / max(stock, 1))^elasticity`, clamped to `[floor × base, ceiling × base]`; (4) the new price moves from the old one by at most `cap × old`. Stock values: target 50 000 units, elasticity 0.5, cap 0.05 per day, floor 0.4, ceiling 2.5, relaxDays 30. No PRNG (ADR 0098: deterministic unless a recipe declares variance).
- **Market state** `SimSave.economy.markets = { [commodity]: { price, stock, history } }` (`history`: the last 90 daily prices), additive inside 095's `economy` field.
- **Site storage** per site and commodity, capacity from the storage-providing building's level (096); production stops at capacity.
- **Trades:** commands `market-buy` and `market-sell { commodity, amount, site }`, priced at today's price, ledger entries `stock.market-buy` / `stock.market-sell` with the price in `ref`; refused when funds or storage are short. **Launch fuel:** at `load-vessel`, contents are drawn from the launch site's storage first and the rest bought at the market price (two ledger entries: parts at `vesselCost` without contents, fuel at market).
- **Production:** each tick a powered plant whose upkeep was paid that day (096's charge accepted) adds its outputs to storage; unpaid upkeep or no power means nothing that day, with a "Needs attention" reason for the HUD.
- **Economy panel data** (snapshot or a query): price, stock, 90-day history and the ledger causes behind today's change.
- Markets are off with `stock.economy` off (Sandbox): no trades, no production costs, fuel free.

**Out:** agencies as market actors (126); interplanetary logistics (128); more chains (ore, metals) until the propellant chain is judged fun by a human pass; a market UI beyond the panel data (a later UI plan).

## Touches

- **Size:** L
- **Edits:** `packages/core` (`market.ts` new, commodity and recipe schemas and registries), `packages/sdk` (`defineCommodity`, `defineRecipe`), `packages/sim` (market tick system, trades, launch fuel, storage), `mods/stock` (commodities, recipe), `apps/web/src/routes/space-center` (panel data only)
- **Shared contracts:** **SDK (`defineCommodity`, `defineRecipe`), save (`economy.markets`, site storage; additive), protocol (`market-buy`, `market-sell`)**

## Design notes

Prices and stocks are deterministic tick functions of the day's inputs, so a resumed world prices the same. The model is the same for every commodity; numbers are data, patchable (079). The career bot of 095 gains a policy: buy fuel at launch, and from year 2 build a propellant plant and sell surplus whenever the price is above base.

## Steps

1. Commodity and recipe registries; stock data.
2. `market.ts` with tests for relaxation, damping, caps, floor and ceiling.
3. Site storage, the propellant plant recipe on the tick, upkeep and power gates.
4. Trades, launch fuel from storage then market, ledger entries.
5. Career-bot band test with markets; panel data.

## Acceptance criteria

- [x] `packages/core` test: selling 10 000 units every day lowers the price by at most 5 % per tick and settles at `0.4 × base`; stopping the sales lets the price return toward base as the stock relaxes (hand-computed table for 10 days).
- [x] `packages/sim` test: a level 1 propellant plant with power and paid upkeep adds exactly 200 × days liquid fuel and 245 × days oxidizer to storage, stops at capacity, and adds nothing on a day its upkeep was refused.
- [x] `packages/sim` test: a launch draws its fuel from site storage first and buys the rest at today's price; the two ledger entries add up to the debit.
- [x] `packages/sim` resume test: markets and storage resume byte for byte after 30 days of trades.
- [x] Career-bot test with markets on, 10 game years: funds stay between 25 000 and 500 000; no income source (budget, recovery, sales) exceeds 80 % of income (099 lowers this when contracts exist); under 30 s in Bun on the M5.
- [x] `bun run test`, web vitest, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/097-markets-and-production.md` written.
- [x] `architecture/simulation.md` (markets), `guides/writing-a-mod.md`.
- [x] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0098).
- 2026-10-17 — Refined by Agent 1 while waiting (body only, status stays `draft`): commodity and recipe shapes, a deterministic market model with its stock numbers, storage and upkeep gates, launch fuel from storage then market, trades as commands with ledger entries, measurable criteria tied to 095's career bot and 096's levels.
- 2026-10-18 — Claimed by Agent 1 after 096 merged. ADR 0124: market and storage state in `SimSave.economy` (optional), trades move the market stock at once and the tick relaxes and prices it, production needs the world out of debt after the day's charges (096's upkeep is monthly and may go negative), power from the site grid until 128, launch fuel from the launch site's storage then the market (two kinds of ledger entries), a read-only Market panel in the Space Center. `CAPACITY.storage` is in commodity units. The bot's sale threshold is 95 % of base (at base exactly a market never rises above it without buyers) and it builds the plant in year 2 once it holds 150 000 funds. API_VERSION 0.1.60.
- 2026-10-18 — Criteria: core `market.test.ts` (the 10-day table, the floor at 0.4 × base, the climb back), sim `market.test.ts` (200 and 245 u a day, capacity, nothing on a day in debt, launch fuel from storage then market, trades, byte-for-byte resume after 30 days of trades), `career-bot.test.ts` with markets (funds 52 709 to 365 903, budget 70.3 %, recovery 23.6 %, sales 6.1 % of income, 7.9 s); full checks in the journal.
