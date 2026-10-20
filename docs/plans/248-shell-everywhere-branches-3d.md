---
id: 248
title: "Shell everywhere: warp and Debug on every page, Save/Load in the menu, a place-pause chip, branch buildings in the Space Center 3D view"
status: done
owner: "Worker C"
depends: [247]
phase: 8
created: 2026-10-20
updated: 2026-10-20
---

# 248 — Shell everywhere: warp and Debug on every page, Save/Load in the menu, a place-pause chip, branch buildings in the Space Center 3D view

**Size:** M

## Goal

The world shell works the same on every page, and a branch space center shows its own buildings.

## Context

- The release audit of 2026-10-20 (main @ 4281d931, read-only) found these items Partial or Missing against `refs/rancangan-terpadu.md`. The owner ordered plans for every missing feature at once ("Buatkan plan untuk semua fitur yang kurang sekarang", 2026-10-20). They do **not** block `v1.0.0` (plan 232); they form the v1.1 wave. File and line cites are from the audit; check them against current main when refining. Design: §2.4, §2.6, §3.4, §5b.1, ADR 0222 point 4.
- Warp can be picked only in Flight: the segments are disabled when `onpick` is unset (`TimeBar.svelte:89`), and only `flight/+page.svelte:1050` sets it.
- The Debug panel is mounted only in `flight/+page.svelte:79,849`; the shell menu (`WorldShell.svelte:119-149`) has no Debug entry and no Save/Load (BASE_LAYOUT §3 asks for save/load).
- §3.4: the time-bar chip only displays the place pause (`TimeBar.svelte:102`); it cannot toggle it.
- C18: the Space Center 3D view always shows the HQ; a branch's buildings go to the first free cell (journal 236).

## Scope

**In:**

- Warp segments active on every in-world page through the world session.
- The Debug panel (Alt+F12 and a menu entry) on every in-world page.
- Save and Load in the ☰ menu.
- The place-pause chip toggles the current place's pause.
- The Space Center 3D view draws the selected site (HQ or branch) with its buildings.

**Out:**

- Off-world base visuals (plan 128 has its own).

## Touches

`apps/web/src/routes/(world)/+layout.svelte`, `lib/layout/{TimeBar,WorldShell}.svelte`, `lib/debug/*`, `lib/save/*`, `routes/(world)/space-center/*`, `packages/renderer` site view.

## Steps

1. Move warp picking and the Debug panel to the layout; unit tests where possible.
2. Save/Load in the menu; the chip toggle.
3. Site switching in the 3D view with a renderer test.
4. Chromium e2e: warp from the Space Center; open Debug from the Hangar; switch to a branch and see its dish.
5. Light checks locally, push `ready/248` for CI, and follow the worker brief (batch mode while it is in force).

## Acceptance criteria

- [x] Warp and Debug work on every in-world page.
- [x] The ☰ menu has Save and Load; the chip toggles the place pause.
- [x] The Space Center 3D view shows the selected site's buildings. (e2e paused by the owner)
- [x] CI is green on `ready/248`. (The Chromium e2e is paused by the owner; `shell-everywhere.e2e.ts` is written and `branch-sites.e2e.ts` now places by hand, neither run.)

## Docs checklist

- [x] STATUS row, journal `docs/journal/248-shell-everywhere-branches-3d.md`, remove the matching Known-issues lines, any ADR written while refining.

## Log

- 2026-10-20 — Created by the coordinator from the release audit (owner order). Draft: the owner (Worker C) refines it against current main before claiming.
- 2026-10-20 — Refined and coded on `rel/248-shell-everywhere` (stacked on 247). Warp through the `warp` command on every non-Flight page; Debug panel and Save/Load in the layout; chip lifts the place pause; the Space Center 3D view draws the chosen home-planet site. Open: a branch is drawn on the home site's terrain with its own cells. Stays draft until 247 is done.
- 2026-10-20 — Done: merged on CI pass (e2e paused by the owner). The layout's Debug panel passes `resetFrames` (plan 251).
