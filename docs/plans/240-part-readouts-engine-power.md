---
id: 240
title: "Part read-outs: live engine thrust, Isp and flow, flameout reason, solar and RTG output, tank bars in the inspector"
status: done
owner: "Worker C"
depends: []
phase: 8
created: 2026-10-20
updated: 2026-10-20
---

# 240 — Part read-outs: live engine thrust, Isp and flow, flameout reason, solar and RTG output, tank bars in the inspector

**Size:** M

## Goal

Every part that produces or uses something shows what it does right now, not a static range.

## Context

- The release audit of 2026-10-20 (main @ 4281d931, read-only) found these items Partial or Missing against `refs/rancangan-terpadu.md`. The owner ordered plans for every missing feature at once ("Buatkan plan untuk semua fitur yang kurang sekarang", 2026-10-20). They do **not** block `v1.0.0` (plan 232); they form the v1.1 wave. File and line cites are from the audit; check them against current main when refining. Design: §4.3, §7.6b.
- Engine: `mods/stock/src/modules.ts:338-405` shows thrust and Isp as a static sea-level to vacuum range, has no mass-flow read-out, and the flameout reason is always "out of propellant" (also when the cause is no oxidizer, no air, or a closed flow lock).
- Solar panels and the RTG: `mods/stock/src/solar.ts:62-77` only extends and retracts; no sun exposure or EC/s output read-out.
- Tanks and batteries: bars are only in the vessel panel's Resources tab (`VesselPanel.svelte:246-266`); the Parts row and the inspector (`ControlRows`) do not draw a part's `resources`.

## Scope

**In:**

- Engine read-outs: current thrust (kN), current Isp (s) for the current pressure, propellant flow (kg/s or units/s per resource), and a flameout reason from the sim (out of a named propellant, flow locked, no air for air-breathing engines, overheated).
- Solar: exposure (0–100 %, with "in shadow" / "blocked") and output EC/s; RTG: output EC/s.
- Resource bars per part in the Parts row and the inspector, reusing the Resources tab's bar.

**Out:**

- New engine types; air-breathing engines if none exist yet (the reason list just includes it when the module has it).

## Touches

`mods/stock/src/modules.ts`, `mods/stock/src/solar.ts`, `packages/sim/src` (flameout cause on the snapshot), `apps/web/src/lib/inspector/*`, `apps/web/src/lib/vessel-panel/VesselPanel.svelte`, `ControlRows.svelte`.

## Steps

1. Expose the live values from the sim snapshot (or module status) for engines, solar and RTG; add a flameout cause enum.
2. Draw them in the module descriptors' status rows; add the per-part resource bars.
3. Unit tests: an engine at sea level and in vacuum reports the right Isp and thrust; a tank empty of oxidizer gives that reason; a panel in shadow reports 0 output.
4. Chromium e2e on the M2: the inspector of a firing engine shows changing thrust and flow.
5. Light checks locally, push `ready/240` for CI, and follow the worker brief (batch mode while it is in force).

## Acceptance criteria

- [x] Engine read-outs are live and the flameout reason names the cause; tests pass.
- [x] Solar and RTG output and exposure read-outs; test passes.
- [x] Per-part resource bars in the Parts row and the inspector.
- [x] CI is green on `ready/240`. (The Chromium e2e is paused by the owner and was not written; the module tests cover the values.)

## Docs checklist

- [x] STATUS row, journal `docs/journal/240-part-readouts-engine-power.md`, remove the matching Known-issues lines, any ADR written while refining.

## Log

- 2026-10-20 — Created by the coordinator from the release audit (owner order). Draft: the owner (Worker D) refines it against current main before claiming.
- 2026-10-20 — Worker C claimed and coded it (queue of Worker D). The e2e (step 4) is paused by the owner; the sim and module tests cover the values.
- 2026-10-20 — Done: merged on CI pass (e2e paused by the owner).
