---
id: 241
title: "Part controls: reaction wheel mode, decoupler staging switch, docking port target, wheel motor and steering, RCS and battery groups, parachute spread, pod and experiment actions"
status: draft
owner: "Worker D"
depends: [240]
phase: 8
created: 2026-10-20
updated: 2026-10-20
---

# 241 — Part controls: reaction wheel mode, decoupler staging switch, docking port target, wheel motor and steering, RCS and battery groups, parachute spread, pod and experiment actions

**Size:** L

## Goal

Every stock part type has the controls the design lists (§7.6b), in flight and, where it applies, in the Hangar.

## Context

- The release audit of 2026-10-20 (main @ 4281d931, read-only) found these items Partial or Missing against `refs/rancangan-terpadu.md`. The owner ordered plans for every missing feature at once ("Buatkan plan untuk semua fitur yang kurang sekarang", 2026-10-20). They do **not** block `v1.0.0` (plan 232); they form the v1.1 wave. File and line cites are from the audit; check them against current main when refining. Design: §4.2, §4.3, §7.6b.
- Reaction wheel: on/off only (`modules.ts:583-595`); no mode (normal, SAS only, pilot only).
- Decoupler: no "staging enabled" switch (`modules.ts:539-552`).
- Docking port: no "Set as target" on the part (`mods/stock/src/docking.ts:41-58`).
- Wheels: brakes only (`modules.ts:1234-1246`); no motor on/off and limit, no steering on/off and invert.
- RCS: no Hangar build settings and no `stock.rcs` action group or navball mark (`mods/stock/src/action-groups.ts:5-16`).
- Batteries: the `stock.batteries` group is empty.
- Parachute: no spread angle.
- Pod: rename and vessel type only in the Mission Center; no SAS level; no crew list with EVA and transfer in the inspector (`crew-transfer` exists in `packages/core/src/protocol.ts:924` but no UI uses it).
- Experiment: no "Take (EVA)" from a part (`mods/stock/src/science.ts:288-326`).
- Control surface: no deploy.

## Scope

**In:**

- All the controls above, each as a module action or field so the Hangar's `BuildSettings` and the flight inspector both get it.
- The RCS action group (R) and battery group membership.
- Crew transfer UI in the pod inspector using the existing command.

**Out:**

- Seat-by-seat crew placement in the Hangar.

## Touches

`mods/stock/src/modules.ts`, `rcs.ts`, `docking.ts`, `parachute.ts`, `science.ts`, `action-groups.ts`, `packages/sim/src` where a control needs sim support, `apps/web/src/lib/inspector/*`.

## Steps

1. Refine: confirm each gap on current main; write an ADR if reaction wheel modes or the staging switch need a rule decision.
2. Add the module actions and fields, part type by part type, each with a sim or module unit test.
3. Wire crew transfer and "Set as target" in the inspector.
4. Chromium e2e on the M2: one test per family (wheel mode, decoupler not staged, set target, crew transfer).
5. Light checks locally, push `ready/241` for CI, and follow the worker brief (batch mode while it is in force).

## Acceptance criteria

- [ ] Every listed control exists and works; unit tests pass per part type.
- [ ] RCS and battery action groups contain their parts.
- [ ] Crew transfer and "Set as target" work from the inspector; e2e passes.
- [ ] CI is green on `ready/241`, and the e2e of this plan passes on Chromium.

## Docs checklist

- [ ] STATUS row, journal `docs/journal/241-part-controls-completion.md`, remove the matching Known-issues lines, any ADR written while refining.

## Log

- 2026-10-20 — Created by the coordinator from the release audit (owner order). Draft: the owner (Worker D) refines it against current main before claiming.
