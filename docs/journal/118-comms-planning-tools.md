# 118 — Comms planning tools: contact timeline, coverage map, constellation planner

**Plan:** [plans/118-comms-planning-tools.md](../plans/118-comms-planning-tools.md) · **Session:** Agent 2 (Dev B, MacBook Pro M2 13"), 2026-10-18 · **ADRs:** [0163](../decisions/0163-comms-planning-worker-timeline-coverage-constellation.md) (new), [0101](../decisions/0101-communications-one-model-six-tiers-delay-off-by-default.md), [0179](../decisions/0179-comms-tier-1-links-stations-control-blackout.md), [0188](../decisions/0188-comms-routing-pointing-capacity-latency-signal-delay.md) · **Research:** none

**Status when written: criteria met.**

## What was done

| Where | What |
|---|---|
| `packages/kepler/src/constellation.ts` | `resonantDeployment`: the deploy orbit of period `T (N±1)/N`, drops a deploy period apart, insertion and circularisation Δv, refusal under the surface plus a clearance |
| `apps/web/src/lib/comms-planning/geometry.ts` | the planning world from the catalog's bodies, stations recovered from the snapshot, vessels on their conics, `linkedAt` (range and body spheres), a vessel's range from its parts |
| `timeline.ts`, `coverage.ts` | the contact timeline (10 s samples, bisection to 0.01 s) and the 72 x 36 coverage grid |
| `protocol.ts`, `planning.worker.ts`, `planner.ts` | the planning Worker, its dispatcher and the page's client (started on first use, 32 answers cached by request) |
| `planning-model.ts`, `CommsPlanningPanel.svelte` | the Mission Center's Planning panel: Timeline, Coverage, Constellation |
| `sim-host.ts`, `messages.ts` | the `ready` catalog carries `antennas` (id, label, range) |
| tests | kepler `constellation.test.ts` (4), web `comms-planning.test.ts` (3), `boundary.test.ts` (2), `planning-model.test.ts` (5), e2e `mission-center.e2e.ts` (the three tools) |

## What surprised me

- **The timeline equals the sim exactly.** A probe at 2000 km, 20° inclined, and the Space Center over 24 h at warp 1e5: the same four events to the printed digit. The sim and the planner run the same Kepler propagation, the same 10 s grid from the same start and the same bisection.
- **Coverage from ground stations is zero.** A receiver 10 m up sees a station only within its horizon (about 11 km), so a new world's coverage map is empty. The test uses a relay, and the panel explains an empty map (ADR 0163, "Found while building").
- **`formatDeltaV` has no unit**: callers add `speedUnit()`.
- Contract request: a vessel's range rating in `Snapshot.network.vessels` would replace the page-side reading of part configs (ADR 0163 point 3).
- Same environment notes as before: `sim-host-script-worker.test.ts` (2 vitest) fails on this machine on main too.

## Verification output

```
bun test packages/kepler/test/constellation.test.ts                4 pass
cd apps/web && bunx vitest run src/lib/comms-planning               10 passed
E2E_PORT=5210 bunx playwright test e2e/mission-center.e2e.ts --project=chromium --project=webkit
                                                                    2 passed
```
