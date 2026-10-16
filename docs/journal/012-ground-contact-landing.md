# 012 — Ground contact, landing and damage

**Plan:** plans/012-ground-contact-landing.md · **Session(s):** ground session (Claude, 2026-10-16) · **Date:** 2026-10-16

## What was done

The draft was refined to `ready` at the human's request (Rapier docs checked, ADR 0019, measurable criteria, draft plan 014 for the heating that was scoped out), then implemented. No scaffolding, no new dependencies.

| Area | Change |
|---|---|
| core (additive, `API_VERSION` 0.1.3) | `BodyDesc.friction`/`restitution`, `ContactPoint`, `PhysicsBackend.contacts(a, b)`; `ModuleCollider` and `ModuleDefinition.colliders`; `PartDefinition.impactTolerance`; event `part:damaged` |
| physics | adapter: friction/restitution on all colliders, collider-to-body index, `contacts` through `contactPairsWith` + `contactPair` (solver contacts, world points); mock returns none; `test/contacts.test.ts` (4 tests) |
| sim | ground tile per vessel near the ground (`frames.ts updateTile`), contact readback with pre-step velocities (`groundContacts`), `landed` from contact points, damage (`vessel.ts damagePart`: cut every attachment with `splitVessel`, destroy above 2x), module colliders in the compound body and `refreshColliders` after action/stage, `placeOnSurface` counts deployed feet; **removed**: pad hold (`PadHold`, `holdOnPad`, `vessel.pad`), sphere clamp `applyGround`, `CRASH_SPEED`, `core.forces` |
| stock | `stock.landing-leg` module (`deploy`/`retract`/`toggle`, `onStage` deploys, four feet), `stock.landing-legs` part, `impactTolerance` on every part (pod 10, wheel 6, tanks 5, engine 4, decoupler 8, legs 12) |
| tests | `ground.test.ts` (standing, liftoff, impacts, legs, determinism), `landing.test.ts` (orbit to standing, twice for determinism), `helpers/{attitude,ground,landing}.ts` (the PD loop of the ascent script moved to `attitude.ts` and shared), `lander()` design; stock module tests |
| docs | ADR 0019 (+ index, 0017 status), `simulation.md`, `plugin-system.md`, `guides/writing-a-mod.md`, glossary, `research/rapier.md`, draft plan 014 |

## Numbers

- **Landing** (`landing.test.ts`; lander = pod, wheel, 2 medium tanks, engine, legs, 21.1 t wet, 5.75 t at touchdown): start in a 100 km circular orbit on rails; retrograde burn with a constant-deceleration throttle law from the start (no separate deorbit burn: gravity loss is acceptable with 5.4 km/s on board); "final" stopping-profile law from 5.7 km altitude at 100 m/s; legs out at 400 m (110 m/s); touchdown at 1.29 m/s at t = 409 s; 10 s later at rest: 0.014 m/s relative to the ground, tilt 0.00 degrees, 6/6 parts, no `part:damaged`. 419 s simulated, 0.49 s wall.
- **Standing** (`twoStage` on the surface): 60 s, relative speed ~1.2e-3 m/s (it is the 1e-3 floor of f32 velocity), tilt < 0.02 degrees; 3 000 steps in 112 ms (37 µs/step with the tile). `bun packages/sim/bench/stack.ts 20 50 100`: 62 / 99 / 128 µs, unchanged (no tile when high).
- **Impacts** (dropped on the engine with 0.5 m clearance): 2 m/s nothing; 6 m/s engine `broken`; 20 m/s engine `destroyed`; on deployed legs 5 m/s nothing; 100 m/s lone pod `destroyed` and the vessel is gone. Mutation check: with every `impactTolerance` set to 1e9, 4 of the damage tests fail (restored).

## What surprised me

