# 0272 — Tethers and winches: a rope joint between two vessels; releasable struts

**Status:** accepted (2026-10-22, amended by plan 313: the sim applies the rope, not a Rapier joint; research in `refs/part-visuals-and-blueprints/connectors-and-tethers.md`)
**Date:** 2026-10-21
**Plan:** plans/313-tethers-winches-and-strut-release.md
**Builds on:** ADR 0018 (one compound body per vessel), 0071 (connector parts), 0218 (docking merges into one body), 0265 (Rapier joint measurements), 0269 (kinematic robotics)

## Context

The owner asked about KSP's struts and "cables that can be decoupled". Struts and fuel lines already exist as connectors (ADR 0071): they are cut when their ends end up on two vessels. Our vessels are one rigid body each, so a strut adds no strength: there is no wobble to stop. What we lack is a cable between two **separate** vessels. KSP players get one from the Kerbal Attachment System mod (winches, hooks, magnets, hoses). Its known faults are vessels flung away when docked mode toggles, and hoses lost past 30 m.

## Proposal

1. **Strut release:** a connector may carry a "Release" action (and a staging step); the sim cuts its `link`, as a split does today.
2. **A tether is a rope joint between two vessel bodies**, the only physics joint the game has:
   - **Core:** `ModuleDefinition.tether(config, state)` returns `{ node, maxLength, length, strength }`, or null while stowed.
   - **Sim:**
     - it creates a Rapier rope joint (pull only) between the two bodies at the anchors;
     - it reels by changing `length`;
     - it snaps above `strength` (`tether:snapped`);
     - it saves the pair and the length.
   - **Rails:** reeled-in tethered vessels go on rails as one; with slack they wake both.
3. **The ends:**
   - a socket part (a hook or magnet end that an EVA kerbal plugs in, plan 225's EVA);
   - a harpoon that sticks to what it hits, including terrain and asteroids;
   - a tether is attached in flight, never in the Hangar.
4. **Limits:**
   - one joint per tether;
   - at most 4 tethers per vessel;
   - no chains of tethered vessels longer than 3;
   - attaching or releasing never changes either vessel's velocity (the KAS lesson).
5. **Renderer:** the rope as a sagging curve while slack and a straight line while taut.

## Alternatives considered

- **Merge tethered vessels into one body** (as docking does). A rope is not rigid, so a winch would be pointless.
- **A spring force without a joint.** Stiff springs need small steps to stay stable. Rapier's rope joint is stable at our step for a single joint (plan 288's spike).

## Consequences

- The first physics joint in the game: `PhysicsBackend` gains `createRopeJoint`, `setRopeLength`, `removeJoint` and the mock backend's version.
- Struts stay cosmetic (and fuel paths); no load model.

## Amendment (plan 313, 2026-10-22)

- **The rope is applied by the sim, not by a Rapier rope joint.**
  - Rapier 0.12's rope joint cannot change its length, and it does not report the force it carries. A winch changes the length every step, and a rope snaps by its tension.
  - Before each physics step, when the anchors are farther apart than the length and separating, the sim applies equal and opposite pulls at them: the impulse that stops the separation in one step, plus a small correction for the overshoot. That pull is the tension.
  - `PhysicsBackend` gains nothing; the mock backend works as is.
- **The hooks** are `tether(config, state)` (`{ anchor, maxLength, length, strength, connect }`) and `socket(config)` (`{ anchor }`). The sim writes the winch's `connected`, `length`, `tension` and `snapped`.
- **The pair** is `PartState.tether = { peer }` on the winch part, saved with the world.
- **Not in plan 313:** the harpoon, EVA carrying the hook, hoses, the rails merge of reeled-in vessels, and the chain limits. Tethered vessels simply stay in flight.
