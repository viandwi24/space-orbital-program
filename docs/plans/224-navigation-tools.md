---
id: 224
title: "Navigation tools: numeric node editor, AN/DN, alarms, transfer windows"
status: draft
owner: ""
depends: [206]
phase: 7
created: 2026-10-18
updated: 2026-10-18
---

# 224 — Navigation tools: numeric node editor, AN/DN, alarms, transfer windows

## Goal

Planning a flight no longer needs guesswork. Every maneuver node has a panel with typed Δv per axis, time ± buttons and ±orbit. The map shows AN/DN and the Ap/Pe of the planned orbit. The player can warp to any marker. User alarms stop warp, also for background vessels. A "next window" view gives the next transfer window to a body with its Δv. The flight HUD has a Δv body picker.

## Context

- rancangan §6.5 (numeric node editor, panel per node), §6.6 (AN/DN, Ap/Pe on the planned orbit), §6.7 (warp to markers with a safe margin), §6.8 (user alarms), §6.9 (minimum transfer-window view), §6.10 (Δv per stage with body and situation, also in flight); §5.13 W5 (warp-to sets its own level and stops before the event).
- Research 15c:
  - §2: up to 8 nodes chain (`packages/core/src/protocol.ts:53`, `packages/sim/src/maneuver.ts:193`) but the panel only describes the first (`apps/web/src/lib/hud-controller.ts:265-282`); no numeric Δv, no time ±, no next orbit (`apps/web/src/lib/hud/ManeuverPanel.svelte:48-81`);
  - §1: Ap/Pe markers on the current orbit only (`apps/web/src/lib/hud/MapMarkers.svelte:23-50`); AN/DN only as buttons on the Target card (`apps/web/src/lib/rendezvous-aids.ts:163-164,270-283`);
  - §4: no Alarm Clock; Upcoming in the Mission Center lists nodes, SOI and reviews with warp-to (`apps/web/src/lib/mission-center/model.ts:97-170`);
  - §5: trip planner only in the VAB (`apps/web/src/lib/editor/trip.ts`, `apps/web/src/lib/vab/StatsStrip.svelte:124-147`); no body selector for Δv in flight (`apps/web/src/lib/stage-stack.ts`).
- Doc 08 covers KSP's node editor, Alarm Clock (1.12) and transfer windows.
- ADRs: 0202 (flexible time warp, warp-to targets), 0056 (maneuver nodes), 0083 (trip planner), 0084 (rendezvous aids).
- Plan 206 provides the warp-to sim command this plan reuses.

## Scope

**In:**
- Node panel for every node: typed Δv (prograde, normal, radial) with units, time ± (1 s, 10 s, 1 min, 10 min), ±orbit, delete. Selecting a node on the map opens its panel.
- AN/DN markers relative to the target, or to the body equator with no target. Ap/Pe markers on the planned orbit.
- Warp to Ap, Pe, AN, DN, SOI and node from the marker's menu, through the plan 206 warp-to command with its safe margin.
- Alarms in the sim: time, node, Ap/Pe, SOI and transfer window. Each stops warp and posts to the bell (plan 205). Alarms work for vessels that are not focused.
- Alarm list in the Mission Center Upcoming, with add, edit and delete.
- Next-window view: pick a destination body; show date, wait time and Δv from the trip planner model.
- Δv body and situation picker in the flight stage stack.

**Out:** porkchop plots (P2). Snap node to marker and one-click circularise (P1). Finite-burn prediction. Touch node editing beyond the typed fields.

## Touches

- **Size:** L
- **Edits:**
  - `packages/sim/src/maneuver.ts`, `packages/sim/src/commands.ts`, `packages/sim/src/tick.ts` (alarm checks), `packages/sim/src/save.ts`
  - `packages/core/src/protocol.ts` (alarm commands and snapshot list)
  - `apps/web/src/lib/hud/ManeuverPanel.svelte`, `apps/web/src/lib/maneuver-controller.ts`, `apps/web/src/lib/maneuver.ts`, `apps/web/src/lib/hud-controller.ts`
  - `apps/web/src/lib/hud/MapMarkers.svelte`, `apps/web/src/lib/map-path.ts`, `packages/renderer/src/scene.ts`
  - `apps/web/src/lib/mission-center/model.ts`
  - `apps/web/src/lib/editor/trip.ts` (shared with flight), `apps/web/src/lib/stage-stack.ts`, `apps/web/src/lib/hud/StageStack.svelte`
  - `apps/web/e2e/navigation.e2e.ts` (new)
- **Shared contracts:** `add-alarm`, `remove-alarm` commands; `alarms` in the snapshot and save (version bump); alarm firing as a warp-stop event (plan 205 bell).

## Design notes

- Alarms live in the sim so they fire under warp and in the background. The page only lists and edits them.
- A transfer-window alarm is an alarm whose time comes from the trip planner at creation; it does not recompute later.
- The node editor writes through the existing node update command; typed values and drag handles share one path.

## Steps

1. Panel per node with typed fields and time/orbit buttons.
2. AN/DN and planned Ap/Pe markers.
3. Warp-to from markers through plan 206.
4. Alarms in the sim with save round-trip and background firing.
5. Alarm UI in Upcoming; next-window view.
6. Δv body picker in flight.
7. Chromium e2e.

## Acceptance criteria

E2E setup uses the plan 203 debug API (ADR 0200). This plan does not depend on 203; if 203 is not done yet, set up with `launchTwoStage` and `runScript` from `apps/web/e2e/support.ts` and record that in the Log.

- [ ] `bun test packages/sim` passes, including `test/alarms.test.ts`: a time alarm at T+600 s stops a 1000× warp no later than T+600 s; an alarm on an unfocused vessel's Pe fires; alarms survive a save and load.
- [ ] `apps/web` vitest: `maneuver.test.ts` covers typed Δv and ±orbit (a node moved +1 orbit keeps its Δv and shifts by one period); AN/DN of two orbits 5° apart are 180° apart in true anomaly.
- [ ] Chromium e2e `apps/web/e2e/navigation.e2e.ts`: `debug.setOrbit` (plan 203) puts a vessel in a 100 km orbit of Home; add two nodes; the second node's panel accepts "250" prograde and the planned Ap updates; warp to AN stops before it; a 5-minute alarm stops warp and appears in the bell.
- [ ] `bun run check:affected --build --e2e e2e/navigation.e2e.ts` passes.
- [ ] CI is green on the `ready/*` tag for this plan.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/224-navigation-tools.md` written.
- [ ] `docs/architecture/simulation.md` updated (alarms).
- [ ] `docs/guides/scripting.md` updated if alarms are exposed to scripts.
- [ ] `docs/product/glossary.md`: AN/DN, alarm, transfer window.

## Log

- 2026-10-18 — Created from refs/rancangan-terpadu.md (release roadmap).
