# Rapier motored joints for robotics (plan 288)

**Question:** can `@dimforge/rapier3d-compat` 0.21 hold motored revolute and prismatic joints? We need them deterministic, stable in a 6-joint chain, and cheap enough per step to carry ADR 0262's robotic parts. The answer is wanted both as multibody joints and as impulse joints.

**Verdict: no-go at the adapter's settings** (dt 0.02 s, 16 solver iterations). Scenarios A, B, C and E pass for both kinds. D (the chain) and F (the cost) fail for both, and the plan's rules make that a no-go. ADR 0265 (proposed) answers it.

## Sources (read 2026-10-21)

- **Typings of the version we build with:**
  - `node_modules/.bun/@dimforge+rapier3d-compat@0.21.0/node_modules/@dimforge/rapier3d-compat/dist/dynamics/impulse_joint.d.ts`, `multibody_joint.d.ts`, `pipeline/world.d.ts`;
  - the raw bindings `rapier_wasm3d.d.ts` (`RawImpulseJointSet`, `RawMultibodyJointSet`).

  Root catalog `@dimforge/rapier3d-compat ^0.21.0`; resolved 0.21.0, `RAPIER.version()` = 0.21.0.
- **Rapier user guide, joints and motors:** https://rapier.rs/docs/user_guides/javascript/joints. Repository https://github.com/dimforge/rapier.

## What the 0.21 JS API offers

| Need | Impulse joint | Multibody joint |
|---|---|---|
| Create | `world.createImpulseJoint(JointData.revolute(a1, a2, axis) / .prismatic(…), b1, b2, wake)` | `world.createMultibodyJoint(same JointData, b1, b2, wake)` |
| Position motor | `UnitImpulseJoint.configureMotorPosition(target, stiffness, damping)` | **none** |
| Velocity motor | `configureMotorVelocity(targetVel, factor)` | **none** |
| Motor model | `configureMotorModel(MotorModel.ForceBased / AccelerationBased)` | **none** |
| Limits | `setLimits(min, max)` | only at creation through `JointData.limits`; getters, no setter |
| Contacts between the two bodies | `setContactsEnabled` | `setContactsEnabled` |
| State | none: the angle or travel comes from the two bodies' poses | same |

`RawMultibodyJointSet` exposes no motor call in this build. The bench therefore drives multibody joints with the closest equivalent: a software PD controller each step, as a torque (or force) pair on the two bodies, with the same gains as the impulse motors.

## Measurements

Machine: Intel Core i5-8265U (4 cores, 8 threads, 1.6 GHz), 5.8 GiB RAM, Linux Mint 22.3 (kernel 6.14), Bun 1.4.2, run under `nice -n 10`. Settings: dt 0.02 s, gravity 9.81, 16 solver iterations, 100 warm-up steps. Bench: `bun packages/physics/bench/joints.ts all`.

| Scenario | Rule | Multibody (software PD) | Impulse (Rapier motor, force-based) |
|---|---|---|---|
| A hinge lift, 1 t arm 2 m, 0° → 90° | hold ≤ 0.5° | 90° in 0.34 s, no overshoot, hold 0.000° · **pass** | 0.30 s, no overshoot, hold 0.000° · **pass** |
| B piston, 500 kg, 0 → 1.5 m | hold ≤ 1 cm | 0.24 s, hold 0.61 cm · **pass** | 0.22 s, hold 0.61 cm · **pass** |
| C rotor, 200 kg disc, 60 rpm | ≤ 2 % | 60.00 rpm (0.01 %) · **pass** | 60.00 rpm (0.00 %) · **pass** |
| D chain, 6 joints × 100 kg × 1 m, 30° each, 5 kN kick at 2 s | drift < 1 cm, settles | diverges (tip 5.8 m off, speeds → 10²⁸) · **fail** | tip 104.5 cm off, still moving at 1.3 mm/s · **fail** |
| E determinism of D (500 steps, full state as float32 bits) | bit-equal | in-process and across processes equal · **pass** | in-process and across processes equal · **pass** |
| F cost of D vs one body with 7 colliders | ≤ 3× | 233 µs vs 17.7 µs (13.2×) · **fail** | 101 µs vs 17.5 µs (5.8×) · **fail** |

**The chain, in more detail** (impulse joints, `DIAG=1`, diagnostics only):

