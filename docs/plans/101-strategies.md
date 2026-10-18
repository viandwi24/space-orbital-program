---
id: 101
title: "Strategies: bounded policies in Administration"
status: done
owner: "Agent 3"
depends: [095, 096]
phase: 6
created: 2026-10-17
updated: 2026-10-18
---

# 101 — Strategies: bounded policies in Administration

## Goal

The player activates strategies (for example "reuse first", "science first", "public outreach") that change economy multipliers within stated bounds, each showing its ratio, cap, an N-day projection and its upkeep before activation; the agency type (government, company, hybrid) decides which are offered.

## Context

- ADRs: 0098, [0187](../decisions/0187-strategies-bounded-multipliers-upkeep-slots-projection.md) (this plan)
- Read: ADR 0098 point 5, ADR 0096 point 5, `refs/space-orbital-program-ui/docs/SCREENS.md` (Administration strategies).

## Scope

**In:**
- `defineStrategy({ id, effects: [multiplier keys with bounds], upkeep, agencyTypes, slots })`.
- Activation, end and a cooldown; Administration slots.
- Projection: the ledger projection of 095 with and without the strategy.
- Stock strategies (4 to 6).

**Out:** the director layer (programmes, board, insurance, staff): a later plan.

## Touches

- **Size:** M
- **Edits:** `packages/sdk`, `packages/sim`, `mods/stock`, `apps/web/src/routes/administration`
- **Shared contracts:** **SDK (`defineStrategy`), save (active strategies)**

## Design notes

Every multiplier key is declared with min and max; a strategy exceeding them fails validation.

## Steps

1. Schema and registry.
2. Activation and effects.
3. Projection and UI.

## Acceptance criteria

- [x] `packages/sim` test: a strategy's effect never exceeds its declared bounds even with two strategies on the same key.
- [x] vitest: the projection shown before activation equals the sim's projection after activation for the first N days within 1 funds unit.
- [x] Career-bot test with each stock strategy stays in the band.
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/101-strategies.md` written.

- [x] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0098).
- 2026-10-17 — `depends` gains 096 (three-agent roadmap review, `docs/roadmap/team-development-roadmap.md` "Notes for the Lead"): strategy slots come from the Administration level of plan 096.
- 2026-10-18 — Claimed by Agent 3 (`claim/101`, branch `devc/101-strategies`).
- 2026-10-18 — ADR 0187 covers:
  - six keys declared in core with bounds, and the product of active strategies clamped to them;
  - upkeep as a 30-day charge;
  - slots from Administration's `admin` capacity, and a 30-day cooldown;
  - the projection as `projectBalances` with multipliers and extra charges, the buildings' upkeep included.
- 2026-10-18 — Done here, handed over as `ready/101`:
  - **Sim tests:** `packages/sim/test/strategies.test.ts` checks the bounds with two strategies on a key, the load-time check, agency type and cooldown, upkeep and budget against the projection through a save, and the contract advance.
  - **Web vitest:** `strategies-model.test.ts` checks that the shown projection equals the sim's books for 90 days within 1 funds.
  - **Career bot:** each stock strategy runs ten years in the band.
  - **Full checks:** in the journal.
- 2026-10-18 — Handover (`ready/101`):

```text
Handover: plan 101 — Strategies: bounded policies in Administration

Agent: Agent 3 (Dev C, Linux Mint 6c/8 GB)   Branch: devc/101-strategies
Base: origin/main @ 9db50b3 (rebased 2026-10-18, after 099 and 128)
Commits:
072c873 chore(plan-101): API_VERSION 0.1.65 (128 took 0.1.64)
be2dc9e docs(plan-101): journal, Log, STATUS, architecture, guide and glossary
3ef3aeb feat(sim,web): contract advances follow the contract-funds multiplier; the Strategies tab in Administration with its slots in the agency strip; API_VERSION 0.1.64 (099 took 0.1.63) (plan 101, ADR 0187)
8145ba5 test(sim): the career bot with each stock strategy for ten years in the band; two upkeeps lowered (plan 101, ADR 0187)
978d255 feat(web): the Strategies tab model and cards: ratios, caps, upkeep, the 90-day projection with and without, matching what the sim books (plan 101, ADR 0187)
742ab5a feat(core,sdk,sim,stock): strategies: declared multiplier keys with bounds, defineStrategy, activate/end with agency type, Administration slots and cooldown, upkeep as charges, the projection with upkeep and buildings; six stock strategies; API_VERSION 0.1.63 (plan 101, ADR 0187)
f3d3b49 docs(plan-101): claim (Agent 3)
Acceptance:
  [x] a strategy's effect never exceeds its declared bounds even with two on one key — `bun test packages/sim/test/strategies.test.ts` — 6 pass (two launch-cost 0.75 strategies → 0.75, the launch price × 0.75)
  [x] vitest: the projection shown before activation equals the sim after activation for N days within 1 funds — `bun run --filter @orbital/web test -- src/lib/administration/strategies-model` — 3 passed (90 days, government and hybrid)
  [x] career bot with each stock strategy stays in the band — `bun test packages/sim/test/career-bot.test.ts` — 9 pass (table in the journal)
  [x] bun test, typecheck, build, docs:check — below
Checks run here: bun run test 1690 pass / 1 fail (715 s; patch benchmark under load, passes alone) · web vitest 1006 passed, 1 skipped, 4 env-only import suites (no Node) · typecheck exit 0 · build exit 0 · docs:check OK · e2e not run (no WebGL 2 here; /administration has no 3D)
Contracts changed (from Touches): SDK — defineStrategy, ctx.strategies, report kind strategy · save — SimSave.strategies (optional, no bump) · also: core STRATEGY_KEYS/strategyMultipliers/strategyUpkeepCharge/buildingUpkeepCharges, ChargeDefinition.multiplier, projectBalances options; protocol strategy-activate/strategy-end and Snapshot.strategies (ADR 0187) · Contract requests: none
Save format / API_VERSION: format unchanged (optional field) · API_VERSION patch bump 0.1.65 (099 took 0.1.63, 128 0.1.64)
Docs: journal docs/journal/101-strategies.md · ADR 0187 · research none new · simulation.md, plugin-system.md, writing-a-mod.md, glossary · STATUS row only
Notes: the six per-strategy bot runs add about 230 s to bun run test here (about a third of that on the M5). Company/hybrid-only strategies are bot-checked in a hybrid world with a launch every 90 days (a company has no budget; journal 101).
Resource notes: swap used 1256 MB, thermal ok, sub-workers used 0, anything left running: none
Follow-ups: new drafts none (director layer, activation fee, agency strategies in ADR 0187)
```
- 2026-10-18 — Merged by Agent 1: rebased on main (no conflicts; API_VERSION 0.1.65 set on the branch); bun test 1691 pass, web vitest 1029 pass, typecheck, build, docs:check, smoke e2e 7 passed; launch, space-center and worlds e2e pass (Chromium).
