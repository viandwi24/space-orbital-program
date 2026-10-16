---
id: 012
title: Ground contact, landing and damage
status: done
owner: "ground session (Claude, 2026-10-16)"
depends: [007, 011]
phase: 3
created: 2026-10-16
updated: 2026-10-16
---

# 012 — Ground contact, landing and damage

## Goal

Replace plan 007's idealised ground (a sphere that zeroes relative velocity, a pad hold that pins a standing stack, uncontrolled vessels destroyed above 10 m/s) with real contact: a ground collider in the physics frame with friction, landing legs as a module through the SDK, and a damage model (part break-off and destruction by impact speed). A landing from orbit becomes an acceptance test.

## Context

- Read: ADR 0017 (the idealisation), ADR 0018 (one compound body per vessel), `architecture/simulation.md` "Assembly and physics", journals 007 and 011 ("For plan 012"), `research/rapier.md`.
- Depends on 007 and 011. New decisions: [ADR 0019](../decisions/0019-ground-tile-and-impact-damage.md) (supersedes the ground part of ADR 0017).

## Scope

**In:** ground contact in the physics frame; friction; landing-leg module and part in stock through the SDK; impact damage (break-off, destruction); removal of the pad hold and of the 10 m/s crash rule; re-entry survival hooks (minimal, see below); backend contact readback.
**Out:** terrain LOD and heights (the ground stays the reference sphere; Phase 3 terrain plan), re-entry heating (draft plan 014), part-to-part collision damage, leg suspension and animation, wheels.

"Re-entry survival hooks" are defined minimally as: the per-part `impactTolerance` data and the `part:damaged` event are the hooks a heating model will use to break or destroy parts; nothing is simulated for heat here.

## Design notes

Decided in ADR 0019:

- **Ground = a kinematic "ground tile" per vessel near the ground**, a 400 m x 400 m x 200 m slab whose top face is the tangent plane of the reference sphere under the vessel's centre of mass, re-positioned each step in the local frame, moving with the rotating ground (linear and angular velocity). Created when the vessel's centre of mass is under 300 m altitude, removed above 400 m. Friction 0.8, restitution 0.
- **Backend** (additive): `BodyDesc.friction`, `BodyDesc.restitution`, and `PhysicsBackend.contacts(a, b)` returning the contact points between two bodies (collider index within `a`, world point, signed distance).
- **Damage:** per part `impactTolerance` (m/s, default 6). Impact speed of a part = closing speed of its contact point relative to the ground along the ground normal, measured from the velocities before the step in which the contact appears. Above the tolerance the part breaks off (cut from every neighbour with `splitVessel`, it flies on as debris); above twice the tolerance it is destroyed (removed from the world). Replaces the 10 m/s uncontrolled-vessel rule.
- **Landing legs:** `ModuleDefinition.colliders?(config, state)` lets a module add collision boxes to its part (additive SDK/core change, `API_VERSION` 0.1.3); `stock.landing-leg` (actions `deploy`/`retract`, `onStage` deploys) adds four foot boxes when deployed; the vessel body is rebuilt when a dispatched action or stage changes the collider set.
- **Pad hold removed:** a stack stands on the ground tile by friction.

## Steps

1. Refine (research Rapier, ADR 0019, criteria). (done in refinement)
2. Core + physics: `friction`/`restitution`, `contacts`, `ModuleCollider`/`ModuleDefinition.colliders`, `impactTolerance`, `part:damaged`; adapter, mock, tests.
3. Sim: ground tile, contact readback, `landed`, damage, body rebuild on collider change; remove pad hold and `CRASH_SPEED`.
4. Stock: `stock.landing-leg` module and `stock.landing-legs` part; per-part `impactTolerance`; docs of the SDK change.
5. Tests: standing, landing from orbit, impact, determinism; docs, journal, STATUS.

## Acceptance criteria

