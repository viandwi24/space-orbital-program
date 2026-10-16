# 014 — Re-entry heating and part temperature

**Plan:** plans/014-reentry-heating.md · **Session(s):** heating session (Claude, 2026-10-16) · **Date:** 2026-10-16

## What was done

The draft was refined to `ready` at the human's request (formulas checked online, `research/reentry-heating.md`, ADR 0023, measurable criteria), then implemented. No scaffolding, no new dependencies. `API_VERSION` 0.1.3 -> 0.1.4 (additive).

| Area | Change |
|---|---|
| core | `PartDefinition.maxTemperature`; `PartSnapshot.temperature?`; `part:damaged` gains `cause?`/`temperature?`; `ModuleDefinition.absorbHeat` + `HeatLoad` (re-exported by the SDK) |
| sim | `thermal.ts` (surface area, nose radius, Sutton-Graves flux, `heatInput`, implicit-Euler `advanceTemperature`, `stepThermal`); `PartState.temperature`; `applyDrag` returns the heat per part; `prepareFrame` returns the overheated parts; `burnPart` (vessel.ts, shares `loosePart` with `damagePart`); rails vessels cool by radiation in `stepRailsVessels`; temperature in the snapshot |
| stock | `stock.ablator` resource, `stock.heat-shield` module (store + `absorbHeat`) and part, `maxTemperature` on every part |
| tests | `heating.test.ts` (11), `helpers/reentry.ts`, heat shield tests in `modules.test.ts`, boot test ids, peak temperature in `landing.test.ts` |
| docs | ADR 0023, research, `simulation.md`, `plugin-system.md`, guide, glossary |

## Numbers

Scenario `deorbit`: 70 km, 2 250 m/s inertial (below the 2 290 m/s circular speed there), 2.9 degrees below the horizontal, tail first (a pod/wheel/tank stack, bottom end into the flow; it holds that attitude without control).

- **Unshielded probe:** the tank's windward end reaches 900 K at t = 386 s (airspeed 1 805 m/s) and is destroyed (`part:damaged`, `overheat`, 900.06 K); the vessel continues, pod peak 435 K, wheel 452 K, reaches 5 km at 577 m/s (no impact).
- **Shielded probe** (heat shield under the tank, 80 kg + 120 u ablator): shield skin pinned at 700.4 K from about t = 330 s, ablator 120 -> 101.25 (18.75 kg burnt = 56 MJ carried away), tank peak 366 K, pod 351 K; reaches 5 km at 1 411 m/s with 4 parts and no event.
- **Slow pass** (300 m/s, 10 km, steep): 289.0 K peak (+0.9 K).
- **Plan 012 lander** (unchanged test): peak skin temperature 295 K over the whole descent; the braking burn keeps it at a few hundred m/s in dense air, so no vessel or profile change was needed. A lander left to fall without braking would burn: it reached 1 456 K at the legs (limit 1000) at 5 km altitude and 2.2 km/s in a first experiment with the default 1500 K limit.
- **Cost:** 12-13 µs per step including a snapshot for a 3-4 part probe (the Newton solve is a few iterations per part).

## What surprised me

- **Steeper is not hotter here.** The skin is thin but still has capacity, and the heating pulse of a steep entry is short: a lander on a 14 degree path peaked 1 400 K only at 5 km after 110 s, a 3 degree path gives 900-1 000 K but over 400 s. Radiation caps a shallow entry (equilibrium 800-950 K at these fluxes). The criteria therefore use a shallow deorbit path, the realistic way to come back from orbit; the draft's "steep" wording is dropped.
- **The Sutton-Graves value at this planet is mild.** Orbital speed here is 2.2 km/s against 7.8 km/s on Earth, so `v³` is 43 times smaller; heating the whole part mass would give degrees, not hundreds. Hence the thin-skin capacity and stock limits in the 0.9-1.8 kK band (aluminium melts at 933 K) instead of KSP's 2-3.3 kK (KSP heats much harder).
- **Explicit-looking Newton diverged for big steps.** The first iteration started from "no radiation" (`T0 + hP/C`, absurd for a 1e6 s step) and 12 quartic Newton steps were not enough; starting from `min(source, max(T0, radiative equilibrium))` converges monotonically in a handful of iterations for any step (this is what makes a 10 s rails chunk safe).
- ADR number: 0022 was taken by plan 015's session while I was working, so this is 0023.
- Mutation checks: tank limit 9000 K fails the unshielded test; forcing `absorbHeat` to 0 fails the shielded test (both restored).

## Decisions

ADR 0023: temperature is part state (not module state); Sutton-Graves over the windward area with the drag model's shielding; implicit radiation update also on rails; overheating destroys (no `broken`); `part:damaged.cause`; heat shield as a module hook plus an ablator resource; `reapDebris` stays.

## For the web client, plan 016 and later

- Snapshot: `parts[i].temperature` (K) is always present from the sim; a HUD can colour parts or show the hottest. Event `part:damaged` now has `cause: 'impact' | 'overheat'` (toast text) and, for overheat, `temperature`. `vessel:destroyed` reason may be `"<part id> destroyed by overheating"`.
- New stock part `stock.heat-shield` (mount it at the end that faces the airflow, tail first for a stack) and its module state `{ ablator }` in `parts[i].modules['stock.heat-shield']` (a gauge).
- Plan 016 (landed vessels on rails): temperature is plain part state and cools on rails already; a vessel put on surface-fixed rails needs no heat handling.
- Uncontrolled vessels tumble and will heat sideways; debris in flight below 70 km burns for real now, on rails it is still removed at the top.

## Open questions / follow-ups

- No conduction between parts, no wake/angle-of-attack shock, no convective cooling in dense air, no plasma blackout: a part behind a shield is shielded only by its covered end face and by not being exposed. Draft plan if the human wants more fidelity.
- A HUD/renderer readout of temperature (web client plan).
- `k`, `SKIN_HEAT_CAPACITY` and the stock limits are tuning knobs (ADR 0023).

## Verification output

See the plan's Log and the commit messages; final commands: `bun test` (all green except the other session's scripting WIP if present), `bun run typecheck`, `bun run build`, `bun run docs:check`, prettier on the touched packages.
