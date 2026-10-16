# 042 — SAS and flight assists

**Plan:** plans/042-sas-and-flight-assists.md · **Session:** sas session (Claude, 2026-10-17) · **ADR:** [0049](../decisions/0049-sas-in-the-sim-with-module-authority.md) · **Research:** [sas-attitude-control](../research/sas-attitude-control.md)

**Status: done.** Sim, stock, core and the HUD components were committed first; the flight loop, flight page and script API hunks were integrated afterwards (section "Integration").

## What was done

| Where | What |
|---|---|
| `packages/core` | API 0.1.11 (additive): `sas` command (`mode?`, `reference?`), `SasMode`/`SasReference`/`SasSnapshot`, `VesselSnapshot.sas`, `ModuleDefinition.controlAuthority` |
| `packages/sim` | `sas.ts`: the controller (in `prepareFrame` before the module hooks), rails tracking at the end of a rails step, `VesselState.sas`, `effectiveControl` (what modules see as `control`), body inertia kept on `FlightBody`, snapshot field, staging copies the state to the split-off vessel |
| `mods/stock` | `controlAuthority` of the reaction wheel (enabled and powered), the gimbal engine (`gimbalAuthority`: thrust x sin(range) x lever, zero when cold), the control surface (`surfaceAuthority`: force change over the range x lever, zero in vacuum) |
| `apps/web` | `hud/sas-model.ts` (buttons, keys, commands, reference follow rule), `hud/SasButtons.svelte` (strip under the navball; optional on `InstrumentDeck`), `HudModel.sas/controllable`, `HudController.sasCommand/sasFollowUp`, controls list |

## How it works (short)

The demand is normalised by the vessel's real angular-acceleration capability (module-reported authority over the inertia diagonal), so one set of gains serves a 5 kN m wheel and a 100 kN m bell. Desired rate is `min(0.7 e, sqrt(2 * 0.5 a_max e), 0.6 rad/s)`, rate loop 3/s, a bounded integral that learns constant disturbance torques. Player input overrides while held; `hold` then settles and latches. A settled vessel gets exactly zero demand so it still goes on rails; on orbital rails a pointing mode keeps the nose on its direction analytically.

## Verification (headless, `packages/sim/test/sas.test.ts`, 36 tests)

| Criterion | Evidence |
|---|---|
| Hold under a 20 % pitch disturbance (1000 N m; wheel 5 kN m) | worst 0.82 deg (two-stage), 0.74 (`saturn(1)`), 0.73 (lander); after 20 s 0.03, 0.01, 0.00 deg (asserted 3 and 1) |
| Modes converge (90 degrees off, orbit reference, asserted within 2 degrees in 30 s) | two-stage 4.9 to 9.4 s, `saturn(1)` 6.1 to 11.9 s, lander 7.7 to 15.4 s over prograde, retrograde, normal, antinormal, radial-out, radial-in; retrograde from 170 degrees off: 10.9, 13.7 and 17.4 s |
| No limit cycle | settled for 60 s after 40 s: error 0.00 to 0.03 deg (asserted 0.25), angular speed 2.7e-3 rad/s which is the orbital rate of the prograde direction itself (asserted 5e-3) |
| Thrust | `saturn(1)` burning in vacuum, prograde through the gimbal: worst error after 10 s 0.90 deg |
| Ascent | a kick until the nose is 5 (two-stage) or 20 degrees (`saturn(1)`) off vertical, then surface prograde: worst angle of attack 1.74 and 0.88 deg from 3 s after engaging, nose 31.6 degrees from vertical at 10 km (two-stage) and 22.9 at 20 km (`saturn(1)`) with no scripted steering. A bigger kick on the two-stage rocket (25 degrees) tips it over to horizontal and it falls: that is gravity-turn physics (TWR about 2), not an SAS fault, and the reason for the small kick. The criterion's 30 km became 10 and 20 km |
| Input override | hold, pitch held 4 s turned the vessel 40 degrees, after release the attitude latches and drifts 0.000 deg in 20 s; pointing mode steps aside while the key is held and points again within 0.5 deg 40 s after release |
| Rails | a settled pointing vessel goes on rails by itself; 120 s at 100x keeps 0.0000 deg error; the wake is steady (error under 1 deg after 0.5 s); `hold` keeps the frozen attitude exactly through the warp |
| Protocol | unknown vessel, bad mode, uncontrolled vessel refused; snapshot `sas`; an omitted field keeps its value; determinism: two runs give the same JSON |
| Authority unit tests | `mods/stock/test/authority.test.ts` (11): wheel with and without charge or when disabled, gimbal lit (T sin 3 deg x 6 m = 67.5 kN m by hand), lever sign, short lever, cold, flamed out, no range; control surface in vacuum and in air, no lever. `packages/core/test/sas-command.test.ts` |
| HUD | `apps/web/src/lib/hud/sas-model.test.ts` (button list and keys, active and disabled states, the T toggle, number keys, reference follow rule, error text) |
| Repo checks | `bun test` 1 085 pass 1 skip 0 fail; `bun run typecheck` 0 errors (svelte-check 1 358 files); `bun run build` ok; prettier clean on every file touched (it reports `site-meshes.ts` and `api-additions.test.ts` of other sessions); `bun run docs:check` only plans 035 and 036 missing from the board |