- **The old "controlled vessel is only stopped" behaviour hid a crash in the determinism script.** The scripted run (pitch 0.2, throttle 0.6) flew a ballistic arc into the ground at 216 m/s at t = 49.7 s and the old clamp quietly stopped it. With real damage the vessel was destroyed and the script's later `stage` was refused. Changed the script (pitch 0.02, throttle 0.9) so the vessel stays up; the old crash test in `sim.test.ts` was removed (superseded by the impact tests in `ground.test.ts`).
- **The whole rigid body is stopped by the one contact that hits the ground.** At 100 m/s the tank and engine at the bottom are destroyed, but the parts above lose their speed in the same step (momentum went to the ground through the contact) and survive. The plan's first wording ("a 100 m/s fall destroys the command pod") was only true for a lone pod; criterion and tests changed accordingly (see Log of the plan). A crumple-energy model (damage propagating up the stack) would be a later refinement.
- **Free-fall during the test's "clearance"** made the first impact tests hit at 22 m/s instead of 5: `dropOnto` places the lowest point 0.5 m above the ground using the standing COM altitude of a scratch sim.
- **Scripted landing guidance:** the first law kept `a_req = v²/2h` to the ground and hovered for 200 s at the end (fuel gone, crash at 164 m/s). A stopping-profile law (`v_target = -sqrt(net_decel · h)`, engine off above it) fixed it; also a horizontal-damping gain of 0.15 per m/s tilted the vessel 24 degrees, 0.03 with a 17 degree cap is fine.
- Damage splits can be several per step (a destroyed mid-stack part cuts two attachments); `damagePart` is robust to a part an earlier hit of the same step already removed.
- Plan numbers corrected on the way: the lander has 6 parts (the plan said 7) and the collider count goes 6 -> 10 -> 6.

## Decisions made

ADR [0019](../decisions/0019-ground-tile-and-impact-damage.md): kinematic ground tile per vessel (not a per-step height query, not a huge collider), contact readback through the narrow phase (not force events), impact-speed damage with break-off at 1x and destruction at 2x the part's tolerance, landing legs as module colliders with a body rebuild on action/stage. Supersedes the Ground point of ADR 0017.

## For the web client and plan 010 (scripting)

- New command usage: none (the protocol is unchanged). Landing legs are driven with the existing `action` command: `{ type: 'action', vessel, part, module: 'stock.landing-leg', action: 'deploy' | 'retract' | 'toggle' }`, or by staging (`onStage` deploys). The part snapshot's `modules['stock.landing-leg']` is `{ deployed: boolean }` (the renderer may draw legs from it).
- New part `stock.landing-legs`, new module `stock.landing-leg`, new event `part:damaged { vessel, part, definition, speed, outcome: 'broken' | 'destroyed' }` (HUD toast material); `vessel:destroyed` reasons are now `"<part id> destroyed by impact"` instead of `"crashed into the ground"`. A broken-off part becomes a new vessel (`"<name> (debris)"`, `vessel:created` with `from`).
- Vessels no longer survive arbitrary crashes: a launch whose trajectory comes back into the ground now loses parts. `vessel.landed` still keeps a vessel off rails.
- For a scripting API: everything needed for a landing is already in `snapshot` (position, velocity, orientation, part module states) and `throttle`/`attitude`/`stage`/`action`; `test/helpers/landing.ts` is a worked example of a guidance script using only those.
- `PhysicsBackend` gained a required method, `contacts`; hosts that implement their own backend need it (the web app uses `createRapierBackend`).

## Open questions / follow-ups

- Draft plan [014](../plans/014-reentry-heating.md) (heating); draft plan 013 (debris lifecycle) interacts: debris now meets the ground and is destroyed or lies on a tile when low enough.
- Terrain heights would replace the flat tile (the tile code in `frames.ts` is the plug-in point).
- Collision damage between vessels (a stage hitting its parent) and crumple-energy propagation are not modelled.
- Module colliders changed from an `update` hook only take effect at the next action/stage/split (documented).
- The tile's flat plane deviates from the sphere by `d²/2R` (3 cm at 200 m): fine under a vessel, wrong for a far-away large debris field.

## Verification output

```
$ bun test packages mods     -> 268 pass, 0 fail
$ bun test                   -> 289 pass, 0 fail (38 files)
$ bun run typecheck          -> 8 workspaces exit 0 (web: 0 errors)
$ bun run build              -> done
$ bunx prettier --check packages/core packages/physics packages/sim packages/sdk mods/stock -> clean
landing: 374 s final: 5679 m up, 100.0 m/s | 403 s legs out at 399 m, 110 m/s | 409 s touchdown: 1.29 m/s | 419 s done; rest speed 1.40e-2 m/s, tilt 0.00 deg, sim 419 s, wall 488 ms
orbit (scenario-orbit, unchanged): apoapsis 111.87 km, periapsis 76.18 km, e 0.0257, 217.6 s
```
