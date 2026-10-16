---
id: 007
title: "Sim loop: flight + on-rails"
status: in-progress
owner: "sim session (Claude, 2026-10-16)"
depends: [002, 004, 006]
phase: 1
created: 2026-10-16
updated: 2026-10-16
---

# 007 — Sim loop: flight + on-rails

## Goal

`@orbital/sim` runs the fixed-timestep loop over a world booted with stock: vessel assembly from a design → rigid bodies + joints, gravity, resources flowing to engines, staging, atmosphere drag, flight ↔ on-rails transitions, time warp, snapshots and commands. **Phase 0 exit test:** a scripted two-stage stock vessel reaches a stable orbit headlessly in `bun test`.

## Context

- Read: `docs/architecture/simulation.md` (implement it; then update it), `units-and-frames.md`, `plugin-system.md` (module hooks), `boundaries.md`.
- ADRs: 0003, 0004, 0007, 0010, 0011, 0013, 0014. New ones written by this plan: 0015 (module capability API), 0016 (vessel design format and protocol additions), 0017 (flight model decisions).
- Journal entries of 002, 004, 005, 006, 008. Research: `docs/research/rapier.md`.
- Facts carried in: kepler throws `KeplerError` for near-parabolic and radial states; Rapier is f32, first-order, forces last one step, fixed-joint chains are soft (`solverIterations`), unjoined bodies collide; `ModuleContext` has no body handle or vessel resource access (journal 006); `Command` has no schema in core.

## Scope

**In:** everything listed in the goal; the module capability API that stock needs to do its job (this is the "minimum needed" because stock may not have a back door: boundaries.md, ADR 0005); stock module `update`/`onStage` hooks using it; the vessel design format and its validation; command validation at the sim boundary; a ground-contact model sufficient to stand on a pad and lift off; a scripted ascent helper for tests; determinism, warp and scenario tests.
**Out:** rigid grouping optimisation (plan 011), SOI transitions (single root body), maneuver nodes, Worker hosting and the web UI (009), terrain, landing legs, damage, lift, re-entry heating, radial/non-stack attachments (only anti-parallel node pairs), balance tuning of stock parts.

## Design notes

Decisions are recorded in ADRs 0015-0017; this is the working summary.

**API (`packages/sim/src/sim.ts`).** `createSim({ plugins, backendFactory, seed?, dt? = 0.02, maxFlightFrames? = 2 })` is async (physics backends are created up front, one per concurrent flight frame) and returns `{ step(wallDelta), dispatch(command), snapshot(), world, events, registries, report, rng, time, warp, dispose() }`. `loadPlugins(plugins)` runs inside. `step(wallDelta)` adds `wallDelta × warp` to an accumulator and runs fixed steps (`dt` each while any vessel is in flight; on-rails chunks of at most 10 s otherwise). `dispatch(command)` validates the plain-data command (zod `commandSchema` in core) and returns `{ ok: true, vessel? } | { ok: false, reason }`; `snapshot()` is built on request.

