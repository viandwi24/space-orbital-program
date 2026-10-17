---
id: 095
title: "Economy core: currencies, ledger, part costs and recovery"
status: draft
owner: ""
depends: [078, 082]
phase: 6
created: 2026-10-17
updated: 2026-10-17
---

# 095 — Economy core: currencies, ledger, part costs and recovery

## Goal

A world keeps a ledger of funds, science and reputation with a cause on every entry; parts have costs (dry plus contents); launching pays, recovering pays back by a visible formula; running costs (building upkeep, salaries placeholder) are charged on the world tick; the Hangar shows costs; an N-day projection exists. This is the economy's first complete slice and the fallback if the full economy stalls.

## Context

- ADRs: 0098
- Read: ADR 0098 points 1 and 3 and the guardrails, ADR 0096, `refs/reverse-engineering-ksp2/07-economy-and-career.md` (git-ignored; KSP figures there are unverified and not to be copied).

## Scope

**In:**
- Ledger component (entries `{ time, currency, amount, cause, ref }`), balances, projection over N days from scheduled charges.
- `cost` on part definitions (stock costs set by a documented rule: per kg of dry mass by part class, plus resource prices); resource unit prices.
- Launch charge; recovery: payout fraction by distance to the nearest recovery-capable site, speed at touchdown and damage, shown before and after.
- Reputation decays toward a baseline on the tick.
- Economy rule off (Sandbox): no charges, costs still shown.
- Headless career-bot harness (a scripted player that launches a stock rocket every N days) with a 10-year band test, to be extended by 096, 097 and 099.

**Out:** markets and production (097), contracts (099), building costs (096).

## Touches

- **Size:** M
- **Edits:** `packages/core`, `packages/sdk`, `packages/sim`, `mods/stock`, `apps/web/src/lib/vab`, `apps/web/src/routes/vab`
- **Shared contracts:** **SDK (`cost` on parts, resource prices), save (ledger), protocol (ledger in snapshot)**

## Design notes

All maths in sim/core as pure functions; the Hangar and the recovery dialog only display. Prices are stock data, patchable (079).

## Steps

1. Ledger and projection.
2. Part costs for stock with the rule documented.
3. Launch and recovery.
4. Tick charges and decay.
5. Career-bot harness and band test.

## Acceptance criteria

- [ ] `packages/sim` test: launching the stock two-stage rocket debits exactly its cost; recovering its pod on the launch site credits the stated fraction; a ledger entry exists for each with its cause.
- [ ] `packages/sim` test: with the economy rule off no entry is written.
- [ ] Career-bot test: 10 game years with only launches and recoveries keep funds inside the band stated in the plan when refined (and the run takes under 30 s in Bun).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/095-economy-core-currencies-ledger-costs.md` written.
- [ ] `architecture/simulation.md` (economy), `guides/writing-a-mod.md` (costs).
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0098).
