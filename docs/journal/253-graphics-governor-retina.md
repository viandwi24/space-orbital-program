# 253 — A governor that knows the pixel ratio, steps the planet budget first and does not stutter

**Plan:** [plans/253-graphics-governor-retina.md](../plans/253-graphics-governor-retina.md) · **Session:** Worker C, 2026-10-20 · **ADRs:** [0233](../decisions/0233-governor-paced-fast-down-measured-up.md) (amends [0053](../decisions/README.md)), [0234](../decisions/README.md)

## What was done

| Where | What |
|---|---|
| `renderer/quality-governor.ts` | locked 60 (or 30) fps target from a cadence estimate (a 120 Hz screen targets 60); fast drops (half the last second over budget × 1.15, two rungs when p95 is over twice the budget); step ups only on measured headroom or one trial per rung per scene, a failed trial drops one rung and bans it for the scene; a flat 30 ms interval is read as a cap (four no-effect drops across a preset), not as a slow GPU; 30 s minimum between ups and plan 201's preset dwell stay |
| same | the ladder reads the planet pass's budgeted scale (plan 252): where the pixel budget already draws it near half size, the half rungs are left out |
| `web/flight-loop.ts`, `DebugPanel.svelte` | `tick` with the rAF interval, scene key per frame, the reasons of each change in Debug, a "Frame pacing" row |
| tests | `quality-governor.test.ts` (27): settle without oscillation, a sudden heavy scene drops within about 1 s, no step up without headroom, the throttle check, the budget-shaped ladder |

## Trace (Worker A, M5 on AC, development build, 1512 × 945 at DPR 2, `high`, governor on, pad, 120 s)

| Measure | Result | Target |
|---|---|---|
| frames over 33.3 ms (the app's own histogram) | 0.045 % | < 1 % |
| preset or rung changes | 1 in 120 s (`high 100 %` → `high 85 %` at 69 s) | ≤ 1 per 30 s |
| draw intervals | 6 666 frames, 55.5 fps, p50 16.7 ms, p95 25.0 ms, p99 25.5 ms | |

p95 sits on the third vsync of a 120 Hz screen: about a quarter of the frames take 25 ms because `high` at ratio 2 costs 16–17 ms, a millisecond over the 16.7 ms period. The old governor, on the same pad, changed five times in two minutes; now it changes once and never leaves `high`.

## Open

- The frame cost at Retina `high` is the limit now, not the governor: plan 252's budget could go to 1.43 Mpx for about 1 ms more room.
