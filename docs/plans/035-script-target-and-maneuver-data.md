---
id: 035
title: Script access to targets and maneuver nodes
status: done
owner: "script session (Claude, 2026-10-17)"
depends: [032]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 035 — Script access to targets and maneuver nodes

## Goal

A vessel can have a target (another body, or another vessel such as debris); the game reports where it is relative to the vessel, when the two orbits come closest, and SAS can point at it; scripts can read all of that, choose the target, and ask where a body is at any time. (The maneuver-node half shipped with plan 045.)

## Context

- Read: ADR 0049 (SAS), 0051 (body tree, shared inertial axes), 0056 (nodes as sim state: the pattern to follow), 0020/0031/0038/0039 (script sandbox, command path, warp hold), 0065 (this plan's decisions); journals 045 and 032; `architecture/scripting.md`, `guides/scripting.md`; `architecture/boundaries.md` (scripting may not import `kepler`).
- Plan 045 is done; `ship.nodes`, `addNode`, `warpTo` exist (headless-tested; see step 7 for what the browser did with them).

## Scope

**In:** `target-set` command, `VesselState.target`, snapshot `target` and vessel `name`, save format 4; `kepler.closestApproach` and `kepler.bodyStateAt`; SAS `target` and `anti-target`; `ship.target`, `ship.targets`, `setTarget()`, `bodies[id].state(t)`; the web sim host letting scripts use `sas`, nodes, `target-set` and `warp-to`; a Target card, key `Y`, SAS buttons and keys `9`/`0` in the flight HUD; docs.

**Out (draft 057):** navball and map target markers, closest approach across spheres of influence, node helpers, docking. A target in the map view's click handling.

## Steps

1. `kepler`: `closestApproach(from, to, t0, t1, samples)` and `bodyStateAt(bodies, id, t, frame)` with tests.
2. `core`: `TargetRef`, `TargetSnapshot`, `TargetApproach`, `VesselSnapshot.name`/`target`, command `target-set` and its schema, SAS modes `target`/`anti-target`, event `vessel:target-lost`, API 0.1.17, save format 4 with the 3 to 4 migration.
3. `sim`: `target.ts` (resolve, direction, command, prune), snapshot, SAS, split hands the target on, save check, frozen `save-v4.json`.
4. `scripting`: telemetry (`target`, `targets`), `setTarget`, SAS modes, `bodies[id].state` through an injected `bodyState` provider; the sandbox surface test lists the new names.
5. `apps/web`: script Worker builds the provider (`script-body-state.ts`); the Worker is sent the other vessels without parts (`scriptView`); sim host allows `sas`, `node-set`, `node-remove`, `target-set`, `warp-to` for scripts and ends the warp hold when the sim ends the warp; HUD model, Target card, SAS buttons, keys.
6. Docs: ADR 0065, `simulation.md`, `scripting.md`, `guides/scripting.md`, glossary, boundaries, journal, STATUS; draft 057.
7. Manual browser run on a production build (own port 5218): a generated save with two vessels in orbit.

## Acceptance criteria

- [x] `bun test packages/kepler`: `closestApproach` equals a 200 000-sample scan within 1 m on an eccentric pair and finds the aligned-circular case to 0.5 s; `bodyStateAt` returns the root at rest, a child's orbit, and the sum along the parent chain; bad input throws `RangeError`.
- [x] `bun test packages/sim/test/target.test.ts`: `target-set` selects a body or vessel, clears with null, refuses itself, unknown ids and a vessel without a command part; the snapshot's relative position equals the difference of the two centres of mass within 1 mm; the closest approach equals the distance the sim measures when it warps there within 1 m (vessel and moon); it is `null` for a climb from the pad and for the vessel's own primary; one snapshot with a target costs under 1 ms more than without; SAS `target` and `anti-target` settle within 1 degree on rails and in flight; a re-entered target vessel is dropped with `vessel:target-lost`; staging hands the target to the half with the command pod.
- [x] `bun test packages/sim packages/core`: save format 4 reads the frozen `save-v4.json` (both targets kept, resumes and saves again) and migrates the frozen format 3 and 2 fixtures to vessels without a target.
- [x] `bun test packages/scripting`: a script reads `ship.target` (null, then the chosen target with `distance`, `approach`), lists `ship.targets` (all bodies, other vessels with names, never itself), sets a body, a vessel id and a list entry and clears with `null`, gets a refusal as a value for an unknown vessel, and `setTarget` rejects unreadable arguments inside the script; `ship.sas` takes `'target'` and `'anti-target'` and the sim reports it; `bodies[id].state(t, frame)` asks the provider, validates `t` and the frame, is not enumerable, leaves `bodies` frozen, throws without a provider and passes a provider's exception on; the sandbox surface test lists the new names and nothing else.
- [x] `apps/web` vitest: `scriptBodyState` equals the sim's body positions at the sim time and after a 40 000 s warp within 1 mm and its speed equals the numerical derivative; a host test shows a script's `setTarget`, `ship.sas = 'target'`, `addNode` and `warpTo` reach the sim (no refusal line), the warp ends at the target time, the script's attitude is no longer held afterwards, and the test fails when the hold release is removed; `scriptView` keeps the controlled vessel whole and strips the parts of the others; the target model, the SAS button states and the key table pass.
- [x] `[manual]` Production build, built-in browser: a save with two vessels in orbit; the Target card lists Home, Cinder and the other vessel, selecting it shows distance, relative speed, range rate and closest approach; SAS target holds (0.0 degrees); a script run in the sandbox prints the same numbers and `bodies['stock.cinder'].state(...)`; `Y` steps through the list and back to none. JPG screenshots `docs/journal/assets/035-*.jpg`.
- [x] `bun run test`, `cd apps/web && bunx vitest --run`, `bun run typecheck`, `bun run build`, `bun run docs:check` pass; prettier clean on the touched files; the sandbox tests (`script-sandbox*`, `sandbox.test.ts`) stay green.

## Docs checklist

- [x] `STATUS.md`, journal 035, ADR 0065, `architecture/simulation.md`, `architecture/scripting.md`, `guides/scripting.md`, glossary, boundaries note, draft 057.

## Log

- 2026-10-17 — Created as draft by plan 032 (the draft 032 listed "target and maneuver information"; the sim has no such concept).
- 2026-10-17 — The maneuver-node half (`ship.nodes`, `addNode`, `setNode`, `removeNode`, `warpTo`, SAS `maneuver`) shipped with plan 045 (ADR 0056). Left here: `ship.target` and other bodies' state over time (the body-state half needs `kepler` body orbits in the script `bodies`).

- 2026-10-17 — Refined draft → ready at the human's request (session: script-targets session). Scope narrowed to the target and the body-state half; navball/map markers and cross-sphere approach are draft 057. In progress.
- 2026-10-17 — Done. Evidence in journal 035 (test counts, manual run, screenshots). The sim host also now lets scripts use `sas`, nodes and `warp-to` (they were refused in the browser since plans 042/045) and ends the warp hold with the sim's own warp end. Web vitest has one failure outside this plan: plan 050's roadmap entry.
