# 310 — Vessel menu in Flight, docking-port targets, a vessel-pilot API and Auto Dock

**Plan:** [plans/310-vessel-menu-port-targets-control-api-and-auto-dock.md](../plans/310-vessel-menu-port-targets-control-api-and-auto-dock.md) · **Session:** auto dock session (Claude), 2026-10-21 · **ADRs:** 0270, 0271

## What was done

- **Vessel menu (ADR 0270 point 1):** a click on another vessel in the Flight view opens a menu: Control this vessel (the flight loop's `switchVessel`), Set as target, Target a docking port (its free ports), Focus camera, Rename. The vessel is found by a raycast against its meshes (`Renderer.vesselAt`) or, when it is too small to hit, by its projected point within 14 px. Hovering shows name, distance and relative speed. The renderer's `focusPart` now also looks at another vessel's part.
- **Port targets (ADR 0270 points 2 to 4):** with a port targeted, `target.position` and `target.velocity` run from the own control port (when the vessel is controlled from a port) to the target port's face, with each point's own velocity. The navball markers, the Target card, SAS `target`, scripts and the maneuver aids (they build the target state from `target.position`) follow. The map's closest approach stays between centres of mass. The `attitude` command's rotation and RCS translation are read in the control part's axes.
- **Vessel pilot and autopilots (ADR 0271):** SAS mode `direction` (with a direction) and `hold` with an `attitude`. `VesselPilot` in core, exported by the SDK. The `autopilots` registry with `defineAutopilot`, the `autopilot-engage` and `autopilot-disengage` commands, `vessel.autopilot` in the snapshot and the `autopilot:ended` event. The script ship API gains `translate`, `setRcs`, `controlFrom`, `pointAt`, `holdAttitude`, `engage`/`disengage`, `setTarget({ vessel, port })` and `ship.dock`/`ports`/`rcs`/`controlPart`/`autopilot`. Guide: `docs/guides/vessel-pilot-api.md`.
- **Auto Dock (`mods/autodock`, built in):** one autopilot (`autodock.dock`) and one dock panel (Status, Phase, Distance, Closing speed, Alignment error, Off axis, Engage, Abort).
  - It aligns, nulls the drift, then approaches along the target port's axis. It stops and centres at 200, 50 and 10 m, with speed limits of 2, 1, 0.3 and 0.15 m/s (the last below 1 m), and lets the magnets take the last metres.
  - A PID keeps it on the axis. Each RCS push is sized by an acceleration the controller learns from the vessel's response.
  - It aborts on low propellant, RCS that cannot move the vessel, behind the target port, off the axis close in, or after 30 minutes.

- **Vessel menu crash fix:** after Control, or with a decouple, a handler read the closed menu (`reading 'menu'` of null). Actions now read the menu before closing it. The menu is re-read with each snapshot and closes when its vessel is gone or is the flown one (`runVesselMenuAction`, `refreshVesselMenu`, tests).
- **Torque-limited turns (owner report: Kronos V switched SAS modes almost instantly in orbit):**
  - A coasting vessel is on rails, where SAS turned it at a fixed 30°/s. Now a turn of more than 2° at physics warp wakes it, before the step, and the turn takes its torque: wheels (electric charge), RCS (monopropellant, with the existing puffs and hiss) and gimbal.
  - A probe turns 180° in 6 s; a long stack of ten tanks takes 166 s.
  - A vessel with no torque cannot turn. The HUD shows LOW TORQUE (with the half-turn time) or NO TORQUE.
  - Research: `docs/research/sas-torque-ksp.md`.

## Surprises

- **Rails chunks.** When every vessel is on rails, the sim advances in an analytic rails chunk. A command applied inside that chunk can put a vessel in flight. The chunk then advances the clock without moving that vessel, so it lands one step behind: 45 m at orbital speed. Running the autopilots before the sim chooses the kind of step fixed it for autopilots. The signal-delay queue could do the same to a delayed command (`drain()` inside `railsChunk`). It is fixed the same way: due commands now drain at the top of the step loop (test `packages/sim/test/delay-wake.test.ts`: 44.9 m before, 0.013 m after).
- **Auto-rails.** The sim clears its "active" mark at the start of each step (`prepareFrame`). An autopilot could therefore not keep its vessel out of auto-rails by marking it. `railsEligible` now leaves a vessel with an engaged autopilot alone.
- **RCS strength.** The stock RCS on a 2 t chaser gives about 4 m/s². A fixed gain chattered between full forward and full back at 10 Hz and drifted. The learned-acceleration push fixed it.
- **Numbering.** Plan 306 and ADR 0269 were taken by the robotics plan at the same time. Renumbered to 310, 0270 and 0271 before the first push.
- **`VesselControl`** already names the control state modules read, so the public API is `VesselPilot`.

## Verification output

```
bun test (packages, mods, examples, tools): 2158 tests, 3 fail (wall-clock benchmarks, run while another session's tests shared the CPU)
bun test mods/autodock: 3 pass (docked after 171 s; abort from behind; refusals)
bun test packages/sim/test/torque-turn.test.ts: probe 6 s, long stack 166 s
web vitest (CI=true): all pass except the two script-worker cases (Node 26 dropped --experimental-transform-types; they fail on main too)
bun run typecheck: exit 0
```

## Open questions / follow-ups

- The vessel menu has not been tried by a person in the browser; the owner tests on the deployed site.
