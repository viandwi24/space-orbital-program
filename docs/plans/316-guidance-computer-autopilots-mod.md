---
id: 316
title: "Guidance Computer: a built-in mod with MechJeb-style autopilots (node executor, circularize, ascent, landing)"
status: done
owner: "vessel programs session (Claude)"
depends: [310, 315]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 316 — Guidance Computer

## Goal

A built-in mod, `@orbital/mod-guidance` ("Guidance Computer"), ships the autopilots players know from MechJeb 2 as programs: execute the next maneuver node, circularize at apoapsis or periapsis, fly an ascent to a chosen orbit, and land (suicide burn, then a soft touchdown). Each is an ADR 0271 autopilot that uses only the public SDK (`defineAutopilot`, `VesselControl`) and a `definePanel` panel. The player takes any channel back by touching it and stops them with Delete (ADR 0273); the Mods page lists the mod under Built in.

## Context

- Owner's request (2026-10-21): "mods like auto docking, and several of the well-known MechJeb 2 features, in our game as mods; built-in mods appear in the Mods menu".
- Research: `research/vessel-programs.md` (MechJeb's per-axis yield and PID reset, kRPC's AutoPilot refusing SAS).
- ADRs: 0271 (autopilots), 0273 (arbitration, saved state), **0274** (pilot read-outs: body, mass, engines, nodes), 0056 (maneuver nodes), 0049 (SAS).
- Depends on plan 310 Part 3 (`defineAutopilot`, `autopilot-engage`/`-disengage`, snapshot `autopilot`) and plan 315.

## Scope

**In:** `mods/guidance` with four autopilots (`guidance.node`, `guidance.circularize`, `guidance.ascent`, `guidance.land`), one panel, built in (`BUILTIN_PLUGINS`), headless sim tests, a guide section.
**Out:** rendezvous and docking (Auto Dock, plan 310), Smart A.S.S. (stock SAS covers it), landing at a chosen site, aircraft autopilots.

## Design notes

- Each autopilot points with SAS `direction`/`maneuver` and sets throttle through `VesselControl`; it never touches physics. It resets its own integrators when the snapshot shows an override on a channel it flies (MechJeb's `Controller.Reset`).
- Memory is the phase plus a few numbers, so a world reopened mid-burn resumes the burn (ADR 0271 point 6).
- Node executor: point at the node, warp to `t - burn/2 - 20 s` (via `warp-to`), throttle by remaining delta-v with a tail-off below 1 s of burn, done under 0.2 m/s.
- Circularize: adds a node at apoapsis (or periapsis) for the circular speed, then runs the node executor's phases.
- Ascent: vertical to 100 m/s, gravity turn by a shape parameter (MechJeb's "turn shape"), throttle limited to a TWR, coast to apoapsis, circularize.
- Land: deorbit burn when on rails, then suicide burn from the vessel's TWR and the terrain height under it, touchdown below 2 m/s.

## Steps

1. ADR 0274: the pilot reads the body, mass and engines and sets nodes (the sim's runner passes them); commit.
2. Mod skeleton and the node executor with sim tests; commit.
3. Circularize and ascent with sim tests; commit.
4. Landing with a moon test; commit.
5. Panel, built in, guide, docs.

## Acceptance criteria

- [x] `bun test mods/guidance`: from a 100 x 100 km orbit, a node of 300 m/s prograde is executed to within 1 m/s; circularize at apoapsis from 100 x 75 km ends with eccentricity below 0.005; ascent from the pad reaches a periapsis above 70 km; a lander from 20 km above the moon touches down below 2 m/s.
- [x] `bun test mods/guidance`: a player throttle write during a burn is respected (override) and the burn continues after the resume delay; `program-stop` disengages.
- [x] web vitest: the Mods page lists "Guidance Computer" under Built in.
- [x] `bun run typecheck`, `bun test`, web vitest with `CI=true`, `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row).
- [x] `docs/journal/316-guidance-computer-autopilots-mod.md` written.
- [x] `docs/guides/` section on the Guidance Computer.

## Log

- 2026-10-21 — Drafted by the vessel programs session (plan 315) from the owner's request; waits for plan 310 Part 3.
- 2026-10-21 — Refined and started in the same session at the owner's request; plan 310 Part 3 is on main. The pilot lacked body, mass, thrust and nodes: ADR 0274.
- 2026-10-22 — Done. `bun test mods/guidance`: 6 pass. `bun run typecheck`: 0 errors; `bun run build`: done; `bun run docs:check`: OK. `bun run test`: 2178 pass, 1 fail (the 50-vessel background benchmark, passes alone: 2 pass). Web vitest: 1452 pass; fails: the two real-thread script tests (Node 26, fail on main too) and `branch-model` under load (5 pass alone). Browser: Mods page lists the mod; `guidance.ascent` flew the turn from the pad in the dev build.

