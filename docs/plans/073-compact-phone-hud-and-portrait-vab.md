---
id: 073
title: "A compact flight HUD and VAB for phones, built with a device"
status: blocked
owner: "Agent 2"
depends: [055, 088, 093]
phase: 6
created: 2026-10-17
updated: 2026-10-18
---

# 073 — A compact flight HUD and VAB for phones, built with a device

## Goal

Make phones (landscape first, then portrait) a supported class, if the human's device pass of plan 055 shows the game can run on them. Plan 055 decided in ADR 0091 that phones stay unsupported because no compact interface exists and nothing about phone GPUs or thermals could be measured.

## Context

- ADR 0091 and journal 055 (the human device checklist). Start only with results from that checklist: frame times on at least one iPhone and one Android phone with the `low` preset and the governor, how the browser chrome and the notch change the usable area, whether audio survives a call.
- The flight HUD is a 650 to 830 px wide deck, a 264 px right column and strips; a phone in landscape is about 390 px tall.
- Foundation (ADR 0107): the refs UI is designed at 1920x1080 for desktop; phones remain unsupported (ADR 0091) and ADR 0107 point 6 keeps them so. If device results allow phones, the compact HUD is built from the refs components (capsule, dock as a sheet, vessel panel as a sheet, navball module) rather than the ADR 0026 widgets, after plans 088 (flight HUD) and 093 (Hangar).

## Scope

**In (to be ordered at refinement):**
1. A compact flight HUD for under 900x500: navball, speed, altitude, throttle, stage in a few elements; the rest behind a drawer.
2. A VAB layout for phone landscape and portrait (catalogue as a drawer, stage editor as a sheet).
3. Phone rules: the preset and the governor's floor, an energy-saving mode, the wake lock if the screen sleeps during a long warp.
4. Move the notice to "supported" for the classes that pass.

**Out:** gamepad support, a native app.

**Realignment (2026-10-17):** items 1 and 2 use the refs components and tokens (plan 086), with 44 px touch targets; the Space Center and Mission Center screens (plans 091, 113) are out of scope for phones in this plan.

## Touches

- **Size:** L
- **Edits:** `apps/web/src/lib/hud`, `apps/web/src/lib/vab`, `apps/web/src/lib/touch`, `apps/web/src/lib/ui`, `packages/renderer/src/presets.ts`
- **Shared contracts:** none

## Steps

Refined 2026-10-18 by Agent 2. The plan starts from device results (Context, first point), and none exist: journal 055's checklist sections C and D have not been run, and plan 066 measured only the M2 (no phone hardware). ADR 0107 point 6 keeps phones unsupported until then.

1. **Owner (gate):** run journal [055](../journal/055-phone-layout-and-real-device-passes.md)'s checklist sections C and D on at least one iPhone (Safari) and one Android phone (Chrome), and `apps/web/scripts/measure-devices.ts` (plan 066) on each with the `low` preset and the governor: frame time at the pad and in orbit, the usable area with the browser chrome and the notch, whether audio survives a call. Results go into this Log.
2. **Agent, if the results allow phones:** write the acceptance criteria from them (frame-time budget per class, the 44 px targets, the drawer and sheet layouts at 844x390 and 390x844), then the ADR superseding ADR 0091 point 1, then Scope items 1 to 4 with the refs components.
3. **If they do not:** record why in the Log, keep ADR 0091, and close the plan as not doing.

## Acceptance criteria

- [ ] Owner: device results for one iPhone and one Android phone in this Log (Step 1).
- [ ] Written from those results at Step 2.

## Docs checklist

- [ ] STATUS, journal, `product/browser-support.md`, an ADR superseding 0091's first point.

## Log

- 2026-10-18 — Agent 2: claimed and refined (Steps). Nothing built: the plan's gate is the owner's phone pass, and no phone results exist (journal 055 C and D unrun; journal 066 has the M2 row only). Set `blocked` on Step 1 under the roadmap's human-gated rule; the next agent session starts at Step 2 from the results.
- 2026-10-17 — Created as draft by plan 055 (phone session): the compact interface is unverifiable without a device.
- 2026-10-17 — Realigned with the owner's Fondasi Orbital decisions (ADR 0107, 0091: phones stay unsupported; any compact HUD uses the refs components).
- 2026-10-18 — Merged by Agent 1 (docs only: the refinement and the owner's checklist; docs:check passes); the plan stays `blocked` on the owner's phone pass, its checkpoint pending.
