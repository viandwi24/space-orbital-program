# 363 — Frame budget research and the first cuts

**Plan:** [plans/363-frame-budget-research-and-first-cuts.md](../plans/363-frame-budget-research-and-first-cuts.md) · **Research:** [frame-budget-and-efficiency.md](../research/frame-budget-and-efficiency.md) · **Session:** perf / auto quality (Claude) · **Date:** 2026-10-22

## What was done

- `apps/web/scripts/profile-frame.ts`: a CDP CPU profile and a sampled allocation profile with garbage included, per drawn frame. `CALLERS=<regex>` attributes allocations to their call chains. `ORBITAL_PROFILE=1` builds without minification (`vite.config.ts`) so functions keep their names.
- `navball-math.ts`: `visibleRuns` and `groundRegion` work out the vessel's axes once per curve. Before, they did it once per point: three quaternion rotations for each of about 1,100 graticule points a frame.
- `describeModule` (core) parses a config once per module and raw config object (`parsedConfig`, WeakMaps). The HUD's `vesselThrottle` and the vessel panel describe every part's modules each frame.
- The research doc, and draft plans 365 (snapshot transport), 367 (parts per material), 368 (the Retina frame end) and 369 (static site shadows).

## Numbers (M2, WebGPU, `medium`, Kronos V + Selene in a 100 km orbit, 8 s profiles)

| | before | after |
|---|---|---|
| allocated per frame | 1143 KB | 951 KB |
| navball curve drawing (`stroke` chain) | 285 KB | 99 KB |
| config parses in `describeModule` | about 41 KB | about 0 |
| main thread busy per frame | 3.31 ms | 3.28 ms |

## What surprised me

- **The main thread is idle most of the frame on the M2** (3.3 ms busy of 16.7). The frame waits on the GPU and the present, so these cuts lower garbage and the heap's high-water mark, not the frame time.
- **The zod cost is mostly the descriptor check, not the config parse.** `moduleInfoSchema.safeParse` on every describe call is still about 185 KB a frame. It is listed as the next cut: describe at the HUD period, or check once per module and shape.
- The core test `events catalogue … every EventMap key has an entry` fails at HEAD (`tether:attached` from plan 313 has no catalogue entry). Not touched here.
- `apps/web/src/lib/sim-host-script-worker.test.ts` times out twice under load (5 s and 18 s). It did so before this plan's core change; not touched here.

## Verification output

```
bun test packages/core/test/module-info.test.ts      8 pass (with the parse-once test)
bunx vitest run src/lib/navball-math.test.ts src/lib/hud   85 passed
bun run docs:check                                     OK
```
