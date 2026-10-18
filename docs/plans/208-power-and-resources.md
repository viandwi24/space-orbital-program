---
id: 208
title: "Resources and power: monoprop, solid fuel, batteries, real solar, RTG, transmit cost"
status: done
owner: "Worker A"
depends: [207]
phase: 7
created: 2026-10-18
updated: 2026-10-19
---

# 208 — Resources and power: monoprop, solid fuel, batteries, real solar, RTG, transmit cost

## Goal

Power behaves the way a KSP player expects. Monopropellant and solid fuel exist as resources and the EVA propellant becomes Cold gas. Three battery sizes, fixed and sun-tracking solar panels whose output follows sun angle, sun distance and body shadow (in flight and in the background), and an RTG are in the stock parts. Transmitting data costs EC and time, probe cores drain EC, and a probe at zero EC loses control with a notification. The core computes a power budget (day and night) that the Hangar can show.

## Context

- rancangan §4.1 (resources), §4.2 (battery, solar and RTG rows; KSP reference numbers), §4.3 (power rules).
- Research: `refs/reverse-engineering-ksp-ksp2/11-resources-power-isru.md`, `09-parts-catalogue.md`, `16-verification-log.md` (battery 5 kg per 100 EC, RTG 0.75 EC/s, OX-10 class panel 8.25 EC/s); `15d-parts-science-crew-audit-raw.md` A3, A4.
- Evidence:
  - `mods/stock/src/solar.ts:4, 25-28`: one panel at a constant 0.5 EC/s, also in the background; no sun angle, occlusion or distance falloff (plan 190, ADR 0171).
  - `mods/stock/src/resources.ts`: no monoprop or solid fuel; `mods/stock/src/eva.ts:21`: `stock.eva-propellant`.
  - `mods/stock/src/comms.ts:75, 85, 99`: antennas have a `power` field but transmitting draws no EC; transmission queue in `packages/sim/src/transmission.ts:42-190`.
  - Built-in storage only (pod 50, probe 20, suit 20 EC); the `stock.batteries` action group is empty (`mods/stock/src/action-groups.ts`).
  - Reaction wheels already lose authority at zero EC (`mods/stock/src/modules.ts:396-420`); experiments pause (`mods/stock/src/science.ts:169, 216-219`).
- Parts go into the per-family files from plan 207 (`mods/stock/src/parts/power.ts`, `parts/tanks.ts`).
- ADRs: 0203 (resources and power rules), 0109 (control source), 0214 (sunlight model, panel modes, power rules in the sim).

## Scope

**In:**
- Resources: monopropellant (about 4 kg/u, `vessel` flow), solid fuel (about 7.5 kg/u, `none` flow: an SRB burns only its own), Cold gas (rename of EVA propellant, with a save migration).
- Batteries small, medium, large (5 kg per 100 EC); `stock.batteries` group.
- Solar: fixed panel, the existing folding panel, a large sun-tracking folding panel. Output = rated × cos(sun angle) × (1 AU / distance)² × (not in shadow), in flight and on the world tick.
- RTG at 0.75 EC/s, always on.
- Transmission costs EC per Mbit and takes time per the antenna rate; a queue pauses at zero EC.
- Probe core drain; a probe-only vessel at zero EC is uncontrolled (ADR 0109 chip from plan 200) and a bell entry says so.
- Power budget in `packages/core` (producers and consumers, day and night) for the Hangar (shown by plan 218).

**Out:** fuel cells, alternators (P1/P2); tank transfer and flow locks (plan 213); RCS (plan 211); SRB parts (plan 210, which uses solid fuel from here).

## Touches

- **Size:** L
- **Edits:** `mods/stock/src/resources.ts`, `mods/stock/src/eva.ts`, `mods/stock/src/solar.ts`, `mods/stock/src/comms.ts`, `mods/stock/src/modules.ts` (command drain), `mods/stock/src/parts/power.ts` and `parts/command.ts` (from plan 207), `mods/stock/src/action-groups.ts`, `packages/sim/src/transmission.ts`, `packages/sim/src/tick.ts` (background solar), `packages/sim/src/core.ts` or `packages/sim/src/comms.ts` (control at zero EC), `packages/core/src/save.ts` (resource rename migration), `packages/core/src/power-budget.ts` (new)
- **Shared contracts:** **resources** (new ids `stock.monopropellant`, `stock.solid-fuel`, `stock.cold-gas`; used by plans 210, 211, 213, 225); **save** (rename migration, `SIM_SAVE_VERSION` bump); **power budget API** (read by plan 218); **sim events** (`power:depleted`).

