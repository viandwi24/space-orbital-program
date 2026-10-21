---
id: 314
title: "A bigger Hangar: 90 × 90 × 69 m, and the camera frames tall craft"
status: done
owner: "part visuals session (Claude)"
depends: [285]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 314 — A bigger Hangar

## Goal

The owner: Kronos V reached the Hangar's roof. Make the building wider, longer and taller, with at least 1.3 times the tallest stock blueprint, and frame tall craft whole.

## Context

- `packages/renderer/src/vab/hangar.ts` (the room), `orbit-camera.ts` and `view.ts` (the camera).

## Scope

**In:**
- the room scaled 1.5×: 60 → 90 m wide and long, roof 46 → 69 m;
- camera limits;
- a wider view for craft too tall to frame from inside the room;
- a test that every blueprint fits.

**Out:** new room detail.

## Steps

1. The shell (walls, roof, trusses, crane, towers, lamps, signs) is built as authored and scaled by `HANGAR_SCALE` in a group. The platform, the walking crew and the tug keep their size. The work lights and the lamp list are scaled by hand.
2. Camera limits ×1.5: room 41.5 m, distance 105 m, pan 27 m, top 51 m.
3. The view widens from 38° up to 75° when the framing distance is more than the room allows.
4. `hangar-fit.test.ts`.

## Acceptance criteria

- [x] `apps/web/src/lib/editor/hangar-fit.test.ts`: every blueprint, 1.3 × its height above the platform, under the roof, and 1.3 × its reach inside the walls (12 pass).
- [x] Browser: Kronos V (45.7 m) framed whole with room above (journal screenshot).

## Docs checklist

- [x] `docs/STATUS.md`, journal `314-bigger-hangar.md`.

## Log

- 2026-10-21 — Done on the owner's report.
