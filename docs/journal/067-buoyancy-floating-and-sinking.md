# 067 — Floating, sinking and boats: buoyancy on the sea and on lakes

**Plan:** plans/067-buoyancy-floating-and-sinking.md · **Session:** Agent 3 (Dev C, Linux Mint, 2026-10-18), three-agent team mode, autopilot · **ADRs:** [0182](../decisions/0182-buoyancy-water-seabed-slices-wet-landed.md) (new), [0019](../decisions/0019-ground-tile-and-impact-damage.md), [0043](../decisions/0043-physical-terrain-one-height-function-in-core.md), [0072](../decisions/0072-lakes-in-the-height-function-flowing-rivers-and-shore-waves.md) · **Research:** none

**Status when written: criteria met here, handed over as `ready/067`.**

## What was done

| Where | What |
| --- | --- |
| `packages/core/src/terrain.ts` | `TerrainField.waterAt` (optional), `isWater`, `WATER_DENSITY`, `WATER_DEPTH`, `WATER_IMPACT_FACTOR`; the hills field answers it; `API_VERSION` 0.1.46 (104 took 0.1.45) |
| `packages/sim/src/water.ts` (new) | `waterUnder`, `stepWater`: sliced buoyancy and water drag, newly wet parts and their entry speed |
| `packages/sim/src/frames.ts` | seabed tile over water, the water pass after drag, wet vessels landed, water impacts into the damage rule |
| `packages/sim/src/science.ts` | `splashed` from `waterUnder` |
| `mods/stock` | `stock.flotation-collar` |
| tests | `packages/core/test/water.test.ts` (1), `packages/sim/test/buoyancy.test.ts` (4); stock boot list |
| docs | ADR 0182, draft 193, `simulation.md` "Water and buoyancy", guide note |

## Decisions and deviations

- **The rocket in the sinking test is 17.6 t, not 25 t.** It is the heaviest stack the test helpers build (the two-stage with a medium tank). The criterion is about a vessel denser than water, which this is. The plan's criterion says so.
- **Six slices per part and a linear wet fraction**, instead of an exact tilted-cylinder volume (ADR 0182). The floating test checks the result against an independent grid count of the submerged volume: within 10 %.
- **No new part fields:** volume comes from `shape`, and the flotation collar is just a light, wide part.
- **Ripples and splash moved to draft 193.** The browser pane here has no WebGL 2.
- **Only worlds with a terrain field have water.** The sim's default and most tests do not, so nothing else moves. The web game runs with the terrain field, so its seas and lakes are now water.

## Measurements

- The patch benchmark of `mods/stock` (M5-indicative, 50 ms) measures 49 ms here with the new parts. Under the full suite, `stones.test.ts` (cost budget), `determinism.test.ts` (5 s timeout) and `career-bot.test.ts` (30 s wall budget, 28.8 s alone on this machine, the same on `main`) failed once each and pass alone.

## Follow-ups

- 193 (ripples and splash), 127 (impact classification with `waterAt`), waves.

## Verification output

```text
bun test packages/core/test/water.test.ts         1 pass
bun test packages/sim/test/buoyancy.test.ts       4 pass
bun run docs:check                                exit 0
bun run test                                      1533 pass, 3 fail under load (392 s): determinism (5 s timeout),
                                                  career-bot (30 s wall budget; 28.8 s alone here, on main too),
                                                  patch-bench (50 ms, M5-indicative); all three pass alone
bun run typecheck                                 exit 0 (93 s; svelte-check 0 errors)
bun run build                                     exit 0 (8 s)
bun run --filter @orbital/web test                940 passed; 3 env-only import suites (no Node here);
                                                  vessel-presence.test.ts timed out once under load (known flaky)
```
