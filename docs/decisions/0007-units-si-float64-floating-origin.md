# 0007 — SI units, float64 state, floating origin, +Y up

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/001-repo-bootstrap.md

## Context

Planetary distances exceed float32 precision; GPUs and Rapier are float32; JavaScript numbers are float64. Mixed unit systems are a classic source of bugs in simulation code.

## Decision

- All state and APIs in SI (m, kg, s, N, rad). Display conversion only in UI.
- Positions/velocities in float64 in a body-centred inertial frame.
- Flight-mode physics in a vessel-local frame; rendering with a floating origin (re-centre threshold 10 km) and logarithmic depth buffer.
- Right-handed, +Y is the body's north pole (matches Three.js default up).
- Quaternions for orientation. Details in `architecture/units-and-frames.md`.

## Alternatives considered

- **+Z up (common in aerospace)** — would need a permanent swap for Three.js. Rejected; the convention is internal and documented.
- **Double-precision emulation on GPU** — complex, unnecessary with a floating origin. Rejected.

## Consequences

- Every numeric field in a part definition is SI; SDK helpers (`kN`, `tonnes`) exist for readability.
- Frame conversions are translations only.
