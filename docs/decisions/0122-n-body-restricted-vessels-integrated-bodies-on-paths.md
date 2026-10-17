# 0122 — N-body worlds: vessels integrated in the dominant body's frame, bodies on their paths, warp held to a budget

**Status:** proposed (plan 125 is "exploring", ADR 0108: implementation waits for the owner's go)
**Date:** 2026-10-18
**Plan:** [125](../plans/125-n-body-gravity-model.md)
**Builds on:** ADR 0095 point 5 (restricted n-body), ADR 0103 point 5 (DE440 for n-body), ADR 0173 (trajectory provider), ADR 0183 (body path models), ADR 0051 (spheres of influence), ADR 0024 (surface rails)

## Context

ADR 0095 reserved a world field `gravityModel: 'n-body'` and decided its shape: bodies stay on rails and vessels feel every body. This ADR fixes what the plan must build: the integrator, the frame, warp, prediction, data and the save. The reference material (`refs/reverse-engineering-ksp2/beyond/05-universe-mode.md`, `09-time-and-real-solar-system.md`) notes that DE440 already contains the real system's n-body solution, that Principia integrates vessels against body ephemerides, and that n-body integration is chaotic: floating-point differences between platforms grow.

## Decision

1. **Bodies are not integrated.** They keep their paths (`kepler`, `kepler-rates`, `series`) and gain a fourth model, `chebyshev`: DE440 coefficient records per body, evaluated like JPL's reader. A body's path is exact by construction, so the patched and n-body worlds see the same planets.
2. **A vessel is a test particle in the frame of its dominant body.** The sphere of influence stays as the frame choice only (numerical conditioning and display: altitude, orbit read-outs), not as a cut-off of gravity. The acceleration is the dominant body's plus every other body's direct pull minus the frame's own acceleration (the indirect term): `a = −μ₀ r/|r|³ + Σᵢ μᵢ ((rᵢ − r)/|rᵢ − r|³ − rᵢ/|rᵢ|³)`. A frame switch at the old boundary changes coordinates, not the motion.
3. **On rails: an adaptive Dormand–Prince 8(7) integrator** with relative tolerance 1e-12 and the step bounded by a fraction of the local orbital period. It runs in float64 with a fixed operation order, so a resume on the same platform continues to the bit. Across platforms trajectories can drift apart (chaos), which saves make harmless: a save carries the state, not the history.
4. **In flight** (the 2.5 km physics bubble) Rapier keeps its point-mass gravity of the dominant body, and the other bodies' pull is added as one uniform acceleration at the frame's origin; the tidal difference across the bubble (under 1e-9 m/s² at moon distances) is dropped. Surface rails stay as they are: a landed vessel is fixed to its body.
5. **Warp is held to a CPU budget, not to a fixed list.** The integrator's work per real frame must stay under 2 ms on the M5 for all vessels on rails; the sim lowers the reachable warp until it does and says why (`warp` refused or reduced with "n-body integration limits warp to …×"). Expected order: 1e4 to 1e5×, against 1e6× for patched conics.
6. **Prediction is numerical.** The n-body trajectory provider (ADR 0173) integrates the same equations forward at tolerance 1e-9 over a horizon of 1.5 periods or 30 days, whichever is shorter, and returns samples with events (closest approaches, frame switches, impact). Maneuver nodes stay impulsive Δv at the node time; their path is the same integration after the burn.
7. **DE440 is a mod asset, downloaded on demand.** The Sol pack (plan 124) ships the Level A paths; a world that asks for DE440 fetches a binary asset (little-endian float64 coefficient records for the Sun, the planets and the Moon over a stated span, gzip), checked by size and SHA-256 and cached in IndexedDB. The plan measures and states the download size per century before the format is fixed.
8. **A save format bump** (the number is reserved by Agent 1 when the plan is scheduled; 7 and 8 are held by plans 117 and 119): the world's `gravityModel` value `n-body` is accepted, and a vessel's rails state may be `{ kind: 'numeric', r, v, t, h }` (state, time and the integrator's next step). Patched worlds and their saves are unchanged.

## Consequences

- Create World's "N-body — Coming soon" becomes selectable when plan 125 ships; patched stays the default.
- Lagrange points, perturbed orbits and gravity assists without SOI cuts become possible; long warps become slower.
- Scripts (`ship.orbit`) read osculating elements in the dominant frame; their meaning changes from exact to instantaneous.
- Bodies integrated as n-body (Universe mode) stay out (ADR 0108).
