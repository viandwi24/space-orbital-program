---
id: 066
title: "Environment on real devices: M1/M2, integrated Intel, phones"
status: in-progress
owner: "Agent 2"
depends: [038]
phase: 3
created: 2026-10-17
updated: 2026-10-18
---

# 066 — Environment on real devices

## Goal

The flight view's frame budget, shader compile times and preset choice are measured on the machines ADR 0025 names as the budget (Apple M1/M2, an integrated Intel GPU) and on a phone-class GPU, and `selectPreset`, the governor's ladder order and the precompile order are tuned from those numbers, not from an Apple M5 alone.

## Context

- Pushed out of plan 038 (and before it of 019, 020, 022, 025, 027, 031, 039, 048, 050, 054): none of those sessions had the hardware, and 038 did not either. Nothing about the devices was faked; every frame table in the journals is an M5 table.
- A plan 040 note mentions a device item in a draft 064; if that draft exists when this one is refined, merge the two (the effects' device costs and the environment's belong on the same table).
- Read: ADR 0025 (the bar), ADR 0053 (budget and governor), ADR 0064 (half-resolution rung), ADR 0072 to 0074, journals 039, 050, 054, 038; `docs/research/three.md`.
- Foundation (ADR 0107, 0097): the refs UI adds glass panels with `backdrop-filter: blur(28px)` over the flight view, and the Space Center is a new 3D view (plan 091). Both must be on the device table; the blur's fallback (solid surface) is decided by these numbers.

## Scope

**In (to be ordered at refinement):**
1. The journal 039/054 frame table (pad, 3 km, 12 km, orbit, hillside, a lake, a shore) at `low`, `medium`, `high` and at the half-resolution rung on an M1 or M2, an integrated Intel GPU and one phone or tablet, with the governor's rung that each machine settles on.
2. `selectPreset` (`presets.ts`): the capability probe's thresholds from those measurements.
3. First-load precompile time and the first-switch hitch on each (plan 038 measured the M5: programs ready 3 to 11 s after the first frame, journal 038).
4. Phones: whatever of plan 055 (compact layout) the measurements make necessary for the renderer (resolution cap, shadow size, no clouds).

**Out:** new visual features; a native app.

**Realignment (2026-10-17):** add to item 1's table the flight view with the refs HUD (glass blur on and off, plan 086/088) and the Space Center view at its default camera (plan 091) when they exist. Phones stay unsupported (ADR 0091); a phone row is measured only for draft 073.

## Touches

- **Size:** M
- **Edits:** `packages/renderer/src/presets.ts`, `packages/renderer/src/quality-governor.ts`, `apps/web/src/lib/graphics.ts`, `apps/web/src/lib/ui`
- **Shared contracts:** none

## Acceptance criteria

- [ ] A frame-time table per machine (journal 054's method: production build, 1920 x 1080 at ratio 1 or the device's native size, governor off, minimum of 12 windows of 8 synced frames, second page load) with the budget `medium` 13.3 ms and `high` 16.7 ms on the M-series and what each machine holds.
- [ ] `selectPreset` returns the preset whose measured frame time on that machine fits the budget; a unit test pins the thresholds the table gives.
- [ ] Precompile time and first-switch hitch on each machine, in the journal.
- [ ] `bun test`, typecheck, build, docs:check pass.

## Docs checklist

- [ ] STATUS, journal, ADR if a threshold or a ladder changes, `docs/research/three.md`.

## Log

- 2026-10-17 — Created as draft by plan 038 (devices cannot be measured without hardware).
- 2026-10-17 — Realigned with the owner's Fondasi Orbital decisions (ADR 0107, 0097: glass blur and the Space Center view join the device table).
- 2026-10-18 — Claimed by Agent 2 (Dev B, MacBook Pro M2 13"): the M2 row can be measured here; an integrated Intel GPU and a phone are not available on this machine.
