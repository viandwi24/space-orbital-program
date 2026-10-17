---
id: 102
title: "Milestones, world history and local achievements"
status: done
owner: "Agent 2"
depends: [082, 087]
phase: 6
created: 2026-10-17
updated: 2026-10-18
---

# 102 — Milestones, world history and local achievements

## Goal

Each world records firsts automatically (per body and global: launch, orbit, flyby, landing, return, crewed, EVA, docking, station, relay network, sample return) with a ceremony toast and a history book that can be exported; local achievements across worlds live in an exportable profile, defined as data by stock and mods.

## Context

- ADRs: 0098
- Read: ADR 0098 point 6, `refs/reverse-engineering-ksp2/beyond/06-achievements-milestones-and-meta.md` (git-ignored).

## Scope

**In:**
- Milestone detector on events (stock set for what exists; others register when their systems land).
- History book entries `{ day, actor, text, ref }`; export as Markdown and JSON.
- `defineAchievement({ id, criteria, hidden? })`; profile store `profile` in IndexedDB; export/import.
- Milestones feed reputation and science when those rules are on, and gate tech tiers (105).

**Out:** agencies racing for firsts (126), online profiles.

## Touches

- **Size:** M
- **Edits:** `packages/sdk`, `packages/sim`, `mods/stock`, `apps/web/src/lib/save`, `apps/web/src/lib/hud`, `apps/web/src/routes/worlds`
- **Shared contracts:** **SDK (`defineAchievement`, milestone events), save (milestones, history)**

## Design notes

Achievement criteria are evaluated in the page from sim events (they span worlds); milestones in the sim (they belong to a world).

## Steps

1. ADR 0147.
2. Core: `MilestoneRecord`, `SaveMilestones` (optional in format 5), `milestone:reached`, `AchievementDefinition` registry; SDK `defineAchievement`; API_VERSION bump.
3. Sim: `milestones.ts` detector after steps and rails chunks, `return` at recovery, reputation through the ledger, save, resume, snapshot.
4. Stock: a starter set of achievements.
5. Web: the worker forwards `milestone:reached`; ceremony toast; achievements evaluated in the page; profile store (IndexedDB) with export and import; history and export on the Worlds screen.
6. Tests, guide, journal, handover.

## Acceptance criteria

- [x] `packages/sim` test: the headless ascent records "first orbit of <home>" exactly once, with its time; `launch` before it; a save and resume keeps the record and does not record it again.
- [x] `packages/sim` test: a first with the economy on pays reputation once, with cause `milestone`.
- [x] vitest: an achievement unlocked in one world stays unlocked in another; export then import restores the profile; import merges, keeping the earliest unlock.
- [x] vitest: the history export (Markdown) contains one line per milestone in time order with its calendar date; the JSON export parses back to the records.
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass; smoke e2e.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/102-milestones-history-and-achievements.md` written.

- [x] ADR 0147; `docs/guides/writing-a-mod.md` (achievements).

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0098).
- 2026-10-17 — `depends` gains 087 (three-agent roadmap review, `docs/roadmap/team-development-roadmap.md` "Notes for the Lead"): this plan edits `routes/worlds` and the world save of plan 087.
- 2026-10-18 — Claimed by Agent 2 (Dev B, M2), ahead of 089/093/112/094 in the lane: those wait for unmerged 076, 069 and 088 (their `depends`); 102 depends only on merged plans.
- 2026-10-18 — Refined: kinds that exist now (launch, orbit, flyby, landing, return, crewed variants), Steps and measurable criteria, ADR 0147. EVA, docking, station, relay and sample return come with their systems.
- 2026-10-18 — Done on the branch: core records and achievements registry (API 0.1.42), the sim detector with returns and reputation, stock achievements, the web toast, profile, tracker, history and exports on the Worlds screen. Journal: [102](../journal/102-milestones-history-and-achievements.md).
- 2026-10-18 — Merge check (Agent 1, M5): the branch on origin was one rebase behind the `ready/102` tag, so the merge branch took the branch and the tag's docs commit; rebased on main after 103, 085, 114 and 069 (registries, SDK, sim core, snapshot, stock and the mod guide: both sides kept). API_VERSION 0.1.44. `bun run test` 1524 pass · web vitest 946 pass · typecheck · build · docs:check OK · Chromium smoke 6 pass · worlds and space-center e2e 2 pass.
