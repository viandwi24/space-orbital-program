# 007 — Sim loop: flight + on-rails

**Plan:** plans/007-sim-loop-flight-onrails.md · **Session(s):** sim session (Claude, 2026-10-16) · **Date:** 2026-10-16

## What was done

The draft was refined to `ready` at the human's request, then implemented. No scaffolding. Dependencies: `bun add -d '@orbital/mod-stock@workspace:*' '@orbital/sdk@workspace:*'` in `packages/sim` (test fixtures only; sim `src` imports `core`, `kepler`, `physics`). Looked up online: ISA sea-level constants and Zod 4 number validation (`research/atmosphere.md`).

| Area | Files |
|---|---|
| core | `definitions.ts` (`VesselApi`, `ResourceStore`, `controlSource`, `store`), `schemas.ts` (`crossfeed`), `protocol.ts` (stages, placement, `CommandResult`), `protocol-schemas.ts` (`commandSchema`, `vesselDesignSchema`), `design.ts` (`resolveVesselDesign`), `events.ts` (sim events), `units.ts` (`GRAVITATIONAL_CONSTANT`), `API_VERSION` 0.1.2 |
| sdk | exports for the new types and `GRAVITATIONAL_CONSTANT`; compile-time tests |
| stock | real `update`/`onStage` hooks (engine, reaction wheel, decoupler), container `store`, command `controlSource`, `crossfeed: false` on engine and decoupler, flameout event |
| sim | `sim.ts commands.ts vessel.ts frames.ts modes.ts orbit.ts resources.ts hooks.ts snapshot.ts aero.ts atmosphere.ts parts.ts state.ts core.ts math.ts constants.ts` |
| tests | `packages/sim/test/{scenario-orbit,determinism,warp,sim,modules}.test.ts`, helpers `ascent.ts vessels.ts measure.ts`; core `design.test.ts`; stock hook tests |
| docs | ADRs 0015-0017, `simulation.md` rewritten, `plugin-system.md`, `units-and-frames.md`, `writing-a-mod.md`, glossary, `research/atmosphere.md`, draft plan 012 |

## Exit-test result (scripted two-stage stock vessel)

```
orbit: apoapsis 137.11 km, periapsis 76.11 km, e 0.0432, sim time 210.6 s, wall 601 ms
0.0s liftoff · 60.8s staged · 76.1s cut: apoapsis 80056 m
166.9s circularise: dv 1993 m/s, t to apoapsis 27 s · 206.6s done: periapsis 76100 m
```

The vessel ends on rails (idle for 2 s) with 2 875 kg left. Δv used ≈ 3 816 m/s (stage 1 1 245 m/s ideal at vacuum Isp, upper stage 2 571 m/s) of 4 299 m/s ideal. The circularisation is crude: it stops when the periapsis reaches 76 km, which leaves the apoapsis at 137 km. Performance: a flight step of this vessel costs about 56 µs, a snapshot about 5 µs and 2.8 kB of JSON; the whole scenario test runs in 0.6 s (limit 30 s).

## What surprised me

- **The stack tumbled until the drag model changed.** An uncontrolled ascent flipped end over end within 25 s. Not joint softness (the chain stayed rigid at 16, 64 and 256 solver iterations, 6.90 m long throughout) but drag: with the drag vector anti-parallel to velocity, the nose face's drag has a lever arm of 3.7 m about the centre of mass and a linear (not quadratic) dependence on tilt, which overwhelms a 5 kN·m reaction wheel. With drag set to zero it flew straight. Per-body-axis drag (axial drag stays on the axis) fixed it; the PD loop then holds attitude through max-Q.
- **A stack standing on one point contact topples.** Clamping only the lowest body's position (`applyGround`) let the pencil fall over in 7 s. The pad hold pins surface-loaded vessels until thrust exceeds weight.
- The first attitude gains did nothing because my test helper computed the transverse inertia from perpendicular offsets (about zero for a slender stack), giving huge gains scaling. Along-axis offsets are what matter.
- A one-step lag in the pad pose (pinning with `t` before it was advanced) showed up as a constant 3.5 m offset (174.5 m/s × 0.02 s) in the pad test; fixed by using `t + dt`.
- Mutation checks that bit: Math.random in gravity (determinism fails), warp gate removed (two warp tests fail), no rebase (long-warp test fails), crossfeed ignored and `setMass` skipped (both needed stronger tests first: the first versions passed with the mutation, so the crossfeed test now empties the upper tank and the mass test spies on `setMass`).
- Two backends are created per sim (`maxFlightFrames` 2) by calling `createRapierBackend` twice; `RAPIER.init()` is idempotent in practice.
- Boxes, not capsules, for cylinder parts: 0.2 m and 0.4 m parts are shorter than the 1.25 m diameter, so capsules would stick out.
- `fromStateVector` also throws for exactly parabolic states (tested with escape speed): the state vector is kept and `propagateUniversal` used.

## Decisions made

ADR [0015](../decisions/0015-module-capability-api.md) (capability API), [0016](../decisions/0016-vessel-design-format-and-protocol.md) (design format and protocol), [0017](../decisions/0017-flight-model.md) (flight model). Deviations from the refined plan body are in the plan Log.

## Open questions / follow-ups

- Plan 009 needs (also in the final report to the orchestrator): `await createSim({ plugins, backendFactory })` with the Rapier factory inside the Worker; host loop calls `sim.step(frameSeconds)` and posts `snapshot()` (2.8 kB per vessel); commands go through `dispatch(unknown)` (returns a result to post back); part shapes for the renderer come from `registries.parts` on the main thread (it loads the same plugins): map `PartDefinition.shape` (tuple) to the renderer's `PartShape` (`Vec3`); the VAB emits `VesselDesign` and can call `resolveVesselDesign` live. Warp: send `warp` commands; a controlled vessel idle in a stable orbit reaches rails after 2 s.
- Draft plan 012 (ground contact, landing, damage). Plan 011 (rigid grouping) unchanged; the stack was rigid enough at 16 solver iterations for this scenario.
- Attitude on rails is frozen; reaction-wheel torque acts on one body; no lift or fins; one physics bubble of 2.5 km. All in `simulation.md` "Known limits".

## Verification output

See the plan Log and the final commit message; commands: `bun test packages/sim`, `bun test`, `bun run typecheck`, `bun run build`, `bun run docs:check`, `bunx prettier --check .`.
