---
id: 044
title: "A moon and SOI transitions"
status: in-progress
owner: "moon session (Claude, 2026-10-17)"
depends: []
phase: 2
created: 2026-10-17
updated: 2026-10-17
---

# 044 — A moon and SOI transitions

## Goal

Stock ships a moon orbiting the home planet; vessels move between spheres of influence with patched conics, on rails and in flight; the map view shows both bodies, the SOI and the trajectory across it; the renderer draws the moon as a real place (terrain, no atmosphere) and a player can land on it.

## Context

- ADR 0048; `simulation.md` (single root body today), kepler `soiRadius`, ADRs 0017, 0024, 0036, 0043; renderer environment/planet pass assumes the first body.

## Scope

**In:** body hierarchy in core/sim (moon's orbit propagated analytically), SOI enter/exit events and frame changes, on-rails propagation across SOIs and time warp stopping at transitions, flight frames relative to the current SOI body, map view with focus switching, renderer support for an airless body with its own terrain function and lighting, landing on the moon, stock body data (radius/mass/orbit chosen for a reachable trip with stock parts — Δv budget in the journal), save-format update.
**Out:** more planets, interplanetary transfers.

## Design notes

ADR 0051 (body hierarchy, frames, SOI transitions), ADR 0052 (the stock moon, save format 2), ADR 0053 (airless body in the renderer). Vessel state is relative to its SOI body; the root body rests at the origin, the moon is on analytic Kepler rails around it; a transition translates origin and velocity (all frames share axes).

## Steps

1. Research, ADRs, this plan. 2. kepler: transition primitives. 3. core: events, protocol, save format 2 with migration. 4. sim: body runtime table, per-vessel body, transitions on rails and in flight, warp stop, moon placement. 5. stock: the moon. 6. Tests, scripted mission, resume. 7. Renderer, map view, web (after plan 039 is done). 8. Docs and journal.

## Acceptance criteria

Headless ones live in `packages/kepler/test/soi.test.ts`, `packages/sim/test/soi.test.ts`, `moon-mission.test.ts` and `resume.test.ts`.

- [ ] **Kepler:** transition primitives keep position exactly and speed relative to the new body within 1e-9 relative; crossing time bisection finds the boundary within 1 mm; both directions (enter and exit) round trip to the start state within 1e-6 m and 1e-9 m/s.
- [ ] **Sim, on rails:** a vessel on a moon-crossing orbit changes `soi` to the moon within 10 s of sim time of the true crossing, with state continuous (inertial position to 1 mm, inertial velocity to 1e-6 m/s) and `vessel:soi-changed` emitted; leaving the moon's SOI returns it to the planet, continuous likewise; a vessel not near the moon never changes.
- [ ] **Sim, in flight:** thrusting through the SOI boundary re-bases the frame (local poses untouched, `soi` changed, gravity of the new body from the next step), in both directions, inertial state continuous to 1 mm and 1e-6 m/s.
- [ ] **Warp:** a controlled vessel's SOI change sets warp to 1 and discards the rest of the step's accumulated time; debris transitions do not.
- [ ] **Scripted mission in `bun test`:** launch, orbit, transfer burn, moon SOI, capture burn, moon orbit, landing at rest on the moon (`landed`, on surface rails, speed relative to the ground below 0.05 m/s), through `dispatch`/`snapshot` only.
- [ ] **Determinism:** the mission's snapshot JSON is identical in two runs.
- [ ] **Save:** version 2 with a body list; the frozen v1 fixture loads and migrates; resume byte for byte for a vessel on the moon's rails, one just before and after the crossing, and one on surface rails on the moon.
- [ ] **Stock data:** the moon is registered by `mods/stock`; Δv budget table in the journal; a lander fits the budget with stock parts.
- [ ] `[manual]` screenshots `docs/journal/assets/044-*.png`: the moon from orbit, from its surface, the map view with both bodies and the transfer trajectory. Gated on plan 039.
- [ ] Frame budget unchanged on home-planet scenes and within budget on the moon (gated on plan 039).
- [ ] `bun run test`, web tests, `bun run typecheck`, `bun run build`, `bun run docs:check`, prettier.

## Docs checklist

- [ ] STATUS, journal, ADRs, `simulation.md`, `units-and-frames.md`.

## Log

- 2026-10-17 — Created as draft (ADR 0048, v1 scope).
- 2026-10-17 — Refined draft -> ready at the human's request (session: moon session).
- 2026-10-17 — Started (moon session). `depends` changed from [043] to []: the sim half of 043 (save format, `Sim.save`/`resume`) is committed and is all this plan needs; 043 stays in-progress for its web integration, which docs:check does not allow as a dependency of a started plan.
- 2026-10-17 — Deviations (sim half): (1) the criteria asked for inertial state continuity "to 1 mm and 1e-6 m/s" in the sim; the sim steps rails in whole 0.02 s steps, so the sampled difference between the old and the new conic at the step that crossed is the change of the pulling body over one step (acceleration jump 0.014 m/s^2, 3e-4 m/s). The sim tests assert 1e-3 m and 1e-3 m/s (measured smaller); the 1e-6 bound holds for the conversion itself and is asserted in `packages/kepler/test/soi.test.ts`. (2) Renderer ADR is 0054, not 0053 (taken by plan 039). (3) Added `kepler.predictPatchedConics` and `moonHeight` (cratered terrain in core, ADR 0054), needed for the map trajectory and for the sim and renderer to share the ground.
- 2026-10-17 — Sim half done and committed (kepler, core, stock, sim, sim worker terrain). Renderer, map view and web HUD wait for plan 039 (status in-progress).

