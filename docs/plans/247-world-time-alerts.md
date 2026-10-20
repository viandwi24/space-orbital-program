---
id: 247
title: "World time and alerts: warp stops for every event, frozen-vessel warning, frame-lag warp drop, script alarms"
status: draft
owner: "Worker C"
depends: [239]
phase: 8
created: 2026-10-20
updated: 2026-10-20
---

# 247 — World time and alerts: warp stops for every event, frozen-vessel warning, frame-lag warp drop, script alarms

**Size:** M

## Goal

Warp is safe: every event that needs the player stops it and tells them why.

## Context

- The release audit of 2026-10-20 (main @ 4281d931, read-only) found these items Partial or Missing against `refs/rancangan-terpadu.md`. The owner ordered plans for every missing feature at once ("Buatkan plan untuk semua fitur yang kurang sekarang", 2026-10-20). They do **not** block `v1.0.0` (plan 232); they form the v1.1 wave. File and line cites are from the audit; check them against current main when refining. Design: §3.7, §5.13 (W1, W6).
- §3.7: construction done (`buildings.ts:137`) and power out only post to the bell; they do not stop warp. Contract deadline and life support critical have no bell entry and no warp stop. Atmosphere entry drops warp to 10×, not 1×.
- W1: the frame-lag warp drop exists only in n-body worlds (`packages/sim/src/sim.ts:443-451`).
- W6: `vessel:frozen` is not forwarded to the page, so the player gets no warning (journal 206).
- Plan 224 follow-up: scripts have no alarm functions; apsis alarms do not follow later burns.

## Scope

**In:**

- Warp stops (to 1× or the safe level) with a bell entry for: construction done, power out, contract deadline, life support critical, atmosphere entry.
- A frame-budget warp drop for physics warp in every world.
- A bell warning when a vessel is frozen by warp.
- Alarm functions for scripts; apsis alarms that move after a burn.

**Out:**

- New alarm kinds beyond these.

## Touches

`packages/sim/src/{warp,alarms,buildings,sim}.ts`, `apps/web/src/routes/(world)/+layout.svelte` (bell), the script API.

## Steps

1. Sim: each stop with a test.
2. Bell entries and the frozen warning in the web layout.
3. Script alarm functions with a script-api test.
4. Chromium e2e: warp at 1000× stops when construction completes.
5. Light checks locally, push `ready/247` for CI, and follow the worker brief (batch mode while it is in force).

## Acceptance criteria

- [ ] Every listed event stops warp and posts to the bell; tests pass.
- [ ] Frame lag lowers physics warp in every world.
- [ ] A frozen vessel shows a warning; scripts can set alarms.
- [ ] CI is green on `ready/247`, and the e2e of this plan passes on Chromium.

## Docs checklist

- [ ] STATUS row, journal `docs/journal/247-world-time-alerts.md`, remove the matching Known-issues lines, any ADR written while refining.

## Log

- 2026-10-20 — Created by the coordinator from the release audit (owner order). Draft: the owner (Worker C) refines it against current main before claiming.
- 2026-10-20 — Refined against main and coded on `rel/247-world-time-alerts` (batch mode, light checks only). Stops for construction, power, crew shortage, deadline and atmosphere entry (1×); frame-budget warp drop for physics warp in every world (count-based, constant to tune after 251); apsis alarms follow burns; `setAlarm`/`removeAlarm`/`ship.alarms`; frozen-vessel bell warning. The construction e2e waits for warp on the Space Center page (plan 248), so this plan's e2e covers atmosphere entry instead. Stays `draft` until 239 is done on main (`docs:check` dependency rule).
