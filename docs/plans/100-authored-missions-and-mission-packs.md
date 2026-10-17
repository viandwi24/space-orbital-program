---
id: 100
title: "Authored missions, the story line and mission packs"
status: draft
owner: ""
depends: [098]
phase: 6
created: 2026-10-17
updated: 2026-10-17
---

# 100 — Authored missions, the story line and mission packs

## Goal

A written main line of missions guides a new career (first launch, orbit, moon flyby, landing, return) alongside contracts; missions are data on the same evaluator with briefings and branching; a mission tracker in the flight HUD shows the live checklist; mission packs (a mod with missions and a starting state) can be played as a scenario or offered in a career.

## Context

- ADRs: 0098
- Read: ADR 0098 point 4, plan 098, `refs/reverse-engineering-ksp2/06-missions-contracts-achievements.md` (git-ignored; never copy KSP mission texts).

## Scope

**In:**
- Mission schema extensions: briefing, debriefing, next missions, optional script hooks using the same primitives.
- Stock main line (5 to 8 missions) written for our bodies and names.
- Mission tracker panel (registered into the dock when 112 lands; a HUD card before).
- Mission pack: a mod declares a starting world state (preset, rules, epoch, vessels) and missions.

**Out:** a graphical mission editor.

## Touches

- **Size:** M
- **Edits:** `packages/sdk`, `packages/sim`, `mods/stock`, `apps/web/src/lib/hud`, `apps/web/src/routes/worlds`
- **Shared contracts:** **SDK (mission fields, mission pack manifest)**

## Design notes

The first-flight guide of plan 023 becomes the first mission.

## Steps

1. Mission fields and pack manifest.
2. Stock main line.
3. Tracker.
4. Pack as scenario in Create World.

## Acceptance criteria

- [ ] `packages/sim` test: completing mission 1 in the headless ascent unlocks mission 2.
- [ ] vitest: the tracker shows each objective's progress from the snapshot.
- [ ] A sample mission pack in `examples/` creates a world with its starting vessel in orbit (vitest).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/100-authored-missions-and-mission-packs.md` written.
- [ ] `guides/writing-a-mod.md` (missions).
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0098).
