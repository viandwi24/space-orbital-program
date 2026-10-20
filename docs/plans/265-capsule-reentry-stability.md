---
id: 265
title: "Capsules fly heat shield first on reentry and settle upright: centre of mass, centre of pressure and blunt-body drag"
status: ready
owner: "Worker B"
depends: []
phase: 8
created: 2026-10-21
updated: 2026-10-21
---

# 265 — Capsules fly heat shield first on reentry and settle upright: centre of mass, centre of pressure and blunt-body drag

**Size:** M

## Goal

Fix item 26 of `docs/reviews/2026-10-20-owner-manual-test.md`. Two things should come out of it:
- A bare command pod, with or without a heat shield, turns heat shield first on reentry by itself, as real capsules and KSP's do, and stays there with little or no SAS.
- A pod that comes to rest on the ground settles on its base, not on its top.

## Context

- **The report:** reentry with a bare pod is hard to control, because the pod does not stay blunt end first. On the Moon a fallen pod often comes to rest on its top.
- **How real capsules do it:**
  - The centre of mass sits low, toward the heat shield, and the blunt base has most of the drag.
  - Aerodynamic stability needs the centre of pressure behind the centre of mass along the flight direction.
  - KSP models this with each part's CoM offset (pods and heat shields put mass low) and per-part drag cubes.
- **What to check in our code:**
  - the pod's and the heat shield's centre-of-mass offset, in the part definitions in `mods/stock/src/parts/command.ts` and the heat shield's definition;
  - how the sim sums CoM (rigid grouping, plan 011);
  - where drag acts and whether it depends on orientation: the drag model of plans 012 and 212 (Mach and heating) in `packages/sim`;
  - plan 219's fairing drag;
  - whether drag gives a restoring torque at all, or only a force at the CoM.
- **The resting attitude:** an upright rest depends on the CoM height relative to the collider. A low CoM makes the pod tip onto its base.
- **Plan 264** (the rolling pod) touches the same pod collider. Coordinate with it, or do it right after.

## Scope

**In:**
- Measure the pod's CoM and CoP today and record them in the journal.
- Give pods and heat shields realistic low CoM offsets.
- Apply drag at an orientation-dependent centre of pressure, so drag makes a restoring torque.
- Unit tests:
  - a pod released at 45° to the airflow turns heat shield first within N seconds with SAS off;
  - a pod dropped on its side on flat ground settles on its base.

**Out:** a full drag-cube system.

## Steps

1. Measure the CoM and CoP. Write an ADR if the drag model changes.
2. Change the CoM offsets and the drag torque, with tests.
3. Check that the stock rockets still fly: the moon shot and two-stage examples keep their stability readout (the Hangar stability line) and their TWR. Run their sim tests.
4. Run the affected unit tests and the typecheck, then merge first.

## Acceptance criteria

- [ ] A bare pod reenters heat shield first by itself; test passes.
- [ ] A pod at rest settles on its base; test passes.
- [ ] The stock examples' sim tests still pass, and the Hangar stability readout is unchanged in sign for them.
- [ ] Affected unit tests and the typecheck pass. E2E is paused by the owner.

## Docs checklist

- [ ] STATUS row.
- [ ] Journal with the measured CoM and CoP.
- [ ] ADR if the drag model changes.

## Log

- 2026-10-21 — Created by the coordinator from the owner's report. It follows 264 in Worker B's queue.