**Module capability API (ADR 0015).** Additive, `API_VERSION` 0.1.1 → 0.1.2: `ModuleContext.vessel: VesselApi` (`time`, `control` throttle/pitch/yaw/roll, `ambient` pressure/density/altitude, `applyForce(force, point?)` and `applyTorque(torque)` in the part's local frame for the current step, `resources.amount/withdraw/deposit`, `detach(node, impulse?)`); `ModuleDefinition.store?` (a module that holds resources: `resources/amount/withdraw/deposit`) so the sim can sum mass and route flow without knowing any container module; `ModuleDefinition.controlSource?` (a vessel with such a part accepts control commands); `PartDefinition.crossfeed?` (default true; resources may pass through the part). Stock: command is a control source; the container is a store; engine/decoupler parts set `crossfeed: false`; engine, reaction wheel and decoupler get real hooks. Stock `ModuleEngine` emits `stock:engine-flameout`.

**Resource flow.** Per resource `flowMode`: `none` → nothing; `vessel` → every store on the vessel; `stack` → breadth-first from the requesting part over attachments (deterministic: neighbours by entity id), never entering a part with `crossfeed: false` (the requester is always the origin), nearest container first, drained one after another.

**Vessel design (ADR 0016).** Keeps core's flat form with `formatVersion: 1` (no code ever produced the provisional shape) and adds `stages`: `{ formatVersion: 1, name, parts: [{ index, part, parent: { index, parentNode, node } | null }], stages: number[][] }`; `stages[k]` are the part indices whose `onStage` runs for the k-th `stage` command. Validation (`resolveVesselDesign` in core, usable by the VAB): unique indices, exactly one root, no cycles, parts registered, nodes exist and are used once, child node direction is anti-parallel to the parent node direction (stack attachment), stages reference existing parts. Part origin offsets follow from node positions (all parts share the vessel orientation).

**Frames.** BCI float64 is the authoritative frame; flight physics runs in a local frame that moves with constant velocity: `bci = origin + local`, `bciVelocity = frameVelocity + localVelocity`, so Rapier sees small positions and small velocities. The frame re-anchors (origin and velocity reset to the focus vessel's) when the focus root is more than 1 km from the origin. One frame holds every flight vessel of a cluster (a decoupled stage stays in its parent's frame so the halves interact); a vessel that is loaded or woken near an existing frame (< 2.5 km) joins it, otherwise it needs a free frame (`maxFlightFrames`), otherwise the command is refused.

**Bodies and contacts.** One rigid body per part: a box with half extents `(r, h/2, r)` for cylinder shapes (exact axial extent, which matters for stacking and separation; explicit cylinder inertia), the box itself for box shapes, a 1 m box without a shape. Mass = dry mass + Σ store contents × density, updated each step. The ground is the sphere of the body's radius: a body whose lowest point is below it is pushed out and its velocity relative to the rotating ground is zeroed (pad hold and crash stop, no damage). An uncontrolled vessel (no control source) is destroyed on first contact.

**Atmosphere.** `p = p0·exp(−h/H)` below `atmosphere.height`, 0 above; `ρ = p / (R·T0)` with `R = 287.05`, `T0 = 288.15` K (documented constants: 1.225 kg/m³ at 101 325 Pa). Drag per part `½ ρ v² C_d A` against the velocity relative to the co-rotating air, `C_d = 0.3` (sim constant, no per-part data yet), `A` = projected area of the part shape (cylinder: `πr²|cos| + 2rh|sin|` with covered end faces excluded; box: Σ face area × |component|). Body rotation is modelled: `ω = 2π / rotationPeriod` about +Y, the launch site co-rotates (≈174 m/s eastward on the equator), `BodySnapshot.rotation` follows.

**Modes.** flight → on rails when the vessel is idle (no force or torque applied by any module for 2 s), its periapsis radius is above `R + atmosphere.height` (above `R` without atmosphere), for controlled and uncontrolled vessels alike; a `state` placement in a stable orbit is created on rails directly. The state is taken at the centre of mass; attitude is frozen. `fromStateVector` throwing `KeplerError` (near-parabolic): keep the state vector and propagate with `propagateUniversal`; radial states are never idle-eligible. On rails `epoch/m0` is re-based when `n·(t − epoch) > 2π`. rails → flight when a `throttle` (> 0), `attitude` (non-zero), `stage` or `action` command targets the vessel at warp 1. `warp > 1` is refused while any vessel is in flight and every command that needs flight is refused while `warp > 1`. Events: `vessel:mode-changed`, `vessel:created`, `vessel:destroyed`, `stage:activated` (declared in core's `EventMap`).

**Staging and splitting.** `stage` runs `onStage` of `stages[next]` (listed order). `detach` requests are applied after the hooks: the joint between the two parts is removed, the graph splits, the component with a control source (and the old root if both or neither) keeps the vessel id, the other becomes a new vessel (root = the part at the cut; throttle 0), both halves get equal and opposite momentum `impulse` along the node direction.

**Snapshot frames.** `VesselSnapshot.position/velocity` are the root part origin in BCI; `orientation` the root body orientation; `PartSnapshot.position` is the part origin minus the root origin **in BCI axes** (already rotated, not in the vessel body frame) and `PartSnapshot.orientation` the part's absolute orientation, which is what the renderer applies today, so no renderer change. `orbit` is the orbit of the centre of mass (absent for near-parabolic/radial).

**Ascent script (tests).** `test/helpers/ascent.ts`: full throttle; vertical to a turn altitude, then a pitch programme towards east (45° from vertical by 40 km), prograde after; PD attitude control from snapshot orientation (rate by finite difference) through `attitude` commands; `stage` when the active engine reports flameout; cut at apoapsis ≥ target; coast; circularise at apoapsis. Crude on purpose; thresholds may be tuned, the criteria stay.

## Steps

1. Core/SDK: `VesselApi`, `ResourceStore`, `controlSource`, `crossfeed`, protocol additions (`CommandResult`, `placement`, `stages`, `commandSchema`, `vesselDesignSchema`), `resolveVesselDesign`, sim events in `EventMap`, `API_VERSION` 0.1.2, SDK exports; tests; ADRs 0015, 0016.
2. Stock: container `store`, command `controlSource`, engine/wheel/decoupler hooks, `crossfeed: false` on engine and decoupler, flameout event; update stock tests and `writing-a-mod.md`.
3. Sim foundations: constants, math, atmosphere/aero, components, vessel assembly (`src/vessel.ts`), resource flow (`src/resources.ts`), capability factory.
4. Flight: frames, gravity, module updates, drag, ground contact, mass updates, staging/detach split, re-anchoring.
5. Modes: on-rails state and propagation, transitions, auto-rails, wake, warp gate.
6. Protocol: `dispatch` with validation, `snapshot`.
7. Tests: unit tests per area, `scenario-orbit.test.ts`, `determinism.test.ts`, `warp.test.ts`; tune the ascent script.
8. Docs: `simulation.md`, `plugin-system.md`, `units-and-frames.md`, `writing-a-mod.md`, glossary, ADR 0017, journal, STATUS, drafts for anything pushed out.

## Acceptance criteria

- [ ] `bun test packages/sim` passes including `scenario-orbit.test.ts`: the stock two-stage vessel, flown by the scripted ascent through `dispatch`/`snapshot` only, ends with periapsis altitude > 70 km and eccentricity < 0.1 within 1 200 s of simulated time, and the test asserts its own wall time < 30 s in Bun.
- [ ] `determinism.test.ts`: two runs with identical command scripts produce byte-identical `JSON.stringify(snapshot())` at t = 100 s.
- [ ] `warp.test.ts`: `warp > 1` refused while any vessel is in flight mode; accepted when all are on rails; on-rails position after 10 000 s with warp matches `kepler.propagate` within 1e-6 relative.
- [ ] Unit tests: design validation (valid, cycle, bad node, non-anti-parallel, unknown part), command validation (malformed, unknown vessel), resource flow (crossfeed blocked at the decoupler), decoupler split (two vessels, momentum conserved), pad hold (no throttle: stays within 0.5 m for 10 s), flight → rails → flight round trip, near-parabolic fallback keeps the state vector, stock hooks.
- [ ] `bun test` (whole repo), `bun run typecheck`, `bun run build`, `bun run docs:check` pass; `bunx prettier --check` passes on touched packages.
- [ ] `grep -rn "Bun\.\|process\.\|window\.\|document\." packages/sim/src` prints nothing; `grep -rn "stock\." packages/sim/src` prints nothing (the sim hard-codes no stock id); `packages/sim/package.json` dependencies are only `core`, `kepler`, `physics`.

## Docs checklist

- [ ] `docs/STATUS.md` (Phase 0 → complete if all Phase 0 plans done), journal, `architecture/simulation.md` (incl. design format), `plugin-system.md`, ADRs 0015-0017, glossary, `guides/writing-a-mod.md`.

## Log

- 2026-10-16 — Created as draft.
- 2026-10-16 — Refined draft → ready at the human's request (session: sim session).
- 2026-10-16 — Started: status in-progress (sim session).
- 2026-10-16 — Note from plan 006 (stock): module hooks cannot apply forces or move resources today (`ModuleContext` has no body handle or vessel resource access), so stock modules define config, state and pure helpers and leave the effect to this plan. Refinement must decide: sim applies effects from documented stock config/state (needs the sim to know stock module ids or a generic capability protocol), or extend `ModuleContext` additively (body handle, vessel resource access) so hooks do it. Contract and ids: journal 006. Also: `state(config)` and `PartDefinition.shape` exist (ADR 0014); the gravitational constant G is not in core (stock uses 6.6743e-11 to turn μ into a body mass).
