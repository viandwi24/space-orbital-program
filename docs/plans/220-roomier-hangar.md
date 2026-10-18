---
id: 220
title: Roomier Hangar and high detail in the Hangar
status: draft
owner: ""
depends: []
phase: 7
created: 2026-10-18
updated: 2026-10-18
---

# 220 — Roomier Hangar and high detail in the Hangar

## Goal

The Hangar feels open. The service towers move back to about x = ±15 m, z = −13 m. Swing arms stop at the platform edge (±6.2 m) or follow the vessel's radius with clearance, so they never cut through a 2.5–3.75 m rocket. Floodlights, the safety cell and the crane, tug and crew paths move with them, and the turntable camera's zoom limits fit the larger space. The Hangar always builds parts at high geometry detail, so round parts do not look faceted on the low preset. Screenshots from four angles record the result.

## Context

- Rancangan §8b.10 (owner request: roomier Hangar, numbers above), §8b.8 (Hangar always at high detail; low detail only for distant flight).
- ADRs: none new (the spec lists none). Related: 0029 (VAB editor state and hangar view), 0053 (graphics presets).
- Research:
  - Rancangan §8b.10 and `packages/renderer/src/vab/hangar.ts:812-813`: two towers at x = ±9.5 m, z = −7 m in a ±30 m room (`HANGAR = { half: 30, height: 46, platformRadius: 6.2 }`, `hangar.ts:62`); swing arms reach to 1.6 m from the vessel axis (`hangar.ts:801`); floodlights at `hangar.ts:822-825`; movers in `packages/renderer/src/vab/hangar-movers.ts`.
  - 05 §2 table: camera distance 2.5–60 m, room half 26 m, pan box 14 m (`packages/renderer/src/vab/orbit-camera.ts:28-36`).
  - `packages/renderer/src/vab/view.ts:213`: part detail follows the active preset (`detailOf(PRESETS[this.quality])`).
- No plan dependency. Plan 217 changes camera input; this plan changes only limits, so either order works.

## Scope

**In:**
- Towers to about (±15, −13); arms either stop at `platformRadius` or extend to `vesselRadius + 1.0 m` when the view tells the hangar the vessel's maximum radius.
- `Hangar.setVesselRadius(r)` on the hangar object; the view calls it when the design changes.
- Floodlights, safety cell, crane rail, tug and crew paths moved to match; no mover crosses the platform.
- Camera limits: max distance and room half widened to fit the new room; pan box widened to about 18 m.
- Hangar part detail fixed at the high level regardless of the graphics preset.
- `apps/web/scripts/capture-hangar.ts` captures four angles (front, side, 45° high, top-down).

**Out:**
- Anything the carry loop adds (217).
- Pad or flight scenery changes.

## Touches

- **Size:** S
- **Edits:**
  - `packages/renderer/src/vab/hangar.ts`, `packages/renderer/src/vab/hangar-movers.ts`
  - `packages/renderer/src/vab/orbit-camera.ts` (`VAB_CAMERA_LIMITS`)
  - `packages/renderer/src/vab/view.ts` (fixed high detail; `setVesselRadius` call)
  - `packages/renderer/test/hangar.test.ts`
  - `apps/web/scripts/capture-hangar.ts`
- **Shared contracts:** `VAB_CAMERA_LIMITS` values (217 reads them); new `Hangar.setVesselRadius` method.

## Design notes

- Arm reach is rebuilt only when the radius changes by more than 0.1 m, so editing does not churn geometry.
- High detail in the Hangar costs triangles; the Hangar has one vessel and no planet, so the budget holds. Record the triangle count before and after in the journal.

## Steps

1. Move towers, arms, lights and movers; add `setVesselRadius`.
2. Widen camera limits.
3. Fixed high detail in the Hangar view.
4. Hangar tests for positions and arm clearance.
5. Four-angle captures for the journal.

## Acceptance criteria

- [ ] `bun test packages/renderer/test/hangar.test.ts` passes with new cases: tower bases at |x| ≥ 14 m and z ≤ −12 m; with `setVesselRadius(1.875)` no arm mesh comes closer than 2.5 m to the vertical axis; with no radius set no arm passes inside the platform radius; every mover path stays outside the platform radius.
- [ ] `bun test packages/renderer/test/presets.test.ts` passes, and a new case asserts the Hangar view requests high detail on the low preset.
- [ ] Chromium e2e `e2e/editor.e2e.ts` passes.
- [ ] `SHOT_URL=http://localhost:5211 bun scripts/capture-hangar.ts` (from `apps/web`, Playwright Chromium against a running build) writes four images; they are linked in the journal. [manual] The owner reviews the four images.
- [ ] `bun run check:affected` passes.
- [ ] CI is green on the plan's ready tag (full suite, ADR 0126).

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/220-roomier-hangar.md` written, with the four captures and triangle counts.
- [ ] `docs/architecture/overview.md` updated if it describes the Hangar layout.

## Log

- 2026-10-18 — Created from refs/rancangan-terpadu.md (release roadmap).
