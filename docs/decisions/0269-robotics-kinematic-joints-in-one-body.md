# 0269 — Robotics as built: kinematic joints inside the vessel's one body

**Status:** accepted (CTO call delegated by the owner, 2026-10-21)
**Date:** 2026-10-21
**Plan:** plans/306-robotics-kinematic-joints.md
**Supersedes:** ADR 0262 points 1, 2, 5 and 7; ADR 0265 (proposed, never accepted)
**Builds on:** ADR 0018 (one compound body per vessel), 0019 (body rebuilt between steps when colliders change), 0218 (docking merges into one body)

## Context

ADR 0262 wanted rigid groups joined by motored Rapier joints. Plan 288's spike found Rapier 0.21 JS has no multibody motors, and a 6-joint impulse chain sags 37–105 cm at 5–6× the cost of one body (ADR 0265). ADR 0265 proposed impulse joints for two joints in series, sub-steps, and kinematic poses for longer arms: three code paths, and every one changes the "one body per vessel" rule that docking, staging, saves, drag, heat and the Hangar's predictions rely on.

The owner wants robotics in the release, mainly for rovers, arms and moving parts on stations, and asked not to stay blocked.

## Decision

1. **Every joint is kinematic.** A robotic part (hinge, rotation servo, rotor, piston) moves the parts on its moving side by re-posing them inside the vessel's one compound body. There are no physics joints. The vessel stays one rigid body, as ADR 0018 says.
2. **How a pose is applied.** A module declares `joint(config, state)`:
   - `kind`: `rotate` or `translate`;
   - `axis` and `pivot`, in the part frame;
   - `node`: the moving side's attach node;
   - `value`: the current angle (rad) or extension (m).

   Each flight step the module moves `value` toward its target at its speed (it draws electric charge while moving). After the backend step, the sim compares `value` with the pose it last applied (`applied` in the module's state). It turns or slides the moving side by the difference about the joint's current pivot and axis. That changes those parts' `designPos` and `rotation`. The step is incremental, so it survives docking merges and splits.
3. **The moving side.** The moving side is every part reached through `node` without crossing the robotic part. If the vessel's root is on that side, the other side moves by the inverse instead. The root never moves in the design frame.
4. **The body is rebuilt at most 10 times a second per vessel** (ADR 0019's rebuild, between steps), so the pose lags the joint by at most 0.1 s. Mass, centre of mass, inertia, colliders, drag and the renderer's part transforms all follow, because they read the part poses. The part's own moving half is drawn from the applied pose (articulation modes `hinge`, `spin`, `slide`).
5. **What it does not model.**
   - A moving arm does not push the vessel the other way: no reaction torque, and no change in angular momentum.
   - A rotor turns what it carries but makes no thrust or lift: propellers are out of scope.
   - An arm that meets the ground is pushed out by the collider, as a leg is.
6. **Limits** (a launch error past them):
   - at most **4 robotic parts in series** on any path from the root;
   - at most **16 robotic parts per vessel**.
7. **Rails and warp.** On rails a joint keeps its pose and does not move. Physics warp moves it as normal. A save keeps the pose (the part poses and `applied` are saved).
8. **Controls.** Each robotic part has part-panel actions (target, speed, lock, and a direction toggle for rotors), and action groups. The sequencer of ADR 0262 point 4 is not in this plan.

## Alternatives considered

- **ADR 0265's mix of impulse joints and kinematic arms.** Two physics paths plus the kinematic one, with sub-steps costing about 4× per robotic vessel. Measurement on the M5 was still open. It can come later for physical hinges if a rover needs one; this ADR's interface (`joint`) stays.
- **Animation only** (move the meshes, not the colliders or the mass). A rover arm that reaches over the side would not shift the centre of mass, and a piston could not lift the rover. Rejected.

## Consequences

- No change to vessels without robotic parts: no rebuilds and no new state.
- `ModuleDefinition` gains `joint` (core), and the API takes a patch bump: the field is optional and additive.
- `PartState.designPos` is no longer "never changes". It is the part's current pose in the design frame, and robotic joints move it.
- Plans 282 and 283 are superseded for robotics by plan 306. Plan 283's rover parts and drive go to plan 307.
