# 0265 — Robotics after the joint spike: impulse joints for short chains, sub-stepping for robotic vessels, kinematic poses for long arms

**Status:** superseded by 0269 before acceptance (2026-10-21; [ADR 0269](0269-robotics-kinematic-joints-in-one-body.md)): every joint is kinematic, no impulse joints.
**Date:** 2026-10-21
**Plan:** plans/288-robotics-joint-spike.md (the gate's verdict); plans/282-robotics-articulated-vessels.md (would build on it)
**Builds on:** ADR 0262 (rigid groups joined by motored joints), 0018 (one compound body per vessel), 0004 (physics behind an adapter)

## Context

ADR 0262 chose Rapier multibody joints and set a gate: plan 288's spike had to meet its numbers before any robotics part ships. Measured on Rapier 0.21.0 at the adapter's settings (dt 0.02 s, 16 solver iterations; `docs/research/rapier-joints.md`):

- **Multibody joints** have no motor and no limit setter in the 0.21 JS API. Driven by software torques, a 6-joint chain diverges.
- **Impulse joints with Rapier's motors** hold a hinge, a piston and a rotor within 0.5°, 1 cm and 2 %, and are bit-deterministic across processes. A 6-joint chain, however, sags 37–105 cm, depending on the gains. It costs 5–6× a vessel's single body. A **two-joint** chain is at 1.06 cm and 2.8×.
- **Smaller steps and more iterations** help. At dt 0.005 the 6-joint chain drifts 2.2 cm, at 3.7× the cost per step, which is four steps per 0.02 s. Only dt 0.005 with 64 iterations reaches 0.7 cm, at 10.5× per step.

By the rules of plan 288 this is a no-go for ADR 0262 as written: D and F fail for both joint kinds.

## Proposal

1. **Impulse joints, not multibody,** for every motored joint (`JointData.revolute` and `.prismatic`, `configureMotorPosition` and `configureMotorVelocity`, force-based). ADR 0262 point 2's interface stays. `maxForce` is clamped in the adapter, since 0.21 does not expose one.
2. **Short chains move under physics:** at most **two motored joints in series** from a vessel's root group (a rover's steering, a hinge with a servo, a rotor, a piston). The spike measured such a chain at our step (ω 30) at 1.06 cm after the kick, settling, at 2.8× a single body's cost.
3. **Sub-steps as an option, not the default:** a flight frame holding a moving two-joint chain may run four sub-steps of 0.005 s per 0.02 s step. The spike measured 0.63 cm that way, at about four times the cost per second of sim time. Plan 282 measures on the M5 whether the default step is enough for the stock parts.
4. **Longer arms are kinematic.** A chain longer than two joints (a crane, a scanning arm) is posed by its targets with no joint solving: each group's pose follows the angles through a rate limit. While it moves, it is a single body whose colliders are re-placed. It still lifts what it holds, as part of the one body, but it pushes on nothing outside the vessel.
5. **Budget:** ADR 0262's 0.5 ms on the M5 for a 6-joint arm becomes 0.5 ms for a two-joint chain under sub-stepping. The M5 measurement stays with plan 282.

## Alternatives

- **Keep multibody joints:** not possible with the 0.21 JS API (no motors). Revisit when a later Rapier exposes multibody motors. The bench (`packages/physics/bench/joints.ts`) reruns as is.
- **Sub-step every chain at dt 0.005 with 64 iterations:** meets 1 cm, but at 10.5× a vessel's cost per step and four steps per 0.02 s, about 40× per second of sim time.
- **Animation-only robotics** (ADR 0262's first alternative): rejected again for short chains, which can move mass.

## Consequences

- Plan 282 stays gated until this ADR is accepted, amended or rejected.
- If it is accepted, plan 282 maps ADR 0262 point 2 to the calls listed in `docs/research/rapier-joints.md`. It adds the sub-step and the kinematic arm, and lowers point 7's chain limit from 8 joints to 2 physical joints.
