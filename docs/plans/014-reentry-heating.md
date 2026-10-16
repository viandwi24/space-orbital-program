---
id: 014
title: Re-entry heating and part temperature
status: done
owner: "heating session (Claude, 2026-10-16)"
depends: [012, 013]
phase: 3
created: 2026-10-16
updated: 2026-10-16
---

# 014 — Re-entry heating and part temperature

## Goal

A vessel that enters the atmosphere fast heats up: each part has a skin temperature that rises with the stagnation heat flux `k·√(ρ/r_n)·v³` over the area the airflow hits and falls by radiation, and a part that exceeds its `maxTemperature` is destroyed (`part:damaged`, cause `overheat`). A stock ablative heat shield, through the public SDK, carries the heat away by burning an ablator resource. Plans 007 and 012 deliberately simulate no heat.

## Context

- [ADR 0023](../decisions/0023-reentry-heating-and-part-temperature.md) (this plan's decisions), `docs/research/reentry-heating.md`.
- ADR 0019 (`impactTolerance`, `part:damaged`, `damagePart`), ADR 0021 (debris is removed at the atmosphere top while on rails; kept), ADR 0017 (drag, atmosphere), `docs/architecture/simulation.md`, `packages/sim/src/aero.ts`, `frames.ts` (`applyDrag`), `vessel.ts`.
- Journals 012 and 013; `docs/guides/writing-a-mod.md`, `docs/architecture/plugin-system.md`.

## Scope

**In:** `PartState.temperature` + `PartSnapshot.temperature`; Sutton-Graves heating from the drag state; radiation cooling (flight and rails); `PartDefinition.maxTemperature`; overheat loss through the damage path with `cause`/`temperature` on `part:damaged`; `ModuleDefinition.absorbHeat`; stock `stock.ablator`, `stock.heat-shield` module and part; stock `maxTemperature` values; `API_VERSION` 0.1.4.
**Out:** plasma blackout, conduction between parts, per-face heating, convective cooling, a HUD/renderer readout (the snapshot carries the temperature), heating on rails, debris burn-up replacing `reapDebris`.

## Design notes

Decisions are in ADR 0023. Test fixtures: `packages/sim/test/helpers/reentry.ts` (`enter`, `probeEntry`, `shieldedProbe`, `deorbit` = 70 km, 2 250 m/s, 2.9 degrees down, tail first).

## Steps

1. Core/SDK (additive): `maxTemperature`, `PartSnapshot.temperature`, `part:damaged` `cause`/`temperature`, `ModuleDefinition.absorbHeat`/`HeatLoad`, `API_VERSION` 0.1.4.
2. Sim: `thermal.ts` (heat input, implicit radiation update, module absorb, overheat list), `PartState.temperature`, heating from `applyDrag`, `burnPart` after the step, rails radiation, snapshot.
3. Stock: `stock.ablator`, `stock.heat-shield` module and part, `maxTemperature` on every part.
4. Tests (`heating.test.ts`, stock module tests, landing peak temperature), docs.

## Acceptance criteria

- [x] `bun test packages/sim/test/heating.test.ts`: an unshielded probe (pod, wheel, tank) on the `deorbit` path, tail first, emits `part:damaged` with `cause: 'overheat'`, `outcome: 'destroyed'`, `temperature` > 900 for `stock.tank-small`, and no impact event.
- [x] Same file: the same entry with a `stock.heat-shield` under the tank reaches 5 km altitude with 4 parts, no `part:damaged`, ablator strictly between 0 and 120 u, peak skin temperature < 900 K.
- [x] Same file: a slow low pass (300 m/s, 10 km) keeps every part within 10 K of ambient (288.15 K).
- [x] Same file: a part at 800 K cools monotonically by radiation to < 500 K within 600 s, in flight on the ground and on rails; `advanceTemperature` is monotone and stable for steps 0.02 s to 1e4 s, converges to the radiative equilibrium, and agrees with explicit integration at small steps.
- [x] Same file: two runs of the shielded entry give byte-identical snapshot and serialized world.
- [x] `bun test packages/sim/test/landing.test.ts`: the plan 012 lander still lands with every part, no `part:damaged`, and its peak skin temperature is < 400 K (no change to the test vessel or profile is needed).
- [x] `bun test packages/sim/test/debris.test.ts packages/sim/test/scenario-orbit.test.ts packages/sim/test/determinism.test.ts packages/sim/test/warp.test.ts` pass unchanged.
- [x] `bun test mods/stock`: the heat shield module's store, threshold, burn rate and exhaustion; stock boot lists `stock.ablator`, `stock.heat-shield`.
- [x] Mutation: raising the tank `maxTemperature` to 9000 fails the unshielded test; forcing the shield's `absorbHeat` to 0 fails the shielded test (both restored).
- [x] `bun run typecheck`, `bun run build`, `bun run docs:check`, `bunx prettier --check packages/core packages/sim packages/sdk mods/stock`, and the boundary greps (no `three`/DOM/`process` in sim/core/sdk/mods; mods import only `@orbital/sdk`) are clean.

## Docs checklist

- [x] `docs/STATUS.md`, journal 014, `simulation.md`, `plugin-system.md`, `guides/writing-a-mod.md`, glossary, ADR 0023 + index, `research/reentry-heating.md` + index.

## Log

- 2026-10-16 — Created as draft by plan 012 (re-entry heating is out of scope there; its hooks are `impactTolerance` and `part:damaged`).
- 2026-10-16 — Refined draft → ready at the human's request (session: heating session). Physics verified online (research/reentry-heating.md); ADR 0023 answers the open questions (temperature is part state; heat shield = module hook `absorbHeat` + ablator resource; `part:damaged` gets `cause`). The "lander without a shield loses its pod on a 100 km deorbit" example from the draft is not adopted: the plan 012 lander brakes with its engine and peaks at 295 K, so the criteria use a probe on a ballistic deorbit path instead. ADR number 0023 (0022 was taken by plan 015).
- 2026-10-16 — Done. Evidence: `bun test` 346 pass / 0 fail (46 files); typecheck 8 workspaces + web 0 errors; build ok; docs:check ok; prettier clean. Heating test output: unshielded `tank-small` destroyed at 386 s / 900.06 K; shielded peak 700 K, ablator 101.25 of 120, 4 parts at 5 km; slow pass +0.9 K; lander peak 295 K; mutations fail as expected. Plan 012's lander needed no change. Criterion wording "steeply" became a 2.9 degree deorbit path (steeper entries peak lower here, see journal 014).
