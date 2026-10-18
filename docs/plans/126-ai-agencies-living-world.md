---
id: 126
title: "AI agencies and a living world"
status: in-progress
owner: "Agent 3"
depends: [082, 099, 114, 097, 117]
phase: 9
created: 2026-10-17
updated: 2026-10-18
---

# 126 — AI agencies and a living world

## Goal

Three to six rival agencies run as state machines on the world tick; their successful missions put real on-rails objects in the world (satellites, relays) that the map and Mission Center show and the player can target and rent (relay capacity); they race for world firsts, react on markets and spawn reactive contracts; a news feed explains what they did.

## Context

- ADRs: 0096, 0098, [0190](../decisions/0190-ai-agencies-state-machines-owned-objects-rental-news.md) (this plan)
- Read: ADR 0096 point 4, ADR 0098, `refs/reverse-engineering-ksp2/beyond/03-world-and-economy-dynamics.md` (git-ignored).

## Scope

**In:**
- `defineAgency` (personality, budget model, programme templates).
- Agency tick: budget, reputation, next mission, success roll from its stream.
- Object placement: a vessel with `owner` on a rails orbit from the mission template.
- Relay rental through the comms contribution (capacity as a commodity, 097).
- Reactive contracts (a broken rival relay, a customer request).
- News feed in the Mission Center; agency strip.

**Out:** player-agency diplomacy, bidding wars (later).

## Touches

- **Size:** L
- **Edits:** `packages/sdk`, `packages/sim`, `mods/stock`, `apps/web/src/routes/mission-center`
- **Shared contracts:** **SDK (`defineAgency`), save (agencies, owned objects)**

## Design notes

Agency count and aggressiveness are world rules; Sandbox has none.

## Steps

1. Agency model and tick.
2. Objects in the world.
3. Rental and reactive contracts.
4. News feed.

## Acceptance criteria

- [x] `packages/sim` test: with a fixed seed, agency A launches its first relay on the same day every run and the relay appears as an on-rails vessel with `owner: A`.
- [x] `packages/sim` test: renting a rival relay routes a link through it and books the rent daily.
- [x] Career-bot test with agencies: funds stay in the band.
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/126-ai-agencies-living-world.md` written.

- [x] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0096, 0098).
- 2026-10-17 — `depends` gains 117 (three-agent roadmap review, `docs/roadmap/team-development-roadmap.md` "Notes for the Lead"): renting a rival relay routes a link through it (routing is tier 3, plan 117).
- 2026-10-18 — Claimed by Agent 3 (`claim/126`, branch `devc/126-agencies`).
- 2026-10-18 — ADR 0190 covers:
  - agencies as data;
  - a daily machine with its own stream;
  - owned passive objects on rails (two per agency, with lifetimes);
  - relays routed only when rented, with a daily rent;
  - reactive contracts after a failed relay;
  - news;
  - an optional save field.

  The ECS query now reuses its answer, so the career bot stays fast with agencies.
- 2026-10-18 — Done here, handed over as `ready/126`:
  - **Sim tests:** `packages/sim/test/agencies.test.ts` (4) checks the same first-relay day for one seed (on rails, owned), refusals and save/resume, rental routing with the daily rent, and a reactive contract.
  - **Career bot:** three agencies for ten years in the band, at 28 s.
  - **Full checks:** in the journal.

