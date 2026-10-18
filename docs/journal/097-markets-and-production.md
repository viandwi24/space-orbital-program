# 097 — Markets and production: one commodity chain first

**Plan:** [plans/097-markets-and-production.md](../plans/097-markets-and-production.md) · **Session:** Agent 1 (Lead, MacBook Pro M5), 2026-10-18 · **ADRs:** [0124](../decisions/0124-markets-one-propellant-chain-site-storage-launch-fuel.md) (new), [0098](../decisions/0098-progression-economy-career-and-milestones.md), [0113](../decisions/0113-economy-core-ledger-costs-charges-recovery.md), [0123](../decisions/0123-construction-on-the-tick-capacity-keys-upkeep.md) · **Research:** none

**Status when written: criteria met.**

## What was done

| Where | What |
|---|---|
| `core/market.ts` | `CommodityDefinition`, `RecipeDefinition` and schemas; `MarketState`, `freshMarket`, `rawPrice`, `marketTick` (relax, price, clamp, cap, 90-day history); `storedUnits` |
| core | `commodities` and `recipes` registries (registrars, report sections); `SimSave.economy.markets` and `.storage` (optional); `designContents`; commands `market-buy`, `market-sell`; `Snapshot.economy.markets` and `.storage`; `CAPACITY.storage` in commodity units; API_VERSION 0.1.61 (116 took 0.1.60) |
| sdk | `defineCommodity`, `defineRecipe` |
| `sim/market.ts` | markets open lazily with the economy on; `launchQuote` (parts at static price, propellants from the launch site's storage then the market), `refuseLaunch` and `payLaunch` used by `load-vessel`; `marketBuy`, `marketSell`; `marketDay` on the world tick after the day's charges (production while funds ≥ 0, then each market's tick); `marketSnapshot` |
| `mods/stock/market.ts` | liquid fuel (0.8) and oxidizer (0.18) on the plan's market numbers, five fixed services, `stock.propellant-synthesis` (200 and 245 u a day in the propellant plant) |
| web | the Space Center's read-only Market panel (price, trend against base, units held) and "Production stopped: funds are below zero" in Needs attention |
| tests | core `market.test.ts` (3), sim `market.test.ts` (5), the career bot with markets (`career-bot.test.ts`), vitest `space-center/model.test.ts` (+2), e2e `space-center.e2e.ts` (the Market panel) |

## Numbers

- Selling 10 000 u of liquid fuel a day: the price falls by the 5 % cap for four days (0.76, 0.722, 0.686, 0.652), then follows the raw price down to the floor, 0.32 (0.4 × base). The stock settles at 40 000 + 10 000 / (1 − e^(−1/30)) ≈ 345 000 u. Without the sales, the stock relaxes back with a 30-day time constant and the price follows it up.
- Career bot with markets, 10 game years (120 missions; the plant is built in year 2 once 150 000 funds are held):
  - funds between 52 709 and 365 903;
  - income: government budget 70.3 %, recovery 23.6 %, sales 6.1 %;
  - 7.9 s in Bun on the M5.

  The bot without markets is unchanged: funds between 82 009 and 196 573.

## What surprised me

- **Upkeep is not daily.** The plan's gate, "upkeep paid that day", does not match 096, whose upkeep is charged every 30 days and may take funds below zero. Production now needs the world out of debt after the day's charges (ADR 0124 point 5).
- **No building supplies power** (every stock level draws). Sites are taken to be on a grid paid through upkeep; a power budget comes with off-world bases (128).
- **A market at its base price never rises above base without buyers.** Launches drawing fuel from storage take no buyers to the market, so a "sell above base" bot sold once and stopped. It now sells at 95 % of base or more.
- 095's launch test now sees three ledger entries (parts, then a purchase for each propellant). Their sum is still the design cost at the base price.

## How to test manually

1. Create a Career world and enter it: the Space Center's Market panel shows liquid fuel at 0.80 / u and oxidizer at 0.18 / u.
2. Build a propellant plant (80 000 funds, 10 days) and fly: once it is ready, the site holds 200 u of fuel and 245 u of oxidizer more each day, and a launch takes its propellant from there first.
