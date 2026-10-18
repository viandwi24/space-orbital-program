# 099 — Procedural contracts

**Plan:** plans/099-procedural-contracts.md · **Session:** Agent 3 (Dev C, Linux Mint, 2026-10-18), three-agent team mode · **ADRs:** [0186](../decisions/0186-procedural-contracts-templates-offers-slots-value.md) (new), [0098](../decisions/0098-progression-economy-career-and-milestones.md) point 4, [0175](../decisions/0175-objective-trees-scheduling-vessel-binding-and-save.md), [0123](../decisions/0123-construction-on-the-tick-capacity-keys-upkeep.md) · **Research:** `refs/space-orbital-program-ui/docs/SCREENS.md` W5 (git-ignored); no new research note

**Status when written: criteria met here, handed over as `ready/099`.**

## What was done

| Where | What |
| --- | --- |
| `packages/core/src/contracts.ts` (new) | template, blueprint, context and offer types with schemas; `SaveContracts`; `ContractsSnapshot`; the constants (cap 5, offer life 10 days, cooldown 15 days, tier reputation 0/100/300); `estimatedLaunchCost` (a base of 5 000 plus a Δv² term), `expectedValue`, `fundsOf` |
| `packages/core` | the `contractTemplates` registry, `ctx.contractTemplates`, report kind `contract-template`; the commands `contract-accept`, `contract-decline` and `contract-cancel`; `Snapshot.contracts`; `SimSave.contracts` (optional); `since` on objective instances; `API_VERSION` 0.1.62, since 116 took 0.1.60 and 097 0.1.61 |
| `packages/sdk` | `defineContractTemplate`; `estimatedLaunchCost`, `expectedValue`, the cost constants and `hohmannTransfer` re-exported |
| `packages/sim/src/contracts.ts` (new) | the generator on the world tick (expiry, cooldowns, a weighted pick, the `contracts` stream, de-duplication by key, unknown objectives dropped); `window()` by `hohmannToTarget`; accept, decline and cancel; slots from `mission-control`; the snapshot |
| `packages/sim` | `definitionOf` resolves `gen.*` from the contract state; `finishObjective` exported for cancel; `viewFor` honours `since`; the tick, the save, the snapshot and init wired |
| `mods/stock` | six templates: altitude record and orbit (tier 1), moon flyby and moon landing (tier 2), moon landing and return, and a sibling-planet flyby on the next transfer window (tier 3); the rule `stock.contracts` |
| `apps/web` | `/administration`: the agency strip, Contracts with Offered/Active/Completed, the detail (brief, objectives with checkboxes, advance, reward, penalty, deadline, expected value with its estimate) and Accept/Decline/Cancel; it saves after a change. A Strategies placeholder for 101. The Space Center's Administration opens it, and the Mission Center lists contracts by title |
| tests | `packages/sim/test/contracts.test.ts` (10); a contracts run of the career bot (`career-bot.test.ts`); web `administration/contracts-model.test.ts` (5) and the Space Center link; the SDK loader's report kinds |
| docs | ADR 0186; `simulation.md` gains "Procedural contracts"; `plugin-system.md`; the guide's "Contract templates"; the glossary |

## Decisions and deviations

- **Slots come from the Mission Center, not Administration.** ADR 0123 had already given `mission-control` (active contracts) to the Mission Center and `admin` (strategy slots) to Administration; the plan's line predates that. Administration is still where contracts are handled, as in the refs.
- **Only vessels launched after the acceptance count** (ADR 0186 point 3). The contract is otherwise unbound: any such vessel will do. Without this, a satellite already in orbit finished every new orbit contract at once. The instance keeps `since`, and the save field is optional.
- **Expected value in the sim uses a Δv rule of thumb.** The plan's "cheapest Hangar library design that meets the objective" needs the browser's library, which the sim never sees. The screen labels the value an estimate and shows the Δv and the cost behind it. The Hangar refinement is a follow-up.
- **No new transfer-window code.** `hohmannToTarget` (plan 045) already gives the next window and the transfer time. Stock has no sibling planet, so the planet template only offers in systems that have one (Sol).
- **Calibrated against the career bot.** The first margins (1.6 / 1.45 / 1.3 × cost) let the bot's funds reach 618 000 in 1 200 days, above the 500 000 band. A pure Δv² estimate also priced a sounding rocket at half its real cost.
  - The estimate gained a base of 5 000. A stock tank and engine cost about 8 300.
  - The margins became 1.2 / 1.25 / 1.3. Riskier tiers pay more.
  - The ten-year bot then holds the band: funds max 383 000, against 197 000 without contracts.
- **The bot's job is honest:** one altitude contract per monthly mission, flown by a bought sounding rocket placed above the altitude. It has no control source, so it becomes ballistic debris and is removed when it falls back (ADR 0021). Leaving pods in low orbit made every warp chunk small, and the run slowed down as they piled up.
- **Offers appear on world ticks.** The Space Center screens do not run the clock, so a new world shows offers after its first day in flight or warp. The empty list says so.

## Measurements

- Career bot, 3 600 days, seed 7:
  - **Without contracts:** funds min 82 009, max 197 048, about 31 s.
  - **With an altitude job per mission:** min 82 009, max 383 348, 119 contracts done, about 35 s.
  - **Ledger with contracts:** advances +193 500, rewards +978 500; the extra launches −986 000.
- Generator: at reputation 0 only tier 1 is open, so stock shows at most three offers (two altitude, one orbit). A test template with room for fifty stops at the cap of five, one new offer a day.

## Follow-ups

- The Hangar-based expected value (cheapest library design that meets the objective).
- Strategies (101) fill the Administration placeholder.
- Contract saturation for repeated kinds (ADR 0098), with markets (097).
- Reactive contracts from agencies (126); bidding.

## Verification output

```text
bun test packages/sim/test/contracts.test.ts      10 pass
bun test packages/sim/test/career-bot.test.ts     3 pass: plain max 196 573; markets max 365 903;
                                                  contracts 119 done, max 382 277 (band 25 000..500 000)
bun run docs:check                                docs-check: OK (135 plans, 160 ADRs)
bun run test                                      1663 pass, 1 fail (503 s): the patch benchmark under load
                                                  (passes alone, M5-indicative)
bun run typecheck                                 exit 0
bun run --filter @orbital/web test                1000 passed, 1 skipped; CreateWorld timed out once under load
                                                  (6/6 alone); 4 env-only import suites (no Node here)
bun run build                                     exit 0
```
