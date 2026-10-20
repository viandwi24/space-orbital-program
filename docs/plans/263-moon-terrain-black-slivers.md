---
id: 263
title: "Black slivers through the Moon's ground near the surface at some view angles"
status: ready
owner: "Worker A"
depends: []
phase: 8
created: 2026-10-21
updated: 2026-10-21
---

# 263 — Black slivers through the Moon's ground near the surface at some view angles

**Size:** M

## Goal

The ground of an airless body (Cinder) never shows black see-through slivers. Item 24 of `docs/reviews/2026-10-20-owner-manual-test.md` (`21.webp`).

## Context

- **What the owner saw:** while landing on the Moon, at certain angles, thin black slivers show in the ground, as if the crust were transparent to the sky.
- **Candidates to check:**
  - plan 252's fractional planet-pass scale (`budgetScale`, `half-res.ts`) and the depth-aware upsample or edge pass at a non-half scale;
  - terrain refine-march misses at grazing angles (`march.glsl.ts`, `planet.glsl.ts`);
  - gaps between camera terrain patches;
  - a depth or log-depth precision issue between the terrain mesh and the planet pass.
- **How to tell regression from old bug:** compare with planet scale 1 (Debug switch from plan 251) to see whether 252 caused it.

## Scope

**In:**
- Find the root cause, fix it, and add a renderer test where possible (for example, the upsample never takes sky for a pixel whose depth says ground).
- Take a screenshot before and after at the same view.

**Out:**
- Nothing else.

## Steps

1. Reproduce through the debug API: set a location low over Cinder and look at a grazing angle.
2. Bisect with the Debug graphics switches (planet scale, march steps, edge pass).
3. Fix, add a test, and put screenshots in the journal.
4. Run the affected unit tests and the typecheck, then merge first.

## Acceptance criteria

- [ ] The root cause is in the journal. The slivers are gone at the reported view (screenshots).
- [ ] No frame-time regression at the pad or on Cinder (spot measurement with the plan 251 tool).
- [ ] Affected unit tests and the typecheck pass. E2E is paused by the owner.

## Docs checklist

- [ ] STATUS row.
- [ ] Journal with screenshots.

## Log

- 2026-10-21 — Created by the coordinator from the owner's report.
