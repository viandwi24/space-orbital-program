---
id: 002
title: Kepler orbital mechanics
status: ready
owner: ""
depends: [001]
phase: 0
created: 2026-10-16
updated: 2026-10-16
---

# 002 — Kepler orbital mechanics

## Goal

`@orbital/kepler` provides correct, tested, dependency-free orbital mechanics: conversion between state vectors and classical elements, propagation in time for elliptic and hyperbolic orbits, apsis/period helpers, and sphere-of-influence radius. Everything `sim` needs for on-rails motion and the map view, with no knowledge of vessels or bodies.

## Context

- Read: `docs/architecture/units-and-frames.md` (frames, +Y up, SI), `docs/architecture/simulation.md` (how on-rails uses this).
- ADRs: 0007.
- Journal: `docs/journal/001-repo-bootstrap.md`.
- Reference formulas: Vallado, *Fundamentals of Astrodynamics and Applications*; the agent should cite which algorithm it used in code comments (e.g. "Vallado Alg. 9 RV2COE").

## Scope

**In:** two-body problem; elliptic, parabolic-safe handling, hyperbolic; mean/eccentric/true anomaly conversions; Kepler's equation solver; state ↔ elements; propagate(elements, μ, dt); period, apoapsis, periapsis, SOI radius; small vector helpers (`Vec3` as `{x,y,z}` plain objects + functions, no classes).
**Out:** perturbations, n-body, maneuver nodes, patched-conic transitions (plan 007 handles the *switch*, this plan provides the math it needs).

## Design notes

- Pure functions, plain data. No classes with methods (state rules in `boundaries.md`).
- Orbit normal convention: angular momentum `h = r × v`; inclination measured from +Y (body north).
- Handle the degenerate cases explicitly: circular (undefined argument of periapsis → 0), equatorial (undefined RAAN → 0), near-parabolic (`|e-1| < 1e-8` → treat with the universal-variable formulation or document the limitation and test it).
- Kepler solver: Newton–Raphson with a good initial guess; must converge for e up to 0.999 and hyperbolic e up to 10 in ≤ 20 iterations; fall back to bisection if not converged.
- Numerics are float64; tolerances in tests are relative (1e-9 for conversions round-trip, 1e-6 for propagation over one period).

## Steps

1. `src/vec3.ts` — `add, sub, scale, dot, cross, length, normalize` on `{x,y,z}`.
2. `src/elements.ts` — `OrbitalElements` type `{ a, e, i, raan, argp, m0, epoch }` plus derived helpers (`period`, `apoapsis`, `periapsis`, `isHyperbolic`).
3. `src/anomaly.ts` — mean↔eccentric↔true conversions, hyperbolic variants, `solveKepler`.
4. `src/convert.ts` — `fromStateVector(r, v, μ, t)` and `toStateVector(elements, μ, t)`.
5. `src/propagate.ts` — `propagate(elements, μ, t)` returning `{ r, v }`.
6. `src/soi.ts` — `soiRadius(aBody, mBody, mParent)`.
7. `src/index.ts` exports; remove the placeholder constant or keep `KEPLER_VERSION`.
8. Tests in `test/`: round-trips, known orbits, convergence, degenerate cases, energy conservation over propagation.
9. Update `docs/architecture/units-and-frames.md` if any convention was clarified; write journal.

## Acceptance criteria

- [ ] `bun test packages/kepler` passes with at least these tests:
  - `convert.test.ts`: for 1 000 random bound orbits (e ∈ [0, 0.95], i ∈ [0, π]), `toStateVector(fromStateVector(r,v))` reproduces `r` and `v` within relative 1e-9.
  - `convert.test.ts`: circular equatorial orbit radius 7 000 km around μ = 3.986e14 → `e < 1e-12`, `i < 1e-12`, `period ≈ 5828.5 s` within 0.01 s.
  - `propagate.test.ts`: propagating any random bound orbit by exactly one period returns to the start `r` within 1e-6 relative.
  - `propagate.test.ts`: specific orbital energy `v²/2 − μ/|r|` is constant within 1e-9 relative across 100 samples over one period.
  - `anomaly.test.ts`: `solveKepler` converges within 20 iterations for e = 0.999 across 360 mean anomalies, and for hyperbolic e = 5.
  - `soi.test.ts`: Earth-Sun values give SOI ≈ 0.924 million km within 1%.
- [ ] `bun run typecheck` passes.
- [ ] `packages/kepler/package.json` has no `dependencies`.
- [ ] `bun run docs:check` passes.

## Docs checklist

- [ ] `docs/STATUS.md` updated.
- [ ] `docs/journal/002-kepler-orbital-mechanics.md` written (include which textbook algorithms were used and any numeric gotchas).
- [ ] `docs/architecture/units-and-frames.md` updated if conventions were refined.
- [ ] ADR if any convention changed.

## Log

- 2026-10-16 — Created.
