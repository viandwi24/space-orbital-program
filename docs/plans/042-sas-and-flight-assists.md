---
id: 042
title: "SAS and flight assists"
status: done
owner: "sas session (Claude, 2026-10-17)"
depends: [033]
phase: 2
created: 2026-10-17
updated: 2026-10-17
---

# 042 — SAS and flight assists

## Goal

A player can switch on SAS and the vessel holds its attitude, or points prograde/retrograde/normal/antinormal/radial-in/radial-out (and maneuver/target once 044/045 exist), using reaction wheels, gimbal and control surfaces through the existing torque-demand path, with navball buttons and keys like KSP players expect.

## Context

- `product/spec.md` Phase 1 lists "SAS-like stability assist"; never planned (ADR 0048). ADRs 0045 (gimbal/mixer), 0046 (fin damping), 0026 (HUD), 0017 (rails), journals 021, 026, 033 (the browser autopilot's latency problems).
- Decisions: [0049](../decisions/0049-sas-in-the-sim-with-module-authority.md) (SAS is a sim system; modules report authority; command, control law, input override, rails). Research: `research/sas-attitude-control.md`.
- Concurrency: plans 032 and 039 own `packages/scripting`, the web script files, `telemetry.ts`, `routes/flight/+page.svelte`, `flight-loop.ts` and renderer files; this plan integrates into those last, after they are `done`.

## Scope

**In:**
1. `core`/`sdk`: `sas` command, `VesselSnapshot.sas`, `ModuleDefinition.controlAuthority`; API 0.1.11 (additive).
2. `sim`: `sas.ts` (controller in the fixed step, rails behaviour), command handling, snapshot.
3. `mods/stock`: `controlAuthority` for the reaction wheel, the gimbal engine and the control surface.
4. Web HUD: pure `sas-model.ts` (modes, button states, key map) and `SasButtons.svelte` next to the navball; `T` toggles hold/off. Integration into `flight-loop.ts`/`routes/flight` and the script API (`ship.sas`) once 032/039 are done.

**Out:** autopilot ascent for players; maneuver/target modes (044/045 extend the mode union); SAS part requirements (every controlled vessel has it).

## Acceptance criteria

Tests are headless in `packages/sim/test/sas.test.ts` unless noted; vessels from `test/helpers/vessels.ts`; vacuum cases start at rest 200 km up, pointing +Y radially unless stated.

- [x] **Hold under disturbance:** with `hold` and a constant disturbance torque of 20 % of the vessel's pitch authority (a test module), the two-stage vessel, `saturn(1)` and the plan 012 lander each stay within 3 degrees at all times and within 1 degree after 20 s.
- [x] **Modes converge:** each of `prograde`, `retrograde`, `normal`, `antinormal`, `radial-in`, `radial-out` (reference orbit), started 90 degrees off (and `retrograde` 170 degrees off), points within 2 degrees within 30 s for the two-stage vessel, `saturn(1)` and the lander; the measured times are in the journal.
- [x] **No limit cycle:** after convergence, over the next 60 s the pointing error stays below 0.25 degree and the angular speed below 0.005 rad/s for every vessel above.
- [x] **Ascent:** `saturn(1)` and the two-stage vessel kick over, then fly with SAS `prograde` (surface reference) (10 km for the two-stage vessel, 20 km for `saturn(1)`): the angle of attack stays below 5 degrees from 3 s after SAS took over, and the nose is more than 20 degrees from vertical there without scripted steering.
- [x] **Input override:** with `hold`, a pitch input held 4 s turns the vessel more than 5 degrees; after release SAS latches the new attitude (angular speed below 0.01 rad/s) and the error against the latched attitude stays below 1 degree for 20 s.
- [x] **Rails:** with SAS `hold` or a pointing mode on and the vessel settled in orbit, it goes on rails, a 100x warp of 120 s keeps the pointing error below 1 degree (pointing modes) / the attitude unchanged (`hold`), and a wake leaves the vessel steady.
- [x] **Determinism:** two sims run the same SAS scenario step for step with identical snapshots (`JSON.stringify` equal).
- [x] **Protocol:** `sas` is refused for an unknown or uncontrolled vessel and for a bad mode/reference; the snapshot carries `sas`; `controlAuthority` has unit tests for the reaction wheel (including no power), gimbal (cold, lit, lever sign) and control surface (vacuum, in air); API version 0.1.11.
- [x] **HUD:** vitest for the mode list, button states (active, disabled without a control source), the `T`/number key map and the reference follow rule; screenshots `docs/journal/assets/042-*.png` (components done; wiring into the flight page waits for 032/039).
- [x] **Script API:** `ship.sas = 'prograde'` (read back the same) sets the mode through the command path (`packages/scripting/test/api-additions.test.ts`: command issued once, repeat not sent, bad values throw `TypeError`, the sim's mode read back on the next tick, a mode the player set is visible to the script).
- [x] **[manual]** browser, repeated on the real tree (journal 042, "Integration"): launch, `T` switches SAS on (hold), a kick, `2` (prograde): the SAS error stayed at 0.03 to 0.6 degrees from 7 to 15 km while the nose swung to +40 degrees pitch, staging kept the mode; screenshots `042-integrated-*.jpg`.
- [x] `bun test`, `bun run typecheck`, `bun run build`, `bun run docs:check`, prettier on touched files all pass (journal 042, "Integration").

## Docs checklist

- [x] STATUS, journal, ADR 0049, `architecture/simulation.md`, `guides/writing-a-mod.md` (`controlAuthority`), `plugin-system.md`, research.
- [x] `guides/scripting.md` (`ship.sas`) with the script API.

## Log

- 2026-10-17 — Created as draft (ADR 0048, v1 scope).
- 2026-10-17 — Refined draft → ready at the human's request (session: sas session).
- 2026-10-17 — Sim, stock, core and HUD components done and committed (headless criteria pass, journal 042); integration into plan 032/039's files and the script API pending.
- 2026-10-17 — Integrated into the flight loop and flight page (keys `T`, `1` to `7`, navball buttons) and the script API (`ship.sas`, telemetry `sas`) by the integration session, repeated the manual run on the real tree; plan 039 stayed in-progress for its own open criteria, which this plan does not depend on. done.
