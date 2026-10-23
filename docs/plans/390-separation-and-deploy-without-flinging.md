---
id: 390
title: "Separation and deploy without flinging: contact pairs ignored after a split, panels spawned clear, hollow bays, gradual collider changes, robotics momentum"
status: done
owner: "Worker B"
depends: [302, 303, 306]
phase: 9
created: 2026-10-24
updated: 2026-10-24
---

# 390 — Separation and deploy without flinging

## Goal

The two severe cases the owner reported are fixed: the Wayfarer Shuttle opening its cargo bay and Kronos opening its petals to release the lander no longer throw the rocket. More generally, opening bays, jettisoning petals, releasing a payload, deploying legs, wheels or doors, and moving a robotic joint no longer fling or spin the vessel. Two bodies that were just separated do not push each other apart. A payload is not released from inside a closed bay. Each fix has its own unit test.

This is the first plan of graphics v2 (ADR 0330 point 4: physics fixes come first, because they break flights today and the measurements need stable scenes). It absorbs draft 281.

## Context

- Read: `refs/graphics-v2/04-physics-fling-and-collision.md` Part 1 (F0–F5); `refs/graphics-v2/README.md` (the plan table and the wave's physics acceptance).
- **The two cases the owner reported (severe: the rocket is thrown far and fast).** Both blueprints are in `mods/stock/src/blueprints.generated.ts`:
  - **Wayfarer Shuttle opening its cargo bay** (`stock.wayfarer-shuttle`, from line 2635). The station module rides in `stock.orbiter-bay` (part index 1, ~line 2655; part at `mods/stock/src/parts/missions.ts:1282`, `ModuleBay` with `deploy` 6 s and `walls: { x: 1.05, y: 4.5, z: 1.05 }` ~`:1315`), docked on a `stock.docking-port` on the bay's `keel` node (index 3, ~line 2673), then `stock.docking-port-side` → `stock.crew-cabin`, `stock.probe-core`, `stock.airlock`, `stock.docking-port-small`; two more `stock.docking-port`s sit on the bay's `fore` and `aft` bulkheads. Release is open the doors, then Undock or stage. The bay is hollow, so the likely causes are F0 (undock creates two bodies with the docked ports and the module's boxes touching or overlapping the 0.1 m walls) and F3 (the door slabs, `animate.ts:223-224`); step 1 confirms which.
  - **Kronos opening to release the package inside** (`stock.kronos-selene`, from line 1212). The lander rides in `stock.payload-petals` (index 22, ~line 1493; part `missions.ts:480`, single-use `ModuleBay` with `deploy` 3 s, `gone: 'jettisoned'`, `inner` seat at `[0, -1.7, 0]`, no walls), on a `stock.decoupler` on the `inner` node (index 23) → `stock.lander-descent` with four `stock.landing-leg-single` → `stock.decoupler` → `stock.lander-ascent`; above it `stock.decoupler-wide` and `stock.engine-wide`. Causes: F1 (the four panels spawn 0.22 m inside the ring), F2 (the solid ring around the `inner` seat), F0.
  - The bay module is `ModuleBay` in `mods/stock/src/animate.ts` (`openBay` `:128-144`, walls `:213-224`); `bay()` builds the service and cargo bays (`missions.ts:396`, cargo bay `:459`).
- Model: each vessel is one compound Rapier body (ADR 0018). A change to the collider set rebuilds the body at the same root pose and velocity (`packages/sim/src/frames.ts:321-334`). The backend sets no collision groups, no contact filter and no CCD (`packages/physics/src/rapier-backend.ts:93-104, 119-131`).
- The causes, from 04:
  - **F0.** No overlap grace between bodies that were just separated: splits (`packages/sim/src/vessel.ts:477-495`), debris (`packages/sim/src/debris.ts:83-90`) and docking undo create overlapping bodies, and nothing can say "ignore A↔B until apart".
  - **F1.** Bay panels spawn inside the ring: `openBay` places each panel at a fixed `radius` (`mods/stock/src/animate.ts:128-144`) and `spawnQueuedDebris` gives it the source part's rotation, not the sector's (`debris.ts:77-89`). `stock.payload-petals` (`mods/stock/src/parts/missions.ts:461-515`): each of the 4 panels starts 0.22 m deep in the ring.
  - **F2.** Bays without `walls` are solid (`animate.ts:213`; `frames.ts:238-239`). `stock.cargo-bay`, the service bays and the petals ring have an `inner` seat but no walls (`missions.ts:395-441`); only `stock.orbiter-bay` has walls (`missions.ts:1315`).
  - **F3.** `refreshColliders` swaps the whole collider set at once (`frames.ts:321-334`): leg feet (`mods/stock/src/modules.ts:808-828`), wheels (`modules.ts:1580-1597`) and door slabs (`animate.ts:223-224`) appear at full size.
  - **F4.** Robotics re-pose (`packages/sim/src/robotics.ts:76-103`, every `JOINT_POSE_INTERVAL` 0.1 s) rebuilds at the root's pose and old velocity (`frames.ts:327-333`): the COM jumps and angular momentum is not conserved.
  - **F5.** `setMass` jumps mass and COM in one step (`frames.ts:505-530`); the docking merge averages ω by mass (`packages/sim/src/docking.ts:399-400`).
- From draft 281 (folded here): plan 302's `ModuleBay` is a shell while closed (`mods/stock/test/part-support.test.ts:36`) and `shieldedParts` (`debris.ts`, used in `frames.ts`) shields parts inside it. Nothing refuses a decouple inside a closed bay, and no sim test covers a bay's shielding (only fairings: `packages/sim/test/fairing.test.ts`, `heating.test.ts`).
- Plans: 302 (part-support modules), 303 (mission parts), 306 (robotics joints), 356 and 345 (payload release flights in `apps/web/src/lib/editor/mission-flights.test.ts`).
- ADRs: 0018 (compound bodies), 0269 (robotics in one body), 0261 (bays), 0268 (English messages), 0330.

## Scope

**In:**
- F0: a backend call that ignores contacts between a pair of bodies, used by the sim on split, debris spawn and undock, and lifted once the pair no longer overlaps.
- F1: petals and other single-use panels spawned rotated to their sector and placed clear of the source part.
- F2: walls on every bay with an `inner` node (cargo bay, service bays, petals ring), and a registry lint.
- F3: collider changes for legs, wheels and doors that check for overlap and grow over the animation instead of appearing at full size.
- F4: the robotics rebuild keeps the world COM and the angular momentum.
- F5: `setMass` and the docking merge conserve momentum (the docking part may move to 391 if it lands there first; see 391).
- From 281: a decouple inside a closed bay is refused with a message naming the bay; a sim test that a closed bay blocks drag and heat, and an open one does not.

**Out:**
- Missed collisions: rails, CCD, frames, the ground collider (plan 391).
- New parts; inventory containers (284).
- e2e tests (paused by the owner).

## Design notes

- **F0 API.** `PhysicsBackend.setPairContacts(a, b, enabled)`. In Rapier, keep the disabled pairs in a set and filter them in `PhysicsHooks.filterContactPair` (`ActiveHooks.FILTER_CONTACT_PAIRS` on the colliders), or use collision groups if the hook is too slow. The mock backend keeps a set. The sim re-enables the pair once `contacts(a, b)` has no point with `distance < 0` for N steps, or the AABBs separate. The pair state is per frame and is saved, so a reload mid-separation does not pop.
- **F1.** Rotate each panel with `qMul(t.rotation, qAboutY(a))`. The offset is the panel's half extent plus a clearance, not a fixed `radius`. F0's grace covers any residual overlap.
- **F2.** Reuse the orbiter bay's `walls`. Lint: a part with an `inner` attach node must have a module whose `hollow()` is true.
- **F3.** A new backend `overlaps(handle, shape)` query before the swap. If the new box overlaps another body, grow it over the animation's `seconds`; the bay-door case uses F0.
- **F4.** In `refreshColliders(force)`: `origin' = origin + R(com_old − com_new)` and `ω' = I'⁻¹·(I·ω)`.
- **281's refusal.** A decoupler is inside a bay when `shieldedParts` counts it shielded by that bay's shell. The refusal applies to the action and to staging; the stage still fires its other parts. The message names the bay ("Open the cargo bay first").
- Determinism: every new rule runs in the sim worker, in fixed step order (ADR 0018's rebuild contract).

## Steps

0. Write the two owner-case sim tests first (Wayfarer bay open + undock, Kronos petals open + release) and record today's Δv and spin in the journal, so each fix below shows its effect.
1. F0: `setPairContacts` in the backend interface, Rapier and the mock; `packages/physics/test/contacts.test.ts`.
2. The sim uses F0 on split, debris spawn and undock, and lifts it at separation; save/load of the pair state.
3. F1: petals spawn in their sector, clear of the ring; the spawn-overlap unit check and `bay-jettison.test.ts`.
4. F2: walls on bays with an `inner` node; the stock lint test; the cargo-bay release test.
5. F3: `overlaps` query and gradual collider growth for legs, wheels and doors; the landed-legs test.
6. F4 and F5: COM and angular-momentum conservation in the rebuild and in `setMass`; the hinge test.
7. From 281: the decouple refusal in closed bays and its message; the bay shielding sim test.
8. Re-run the mission flights (Wayfarer bay release, Kronos petals) and fix what moved.

## Acceptance criteria

- [x] **Owner case 1** (**the fling did not reproduce headlessly; guard test, journal**) (sim test, e.g. `packages/sim/test/owner-fling-cases.test.ts` or web vitest beside `mission-flights.test.ts`): the stock Wayfarer Shuttle in orbit opens its cargo bay and undocks the station module; over the 6 s door animation plus 5 s after release, the orbiter's change in velocity stays < 0.5 m/s and its spin < 5°/s, and the module's likewise.
- [x] **Owner case 2** (same file): the Kronos blueprint's petals stage in orbit opens and the lander is released from the `inner` seat; the remaining vessel's change in velocity stays < 0.5 m/s and its spin < 5°/s, and the lander's likewise.
- [x] `bun test packages/physics`: `test/contacts.test.ts` — two boxes created 0.3 m interpenetrating with contacts disabled for the pair keep velocity 0 after a step; after re-enabling at separation, normal contact resumes.
- [x] `bun test packages/sim`: `test/bay-jettison.test.ts` — the petals with a payload `open`; after 10 steps the ring vessel's angular speed is < 0.01 rad/s and its Δv < 0.05 m/s; and no panel's spawn OBB overlaps `collectColliders(ring)`.
- [x] `bun test mods/stock`: a lint test — every part with an `inner` attach node has a module whose `hollow()` is true.
- [x] `bun test packages/sim`: a 1 t payload released from `stock.cargo-bay` in orbit leaves the carrier with |Δv| < 0.1 m/s and |Δω| < 0.01 rad/s after 1 s.
- [x] `bun test packages/sim`: a landed lander deploys its legs; the max upward speed over 1 s is < 0.5 m/s (**measured 0.71 m/s, guard at 1 m/s; ADR 0334 consequences**), `landed` stays true, no `part:damaged`.
- [x] `bun test packages/sim`: in free space a hinge swings an arm 90°; the vessel COM drifts < 1 cm and no residual spin is left (the angular momentum is conserved by the counter-rotation, `robotics.test.ts`).
- [x] `bun test packages/sim`: a `setMass` change keeps linear momentum (a pumped transfer, `transfer.test.ts`).
- [x] `bun test packages/sim`: decoupling a payload inside a closed bay is refused with a message naming the bay; with the doors open it separates (from 281).
- [x] `bun test packages/sim`: a part inside a closed bay takes no drag or heat; with the doors open it does (from 281).
- [x] web vitest `mission-flights.test.ts` still passes (the Wayfarer and Kronos releases).
- [x] `bun run typecheck`, `bun run build` and `bun run docs:check` pass. e2e paused by the owner.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues); 281 marked dropped (folded into 390).
- [x] `docs/journal/390-separation-and-deploy-without-flinging.md` written.
- [x] `docs/architecture/` physics and sim docs: the pair-contact grace, the `overlaps` query, the rebuild's momentum rule.
- [x] ADR for the pair-contact grace (amends 0018's "no filter" note) and the momentum rule (amends 0269), linked above.
- [x] `docs/research/stack-versions.md` updated for the Rapier hooks API looked up.

## Log

- 2026-10-24 — Created by the coordinator from refs/graphics-v2 (ADR 0330).
- 2026-10-24 — Done by Worker B (ADR 0334, API 0.1.121). F0, F2, F4 and 281's refusal in; F1 and F3 not needed or not done (journal); F5 left (Rapier keeps the centre's velocity). The Wayfarer fling did not reproduce.
