---
id: 095
title: "Economy core: currencies, ledger, part costs and recovery"
status: in-progress
owner: "Agent 1"
depends: [078, 082]
phase: 6
created: 2026-10-17
updated: 2026-10-17
---

# 095 — Economy core: currencies, ledger, part costs and recovery

## Goal

A world keeps a ledger of funds, science and reputation with a cause on every entry; parts have costs (dry plus contents); launching pays, recovering pays back by a visible formula; running costs (an operations placeholder until 096's building upkeep) and the government budget are scheduled on the world tick (082); the Hangar shows costs; an N-day projection exists. This is the economy's first complete slice and the fallback if the full economy stalls.

## Context

- ADRs: 0098, 0096, 0110, 0111; ADR 0113 or later from the Agent 1 range (to write at claim: where the ledger lives in the save, below)
- Read: ADR 0098 points 1 and 3 and the guardrails, ADR 0096 point 5 (agency type selects funding), plan 082 (`world-tick` phase, PRNG streams), `refs/reverse-engineering-ksp2/07-economy-and-career.md` (KSP figures there are unverified and not to be copied).
- Rules already registered by 078: `stock.economy`, `stock.funds-multiplier`, `stock.cost-multiplier`, `stock.agency-type`.

## Scope

**In:**
- **Ledger** (core types, sim state): `LedgerEntry { time, currency: 'funds' | 'science' | 'reputation', amount, cause, ref? }` (`cause` is a registered id such as `stock.launch`, `stock.recovery`, `stock.budget`, `stock.operations`, `stock.reputation-decay`; `ref` a vessel id or design name); balances are the sum of entries plus the starting values. Stored as `SimSave.economy = { balances, entries }`, an additive field with an empty default (the claim ADR; the `readSimSave` re-sign of ADR 0111 makes the default safe), so no format bump.
- **Scheduled charges** (`ScheduledCharge { id, currency, amount, everyDays, cause }`), contributed by stock and later plans; applied on the world tick at day multiples. `projectBalances(state, charges, days)` (pure, core) returns the balance per day for N days.
- **Part costs:** optional `cost` (funds, dry part) on `PartDefinition` and `price` (funds per unit) on `ResourceDefinition`; a part without `cost` costs 0 and the Hangar says "no cost set". Stock numbers come from one documented rule in `mods/stock/src/costs.ts`: `cost = round(dry mass kg × class rate)` with class rates command and avionics 10, engines 6, landing gear and heat shields 4, structure and aero 2, tanks 1.5; prices liquid fuel 0.8, oxidizer 0.18, ablator 0.5, electric charge 0. `vesselCost(design, registries)` = Σ part cost + Σ contents × price. Expected for `referenceTwoStage`: about 26 000 funds (the exact number is pinned by the test).
- **Launch:** `load-vessel` with the economy on debits `vesselCost × cost multiplier` (`stock.launch`, `ref` the design name) and is refused with "Not enough funds: needs N, has M" when the balance is short.
- **Recovery:** a new command `recover-vessel { vessel }`, accepted for a vessel that is landed or splashed and at rest (on surface rails, or flight with `landed` and below the rest speed). It credits `Σ (part cost + contents value) × f(d)` of the parts still on the vessel (`stock.recovery`), with `f(d) = max(0.1, 0.98 − 0.88 × min(1, d / (π R)))`, `d` the great-circle distance to the nearest recovery-capable site (until 084: the launch site of ADR 0030 only) and `R` the body radius; then the vessel is removed. Destroyed or lost parts are simply not there; there is no separate speed factor (the damage model already breaks parts that land hard). The HUD recovery dialog shows the line items before confirming, from the pure `recoveryQuote(...)` the command uses.
- **Budget and running costs (placeholder for 096/099):** a government agency (the default `stock.agency-type`) receives a budget of 24 000 funds every 30 days (`stock.budget`, scaled by the funds multiplier); `company` and `hybrid` get 0 and 12 000 until 101 adds their sources. Operations cost 4 000 every 30 days (`stock.operations`); 096 replaces it with building upkeep.
- **Reputation** decays toward 0 with a 365-day time constant, applied every 30 days in one entry (`stock.reputation-decay`); clamped to −1 000 … 1 000.
- **Starting values:** new rule `stock.starting-funds` (number 0 … 10 000 000, default 100 000, identity: `changeable: false`); science and reputation start at 0.
- **Economy off (Sandbox):** no entry is written and no launch is refused; costs are still computed and shown.
- **Snapshot:** `economy?: { funds, science, reputation }` for the HUD.
- **Hangar:** total cost and a per-part cost column (`apps/web/src/lib/vab`).
- **Career-bot harness** (`packages/sim/test/helpers/career-bot.ts`): drives the real commands; every 30 days it loads `referenceTwoStage` (debit), then a test helper replaces the flight by placing the pod stage landed 40 km downrange at rest (no flight physics), then `recover-vessel`; the rest of the time runs on rails at maximum warp so the world tick fires. Extended by 096, 097 and 099.

**Out:** markets and production (097), contracts (099), building costs and upkeep (096), strategies and the company/hybrid funding sources (101), salaries (106/107; their charge registers on the same schedule).

## Touches

- **Size:** M
- **Edits:** `packages/core` (types, schemas, `economy.ts` new: ledger, projection, `vesselCost`, `recoveryQuote`), `packages/sdk` (exports), `packages/sim` (economy state, launch debit, `recover-vessel`, tick charges, snapshot), `mods/stock` (`costs.ts` new, costs and prices on parts and resources, `stock.starting-funds`, scheduled charges), `apps/web/src/lib/vab`, `apps/web/src/routes/vab`, the HUD recovery dialog (one component file)
- **Shared contracts:** **SDK (`cost` on parts, `price` on resources), save (`SimSave.economy`, additive), protocol (`recover-vessel`, `economy` in the snapshot, ledger events `economy:entry`)**

## Design notes

All maths in sim/core as pure functions; the Hangar and the recovery dialog only display. Prices are stock data, patchable (079). The world tick (082) calls one economy system in the `world-tick` phase; it reads `SystemContext.rules` (078). The budget and operations numbers are a starting point: execution tunes them until the band below holds and records the final values and the measured min and max in the Log and the journal.

## Steps

1. Claim ADR (0113 or the next free number in 0109–0139); ledger types, `projectBalances`, `SimSave.economy` with a resume test.
2. Part costs and resource prices: SDK fields, stock rule in `costs.ts`, `vesselCost` pinned for `referenceTwoStage`.
3. Launch debit and refusal; `recover-vessel` with `recoveryQuote`; HUD dialog.
4. Tick charges (budget, operations, reputation decay); economy-off path.
5. Career-bot harness and band test; Hangar costs.

## Acceptance criteria

- [ ] `packages/sim` test: launching `referenceTwoStage` debits exactly `vesselCost` (pinned number); recovering its pod landed at the launch site credits `0.98 ×` the pod stage's value; recovering it 40 km away credits `f(40 km)` as given by the formula; one ledger entry with its cause for each.
- [ ] `packages/sim` test: with `stock.economy` off no entry is written, a launch with zero funds is accepted, and the snapshot still shows the vessel cost through `vesselCost`.
- [ ] `packages/sim` test: a launch with too little money is refused with "Not enough funds".
- [ ] `packages/core` test: `projectBalances` over 90 days with the budget and operations schedule matches a hand-computed table.
- [ ] `packages/sim` resume test: a save with ledger entries resumes byte for byte.
- [ ] Career-bot test: 10 game years (120 missions) keep funds between 25 000 and 500 000 at every day; the run takes under 30 s in Bun on the M5 (indicative elsewhere).
- [ ] `apps/web` vitest: the Hangar shows the total cost of `referenceTwoStage` and "no cost set" for a mod part without `cost`.
- [ ] `bun run test`, web vitest, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/095-economy-core-currencies-ledger-costs.md` written.
- [ ] `architecture/simulation.md` (economy), `guides/writing-a-mod.md` (costs).
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0098).
- 2026-10-17 — Refined by Agent 1 while waiting for `cp/f1-082-tick` (body only, status stays `draft`): ledger and schedule shapes, the stock cost rule and prices, the recovery formula without a separate speed factor (hard landings already break parts), a flat government budget and an operations placeholder so a 10-year band is possible before contracts exist, `stock.starting-funds`, the career-bot method, measurable criteria. The claim ADR (ledger in `SimSave.economy`, additive) takes the next free number of the Agent 1 range; 0112 is the state-file ADR.
