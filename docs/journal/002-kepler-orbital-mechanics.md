# 002 — Kepler orbital mechanics

**Plan:** plans/002-kepler-orbital-mechanics.md · **Session:** kepler session (Claude, Code tab) · **Date:** 2026-10-16

## What was done

Implemented `@orbital/kepler` with no dependencies. No scaffolding was needed because the package skeleton came from plan 001. The only tool used was `bun:test`, and its docs were checked and recorded in `research/bun-test.md`.

| File | Contents | Algorithm |
|---|---|---|
| `src/vec3.ts` | `vec3, add, sub, scale, dot, cross, length, normalize` on `{x,y,z}` | — |
| `src/elements.ts` | `OrbitalElements`, `period`, `apoapsis`, `periapsis`, `meanMotion`, `isHyperbolic`, `isNearParabolic`, tolerances, `KeplerError` | — |
| `src/anomaly.ts` | true↔eccentric↔mean, hyperbolic variants, `solveKepler` / `solveKeplerDetailed`, `meanToTrue`, `trueToMean`, `wrapTwoPi`, `wrapPi` | Vallado Alg. 2 (KepEqtnE), Alg. 4 (KepEqtnH); Danby starting value; half-angle ν↔E forms |
| `src/convert.ts` | `fromStateVector(r, v, μ, t)`, `toStateVector(el, μ, t)` | Vallado Alg. 9 (RV2COE), Alg. 10 (COE2RV) |
| `src/propagate.ts` | `propagate(el, μ, t)`, `propagateUniversal(r0, v0, μ, dt)`, `stumpffC`, `stumpffS` | Vallado Alg. 8 (KEPLER, universal variables) in Curtis's Stumpff form (Alg. 3.3/3.4) |
| `src/soi.ts` | `soiRadius(aBody, mBody, mParent)` = a (m/M)^(2/5) | Laplace SOI (Vallado §12.5, Curtis eq. 8.21) |

Tests live in `test/{vec3,elements,anomaly,convert,propagate,soi}.test.ts`. A seeded mulberry32 PRNG lives in `test/helpers.ts`, which is deliberately not named `*.test.ts`. `KEPLER_VERSION` is bumped to `0.1.0`.

Docs: `architecture/units-and-frames.md` has a new "Orbital elements" section. `architecture/simulation.md` now notes that the flight → on-rails switch must handle `KeplerError`. The glossary has an "Orbital elements" entry and `research/bun-test.md` was added.

## What surprised me

- **One acceptance criterion's number was wrong.** For r = 7 000 km and μ = 3.986e14, 2π√(r³/μ) = **5828.5199 s**, which is not within 0.01 s of 5828.5. The human approved changing the test to assert 5828.52 s ± 0.01 s, and the plan's Log records the change. Next time, compute a plan's expected values before writing them in.
- **+Y-up versus the textbook frame.** Vallado uses +K as the pole. The proper rotation `I = x, J = −z, K = y` lets the textbook formulas run unchanged. The non-obvious result is that RAAN increases from +X toward **−Z**, which is right-handed about +Y. A test pins this down (`raan = π/2` puts the node on −Z).
- **Use atan2 for the angles in RV2COE.** `atan2((a × b)·ĥ, a·b)` replaces acos plus quadrant checks. It keeps full precision near 0 and π, and the same expression covers the retrograde-equatorial case, because longitudes are then measured about ĥ = −Y, which matches what COE2RV rebuilds with i = π.
- **Kepler solver headroom.** Newton with Danby's start `E0 = M + 0.85 e·sign(M)` (after wrapping M to (−π, π]) needs at most **12** iterations for e = 0.999 across 360 mean anomalies. The hyperbolic solver with start `asinh(M/e)` needs at most **5** for e = 5 with M ∈ [−100, 100]. The 20-iteration cap and the bisection fallback (bracket [M−e, M+e] elliptic, |H| ≤ asinh(|M|/(e−1)) hyperbolic) never trigger in the tests.
- **Measured accuracy is far inside the tolerances.** The worst round-trip error over 1 000 random orbits is 6.3e-15 relative, and the worst one-period return is 1.4e-14 relative. Over very long time-warp spans, though, `m0 + n·(t − epoch)` will lose absolute precision. Re-basing the epoch periodically is plan 007's concern.
- **Stumpff functions.** The closed forms cancel badly near z = 0, so a 5-term series is used for |z| < 1e-2, with truncation error around 1e-15. The universal Kepler equation is monotonic in χ (F′ = r > 0), so Newton runs inside a bracket that is grown until it contains the root, and bisection is always a safe step.

## Decisions made (link ADRs)

No ADR, because no convention changed. The `units-and-frames.md` section spells out consequences of ADR 0007: hyperbolic `a < 0`, angle ranges, and the conventions for degenerate cases.

- Near-parabolic orbits (|e − 1| < 1e-8): the element functions throw `KeplerError` with a message that points to `propagateUniversal`, and `propagateUniversal` covers them on state vectors. The plan's design notes offered both options, and this choice uses both.
- Circular orbits keep the computed tiny `e` rather than zeroing it, so no energy or shape information is thrown away. The resulting inconsistency is at most `e` relative, which is below 1e-11.

## Open questions / follow-ups

- Plan 007 has to deal with `KeplerError` when a vessel goes on rails on a near-parabolic or radial trajectory. This is recorded in `STATUS.md` known issues and `architecture/simulation.md`.
- Plan 007 should re-base `epoch`/`m0` during long time warp to keep `n·(t − epoch)` small.

## Verification output

```
$ bun test packages/kepler
 45 pass
 0 fail
 7260 expect() calls
Ran 45 tests across 6 files. [18.00ms]

$ bun test packages mods        (= bun test)
 46 pass
 0 fail

$ bun run typecheck
@orbital/kepler typecheck: Exited with code 0   (all 7 packages exit 0)
@orbital/web check: COMPLETED 367 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS

$ bun run build
@orbital/web build: Wrote site to "build" … ✔ done

packages/kepler/package.json  → "dependencies": {} (0 keys); 0 non-relative imports in packages/kepler/src

$ bun run docs:check
docs-check: OK (10 plans, 9 ADRs)
```
