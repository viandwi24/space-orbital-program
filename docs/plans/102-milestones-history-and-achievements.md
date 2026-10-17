---
id: 102
title: "Milestones, world history and local achievements"
status: draft
owner: ""
depends: [082]
phase: 6
created: 2026-10-17
updated: 2026-10-17
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

1. Milestones and history in the sim.
2. Achievements and profile in the page.
3. Toasts and exports.

## Acceptance criteria

- [ ] `packages/sim` test: the headless ascent records "first orbit of <home>" exactly once, with the day.
- [ ] vitest: an achievement unlocked in one world stays unlocked in another; export then import restores the profile.
- [ ] vitest: the history export contains one line per milestone in day order.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/102-milestones-history-and-achievements.md` written.

- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0098).