## `[manual]` browser run

On a copy of the repository at this plan's commits plus the integration hunks ([`assets/042-flight-integration.patch`](assets/042-flight-integration.patch)), because plan 032 and 039's files were not free (served by Vite on port 5198 in the built-in browser): the two-stage vessel on the pad, `T` shows "SAS on" and holds the attitude, full throttle and stage, a kick, `2` (prograde): angle of attack at most 0.29 deg from 4 to 10 km while the nose swung from vertical to 9 degrees above the horizon; staging kept the mode; `3` (retrograde) pointed the nose back along the velocity while burning. Screenshots: [prograde hold](assets/042-prograde-hold-ascent.png), [gravity turn](assets/042-gravity-turn.png), [retrograde after staging](assets/042-retrograde-after-staging.png). The first load after writing the design into storage showed "Vessel lost" once while Vite was re-optimising dependencies; a reload did not reproduce it and the sim test of SAS on the pad shows no damage.

## Surprises

- The existing mixer made the demand-to-torque path independent of the vessel, so the controller could stay a pure function of the vessel state; the only thing it could not know was authority, hence `controlAuthority`.
- Rails: pointing modes keep the vessel moving at the orbital rate (2.7e-3 rad/s) so no fixed rate dead band lets it go idle; the quiet band is defined on the error and a loose rate, and requires that the integrator has learned no disturbance. A first version evaluated the rails direction before the rails step advanced the elements and lagged by one rails step (1.5 degrees at 100x).
- Latching a held attitude at 0.01 rad/s drifted almost a degree afterwards; 0.004 rad/s gives 0.000.

## Integration (integration session, 2026-10-17)

- `docs/journal/assets/042-flight-integration.patch` did not apply with `git apply` (the flight loop had changed under plan 039); `patch -p1 -F3` applied five of six hunks, the import hunk was merged by hand. `flight-loop.ts`: `Flight.setSas`, the key handler (`modeForKey`: `T` toggles hold and off, `1` to `7` the modes), the prograde reference follow-up after every HUD model; `routes/flight/+page.svelte`: `sas`, `controllable` and `onsas` on `InstrumentDeck`.
- `ship.sas` (`packages/scripting`): the prelude's accessor (a mode set in a tick reads back at once, the sim's own mode from the next snapshot on), the runner's `case 'sas'` with the same repeat suppression as throttle and attitude, `Telemetry.sas`, three tests (command and read-back, bad values, a mode the player set), the documented-surface test and the scripting guide (`ship.sas`, `sas` in the telemetry table). The reference (`surface` or `orbit`) is not scriptable; the HUD's follow rule keeps choosing it.
- **Manual run on the real tree** (built-in browser, a production-mode build with the dev hooks on port 5204, journal 039 for the method): launch, `Z`, `Space`, `T` (SAS on, hold: [`042-integrated-sas-hold-on-liftoff.jpg`](assets/042-integrated-sas-hold-on-liftoff.jpg)), a pitch kick by command, `2`: [`042-integrated-prograde-gravity-turn.jpg`](assets/042-integrated-prograde-gravity-turn.jpg) at 7.4 km (pitch +58 degrees, SAS error 0.6 degrees), the sim's `sas.error` 0.17, 0.09, 0.03, 0.02, 0.03, 0.04, 0.08, 0.12 degrees at 9.5 to 15.3 km, then `Space` (stage 2): [`042-integrated-prograde-after-staging.jpg`](assets/042-integrated-prograde-after-staging.jpg) at 16.5 km, mode still `prograde` on the surface reference, error 0.2 degrees. My own angle-of-attack arithmetic in the page was wrong (it ignored the sign of the body rotation) and read 25 degrees; the sim's own error field is what the numbers above use.
- Checks after the integration: `bun run test` 814 pass 0 fail; `cd apps/web && bunx vitest --run` 414 pass (51 files); `bun run typecheck` 0 errors (svelte-check 1 388 files); `bun run build` ok; `bun run docs:check` OK (47 plans, 53 ADRs); prettier clean on the files touched.

## Not done

- Maneuver and target modes (plans 044/045); SAS part requirements (every controlled vessel has SAS).