## Design notes

- Sun exposure needs the sun direction and the occluding bodies; reuse the body positions the sim already has for the current SOI chain. Shadow is a cylinder test against each body between the vessel and the sun (no penumbra).
- Background vessels integrate solar per world tick with the same function, sampled at the tick's mid time.
- The KSP numbers are a starting point for balance, not a copy (rancangan §4.2).

## Steps

1. Resources: monoprop, solid fuel, Cold gas rename and the save migration.
2. Battery parts and the batteries group.
3. Solar model (angle, distance, shadow) in flight and background; tracking and fixed panels.
4. RTG.
5. Transmission EC and time cost; probe core drain; loss of control and the bell entry.
6. Power budget in core; tests.

## Acceptance criteria

- [x] `bun test packages/sim` passes, including `test/solar.test.ts` (extended): a panel facing the sun gives its rating at 1 AU, about half at 60°, zero behind the home body; the same vessel on rails over one orbit gets the same EC within 1 % as in physics.
- [x] `bun test packages/sim` passes `test/power.test.ts`: transmitting 10 Mbit costs the antenna's EC per Mbit and takes the rated time; at zero EC the queue pauses; a probe-only vessel at zero EC refuses throttle with the "no power" reason.
- [x] `bun test packages/core` passes `test/power-budget.test.ts`: two batteries, one RTG and one probe core give the expected day and night net rates.
- [x] `bun test packages/core` passes the save migration test: an old save with `stock.eva-propellant` loads as `stock.cold-gas` with the same amount.
- [x] `bun test mods/stock` passes, including the part-id snapshot (updated with the new parts only).
- [x] Chromium e2e `e2e/power.e2e.ts`: `debugSetOrbit` a probe with one panel to 100 km; EC rises on the day side and stops in shadow; `debugSetResource` EC to 0 shows the "Uncontrolled" chip and a bell entry.
- [x] `bun run check:affected --e2e e2e/power.e2e.ts` passes.
- [x] CI green on the `ready/208` tag (`refs/ci/pass/<sha>`, ADR 0126).

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/208-power-and-resources.md` written.
- [x] `docs/architecture/simulation.md` updated (resources, solar model, transmission cost).
- [x] ADR 0203 linked; ADR 0171 notes it is extended.

## Log

- 2026-10-18 — Created from refs/rancangan-terpadu.md (release roadmap).
- 2026-10-18 — Coordinator: `depends` set to 207, since the new parts go into the split part files.
- 2026-10-19 — Worker A: refined against the code and implemented on `rel/208-power` (ADR 0214; 0213 went to plan 203). Defaults noted, not asked:
  - flux 1 is the home planet's distance;
  - the large tracking array gives 8.25 EC/s and the fixed panel 0.35 EC/s;
  - a probe core draws 0.025 EC/s;
  - a transmission costs 0.2 EC per Mbit per watt.
- 2026-10-19 — Worker A, deviations from the plan as written:
  - The notice is an "Out of power" toast, and since plan 205 also an entry in the world layout's bell.
  - The e2e checks night with `debugSetLocation` on the far side of the home planet, not with a shadowed orbit: in orbit the array would fill the battery within seconds at warp, and the sunlit part of an orbit is not known in advance.
  - Rails vessels' `background` forms now refresh every 5 s × the warp, so charge shows on rails.
  - A probe out of power is no debris (`isControlled` stays structural).
  - Batteries have no `stock.batteries` action yet: they would need the flow lock of plan 213.
- 2026-10-19 — Worker A, found and fixed: the solar module's descriptor category `'other'` is invalid, so on main any design with a solar panel did not open in the Hangar (since plan 190). It is now `stock.other`, with a test that validates every stock module's descriptor. The debug log (plan 203) had no line for the new event, so the toast never fired.
- 2026-10-19 — Checks: `bun run check:affected --e2e e2e/power.e2e.ts` all passed in 504 s (typecheck, bun test 10 workspaces, web vitest 587/587, Chromium `power.e2e.ts` 1/1).
- 2026-10-19 — Worker A: CI was red on `ready/208` three times at "bun test" with only "Process completed with exit code 1" and no failing test.
  - The job log and the summary need a login, so nobody here could read them.
  - `CI=true bun run test` (1797/0), `CI=true bun run check:affected --full` (all passed, 377 s), sim tests under `--timeout 2000` (513/0) and `CI=true bun run check:affected --e2e e2e/power.e2e.ts` (all passed, 300 s) all passed on the M5.
  - Merged by the brief's fallback with the coordinator's agreement. If main's CI turns red after this merge, fixing it comes before the next plan.
