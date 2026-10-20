---
id: 244
title: "Hangar: a ghost that follows the cursor, surface attach on any face, whole-vessel pick-up, Alt for nodes only, a 3D size-mismatch mark"
status: done
owner: "Worker A"
depends: [238]
phase: 8
created: 2026-10-20
updated: 2026-10-20
---

# 244 — Hangar: a ghost that follows the cursor, surface attach on any face, whole-vessel pick-up, Alt for nodes only, a 3D size-mismatch mark

**Size:** L

## Goal

Building feels like KSP: the carried part follows the cursor, sticks to any surface, and the whole vessel can be picked up.

## Context

- The release audit of 2026-10-20 (main @ 4281d931, read-only) found these items Partial or Missing against `refs/rancangan-terpadu.md`. The owner ordered plans for every missing feature at once ("Buatkan plan untuk semua fitur yang kurang sekarang", 2026-10-20). They do **not** block `v1.0.0` (plan 232); they form the v1.1 wave. File and line cites are from the audit; check them against current main when refining. Design: §8.1, §8.2, §8b.3.
- 8.1: the ghost shows only at the nearest or hovered target (ADR 0221); nodes do not light up as the part nears; node pick is a ray-sphere test at 0.9× node radius (`packages/renderer/src/vab/picking.ts:41-62`).
- 8.2: surface attach covers cylinder and box sides only, not top and bottom faces or cones (`controller.svelte.ts:1071-1096`); Alt turns off angle snapping instead of forcing node-only (`:1090`); no Shift-click for the whole vessel.
- 8b.3: a node size mismatch is listed only in the pre-flight checks, with no mark at the joint in 3D (plan 207 follow-up).
- The owner complained about this (C4).

## Scope

**In:**

- The carried part follows the cursor freely at a set distance; nearby nodes glow within a screen radius; snapping takes over near a node.
- A general surface link: attach to any face of any part (including top and bottom faces and cones), aligned to the surface normal.
- Alt forces node-only; Shift-click picks up the whole vessel (from the root).
- A 3D mark at a mismatched joint.

**Out:**

- Re-root tool (P1).

## Touches

`apps/web/src/lib/vab/controller.svelte.ts`, `apps/web/src/lib/editor/*`, `packages/renderer/src/vab/{picking,view,part-layer}.ts`.

## Steps

1. Refine; ADR for the surface link (how it is saved and how symmetry copies it).
2. Free ghost and node glow; renderer tests for the screen-radius pick.
3. Surface link with save round-trip tests; Alt and Shift-click.
4. The 3D mismatch mark.
5. Chromium e2e: attach a part to a tank's top face and to a cone; Shift-click moves the whole vessel.
6. Light checks locally, push `ready/244` for CI, and follow the worker brief (batch mode while it is in force).

## Acceptance criteria

- [x] The ghost follows the cursor; nodes glow when near.
- [x] Surface attach works on top and bottom faces and cones and survives save/load; tests pass.
- [x] Alt is node-only; Shift-click picks up the whole vessel; unit tests pass (e2e paused by the owner).
- [x] A mismatched joint shows a mark in 3D.
- [x] CI is green on `ready/244`.
- [ ] The e2e of this plan passes on Chromium (e2e paused by the owner).

## Docs checklist

- [x] STATUS row, journal `docs/journal/244-hangar-attach-and-pickup.md`, remove the matching Known-issues lines, any ADR written while refining.

## Log

- 2026-10-20 — Created by the coordinator from the release audit (owner order). Draft: the owner (Worker A) refines it against current main before claiming.
- 2026-10-20 — Worker A: ADR 0235. Core surface links (`placeSurface`, validation, schema), editor `surfaceTarget` with symmetric copies, controller (faces, Alt = rings only, ring snap 36 px and glow 80 px, free ghost, Shift-click the whole vessel), 3D mismatch ring. Unit tests only (e2e paused by the owner).
