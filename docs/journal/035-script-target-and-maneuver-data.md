# 035 — Script access to targets and body state

**Plan:** plans/035-script-target-and-maneuver-data.md · **Session(s):** script-targets session (Claude, 2026-10-17) · **Date:** 2026-10-17 · **ADRs:** [0065](../decisions/0065-targets-in-the-sim-and-script-access.md)

## What was done

| Where | What |
|---|---|
| `packages/kepler` | `closestApproach` (scan plus golden-section on any two propagation functions), `bodyStateAt` (a body's state from its orbit, parent or system frame); tests |
| `packages/core` | `TargetRef`/`TargetSnapshot`/`TargetApproach`, `VesselSnapshot.name` and `.target`, command `target-set`, SAS modes `target`/`anti-target`, event `vessel:target-lost`; save format 4 with the 3 to 4 migration; API 0.1.17 |
| `packages/sim` | `target.ts` (resolve, direction, command, prune), snapshot, SAS (`aimOf`), a split hands the target to the controlled half, save shape check; `save-v4.json` frozen with `make-save-v4.ts`; 13 tests in `target.test.ts` |
| `packages/scripting` | `ship.target`, `ship.targets`, `setTarget()`, SAS modes, `bodies[id].state(t, frame)` through an injected `bodyState` provider (the package may not import `kepler`) |
| `apps/web` | `script-body-state.ts` (the provider, built in the script Worker core), `scriptView` (other vessels reach the Worker without parts), sim host: scripts may use `sas`, `node-set`, `node-remove`, `target-set`, `warp-to`, and the warp hold ends with the sim's own warp; `target-model.ts`, `TargetPanel.svelte` (in the right column), SAS buttons, keys `9` `0` `Y`; roadmap entry 035 replaced by 057 |
| docs | ADR 0065, simulation and scripting architecture, scripting guide, glossary, boundaries note, draft 057 |

## What the numbers say

```
snapshot with a target 0.075 ms, without 0.002 ms (a 240-sample scan, two vessels on rails)
closest approach (vessel to vessel, on rails): equals the measured distance at that time within 1 m, speed within 1e-3 m/s
closest approach (vessel to the moon): within 1 m
kepler closestApproach vs a 200 000-sample scan: within 1 m; aligned circular orbits: time within 0.5 s
sas target in flight: worst pointing error after 25 s 0.000 degrees (quiet band); on rails within 1 degree
bodyState vs sim body positions: 1e-3 m now and after a 40 000 s warp
bun run test 963 pass; web vitest 576 pass (the one failure is plan 050's roadmap entry, not this plan)
```

## In the browser (manual criterion)

Production build served on 5218. A generated game save (`Orbiter` at 150 km and `Target probe` at 165 km, 0.4 rad ahead) was imported through the load dialog from a file made by a throw-away script (not committed). The Target card lists Home, Cinder and the probe; the probe gave 299 to 300 km, 852 to 856 m/s relative, 62.8 m/s closing, closest approach 162 km in 36:11; SAS `target` showed 0.0 degrees. A script run in the sandbox (`setTarget(ship.targets.find(...))`, reading `ship.target.approach`, `bodies['stock.cinder'].state(time() + 3600)`, `ship.sas = 'target'`) printed the same distance and approach (300 704 m, 163 417 m in 2 172 s) and the moon's position. `Y` stepped None, Home, Cinder, Target probe, None. Screenshots: `assets/035-script-target-sandbox.jpg`, `035-target-panel-sas-target.jpg`.

## What surprised me

- **Scripts could not use SAS, nodes or warp-to in the browser at all.** The sim host allowed a script `throttle`, `attitude`, `stage`, `action` and `warp` only; plans 042 and 045 added the commands and tested them headlessly, so `ship.sas = ...`, `addNode` and `warpTo` were answered "not allowed for scripts" in the real client. Fixed here (ADR 0065 point 7) and covered by a host test that fails if the allowance or the hold release is removed.
- **The warp hold never ended after a `warp-to`.** The sim sets warp back to 1 itself at the target, but the host only released the script's held attitude when the script asked for `warp(1)`. The host now releases it when the sim's warp is 1 again.
- **The script Worker was sent the controlled vessel only**, so a list of other vessels had nothing to list. Others now arrive without parts.
- **A `warp-to` approaches its time by a fixed fraction of what is left per frame** (about 285 frames for 300 s at 20 ms ticks): a host test that ticked 80 times saw nothing happen.
- **A climbing vessel's conic dips into the ground** and gave a "closest approach" of 25 s ahead at 11 000 km; the rule is now: no approach unless the orbit clears the body.
- **The `boundaries.md` rule that `scripting` may not import `kepler`** ruled out computing `bodies.state` inside the runner; an injected provider keeps the rule.
- **At 1024x768 the instrument deck reaches under the right column** (it did before; two more SAS buttons made it 60 px wider). The Target card sits in the right column, which now scrolls above the deck below 1280 px. The deck still overlaps the left Orbit panel at that width (pre-existing).

## Decisions (ADRs)

0065.

## Open questions / follow-ups

- Draft 057: target markers on the navball and map, closest approach across spheres, node helpers.
- A script can name debris only by "... (debris)"; a better key for picking one (distance, a mod flag) comes with the markers.
- `ship.targets` is rebuilt every tick (bodies plus vessels); with hundreds of debris pieces that grows; debris is reaped within seconds today.
- Key `Y` was free in the flight scope; the settings dialog lists the three new actions.

## Verification output

```
bun run test                 963 pass, 0 fail (109 files)
apps/web vitest --run        576 pass, 1 fail (roadmap.test: plan 050 is done but still on the roadmap page; plan 050's session owns that entry)
bun run typecheck            0 errors (all packages, svelte-check 1464 files)
bun run build                ok
bun run docs:check           OK
```
