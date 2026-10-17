---
id: 101
title: "Strategies: bounded policies in Administration"
status: draft
owner: ""
depends: [095, 096]
phase: 6
created: 2026-10-17
updated: 2026-10-17
---

# 101 — Strategies: bounded policies in Administration

## Goal

The player activates strategies (for example "reuse first", "science first", "public outreach") that change economy multipliers within stated bounds, each showing its ratio, cap, an N-day projection and its upkeep before activation; the agency type (government, company, hybrid) decides which are offered.

## Context

- ADRs: 0098
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

- [ ] `packages/sim` test: a strategy's effect never exceeds its declared bounds even with two strategies on the same key.
- [ ] vitest: the projection shown before activation equals the sim's projection after activation for the first N days within 1 funds unit.
- [ ] Career-bot test with each stock strategy stays in the band.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/101-strategies.md` written.

- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0098).
- 2026-10-17 — `depends` gains 096 (three-agent roadmap review, `docs/roadmap/team-development-roadmap.md` "Notes for the Lead"): strategy slots come from the Administration level of plan 096.
