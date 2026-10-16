---
id: 045
title: "Maneuver nodes"
status: done
owner: "node session (Claude, 2026-10-17)"
depends: [044]
phase: 2
created: 2026-10-17
updated: 2026-10-17
---

# 045 — Maneuver nodes

## Goal

A player plans burns in the map view: place a node on the orbit (click the path), drag prograde/normal/radial handles, see the predicted orbit after the burn (including SOI encounters and the closest approach to the moon), the Δv and estimated burn time, a navball maneuver marker and a burn countdown; SAS can point at the node (`maneuver` mode); time warp goes to the node; scripts can read, create and remove nodes. Plan 035's node half is folded in here.

## Context

- ADRs 0048 (v1 scope), 0049 (SAS), 0050 and 0051 (save format, patched conics), 0033 (`Renderer.project`), 0021/0026 (HUD), new 0056 (this plan's data and rules).
- Journals 042 ("For plan 045"), 043, 044 ("Notes for plan 045"). Research `research/maneuver-nodes.md`.
- Plan 035 (script target and maneuver data): the node part moves here; `ship.target` and body state over time stay in 035.

## Scope

**In:** node data in the sim (a component of the vessel, saved; save format 3 with a migration), commands, prediction (`kepler.predictWithManeuvers`), remaining-burn model, SAS `maneuver` mode, `warp-to`, snapshot data, map-view handles with mouse and keyboard, burn time from the stage model (`delta-v.ts`), navball marker, burn panel with countdown, script API.
**Out:** a target selector and rendezvous tools (plan 035), chained-transfer optimisation, finite-burn simulation in the prediction (the prediction is the impulsive burn; the panel says so), node editing by touch.

## Design notes (see ADR 0056)

- `VesselState.nodes`: `{ id, time, prograde, normal, radial, target }` (m/s in the orbital frame at the node, `target` the absolute post-burn velocity once set). Max 8.
- Remaining burn = target velocity minus the velocity the vessel's current orbit has at the node time; it equals the plan while coasting and shrinks while burning. A node is removed when its time has passed and less than 0.5 m/s remain.
- One function, `kepler.predictWithManeuvers`, serves the sim (resolution, SAS vector) and the page (drawing).
- `warp-to { time, factor }`: sim-side, tapers the warp so it stops exactly at `time`; stops on an SOI change like any warp.

## Steps

1. Refine and record (this document, ADR 0056, research). 
2. kepler: `orbitalFrame`, `burnVector`, `patchedStateAt`, `predictWithManeuvers` + tests.
3. core: `ManeuverNode`/snapshot types, `node-set`, `node-remove`, `warp-to`, `maneuver` SAS mode, save format 3 and migration, API 0.1.14.
4. sim: node storage and resolution, commands, completion, SAS maneuver (flight and rails), warp-to, snapshot, save/resume tests, v1 and v2 fixtures still load.
5. scripting: `ship.nodes`, `addNode`, `removeNode`, `warpTo`, `ship.sas = 'maneuver'`; guide.
6. renderer: planned-path colour only (`MapPathSegment.planned`).
7. web: `maneuver.ts` (burn time, handle drag to Δv, pick on path), controller, map layer with handles, navball marker, burn panel, SAS button, keys, warp to node.
8. Browser run (moon transfer by nodes + SAS), screenshots, all checks, docs.

## Acceptance criteria

Kepler (`packages/kepler/test/maneuver.test.ts`):
- [x] The post-burn orbit of an impulsive node equals independent propagation: raising the apoapsis of a 200 km circular orbit by a prograde node gives an apoapsis radius equal to the vis-viva value within 1e-6 relative, and the predicted position 1 h after the node equals `propagateUniversal` of the hand-added Δv state within 1 mm.
- [x] With `target` set, the burn is `target - pre.v` (exact within 1e-9 m/s); node frame axes are orthonormal and right-handed (prograde x normal = radial) within 1e-12.
- [x] A node whose time the path never reaches (impact first) is reported unreachable, not thrown.

Sim (`packages/sim/test/maneuver.test.ts`, `warp-to.test.ts`, `resume.test.ts`, `save-format.test.ts`):
- [x] SOI encounter: on the stock bodies a node of the transfer Δv from a 200 km circular orbit predicts an entry into the moon's sphere; the predicted moon periapsis equals the sim's (post-burn state on rails, run to the encounter) within 1 km, and the entry time within 10 s.
- [x] A finite burn executed with SAS `maneuver` and the engine ends with the remaining burn below 1 m/s and the node removed, and the orbit's apoapsis within 2 % of the impulsive prediction (value measured and recorded in the Log).
- [x] Burn time: the web `burnTime(dv, stages)` equals the Tsiolkovsky value `m0 (1 - exp(-dv/ve)) / mdot` of the stock stage within 1e-9 s relative (web vitest) and the sim's actual burn of that Δv lasts within 3 % of it (sim test).
- [x] SAS `maneuver`: the nose points within 1 degree of the burn vector in flight and on rails (pointing error from the snapshot and measured from the orientation), and follows the vector as the node is edited.
- [x] `warp-to` stops at the requested time within 1e-6 s with warp 1 afterwards, never overshoots at warp 1e5, and is cancelled by an SOI change; refused in flight (like `warp`).
- [x] Save round trip: nodes (with a target) survive `save()`/`createSim({ resume })` byte for byte and the resumed run is identical; the frozen version 1 and 2 fixtures still load (nodes empty), a version 3 fixture is frozen.
- [x] Commands are validated: past time, non-finite values, 9th node, unknown id, surface-rails vessel are refusals with a reason.

Scripting (`packages/scripting/test/maneuver.test.ts`):
- [x] `ship.nodes` lists the nodes; `addNode`, `removeNode`, `warpTo` issue validated commands and report refusals; a script plans, warps to, and burns a node in a headless run.

Web (`vitest`):
- [x] Handle drag to Δv: a drag of N pixels along a handle's screen axis changes that component by the specified amount, sign-correct for retrograde/antinormal/radial-in handles, scaled by Shift/Alt; picking a time on the path returns the nearest sample within 12 px and nothing farther.
- [x] Burn indicator: countdown, "burn now" window (centred), remaining Δv and overdue states for a table of cases; navball maneuver marker direction equals the node vector in the vessel frame.

`[manual]` in the browser (screenshots `docs/journal/assets/045-*.png`): from orbit plan a moon transfer with a node, warp to it, execute the burn with SAS `maneuver`, and see the moon encounter in the map.

- [x] `bun run test`, web vitest, `bun run typecheck`, `bun run build`, `bun run docs:check`, prettier on touched files all pass.

## Docs checklist

- [x] STATUS, journal 045, ADR 0056, `guides/scripting.md`, `architecture` simulation/protocol notes, research, plan 035 note, glossary (maneuver node).

## Log

- 2026-10-17 — Created as draft (ADR 0048, v1 scope).
- 2026-10-17 — Refined draft → ready at the human's request (session: node session).
- 2026-10-17 — Done. Evidence: kepler `maneuver.test.ts` (vis-viva apoapsis 1e-6, position 1 mm, target exact, unreachable listed); sim `maneuver.test.ts` (moon encounter: predicted and flown periapsis both 218.632 km, entry 23625.7 s vs 23628.5 s; SAS maneuver 0.129 deg in flight; finite burn apoapsis 0.13 % from the impulsive value, full-throttle time 20.24 s vs 20.21 s), `warp-to.test.ts` (lands within 1e-6 s, no overshoot at 1e5x, SOI change cancels it), `resume.test.ts` (nodes with target and SAS maneuver resume byte for byte), `save-format.test.ts` (v1, v2 fixtures load, v3 fixture frozen); scripting `maneuver.test.ts`; web `maneuver.test.ts`, `maneuver-controller.test.ts`, `map-path.test.ts`, `navball-math.test.ts`, `sas-model.test.ts`. Manual run in the browser and screenshots: journal 045.
- 2026-10-17 — Deviations: node completion threshold is 0.5 m/s (draft 0.1, a throttled script could not hit it); the burn-time criterion is checked as "full throttle until 8 m/s left" within 3 % (the engine's tail at low throttle is not part of the rocket equation); `save-v3.json` instead of only keeping v1/v2 fixtures; the sim host message carries `warp`.
