# 080 — Trajectory provider interface: patched conics behind one API, no behaviour change

**Plan:** plans/080-trajectory-provider-interface.md · **Session:** Agent 3 (Dev C, Linux Mint, 2026-10-17), three-agent team mode · **ADRs:** [0173](../decisions/0173-trajectory-provider-interface-and-how-consumers-reach-it.md) (new), [0095](../decisions/0095-gravity-model-per-world-and-a-trajectory-provider.md) · **Research:** none

**Status when written: criteria met here, handed over as `ready/080`.** The timing criterion ¹ is indicative here; Agent 1 runs it on the M5.

## What was done

| Where | What |
| --- | --- |
| `packages/kepler/src/trajectory.ts` (new) | `TrajectoryProvider`, `TrajectoryCapabilities`, `TrajectoryModel`, `createPatchedProvider`, `createTrajectoryProvider`, `trajectoryFor` |
| `packages/kepler/test/trajectory.test.ts` | every method `toEqual` the wrapped function; caching; n-body refused |
| `packages/sim` | `SimCore.trajectory` from `gravityModel`; `maneuver.ts` (`patchedBodiesOf`), `soi.ts`, `target.ts` call it; `createSim` throws `SaveError` `incompatible` for an n-body world |
| `apps/web/src/lib` | `map-path.ts` and `rendezvous-aids.ts` call `trajectoryFor(bodies)`; signatures unchanged |
| goldens (recorded before the move, commit a5110b7) | `packages/sim/test/trajectory-golden.test.ts` (moon flyby SOI crossings, sim node prediction), `apps/web/src/lib/trajectory-golden.test.ts` (map path, node prediction, approach and aids) |
| `packages/core`, `packages/sdk` | type re-exports; `API_VERSION` 0.1.33 |
| docs | ADR 0173, `simulation.md` (provider, SOI, nodes) |

## Method

The goldens were committed before any code moved. Each consumer then moved in its own commit, with the goldens and the existing tests green after each step. No test file that existed before was edited.

## Timing (indicative, this machine; `bench080.ts`: best of 7 × 400 calls, the golden's transfer path with a 400 000 s horizon)

| | before | after |
| --- | --- | --- |
| map path (`predictMapPath`) | 2.552 / 2.595 ms | 2.500 / 2.481 / 2.511 ms |
| node prediction (`predictManeuvers`, 2 nodes) | 1.351 / 1.358 ms | 1.347 / 1.347 / 1.366 ms |

Neither got slower; the differences are within the run-to-run noise.

## Decisions and deviations

- **Rails propagation is not routed through the provider** (ADR 0173 point 4). `railsMotion` and `stateInParent` take no `SimCore` and propagate a single conic. The plan's "sim rails" is covered by the SOI crossings on rails, which do go through the provider.
- **The web functions keep `bodies` parameters** and use the cached `trajectoryFor`. Plan 125 hands the page the world's provider.
- An n-body world was already refused by `worldInfoSchema` (plan 077), but as a `RangeError` from `createSim`. It is now a `SaveError` with code `incompatible`, and the message keeps the old text, so the save-format test still matches.

## Follow-ups

- Plan 125: an n-body provider; pass the world's provider to the web client; a rails representation that is not a conic.

## Verification output

```text
bun test packages/kepler                                   84 pass, 0 fail (incl. trajectory.test.ts)
bun test packages/sim                                      all pass; goldens: 2 snapshots unchanged
bunx vitest run src/lib/trajectory-golden.test.ts src/lib/map-path.test.ts src/lib/rendezvous-aids.test.ts src/lib/maneuver-controller.test.ts src/lib/script-api.test.ts
                                                           Test Files 5 passed, Tests 33 passed
bun run docs:check                                         docs-check: OK
bun run test                                               1404 pass, 0 fail (178 s)
bun run typecheck                                          exit 0 (60 s)
bun run build                                              exit 0
bun run --filter @orbital/web test                         880 passed, 1 skipped; editor-options, settings and WarpControl
                                                           (imports settings since 081) fail at import here only (no Node)
```
