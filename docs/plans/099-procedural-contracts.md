---
id: 099
title: "Procedural contracts"
status: done
owner: "Agent 3"
depends: [098, 095, 096]
phase: 6
created: 2026-10-17
updated: 2026-10-18
---

# 099 — Procedural contracts

## Goal

The world offers contracts generated from templates with the seeded PRNG: few but meaningful, each with an advance, reward, penalty, deadline (tied to transfer windows where relevant) and its expected value (reward minus an estimated launch cost) shown; the player accepts, declines or cancels within contract-slot limits; completion and failure book to the ledger.

## Context

- ADRs: 0098, [0186](../decisions/0186-procedural-contracts-templates-offers-slots-value.md) (this plan)
- Read: ADR 0098 point 4, plan 098, `refs/space-orbital-program-ui/docs/SCREENS.md` (Administration contracts).

## Scope

**In:**
- Template schema (objective blueprints with parameter ranges, prestige tiers gated by reputation).
- Generator on the world tick with an offer cap and anti-flood rule (at most N of a kind).
- Accept, decline, cancel commands; slots from Administration's level (096).
- Administration screen contracts tab in the refs style; contracts list in the Mission Center when 113 lands.

**Out:** reactive contracts from agencies (126), bidding.

## Touches

- **Size:** M
- **Edits:** `packages/sim`, `mods/stock`, `apps/web/src/routes/administration`
- **Shared contracts:** **protocol (contract commands), save (offers, active)**

## Design notes

Expected value uses the Hangar's cost of the cheapest library design that meets the objective when known, else a rule-of-thumb by Δv tier, labelled as an estimate.

## Steps

1. Templates and generator.
2. Commands and slots.
3. Administration screen.
4. Career-bot run with contracts.

## Acceptance criteria

- [x] `packages/sim` test: the same seed generates the same offers; offers never exceed the cap; a declined offer does not reappear for the stated cooldown.
- [x] `packages/sim` test: completing a contract books its reward; missing the deadline books the penalty.
- [x] Career-bot test with contracts: funds stay in the band.
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/099-procedural-contracts.md` written.

- [x] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0098).
- 2026-10-17 — `depends` gains 096 (three-agent roadmap review, `docs/roadmap/team-development-roadmap.md` "Notes for the Lead"): contract slots come from the Administration level of plan 096.
- 2026-10-18 — Claimed by Agent 3 (`claim/099`, branch `devc/099-contracts`).
- 2026-10-18 — ADR 0186 covers:
  - templates, and the generator on the world tick (a cap of 5, one offer a day, per-template limits, the decline cooldown, its own stream);
  - generated contracts in the sim's contract state as ordinary objective instances, counting only vessels launched after the acceptance;
  - slots from the Mission Center's `mission-control` capacity (ADR 0123; not Administration);
  - expected value from a Δv rule of thumb, labelled an estimate.
- 2026-10-18 — Done here, handed over as `ready/099`:
  - **Sim tests:** `packages/sim/test/contracts.test.ts` checks the same seed giving the same offers, the cap, the cooldown, reward and penalty, cancel, the slots, save and resume, and new vessels only.
  - **Career bot:** `career-bot.test.ts` "with contracts" runs ten years with funds max 383 348, in the band.
  - **Web:** the Administration Contracts tab, with vitest.
  - **Full checks:** in the journal.
- 2026-10-18 — Handover (`ready/099`):

```text
Handover: plan 099 — Procedural contracts

Agent: Agent 3 (Dev C, Linux Mint 6c/8 GB)   Branch: devc/099-contracts
Base: origin/main @ 7c883ff (rebased 2026-10-18, after 116, 131 and 097)
Commits:
ad829bf chore(plan-099): API_VERSION 0.1.62 (097 took 0.1.61); the career bot keeps both the markets and the contracts runs
e483c05 docs(plan-099): journal, Log, STATUS, architecture, guide and glossary
07290d0 fix(sdk): one export of the comms helpers after the rebase on 116 (plan 099)
00997d6 fix(sim): an accepted generated contract counts only vessels launched after it (plan 099, ADR 0186 point 3)
af1aa08 feat(web): Administration with the Contracts tab (Offered, Active, Completed; detail with objectives, terms, expected value; Accept, Decline, Cancel), opened from the Space Center; contract titles in the Mission Center (plan 099, ADR 0186)
ca082e2 feat(sim,stock): contracts count only vessels launched after acceptance; the launch-cost estimate gets a base; the career bot flies an altitude job each mission for ten years in the band (plan 099, ADR 0186)
54da59f feat(core,sdk,sim,stock): procedural contracts: templates, the offer generator on the world tick, accept/decline/cancel, slots from the Mission Center, expected value, the save; six stock templates; API_VERSION 0.1.61 (plan 099, ADR 0186)
0e7e50a docs(plan-099): claim (Agent 3)
Acceptance:
  [x] same seed → same offers; never above the cap; a declined offer stays out for the cooldown — `bun test packages/sim/test/contracts.test.ts` — 10 pass
  [x] completing books the reward; missing the deadline books the penalty (cancel too) — same file
  [x] career bot with contracts: funds stay in the band — `bun test packages/sim/test/career-bot.test.ts` — 3 pass; contracts run 3 600 days, 119 contracts, funds 82 009..382 277
  [x] bun test, typecheck, build, docs:check — below
Checks run here: bun run test 1663 pass / 1 fail (503 s; patch benchmark under load, passes alone) · web vitest 1000 passed, 1 skipped (CreateWorld timed out once under load, 6/6 alone; 4 env-only import suites, no Node) · typecheck exit 0 · build exit 0 · docs:check OK · e2e not run (no WebGL 2 here; /administration has no 3D, a smoke on it is welcome)
Contracts changed (from Touches): protocol — contract-accept / contract-decline / contract-cancel, Snapshot.contracts · save — SimSave.contracts (optional, no bump), optional `since` on objective instances · also SDK/core additions the ADR lists (defineContractTemplate, ctx.contractTemplates, report kind contract-template, estimatedLaunchCost, expectedValue, rule stock.contracts) · Contract requests: none
Save format / API_VERSION: format unchanged (optional fields) · API_VERSION patch bump 0.1.62 (116 took 0.1.60, 097 0.1.61)
Docs: journal docs/journal/099-procedural-contracts.md · ADR 0186 · research none new · simulation.md, plugin-system.md, writing-a-mod.md, glossary · STATUS row only
Deviations: slots from the Mission Center's mission-control capacity (ADR 0123), not Administration; expected value from a Δv rule of thumb (Hangar-library refinement is a follow-up); /administration is a new route (Strategies placeholder for 101)
Resource notes: swap used 1273 MB, thermal ok, sub-workers used 0, anything left running: none
Follow-ups: new drafts none (follow-ups listed in ADR 0186 and the journal; 101 fills Strategies)
```
- 2026-10-18 — Merged by Agent 1: rebased on main (no conflicts); API_VERSION 0.1.63 (065 took 0.1.62); bun test 1671 pass (three career bots in the band, 25 to 27 s each in the parallel suite), web vitest 1024 pass, typecheck, build, docs:check, smoke e2e 7 passed; launch, mission-center, space-center and worlds e2e pass (Chromium).
