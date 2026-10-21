---
id: 302
title: "Part-support modules: a generic open/close module, bay doors that shield, a fuel cell, a single landing leg, staged solar panels"
status: done
owner: "part visuals session (Claude)"
depends: []
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 302 — Part-support modules

## Goal

The owner asked for a preparation step before all the new parts: check that the codebase supports what the planned parts need, and fill the gaps first.

The audit, against plans 280, 281 and 295–300:

| Need | State before this plan | This plan |
|---|---|---|
| RCS, docking, parachutes, legs, wheels, engines | modules exist | — |
| Solar panels and antennas that open | state exists (`deployed`, `enabled`) | — |
| A telescope door, an unfolding dish, payload petals | no module | `stock.animate` |
| Bay doors that shield their contents | missing (ADR 0261) | `stock.bay` |
| Apollo-style power | missing | `stock.fuel-cell` |
| Single radial landing legs for a lander | missing | `layout: 'single'` on the leg |
| Solar panels in the staging stack | missing | `stageable` on solar |

Robotics stays behind ADR 0265, which is proposed and undecided.

## Context

- ADRs 0261 (bays), 0259 (functional parts), 0224 (fairing shell shielding), 0265 (robotics, proposed).

## Scope

**In:**

- `mods/stock/src/animate.ts`:
  - `ModuleAnimate`: open/close with label, action group and optional staging;
  - `ModuleBay`: its `shell` is the profile while closed, `null` while open;
  - `ModuleFuelCell`: LF and Ox to EC while running.
- `landingLegConfigSchema.layout` (`ring` | `single`).
- `solarPanelConfigSchema.stageable` with `onStage`.

**Out:**

- The refusal to decouple a payload inside a closed bay (later, with plan 281).
- Panels breaking in airflow.
- Robotics.

## Steps

1. Modules and config fields.
2. Registration.
3. Tests.

## Acceptance criteria

- [x] `mods/stock/test/part-support.test.ts`:
  - animate opens and closes, and staging opens it only when stageable;
  - a closed bay is a shell and an open one is not;
  - the fuel cell makes EC at its rate from LF and Ox, and nothing when idle or dry;
  - a single leg has one foot along +X;
  - a stageable panel unfolds on staging.
- [x] `bun test mods/stock` passes (160).

## Docs checklist

- [x] `docs/STATUS.md` updated.
- [x] `docs/journal/302-part-support-modules.md` written.
- [x] Affected docs: none describe these modules yet; `guides/writing-a-mod.md` lists stock modules by family only.
- [x] New ADRs: none.
- [x] Research: nothing looked up.

## Log

- 2026-10-21 — Written and done in one go on the owner's instruction (prepare first, then all parts).
