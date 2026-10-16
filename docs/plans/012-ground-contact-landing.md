---
id: 012
title: Ground contact, landing and damage
status: draft
owner: ""
depends: [007]
phase: 3
created: 2026-10-16
updated: 2026-10-16
---

# 012 — Ground contact, landing and damage

## Goal

Replace plan 007's idealised ground (a sphere that zeroes relative velocity, a pad hold that pins a standing stack, uncontrolled vessels destroyed above 10 m/s) with real contact: a ground collider or terrain height query in the physics frame, friction, landing legs as a module, and a damage/destruction model (part break-off at impact speed). Needed before a landing or return-to-surface scenario can be an acceptance test.

## Context

- Read: ADR 0017 (the idealisation and why), `architecture/simulation.md` "Assembly and physics", journal 007. Rapier collider and friction docs (verify online).
- Depends on 007 only; interacts with 011 (rigid grouping makes a standing stack stable without the pad hold).

## Scope

**In:** ground contact in the physics frame, landing-leg module through the SDK, impact damage, re-entry survival hooks (not heating). **Out:** terrain LOD, heating (Phase 3 plans).

## Steps

1. Refine this draft (decide ground representation: large static collider re-positioned under the vessel vs per-step height query).

## Acceptance criteria

- [ ] To be written when refined; must include a scripted landing from a stable orbit that ends with the vessel at rest on the ground, in `bun test`.

## Docs checklist

- [ ] `docs/STATUS.md`, journal, `simulation.md`, ADR superseding the ground part of 0017.

## Log

- 2026-10-16 — Created as draft by plan 007 (ground contact is idealised there).
- 2026-10-16 — Note from plan 011 (done): vessels are one compound rigid body (ADR 0018); the pad hold is not needed for the tests when the ground clamp sticks the rigid body (experiment in journal 011), so this plan can remove it. See "For plan 012" in journal 011.