- [x] `bun test packages/physics`: contact tests pass (a falling box lands on a fixed box and `contacts` reports the shape index and a distance <= 0.02; friction stops a sliding box; `friction`/`restitution` validation; mock returns no contacts). — `bun test packages/physics`: 24 pass; `contacts.test.ts` (4 tests)
- [x] `packages/sim/test/ground.test.ts` "standing": a `twoStage` vessel loaded on the surface with the pad hold gone stands for 60 s of sim time: |v| relative to the ground < 0.05 m/s, tilt from vertical < 0.5 degrees, no `part:damaged`, `landed` true. — `ground.test.ts` standing: |v| ~1.2e-3 m/s, tilt < 0.02 degrees
- [x] `ground.test.ts` "liftoff": with thrust above weight it leaves the ground and the scripted behaviour of `sim.test.ts` "the pad" still holds (adapted test titles: no pad hold). — `ground.test.ts` liftoff + `sim.test.ts` "the pad" (3 tests, titles adapted)
- [x] `packages/sim/test/landing.test.ts`: a lander (command pod, reaction wheel, two medium tanks, engine, landing legs: 6 parts) placed with a `state` placement in a stable circular orbit 100 km above `stock.home` is flown by a scripted deorbit burn, descent burn and touchdown (commands and snapshots only) and ends at rest on the ground: speed relative to the ground < 0.5 m/s, tilt < 5 degrees, all 6 parts still present, no `part:damaged` event, mode `flight`, within 3 000 s of sim time and under 60 s of wall time. — `landing.test.ts`: rest speed 0.014 m/s, tilt 0.00 degrees, 6 parts, 419 s sim, 0.49 s wall
- [x] `ground.test.ts` "impact": a vessel dropped on its engine at 20 m/s loses the engine (`part:damaged` for the engine with outcome `destroyed` or `broken`); the same vessel on deployed legs at 5 m/s loses nothing; a lone command pod at 100 m/s is destroyed and its vessel entity is gone (the rigid body is stopped by the one contact, so a stack only loses the parts that touch); a mutant with every tolerance set to infinity fails the first case (checked once by hand, recorded in the journal). — `ground.test.ts` impact damage (5 tests); mutation (tolerance 1e9) fails 4 of them
- [x] `ground.test.ts` "legs": `deploy` and `retract` actions change the snapshot module state, the body is rebuilt (collider count in a recording backend wrapper goes 6 -> 10 -> 6) and the vessel keeps its pose and velocity across the rebuild within 1e-3 m. — `ground.test.ts` landing legs (collider counts 6 -> 10 -> 6, pose kept < 1e-3 m)
- [x] `bun test packages/sim/test/determinism.test.ts` plus a new determinism case (a landing script run twice) give byte-identical `JSON.stringify(snapshot())`. — `determinism.test.ts` (script adjusted, see journal), `ground.test.ts` determinism, `landing.test.ts` second test
- [x] `bun test packages/sim/test/scenario-orbit.test.ts` still passes (plan 007 orbit). — `scenario-orbit.test.ts`: periapsis 76.18 km, e 0.026, 0.2 s wall
- [x] `bun test packages mods` (whole repo suite), `bun run typecheck`, `bun run build`, `bun run docs:check` pass (apps/web is another session's area: report, do not fix); `bunx prettier --check packages/core packages/physics packages/sim packages/sdk mods/stock` passes. — `bun test packages mods` 268 pass; `bun test` 289 pass; typecheck 8/8; build ok; docs:check ok; prettier clean
- [x] Boundary greps print nothing: `grep -rn "@dimforge" packages/sim/src packages/core/src packages/sdk/src mods/stock/src`; `grep -rn "from '@orbital/\(core\|sim\|physics\)'" mods/stock/src`. — all greps print nothing
- [x] No leftover idealisation: `grep -rn "holdOnPad\|CRASH_SPEED\|PadHold" packages` prints nothing. — grep prints nothing

## Docs checklist

- [x] `docs/STATUS.md` (board, known issues), journal 012, `architecture/simulation.md`, `plugin-system.md` and `guides/writing-a-mod.md` (SDK addition), ADR 0019 + index, 0017 status line, `research/rapier.md`, glossary, draft plan 014.

## Log

- 2026-10-16 — Created as draft by plan 007 (ground contact is idealised there).
- 2026-10-16 — Note from plan 011 (done): vessels are one compound rigid body (ADR 0018); the pad hold is not needed for the tests when the ground clamp sticks the rigid body (experiment in journal 011), so this plan can remove it. See "For plan 012" in journal 011.
- 2026-10-16 — Refined draft → ready at the human's request (session: ground session).
- 2026-10-16 — Deviations: (1) the lander has 6 parts, not 7 as first written, and the collider count goes 6 -> 10 -> 6; (2) "a 100 m/s fall destroys the command pod" holds for a lone pod only: the one ground contact stops the whole rigid body, so the parts above the impacted ones survive (criterion and test changed, journal 012); (3) the determinism script and the old "controlled vessel is only stopped" crash test of plan 007 were changed/removed because that behaviour was the idealisation this plan removes; (4) the heating follow-up is draft plan 014 (013 was taken by the debris lifecycle plan).
- 2026-10-16 — Done. All acceptance criteria verified by running them; see journal 012.
