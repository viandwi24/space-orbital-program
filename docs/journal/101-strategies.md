# 101 — Strategies: bounded policies in Administration

**Plan:** plans/101-strategies.md · **Session:** Agent 3 (Dev C, Linux Mint, 2026-10-18), three-agent team mode · **ADRs:** [0187](../decisions/0187-strategies-bounded-multipliers-upkeep-slots-projection.md) (new), [0098](../decisions/0098-progression-economy-career-and-milestones.md) point 5, [0096](../decisions/0096-world-tick-background-operations-and-a-living-world.md) point 5, [0123](../decisions/0123-construction-on-the-tick-capacity-keys-upkeep.md) · **Research:** `refs/space-orbital-program-ui/docs/SCREENS.md` W5 (git-ignored); no new research note

**Status when written: criteria met here, handed over as `ready/101`.**

## What was done

| Where | What |
| --- | --- |
| `packages/core/src/strategies.ts` (new) | `STRATEGY_KEYS` (six keys with labels and bounds); `StrategyDefinition` and its schema, which fails a factor outside its bounds; `strategyMultipliers` (product, clamped); `strategyUpkeepCharge`; `offeredTo`; `SaveStrategies`; `StrategiesSnapshot` |
| `packages/core` | `ChargeDefinition.multiplier` and `chargeOn`'s lookup; `projectBalances` options `{ multiplier, extra }`; `buildingUpkeepCharges`; `ECONOMY_RULES.agencyType`; the `strategies` registry, `ctx.strategies`, report kind `strategy`; the commands `strategy-activate` and `strategy-end`; `Snapshot.strategies`; `SimSave.strategies` (optional); `API_VERSION` 0.1.65 (099 took 0.1.63, 128 0.1.64) |
| `packages/sdk` | `defineStrategy`; the keys and helpers re-exported |
| `packages/sim/src/strategies.ts` (new) | `multiplierOf`, upkeep charges, slots from `admin`, activate and end (agency type, duplicate, cooldown, slots with the upgrade text), the snapshot |
| `packages/sim` | the multipliers in `launchCost`, `creditRecovery`, `creditScience`, objective rewards (science, reputation, contract funds) and contract advances; upkeep and `budget` in `economyTick`; init, save and snapshot wired |
| `mods/stock` | six strategies (Reuse first, Science first, Public outreach, Lean operations, Commercial contracts, Budget lobbying); the government budget and public grant name `multiplier: 'budget'` |
| `apps/web` | `administration/strategies-model.ts` (`projectFunds`, `strategyCards`, the slots line, commands) and `StrategiesTab.svelte`. The Administration page's Strategies tab, and strategy slots in the agency strip. `loadContent().world` gains `charges` and `strategies` |
| tests | `packages/sim/test/strategies.test.ts` (6); the career bot with each stock strategy (`career-bot.test.ts`, 6); web `strategies-model.test.ts` (3, one of them running the sim for 90 days twice) |
| docs | ADR 0187; `simulation.md` gains "Strategies"; `plugin-system.md`; the guide's "Strategies"; the glossary |

## Decisions and deviations

- **Keys are fixed in core** (ADR 0187 point 1). Each acts in exactly one named place in the sim, so a mod cannot declare a key that nothing reads.
- **Upkeep is a charge**, booked on the 30-day charge days like the budget, so the projection uses the same code as the sim.
  - Building upkeep (096) was never in `projectBalances`. The first run differed from the projection by 1 200 funds a month, the legacy site's building upkeep. `buildingUpkeepCharges` now feeds the projection, and the screen's figure matches the sim to under one unit for 90 days.
- **No activation fee.** The plan names upkeep only (ADR 0187 alternatives).
- **The career bot per strategy runs in an agency that can afford the bot.**
  - A company has no budget, so the bot's monthly launches run it out of money with or without a strategy.
  - Strategies offered to government run there with a launch every 30 days.
  - The company and hybrid ones run in a hybrid world with a launch every 90 days; its grant pays for about one a quarter, and that baseline stays in the band.
- **Tuned:** Public outreach's upkeep went from 3 000 to 1 000 and Commercial contracts' from 1 500 to 1 000. At the old values the bot, which gains nothing from reputation or contracts, fell below the 25 000 floor.
- **Edits outside the plan's listed paths:**
  - `packages/core`, for keys, schema, protocol and save; ADR 0187 lists them as contracts;
  - `apps/web/src/lib/administration` and `lib/catalog.ts`;
  - `packages/sim/src/contracts.ts`, for the advance multiplier, since 099 merged during this plan.

## Measurements

Career bot, 3 600 days, seed 7, funds:

| Strategy | Agency, mission cadence | Min | Max | End |
|---|---|---|---|---|
| none (baseline) | government, 30 days | 82 009 | 196 573 | 196 573 |
| Reuse first | government, 30 days | 82 724 | 102 429 | 102 429 |
| Science first | government, 30 days | 58 773 | 99 809 | 76 573 |
| Public outreach | government, 30 days | 58 773 | 99 809 | 76 573 |
| Budget lobbying | government, 30 days | 82 009 | 364 573 | 364 573 |
| Lean operations | hybrid, 90 days | 46 201 | 99 015 | 60 601 |
| Commercial contracts | hybrid, 90 days | 58 935 | 99 409 | 76 335 |

The six bot runs add about 230 s to `bun run test` here (one run is about 35 s; M5 roughly a third of that).

## Follow-ups

- The director layer (programmes, board reviews, insurance, staff); an activation fee; strategies of agencies (126).
- A company-agency bot pattern (contracts and markets as income) for a stronger company guardrail.

## Verification output

```text
bun test packages/sim/test/strategies.test.ts     6 pass
bun test packages/sim/test/career-bot.test.ts     9 pass (plain, markets, contracts, six strategies; table above)
bun run --filter @orbital/web test -- src/lib/administration/strategies-model   3 passed
                                                  (projection = sim books for 90 days, within 1 funds)
bun run docs:check                                docs-check: OK (135 plans, 163 ADRs)
bun run test                                      1690 pass, 1 fail (715 s): the patch benchmark under load
                                                  (passes alone, M5-indicative)
bun run typecheck                                 exit 0
bun run --filter @orbital/web test                1006 passed, 1 skipped; 4 env-only import suites (no Node here)
bun run build                                     exit 0
```
