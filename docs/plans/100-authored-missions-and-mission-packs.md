---
id: 100
title: "Authored missions, the story line and mission packs"
status: in-progress
owner: "Agent 2"
depends: [098, 087]
phase: 6
created: 2026-10-17
updated: 2026-10-18
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

- [x] `packages/sim` test: completing mission 1 in the headless ascent starts mission 2 (its `next`); a mission whose prerequisites are not done is refused.
- [x] vitest: the tracker shows each objective's progress from the snapshot.
- [x] A sample mission pack in `examples/` creates a world with its starting vessel in orbit (vitest).
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/100-authored-missions-and-mission-packs.md` written.
- [x] `guides/writing-a-mod.md` (missions).
- [x] ADR 0151.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0098).
- 2026-10-17 — `depends` gains 087 (three-agent roadmap review, `docs/roadmap/team-development-roadmap.md` "Notes for the Lead"): a mission pack creates a world and this plan edits `routes/worlds` of plan 087.
- 2026-10-18 — Claimed by Agent 2 (Dev B, M2), ahead of 108 in the lane: 108 waits for 094 (handed over, not merged).
- 2026-10-18 — Refined with ADR 0151: briefing, debriefing, next, line; `next` missions start on completion; stock main line of six; `host.missions` dock panel; scenarios (`defineScenario`) as mission packs from Create World.
- 2026-10-18 — Done on the branch: mission fields and scenarios (API 0.1.53), next missions in the sim, the stock main line, the Missions dock panel, Create World from a scenario and its first flight, the sample pack. Journal: [100](../journal/100-authored-missions-and-mission-packs.md).
- 2026-10-18 — Merged by Agent 1: rebased on main after 094 (conflicts in the ADR index and the flight page, kept both: the Launch screen's placement and the scenario start; a scenario's own placement wins); the flight page and flight loop are outside Touches, needed for the scenario start; bun test 1577 pass, web vitest 980 pass, typecheck, build, docs:check, smoke e2e 7 passed, launch and worlds e2e pass (Chromium).
