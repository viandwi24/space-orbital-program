---
id: 097
title: "Markets and production: one commodity chain first"
status: draft
owner: ""
depends: [095, 096]
phase: 6
created: 2026-10-17
updated: 2026-10-17
---

# 097 — Markets and production: one commodity chain first

## Goal

Commodities have prices that respond to supply and demand on the world tick with damping and caps; a production building (propellant plant) turns inputs into a commodity with upkeep and power; the player buys propellant at market price or makes it; services (launch, comms capacity, data, crew seats, insurance) are priced by the same market model when their systems exist. The career bot stays inside its band with markets on.

## Context

- ADRs: 0098
- Read: ADR 0098 points 1 and 2 and the guardrails, `refs/reverse-engineering-ksp2/beyond/03-world-and-economy-dynamics.md` §2.2 (git-ignored).
- Start with one commodity (propellant) and one chain; add more only after the first is fun (ADR 0098 guardrail).

## Scope

**In:**
- `defineCommodity`, `defineRecipe` (inputs, outputs, time, power, building); stock propellant chain.
- Market model: price = base × f(stock / target) with a per-tick change cap and saturation for repeated sales; world demand curves as data.
- Fuel at launch bought at the market price or drawn from site storage.
- Economy panel data: price history, cause on hover (ledger).

**Out:** agencies as market actors (126); interplanetary logistics (128).

## Touches

- **Size:** L
- **Edits:** `packages/core`, `packages/sdk`, `packages/sim`, `mods/stock`, `apps/web/src/routes/space-center`
- **Shared contracts:** **SDK (`defineCommodity`, `defineRecipe`), save (stocks, prices)**

## Design notes

Prices and stocks are deterministic tick functions; no PRNG unless a recipe declares variance (from its stream).

## Steps

1. Commodity and recipe registries.
2. Market model with tests for damping and caps.
3. Propellant plant and site storage.
4. Career-bot band test with markets on.

## Acceptance criteria

- [ ] `packages/sim` test: selling the same commodity every day lowers its price by at most the cap per tick and saturates at the stated floor.
- [ ] `packages/sim` test: a propellant plant produces exactly rate × days when powered and nothing when upkeep is unpaid.
- [ ] Career-bot test with markets: funds stay in the band; no income source exceeds the stated share.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/097-markets-and-production.md` written.
- [ ] `architecture/simulation.md` (markets), `guides/writing-a-mod.md`.
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0098).
