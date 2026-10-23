# 0334 — Separation and deploy without flinging: pair-contact grace, hollow bays, a rebuild that keeps momentum

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/390-separation-and-deploy-without-flinging.md
**Builds on:** ADR 0018 (one compound body per vessel), ADR 0261 (bays), ADR 0269 (robotics in one body)
**Amends:** ADR 0018 (the backend now has a contact filter, for pairs only), ADR 0269 (a joint's re-pose keeps the centre of mass and the angular momentum)

## Context

Opening the Kronos petals to release the lander threw the rocket (the four panels, the ring and the payload started inside one another and the solver pushed them apart), a split or a spawned piece did the same, and a robotic joint re-posed the parts about a root that was not the centre of mass, so the vessel's centre jumped and its spin changed. `refs/graphics-v2/04-physics-fling-and-collision.md` has the causes (F0 to F5).

## Decision

1. **`PhysicsBackend.setPairContacts(a, b, enabled)` and `ignoredPairs()`** (API 0.1.121). A disabled pair keeps its manifold (so `contacts` still reports the overlap) but exerts no force. Rapier: `PhysicsHooks.filterContactPair` returns `SolverFlags.EMPTY` for a listed pair, with `ActiveHooks.FILTER_CONTACT_PAIRS` set on the colliders of the bodies in it; the hooks run only when `world.step` is given an `EventQueue`, so the backend always passes one. The mock keeps only the set. A removed body drops its pairs.
2. **The sim uses it** (`graceBetween` in `frames.ts`): on a split (the new vessels and the old one), on a spawned debris piece (against its source vessel and its siblings). `stepGrace` lifts a pair when `contacts` has had no point with `distance < 0` for 10 steps, or after 20 s. The set is per flight frame and is not saved: a load starts with none, and a pair that overlapped at the save separates by 20 s at most.
3. **Bays that have an `inner` seat are hollow.** `ModuleDefinition.hollow(config, state?)` now takes the module state (API 0.1.121, additive): the petals are hollow once jettisoned. `stock.bay` gets `walls` on the cargo bay; a lint test says every part with an `inner` node has a module whose `hollow()` is true when its doors are open.
4. **A rebuild of the body keeps the vessel where it is** (`refreshColliders`): the origin follows the centre of mass (`origin' = origin + R(com_old − com_new)`) and the spin keeps its angular momentum (`ω' = I'⁻¹·I·ω`). A robotic joint adds the counter-rotation of ADR 0269's note: the moving parts carry angular momentum about the centre, which the vessel takes up as an offset spin (removed again when the joint stops, before the next rebuild).
5. **A separator inside a closed bay or fairing is refused** (plan 281, folded in): `VesselApi.detach` throws `EnclosedError` ("<part> is closed: open it first") for a part `shieldedBy` a closed shell. The decouple action is refused with that message (the module sets `decoupled` only after `detach` accepted it, so it stays armed); a stage that holds one still fires its other parts and emits `stage:blocked` with the reason.

## Alternatives considered

- **Collision groups**: a pair filter by group needs a group per vessel pair; the hook is one set lookup per candidate pair, and only while the set is not empty.
- **Moving the panels clear (F1 only)**: leaves the split, the undock and a payload in a solid bay; the grace covers every spawn.
- **`setMass` correction (F5)**: tried `v += ω × shift` on the centre's move; the Rapier `setMass` already keeps the centre's velocity, so linear momentum holds and the correction broke it. Left as it was; the new test says a pump does not move the vessel.

## Consequences

- The Kronos petals and cargo-bay releases leave the carrier with |Δv| under 0.05 m/s; the Wayfarer's bay did not reproduce a fling headlessly (journal), and its test stays as a guard.
- Landing legs deployed on the ground lift the ship about 0.7 m/s for 0.3 s (the feet come out below the engine): under the 1 m/s of the guard test, over the plan's 0.5; an animated stroke would be the next step (not done).
- Mods that implement `PhysicsBackend` (tests, fakes) have two more methods; `hollow` implementations that ignore `state` are unchanged.
