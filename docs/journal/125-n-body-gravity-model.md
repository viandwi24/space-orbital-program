# 125 — N-body gravity (DE440)

**Plan:** [plans/125-n-body-gravity-model.md](../plans/125-n-body-gravity-model.md) · **Session:** Agent 1 (Lead, MacBook Pro M5), 2026-10-18, scheduled by the owner while 070 waits · **ADRs:** [0122](../decisions/0122-n-body-restricted-vessels-integrated-bodies-on-paths.md) (amended at claim), [0095](../decisions/0095-gravity-model-per-world-and-a-trajectory-provider.md), [0173](../decisions/0173-trajectory-provider-interface-and-how-consumers-reach-it.md), [0183](../decisions/0183-body-path-models-kepler-rates-series-osculating.md) · **Research:** [ephemerides.md](../research/ephemerides.md) (DE440 section)

**Status when written: criteria met.**

## What was done

| Where | What |
|---|---|
| `kepler/nbody.ts` | `nBodyAcceleration` (the frame body, every other body's direct pull, the indirect term), `integrateNBody` (adaptive Bulirsch–Stoer, sequence 2, 4, …, 16, tolerance 1e-12), `nBodyStep` (one accepted step), `hermiteState` (quintic dense output), `thirdBodyAcceleration` |
| `kepler/nbody-path.ts`, `trajectory.ts` | `predictNBody` (frame switches at the patched boundaries, segments cut every `maxStep` with the end `sample`), `createNBodyProvider`, `createTrajectoryProvider('n-body')`, `trajectoryFor(list, model)` and `tagTrajectoryModel`; `predictWithManeuvers` takes the path function |
| `kepler/chebyshev.ts`, `ephemeris.ts` | Chebyshev records (evaluate, fit, find); the `ORBEPH01` asset (read, write), the SPK segment state, barycentric states (Earth from the Moon over EMRAT), ICRF to the game frame, `ephemerisPath` |
| `tools/pack-de440.ts` | NAIF's SPK to the asset for a span of years, size and SHA-256 printed |
| core | `GravityModel` `'n-body'` accepted by the world schema and the save reader; `BodyDefinition.naif`; event `warp:limited`; API_VERSION 0.1.66 |
| sim | `nbody.ts` (the field of a frame, numeric rails with cached steps and dense output, the third-body pull); rails `numeric` from every place that makes rails; the flight bubble's uniform perturbation; the warp cap (1e5×) and the frame budget (5 000 evaluations); `createSim({ ephemeris })` and the `table` path for bodies with a NAIF id |
| `mods/sol` | NAIF ids of the Sun, the planets and the Moon |
| web | Create World's n-body option; the map and the aids predict with the world's provider (`Catalog.gravityModel`); `ephemeris-asset.ts` (fetch once, size and SHA-256, IndexedDB, gunzip) and the asset in `static/ephemeris/`; the flight passes it to the Worker; the Launch screen loads the world's own system |
| tests | kepler `nbody.test.ts` (4), `chebyshev.test.ts` (2), `ephemeris.test.ts` (2), `trajectory.test.ts` (+2); sim `nbody.test.ts` (4), `de440.test.ts` (1); vitest `ephemeris-asset.test.ts` (3); e2e `nbody.e2e.ts` (2) |

## Numbers (M5)

- An acceleration with the stock bodies (the Sun and the moon pulling): 0.38 µs.
- Rails, twenty vessels from 80 to 460 km: the budget holds them at 25 000× with 2 861 evaluations a frame (2.0 ms for the whole frame in the test). Before the dense output the rails integrated once per 10 s chunk: 70 000 evaluations a frame at 1e5×.
- Kepler limit: 1e-6 after 10 orbits. Jacobi constant: drift under 1e-8 over 100 days. L4: within 1 % of the moon's distance for 10 moon orbits. Prediction against the sim: under 1 m after a day.
- DE440, 2000 to 2100: 7.89 MB raw, 7.50 MB gzipped. All 1 042 JPL test points in the span agree within 7.1e-15 AU.

## What surprised me

- **The 10 s rails chunk.** The sim advances rails in chunks of at most 10 s, so an integrator started fresh per chunk paid its overhead 167 times a frame at 1e5×. The rails now step on their own Bulirsch–Stoer steps and read between them by Hermite; the trajectory is the steps, never the interpolation.
- **The warp budget had to leave the wall clock.** A time-based budget would make the reached warp, and so the flight, depend on the machine, and a replay would no longer verify (plan 131). It counts evaluations.
- **No save format bump.** The numeric rails state is a new variant of an existing field; old saves read as before. Format 9, reserved at claim, was released.
- **`testpo.440` moved:** the `test-data/440/` path some readers use answers 404; the file is under `ascii/de440/`.
- **A Sol world's Launch screen did nothing:** it loaded the stock system's bodies, so `sol.earth` was unknown and Launch returned quietly. It now loads the world's system. The Space Center of a Sol world still lists no buildings (STATUS).

## How to test manually

1. Create World: choose Sol, the 1:1 scale and N-body; enter, open the Hangar from the menu, launch. The flight shows "Loading JPL's DE440 ephemeris" once; a second flight reads it from the cache.
2. In a stock n-body world, put a vessel in orbit and warp: above 1e5× the warp is refused with "n-body integration limits warp to 100000x"; with many vessels the warp steps down with the same reason.
