---
id: 099
title: "Procedural contracts"
status: in-progress
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

