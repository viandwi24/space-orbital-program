# 330 — Docking blueprints, Auto Dock fly-around, logs, options and mod panel UIs

**Plan:** [plans/330-docking-blueprints-auto-dock-fly-around-and-panels.md](../plans/330-docking-blueprints-auto-dock-fly-around-and-panels.md) · **Session:** auto dock session (Claude), 2026-10-22 · **ADR:** 0285

## What was done

- **Blueprint audit** (owner: "analyse every blueprint; make the bays, the docking and the rest really work"). A dump of each design's part tree, modules, staging, Δv and checks found:
  - Bays only open their doors, so a payload bolted to a bay's inner node could never leave. This hit the Wayfarer satellite and the Selene lander.
  - Kronos V: the capsule had no docking port. It could not separate from its service module before re-entry. The ascent stage could not leave the descent stage. Auto-staging lit the lander engines at liftoff.
  - Wayfarer: the orbiter had 0 m/s of its own once the tank dropped; its engines were in no stage. The wings sat ahead of the centre of mass ("unstable").
  - Horizon Station: liftoff TWR 1.16 and 3,222 m/s, marginal for orbit here. Two size mismatches (hub to habitat, empty service bay to core). Only one port free after launch.
  - Moonwatch, Telescope, Aurora and the rover were sound (Δv 6,000–7,800 m/s, power, comms, RCS with monopropellant).
- **Fixes:**
  - Kronos V: the capsule got a 0.625 m port under the tower (matching the lander's) and separates from the service module. The lander sits on decouplers in the petals and between its stages, and has a whip antenna. Staging follows Apollo, nine presses.
  - Wayfarer: the satellite sits on a decoupler. The orbiter carries its own tank (624 m/s) and its engines light when the tank drops. The wings moved aft.
  - Horizon Station: five berths, an adapter from the hub to the habitat, no empty bay, and four solid boosters (TWR 2.02, 3,937 m/s).
  - Guard tests in `missions.test.ts`. The five headless mission flights (plan 309) pass.
- **Docked ports snap face to face.** The merge kept the absorbed vessel where it was at capture (up to 0.15 m and 15° off), which is the gap and crooked joint the owner saw. Now it is moved and turned so the faces meet exactly, as KSP does. Test: gap 0.15 m and 0.95° before, 0 after.
- **Auto Dock flies round.** The owner's run aborted at once: 86° and 43 m off the axis, close in. Now:
  - a `reposition` phase flies outside a keep-out sphere round the target (its size plus ours plus 3 m) to a start point on the port's axis, 25° steps round the sphere when the straight line would hit;
  - off the axis close in, it backs out instead of aborting;
  - settings: `speed` (careful, normal, fast) and `start` (auto, 20, 50, 100 m);
  - log lines at each phase and mark.
  - From 200 m in front: 174 s. From 40 m beside: 108 s. From behind: 215 s. Without thrusters: aborts after about 25 s, with the reason.
- **Sim/core:**
  - `autopilot-settings` (saved, passed to `start`);
  - `AutopilotStep.log`, with the last 30 lines kept;
  - `autopilotLast` (also for a refused engage);
  - the `select` panel node;
  - `custom: { height, source }` for a mod's own UI.
- **The mod's own UI** runs in a sandboxed srcdoc frame. Checked in Chromium (dev): ready, mount, resize, input and command round-trip; origin `null`; parent document and storage throw `SecurityError`; a thrown error shows in the panel.
- **Auto Dock panel:**
  - Speed and Start selects;
  - Engage and Abort;
  - the alignment display on the canvas (crosshair, green offset lines on a log scale, orange pointing ring, DST, CVEL, angle, phase);
  - Last run;
  - the Log, newest first.

## Surprises

- Plan 321 and ADR 0277 were taken by the vessel programs session while this was being written; renumbered to 330 and 0285. The two first commits (`dee491dc`, `09462b18`) say "plan 321".
- At 8° off the axis the stock test probes never capture (they touch rim to rim first); 4° does.

## Verification output

See the plan's acceptance criteria.

## Open questions / follow-ups

- Kronos V keeps one size-mismatch caution: the 1.25 m tower over the 0.625 m port (jettisoned at the second stage).
- The custom UI has been checked in the dev server only; the production CSP includes the bootstrap hash through `scripts/site-policy.ts`.
