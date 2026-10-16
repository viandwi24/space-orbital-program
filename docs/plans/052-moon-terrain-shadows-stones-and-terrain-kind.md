---
id: 052
title: "Moon terrain shadows, stones as geometry, terrain kind per body"
status: draft
owner: ""
depends: [049]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 052 — Moon terrain shadows, stones as geometry, terrain kind per body

## Goal

The sun casts long shadows from a crater rim, stones are real geometry you can land next to, and a third airless body with its own terrain is a data change.

## Context

Left out of plan 049, which fixed the v1 must-fixes (light and dust). Reasons: terrain shadows need a short march through the baked patch in the Lambert fragment shader and a decision about the vessel's shadow map against it (a plan of its own, ADR); stones need an instanced mesh from the same cell hash as the shader and a collision answer from the sim (the ground tile is a height field); the terrain kind needs an SDK/`BodyDefinition` change (API version) and runs through `sim.worker.ts` (`createMoonTerrainField` for every body with a parent) and `scene.ts` (`i > 0 && !b.atmosphere`).

## Scope

**In:** sun-direction terrain shadow from the baked patch; instanced stones near the camera; a `terrain` kind (or registry of fields) replacing "has a parent".
**Out:** more planets, surface features to interact with.

## Acceptance criteria

- [ ] To be made measurable at refinement (a low-sun screenshot with a crater rim shadow, frame budget on the moon surface, a test mod body with its own terrain renders).

## Docs checklist

- [ ] STATUS, journal, ADR for the terrain kind, `overview.md`.

## Log

- 2026-10-17 — Created as draft from plan 049.
