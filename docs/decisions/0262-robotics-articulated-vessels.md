# 0262 — Robotics: a vessel splits into rigid groups at robotic joints, joined by motored Rapier joints

**Status:** accepted with a gate (CTO call delegated by the owner, 2026-10-21): plan 282 starts with a spike. If the spike misses its numbers, a new ADR supersedes this one before any robotics part ships.
**Date:** 2026-10-21
**Plan:** plans/282-robotics-articulated-vessels.md, plans/283-rover-and-arms.md
**Builds on:** ADR 0018 (one compound rigid body per vessel), 0004 (physics behind an adapter), 0045 (articulation), 0218 (docking merges into one body)

## Context

The owner put robotics in the release roadmap together with the new parts, mainly for rovers. KSP's Breaking Ground has hinges (including "alligator" hinges), rotation servos, electric rotors, pistons (plain and telescoping) and the KAL-1000 sequencer. Our physics makes each vessel **one compound rigid body** (ADR 0018, for speed and stability). `PhysicsBackend` exposes only fixed joints, which the sim does not use. Wheels are colliders on that body with tyre forces at their contacts (ADR 0161). Legs swap colliders by state. Docking merges two vessels into one body (ADR 0218). A hinge that really moves mass cannot live inside one rigid body.

## Decision

1. **Rigid groups.** A robotic part splits the vessel's part tree at its joint:
   - the part's base stays in the parent group;
   - its moving half and everything below it form a child group.

   Each group is one compound body, built as today. A vessel without robotic parts is **exactly one group**, so every existing vessel, save and test is unchanged.
2. **Joints.** `PhysicsBackend` gains:
   - `createRevoluteJoint` (hinge, servo, rotor);
   - `createPrismaticJoint` (piston);
   - `setJointMotor(handle, { mode: 'position' | 'velocity', target, stiffness, damping, maxForce })`;
   - `getJointState`.

   The Rapier adapter uses multibody joints (reduced coordinates: no drift in long chains). The mock backend implements the same interface for tests. The spike checks Rapier's JS build, its version and its determinism, and records them in `research/stack-versions.md`.
3. **Parts:**
   - hinge S/M/L and alligator hinge S/M/L;
   - rotation servo S/M/L and plate servo;
   - electric rotor S/M/L;
   - piston and telescoping piston, S and L each;
   - sequencer controller.

   Each robotic part:
   - draws EC while moving;
   - has a torque or force limit, damping, a lock, and a target angle, length or rpm;
   - is shown in the panel and in action groups and axis groups.
4. **Sequencer:** a controller part with keyframe tracks per joint (play, loop, ping-pong), bound to action groups. Its UI is a timeline panel in Flight and in the Hangar.
5. **Rails and warp:**
   - When a vessel goes on rails (orbit or surface), its joints lock at their current pose and it is treated as one rigid body.
   - It wakes back into groups when it leaves rails.
   - Time warp above physics warp is refused while a joint is moving.
6. **Save, staging, docking:**
   - `PartState` stores the joint pose and motor targets.
   - Decoupling inside a group works as today. Decoupling across groups removes the joint.
   - Docking merges vessels as ADR 0218 does, keeping each side's groups and joints.
7. **Limits:** at most 24 groups per vessel and 8 joints in one chain. The spike measures the step cost; the budget is 0.5 ms of sim time on the M5 for a 6-joint rover arm.
8. **Rovers do not need joints for their wheels.** Wheel suspension becomes a spring and damper force at the wheel contact in `ModuleWheel`. It adds travel, spring and damping tweakables and a visual travel, inside the single body. Robotics is for steering arms, cranes, folding rovers and scanning arms that really move.

## Alternatives considered

- **Animation-only robotics** (moving visuals, fixed physics): cheap, but a hinge that cannot lift anything is not what the owner asked for.
- **Every part a body with fixed joints:** the instability ADR 0018 removed.
- **Impulse joints:** simpler API, but chains drift and wobble; multibody is the robust choice for arms.

## Consequences

- The biggest architectural change in the parts work. It stays isolated behind "a vessel with robotic parts", so nothing else changes until a player uses one.
- Plan 282 (core and parts) gates plan 283 (rover, arms) and the robotics lessons.
