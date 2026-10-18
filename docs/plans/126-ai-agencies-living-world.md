---
id: 126
title: "AI agencies and a living world"
status: done
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
- 2026-10-18 — Handover (`ready/126`):

```text
Handover: plan 126 — AI agencies and a living world

Agent: Agent 3 (Dev C, Linux Mint 6c/8 GB)   Branch: devc/126-agencies
Base: origin/main @ 47f9e35 (rebased 2026-10-18, after 119 and the CI change)
Commits:
ab1441c fix(sim): an agency's vessel never does the player's contract or mission work; verification in the journal (plan 126, ADR 0190)
9fa623b test(sim): narrow the load result in the rental test (plan 126)
c640680 chore(plan-126): API_VERSION 0.1.70 (main took 0.1.69); format after the rebase on 119
a189c93 docs(plan-126): journal, Log, STATUS, architecture, guide and glossary
191a546 feat(core,sdk,sim,stock,web): rival agencies: defineAgency, a daily state machine with its own stream, owned passive objects on rails (two each, with lifetimes), relay rental through routing with daily rent, reactive contracts after a failed relay, news; the ECS query reuses its answer until membership changes; six stock agencies; Rivals and News in the Mission Center; API_VERSION 0.1.69 (plan 126, ADR 0190)
d72ffa0 docs(plan-126): claim (Agent 3)
Acceptance:
  [x] with a fixed seed agency A launches its first relay on the same day every run, on rails with owner A — `bun test packages/sim/test/agencies.test.ts` — 4 pass
  [x] renting a rival relay routes a link through it and books the rent daily — same file (route vessel:<relay> → station; −400 a day to Meridian)
  [x] career bot with agencies: funds stay in the band — `bun test packages/sim/test/career-bot.test.ts -t "only launches"` — three agencies, funds 82 009..196 573, 28.3 s
  [x] bun test, typecheck, build, docs:check — check:affected here (see journal); full suite in CI on this tag
Checks run here: bun run check:affected (prettier, docs, typecheck pass; bun test 1627/1629 — patch benchmark under load, and a real bug it caught, fixed and rerun: 19 pass)
Contracts changed (from Touches): SDK — defineAgency, ctx.agencies, report kind agency · save — SimSave.agencies (optional, no bump) · also protocol relay-rent/relay-end-rent, owned-vessel refusals, Snapshot.agencies, VesselSnapshot.owner; core world.query caches its answer by membership revision (same results, ascending ids) (ADR 0190) · Contract requests: none
Save format / API_VERSION: format unchanged (optional field) · API_VERSION patch bump 0.1.70
Docs: journal docs/journal/126-ai-agencies-living-world.md · ADR 0190 · research none new · simulation.md, plugin-system.md, writing-a-mod.md, glossary · STATUS row only
Notes: owned objects are passive in the rails chunks (no hooks, heat, rebase, SOI, debris, milestones) and off the comms network unless rented; an empty network returns at once — the base career bot is 28 s with three agencies (32 s before). Owned vessels never count for the player's milestones, contracts or missions.
Resource notes: swap used 1089 MB, thermal ok, sub-workers used 0, anything left running: none
Follow-ups: new drafts none (rent button on the card, agency world firsts, markets, customer requests, a rule naming agencies — ADR 0190)
```
- 2026-10-18 — Merged by Agent 1 (ADR 0126): no CI result 30 minutes after the handover tag (none), so the local fallback ran on the rebased result: check:affected passed (11 affected workspaces, bun test, related vitest), the build and the Chromium smoke; Mission Center and n-body e2e pass. API_VERSION 0.1.70.
