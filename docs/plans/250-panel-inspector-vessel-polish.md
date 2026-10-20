---
id: 250
title: "Panels and vessels: −/+ steppers on narrow panels, inspectors that never cover the vessel, a resizable dock, one type scale, port-frame Locked camera, undocked map card"
status: done
owner: "Worker C"
depends: [248]
phase: 8
created: 2026-10-20
updated: 2026-10-20
---

# 250 — Panels and vessels: −/+ steppers on narrow panels, inspectors that never cover the vessel, a resizable dock, one type scale, port-frame Locked camera, undocked map card

**Size:** M

## Goal

Close the remaining panel and vessel gaps the audit found.

## Context

- The release audit of 2026-10-20 (main @ 4281d931, read-only) found these items Partial or Missing against `refs/rancangan-terpadu.md`. The owner ordered plans for every missing feature at once ("Buatkan plan untuk semua fitur yang kurang sekarang", 2026-10-20). They do **not** block `v1.0.0` (plan 232); they form the v1.1 wave. File and line cites are from the audit; check them against current main when refining. Design: §6.1, §6.2, §7.1, §7.3, §7.5, §7.6.
- §7.1: below 300 px, sliders do not become a number with − and + (`ControlRows.svelte:60-90`).
- §7.3: below 1280 px `--panel-room` is 0 (`flight/+page.svelte:1506`), so the inspector column can overlap the vessel panel.
- §7.5: the dock is a fixed 17.5rem (`Dock.svelte:147`), not resizable 260–400.
- §7.6: legacy `--t-xs`/`--t-sm` still used in `OrbitStrip.svelte`, `ResourcesPanel.svelte`, `CrewPanel.svelte`.
- §6.2: the Locked camera does not read the port frame (`VesselSnapshot.ports` unused in the renderer).
- §6.1: map vessel markers have no card with "Switch to".

## Scope

**In:**

- All the items above.

**Out:**

- New panels.

## Touches

`apps/web/src/lib/{inspector,vessel-panel,hud,layout}/*`, `apps/web/src/routes/(world)/flight/+page.svelte`, `packages/renderer/src/scene.ts`.

## Steps

1. Each item with a unit or component test.
2. Chromium e2e at 1280 × 720 and 1920 × 1080: no overlap; stepper below 300 px.
3. Light checks locally, push `ready/250` for CI, and follow the worker brief (batch mode while it is in force).

## Acceptance criteria

- [x] Every listed item is done; unit tests pass. (e2e paused by the owner)
- [x] Merged with the typecheck of the touched workspaces and the unit tests green. (The Chromium e2e is paused by the owner.)

## Docs checklist

- [x] STATUS row, journal `docs/journal/250-panel-inspector-vessel-polish.md`, remove the matching Known-issues lines, any ADR written while refining.

## Log

- 2026-10-20 — Created by the coordinator from the release audit (owner order). Draft: the owner (Worker C) refines it against current main before claiming.
- 2026-10-20 — Refined and coded on `rel/250-panel-polish` (stacked on 248, batch mode). All six items; stays draft until 248 is done.
- 2026-10-20 — Done: merged (merge first, CI on main after; e2e paused by the owner).
