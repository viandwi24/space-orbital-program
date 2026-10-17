# 095 — Economy core: currencies, ledger, part costs and recovery

**Plan:** plans/095-economy-core-currencies-ledger-costs.md · **Session:** Agent 1 (Lead, MacBook Pro M5), 2026-10-17 · **ADRs:** [0113](../decisions/0113-economy-core-ledger-costs-charges-recovery.md) (new), [0098](../decisions/0098-progression-economy-career-and-milestones.md), [0171](../decisions/0171-world-tick-day-length-timing-and-save-fields.md), [0111](../decisions/0111-world-rules-values-in-world-info-set-rule-and-changelog.md) · **Research:** none

**Status when written: criteria met** except the HUD recovery dialog, moved to draft 132 (see below).

## What was done

| Where | What |
|---|---|
| `packages/core/src/economy.ts` | currencies, `LedgerEntry`, `SaveEconomy`, `ChargeDefinition` and schema, `chargeOn`, `projectBalances`, reputation decay and clamp, `designCost`, `contentsValue`, `recoveryFactor`, `greatCircle`, `recoveryQuote`, `ECONOMY_RULES`, `ECONOMY_CAUSES` |
| `packages/core` schemas, registry, plugin, protocol, events, save | `cost` on parts, `price` on resources, `charges` registry and `ctx.charges`, `recover-vessel`, `Snapshot.economy`, `VesselSnapshot.recovery`, `economy:entry`, optional `SimSave.economy`; `API_VERSION` 0.1.30 |
| `packages/sdk` | `defineCharge` and the economy helpers and types |
| `packages/sim/src/economy.ts` and wiring | ledger state, launch check and debit in `load-vessel`, `recover-vessel`, charges and decay in the world tick, snapshot fields, save and resume |
| `mods/stock` | `costs.ts` (class rates, prices), costs on all 17 parts, prices on the 4 resources, `stock.starting-funds`, `charges.ts` (government and hybrid budget, operations) |
| `apps/web/src/lib/vab` | the stats strip shows the launch cost and "no cost set" |
| tests | `packages/core/test/economy.test.ts`, `packages/sim/test/economy.test.ts`, `packages/sim/test/career-bot.test.ts` with `helpers/career-bot.ts`, `StatsStrip.test.ts` |

## Numbers

- `twoStage` / `referenceTwoStage`: parts 25 250 + contents 816.4 = **26 066.4 funds** (by hand: pod 840 kg × 10, wheel 100 × 10, two tanks 250 × 1.5, two engines 1 250 × 6, decoupler 50 × 2; per tank 400 u × 0.8 + 490 u × 0.18).
- Pod recovered on the pad: 8 400 × 0.98 = 8 232; 40 km downrange: factor 0.9613, 8 075.
- **Career bot**, 3 600 game days (120 missions of 30 days, a day is 21 600 s): funds min **82 009**, max **341 048** (band 25 000 to 500 000), end 341 048; launches −3 127 968, recoveries +969 016, government budget +2 880 000, operations −480 000; **3.1 s** in Bun on the M5. Income share: the budget is 75 % of income; the share limit belongs to 099 (contracts), so this test does not assert one.

## Decisions and surprises

- **A "game year" is not a year here.** The tick day is the home body's 6-hour rotation (ADR 0171), so 3 600 days is 2.5 Earth-years of game time but 120 missions of 30 days, which is what the plan meant by "10 years". 081 (calendar) will name the year.
- **Contents through module stores.** The value of a part's contents needed no stock knowledge in core: `designCost` builds each store module's state from its parsed config, as the sim does for a new vessel, and asks the store for its amounts. The live value uses the same `contentsValue`, so an untouched vessel recovers at what it cost.
- **The career bot uses only real commands.** It cannot fly, so it switches the economy off for a moment (`set-rule`) to clear the pad and put the pod down 40 km east, which logs two rule changes per mission. A bot that flies the rocket by script is a later improvement.
- **No speed factor in recovery** (ADR 0113 point 6): hard landings already break parts.
- The sim names three stock rule ids (`ECONOMY_RULES`); without stock the economy is simply off.

## Not met / not done

- **HUD recovery dialog** (Touches named it): the sim exposes `VesselSnapshot.recovery` and the command, but no button or dialog exists yet. Moved to draft **132** so the economy contract could land now.
- Company and hybrid funding sources (101), salaries (106/107), building upkeep (096), markets (097), the income-share limit (099).
