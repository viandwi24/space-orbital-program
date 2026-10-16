---
id: 039
title: "Release pass: frame budget, mountain haze, radar altitude"
status: draft
owner: ""
depends: [031]
phase: 2
created: 2026-10-17
updated: 2026-10-17
---

# 039 — Release pass: frame budget, mountain haze, radar altitude

## Goal

The flight view meets the ADR 0025 performance budget again on every preset, the mountains read as mountains from 3–12 km, and the HUD shows altitude above terrain, so the physical terrain of plan 031 is releasable.

## Context

- Read: `docs/product/visual-direction.md`, ADRs 0025, 0027, 0036, 0037, 0043, 0044, journals 025, 027, 031 (frame-time tables and self-review).
- Found by the orchestrator reviewing plan 031 (2026-10-17): `high` at the pad 16.0 ms and on a hillside 18.6 ms throughput on an Apple M5 (budget 16.7 ms sync, and M1/M2 are slower); `medium` 17.3 ms on a hillside; mountains a near-white wall from 3 km (`031-after-hor3.png`); `VesselSnapshot.terrainHeight` exists but the HUD does not show radar altitude; GPU/CPU terrain parity worst 0.81 m on the mid patch; preset auto-selection unchanged since plan 019.

## Scope

**In:** profile and cut the terrain/planet/cloud passes (march steps, patch resolution, half-res or temporal techniques, early-outs) until every preset fits the budget at the pad, 3 km, 12 km, orbit and hillside scenes with margin for slower GPUs; an automatic quality governor (drop preset or internal resolution when frame time exceeds budget for N seconds, with a setting to disable); shader precompile at load so a preset switch does not hitch; mountain aerial perspective / contrast so relief reads at 3–12 km without breaking the haze fix of ADR 0037; radar altitude (above terrain) in the HUD with the existing altitude, and in the script `ship` API if trivial; terrain parity on the mid patch.
**Out:** volumetric clouds (037), water/site animation/mobile (038).

## Steps

1. Refine: measure first (per-pass GPU timings), set targets per preset, ADR for the governor and any technique change.
2. Implement; tests for pure parts (governor hysteresis, step budgets, radar altitude).
3. Screenshots and frame-time tables; journal.

## Acceptance criteria

- [ ] To be made measurable at refinement. Must include: every preset at every listed scene ≤ 13.3 ms sync on the M5 (20 % margin under 16.7 ms for slower machines) or a written, reviewed reason per exception; governor unit tests and a manual run showing it stepping down and up; no visible hitch on preset switch (measured); before/after screenshots at 3 and 12 km showing readable relief; radar altitude in HUD tested in vitest and shown in a screenshot; all repo checks pass.

## Docs checklist

- [ ] `docs/STATUS.md`, journal, ADR(s), research.

## Log

- 2026-10-17 — Created as draft by the orchestrator from the plan 031 review (performance regression and look gaps are release blockers).
