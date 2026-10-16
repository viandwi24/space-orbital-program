---
id: 011
title: Physics rigid grouping (compound bodies)
status: draft
owner: ""
depends: [004, 007]
phase: 1
created: 2026-10-16
updated: 2026-10-16
---

# 011 — Physics rigid grouping (compound bodies)

## Goal

Contiguous vessel parts with no decoupler between them are merged into one compound rigid body (several colliders, one body), so a 100-part rocket costs a handful of bodies and joints instead of 100 bodies and ~99 fixed joints. Splitting happens on stage or break. The `PhysicsBackend` API stays source-compatible (internal change, per `architecture/simulation.md`).

## Context

- Read: `docs/architecture/simulation.md` (vessel assembly → physics, rigid grouping), `docs/journal/004-physics-backend-rapier.md` (measured joint drift and per-step cost).
- ADRs: 0004.

## Scope

**In:** measure first (joint count vs. step time and joint drift with `createRapierBackend` for 20/50/100 parts); decide whether the backend gains compound-body support (e.g. a `BodyDesc.shapes` list) or `sim` merges parts into one `BodyDesc`; implement and test split on stage.
**Out:** terrain collisions, physics warp.

## Design notes

Open questions to settle by ADR before coding: compound shape in `core`'s `BodyDesc` vs. a new backend method; centre-of-mass and inertia recomputation on resource change; how `Velocity` is preserved across a split.

## Steps

1. Benchmark current per-part-body approach; record numbers in `docs/research/` or the journal.
2. Write the ADR; refine this plan to `ready`.

## Acceptance criteria

- [ ] To be written when refined (must include a determinism test and a split-on-stage test).

## Docs checklist

- [ ] `docs/STATUS.md`, journal, `docs/architecture/simulation.md`.

## Log

- 2026-10-16 — Created as draft from plan 004 (rigid grouping was out of scope there).