| Setting | Joint errors (°) | Tip drift | Cost vs compound |
|---|---|---|---|
| dt 0.02, 16 iterations, ω 12 (default gains) | 2.2 11.2 1.1 5.1 0.8 0.7 | 104.5 cm | 5.8× |
| dt 0.02, 16 iterations, ω 30 | 0.65 4.0 0.18 1.9 0.09 0.25 | 36.9 cm | 5.1× |
| dt 0.02, 64 iterations, ω 30 | 0.29 1.0 0.24 0.53 0.21 0.13 | 11.0 cm | 8.2× |
| dt 0.005, 16 iterations, ω 120 | 0.04 0.24 0.02 0.11 0.01 0.02 | 2.2 cm (settles) | 3.7× |
| dt 0.005, 64 iterations, ω 120 | 0.02 0.06 0.02 0.03 0.01 0.01 | 0.7 cm (still moving) | 10.5× |

**A chain of two joints** (`CHAIN_LINKS=2`, impulse joints, same kick):

| Setting | Joint errors (°) | Tip drift | µs per step (vs compound) |
|---|---|---|---|
| dt 0.02, 16 iterations, ω 12 | 1.26 1.06 | 4.5 cm | 42 (2.4×) |
| dt 0.02, 16 iterations, ω 30 | 0.29 0.25 | 1.06 cm, settling | 47 (2.8×) |
| dt 0.005, 16 iterations, ω 30 | 0.18 0.15 | 0.63 cm, settled | 42 per sub-step, about 167 per 0.02 s (about 10×) |
| dt 0.005, 16 iterations, ω 120 | 0.02 0.02 | 0.07 cm, settled | 42 per sub-step, about 170 per 0.02 s |

- The acceleration-based motor model (`MOTOR=accel`) makes the chain unstable at every gain tried.
- The multibody PD diverges at dt 0.005 too: an explicit controller on a light tip link cannot be stiff enough at these steps.

## Reading

- **Single joints work well, and Rapier is deterministic.** A hinge, a piston and a rotor reach their targets in about 0.3 s and hold them. Every run, in one process or two, gives the same bits.
- **Multibody joints are not usable for robotics in this JS build.** They have no motors and no limit setter. Software torques on reduced-coordinate links are not stable enough in a chain.
- **Impulse joints sag and cost too much in a chain** at our step. The joint error falls roughly as 1/ω, not 1/ω²: the iterative solver, not the motor's stiffness, limits the 6-link chain. The error shrinks with more iterations or a smaller step, and so does the cost. Only dt 0.005 with 64 iterations comes near 1 cm, at 10× a vessel's step.
- **Two joints in series are close to the rules at our step:** 1.06 cm and 2.8× at ω 30. Sub-stepping at 0.005 s brings the drift well under 1 cm, but costs about four times as much per second of sim time.
- **What this suggests for ADR 0265:**
  - impulse joints for short chains (one or two joints: a hinge, a servo, a rotor, a piston), at our step, with stiff gains;
  - sub-steps only where a vessel needs the precision;
  - a kinematic pose (a set angle, with no solving) for arms longer than that.

## For plan 282, if ADR 0265 is accepted with impulse joints

| ADR 0262 point 2 call | Rapier 0.21 |
|---|---|
| `createRevoluteJoint(b1, b2, anchor1, anchor2, axis)` | `world.createImpulseJoint(RAPIER.JointData.revolute(anchor1, anchor2, axis), b1, b2, true)`, then `setContactsEnabled(false)` |
| `createPrismaticJoint(…)` | `RAPIER.JointData.prismatic(anchor1, anchor2, axis)`, the same |
| `setJointMotor(h, { mode: 'position', target, stiffness, damping })` | `configureMotorModel(MotorModel.ForceBased)`; `configureMotorPosition(target, stiffness, damping)` |
| `setJointMotor(h, { mode: 'velocity', target, damping })` | `configureMotorVelocity(target, damping)` |
| `maxForce` | not exposed in 0.21 JS: clamp in the adapter (lower the stiffness), or wait for an API |
| limits | `setLimits(min, max)` |
| `getJointState(h)` | computed from the two bodies: `2·atan2(q_rel·axis, q_rel.w)` and `(ω2 − ω1)·axis_world` for a revolute joint; travel `(p2 − p1)·axis_world` for a prismatic one |
