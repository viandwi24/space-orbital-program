---
id: 298
title: "Satellites and a space telescope: the observation needs the door open and the target in view; the orbiter probe bus is an open choice"
status: done
owner: "Worker B"
depends: [303]
phase: 0
created: 2026-10-21
updated: 2026-10-24
---

# 298 — Satellites and a space telescope

## Goal

The space telescope's observation yields science only when its aperture door is open and the craft points within 5° of its target. Today a run succeeds anywhere in high orbit, door shut or pointing away.

## Context

- Plan 303 delivered the parts: `stock.satellite-bus`, `stock.telescope` (with an aperture door, a `ModuleAnimate` labelled "Aperture door") and `stock.magnetometer-boom`, in `mods/stock/src/parts/missions.ts` (about lines 336, 821, 848).
- `mods/stock/src/science.ts`: `ExperimentObservation` (about line 176) lists only situations (`stock.space-high`). `ModuleExperiment`'s `run` action (about line 360) checks the situation and the held sample or result; it checks neither the door nor the pointing.
- ADRs: 0178 (science), 0259.
- Tests: `mods/stock/test/held-experiments.test.ts` for the module's test setup.

## Scope

**In:**
- An experiment condition for the door: the run is refused (`INVALID`, with a reason) while the part's `ModuleAnimate` is closed.
- A pointing condition: the run is refused unless the craft's forward axis is within 5° of the target body. The target is the vessel's set target, else the body it orbits (decide which in the Log or an ADR).
- Both as optional fields of the experiment definition, so other experiments are unchanged.
- A sim test.

**Out:**
- Asteroid discovery or a sky map.
- **Open choice (owner):** the orbiter probe bus with its own engine and the high-gain antennas on arms were never built. Either build them here or drop them. Until the owner decides, they are not in scope.

## Design notes

Check the conditions when a run starts, and stop a run that loses them (door closed or pointing off by more than 5°) as the situation check does today. Keep the pointing check in the module, using the vessel's attitude and the target's position from the module context.

## Steps

1. Add the optional door and pointing conditions to the experiment definition; set both on `ExperimentObservation`.
2. Enforce them in `ModuleExperiment.run` and while a run advances.
3. Sim test.

## Acceptance criteria

- [x] `bun test mods/stock` (`observation-conditions.test.ts`) and a real sim (`packages/sim/test/telescope-observation.test.ts`): an observation in high orbit is `INVALID` with the door closed; with the door open and the craft 10° off the target it is `INVALID`; with the door open and within 5° it runs and yields a result.
- [x] `bun test`, `bun run typecheck` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/298-satellites-and-telescope.md` written.
- [x] Affected `docs/architecture/*.md` updated to match what shipped (`plugin-system.md`).
- [x] New ADR: [0331](../decisions/0331-experiment-conditions-door-and-pointing.md).
- [x] `refs/part-visuals-and-blueprints/parts-tracker.md`: mission table (§11).

## Log

- 2026-10-24 — Rewritten by the coordinator after an audit against main @ 4c546c02: parts are done (plan 303); the remaining work is the door and pointing conditions on the observation with a sim test; the probe bus and high-gain arms are an open choice for the owner; the dependency on 280 is dropped.
- 2026-10-21 — Parts delivered in plan 303: satellite bus, telescope, magnetometer boom, observation and magnetometer experiments. Open: the pointing condition.
- 2026-10-21 — Drafted from the owner's mission targets of 2026-10-21 (Apollo 11, Space Shuttle, station, rover, orbiter, space telescope, research satellite): rocket parts first, rover after, robotics last.
- 2026-10-24 — Worker B: door and pointing conditions on the experiment definition (ADR 0331); the target is the set target, else the body it orbits. The probe bus and high-gain arms stay an open choice for the owner.
