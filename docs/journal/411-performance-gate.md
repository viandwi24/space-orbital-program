# 411 — The performance gate

**Plan:** [plans/411-performance-gate.md](../plans/411-performance-gate.md) · **Session:** Worker C, 2026-10-24 · **ADRs:** 0330 (the tier targets)

## What was built

- `bun run perf:gate` (`apps/web/scripts/perf-gate.ts`): builds once (or `--no-build`, or `--url` for a running server), serves the build, launches Chromium headed with the platform's ANGLE backend, and for each backend (`webgpu`, `webgl`) and governor setting (off, on) at a fixed preset runs the scenes pad, 3 km, 12 km, sea level, orbit, re-entry (through the debug API's `setLocation` and `setOrbit` on the Hangar's booster), the Space Center and the Hangar. Each scene is sampled for 12 s in the page: rAF intervals, the heap every 0.5 s, and the pipeline count of `__orbitalLoadReport()` either side.
- The numbers and the comparison are pure (`src/lib/perf/gate.ts`, tested in `gate.test.ts`): p50 and p95, frames over twice the tier's interval a minute, pipelines compiled in play, the heap range; a budget per tier with a scene override; `failures`, `freeze`, `formatTable`.
- Budgets: `apps/web/perf-budgets.json`, basis `target` (ADR 0330: M5 8.3 ms, M2 and Windows 16.7 ms, plus a 10 % margin; no long frame; no compile in play; 30 MB heap range). `--freeze` writes a run's numbers as the tier's budgets (`basis: measured`), to be committed after plans 408, 409 and 410 have merged.
- `--quick` (pad, orbit, Space Center, the default backend, 5 s, governor off) prints a table to paste back; `--tier m2|windows` picks the budgets.
- The rule is in `docs/roadmap/worker-brief.md` ("The performance gate") and on the plan template's acceptance list.

## Checked

`gate.test.ts` (percentiles, the long-frame count, the budget file, the comparison, freezing, the table). A headless smoke of the whole pipeline (`--headless --no-build --scenes pad,orbit,space-center,hangar --backends webgl --governor off --seconds 4`): it built, served, placed the vessel, sampled the four scenes and printed the table with every run failing the M5's budget, as a 60 Hz headless run must. Its numbers are not measurements.

## Not done

- No headed run: the M5 run that freezes the first measured budgets (after 408 and 410 merge), and the owner's `--quick` runs on the M2 and on Windows are `[manual]`.
- The WebGPU backend, the governor-on runs, 3 km, 12 km, sea level and re-entry scenes were not run here (the smoke covered WebGL, governor off, four scenes).
- In headless the background warming never settles (the script waits 3 minutes per page, then measures anyway); a headed run is expected to settle.
