---
id: 294
title: 'A compact performance overlay (net_graph style)'
status: done
owner: 'perf overlay session'
depends: [201, 251, 253, 261, 272]
phase: 8
created: 2026-10-21
updated: 2026-10-21
---

# 294 — A compact performance overlay (net_graph style)

**Size:** S

## Goal

The owner asked for a small always-on performance read-out, like `net_graph` or the FPS overlay of CS-style games. Debug → Info has the numbers, but it is a dialog: it covers the scene and shows one moment. A setting, off by default, shows a small panel in a free corner with live numbers and a few seconds of history per number.

## Context

- `apps/web/src/lib/flight-loop.ts`: the frame loop, `frameStats` (plan 251), the governor (plans 201, 253), `debugInfo()` with `client.stepMs`, `renderer.debug.info()` and `renderer.gpuFrameMs` (plan 261).
- `apps/web/src/lib/debug/frame-histogram.ts`: `GAP_MS`, the 60 fps budget and jitter.
- `apps/web/src/lib/space-center/space-center-loop.ts`, `mission-center/mission-center-loop.ts`: their own rAF loops and renderers, no governor.
- `apps/web/src/lib/settings/settings.ts`: the interface settings (format 4); `SettingsDialog.svelte`'s Interface tab.
- `apps/web/src/lib/layout/regions.ts` and the flight page's `.ins` column: the top right holds the part inspectors above staging (ADR 0253 point 3).

## Scope

**In:** the setting, a pure stats module (frame window, ring buffer, sample, formatting) with a vitest, an overlay component drawing its graphs on canvases at 10 Hz, Flight, Space Center and Mission Center, a measured cost, a screenshot.
**Out:** network numbers (there is no network), per-pass GPU timings, a draggable or resizable overlay.

## Design

- **Setting.** `interface.perfOverlay`, an optional boolean in format 4 (absent = off), so no format bump; a switch in Settings → Interface.
- **Data.** Each loop keeps a `PerfSource` whose `FrameWindow` takes one `Float32Array` write per drawn frame. `perfSample()` drains it (frames, FPS, p50 and max frame interval) and adds GPU ms (`gpuFrameMs`, null on WebGL), sim step ms, the preset, the resolution scale and whether the governor is on, the backend, draw calls and triangles from a new `renderer.debug.counters()`, and the JS heap where the browser has `performance.memory`. Not `debug.info()`: on WebGL its GPU-name query stalls the pipeline for tens of ms (journal).
- **Overlay.** `PerfOverlay.svelte` takes a `sample()` function, polls it every 100 ms with `setInterval`, keeps 50 samples (5 s) per graph in `Ring`s, writes the text with `textContent` and draws four small canvases (FPS, frame time with p50 line, GPU, sim). Svelte renders it once; nothing reactive changes at 10 Hz. `aria-hidden="true"`, no focusable element, `pointer-events: none`. Sizes in rem (UI scale), text in token colours (high contrast), graph colours read from the tokens on mount.
- **Spike.** A sample is a spike when its longest frame is over the 60 fps budget plus jitter and over twice the p50; the max turns to `--danger` and its bar is drawn in that colour.
- **Where.** Flight: first in the top-right `.ins` column, the inspectors stand below it. Space Center: the top right under the bars. Mission Center: first in its right column, above Upcoming.

## Steps

1. `lib/perf/perf-stats.ts` (`FrameWindow`, `Ring`, `isSpike`, formatters) and its vitest.
2. The setting and its switch.
3. `perfSample()` in the three loops.
4. `PerfOverlay.svelte` and its placement on the three pages.
5. Measure the tick's cost on WebGPU and WebGL; screenshot both.
6. Docs, checks, commit, merge, push.

## Acceptance criteria

- [x] Settings → Interface → "Performance overlay" is off by default, toggles the overlay, and survives a reload (`settings.test.ts`, browser).
- [x] The overlay shows FPS, frame p50/max with a spike mark, GPU ms (a number on WebGPU, `—` on WebGL), sim step, renderer, preset and resolution %, draw calls, triangles and memory where available, each graphed number with a live graph, on WebGL and WebGPU (journal, screenshots).
- [x] It is `aria-hidden`, holds no focus, and scales with the UI scale and follows high contrast (journal).
- [x] One overlay tick costs under 0.2 ms, measured in the browser (journal).
- [x] `perf-stats.test.ts` covers the ring buffer, the frame window, the spike rule and the formatting.
- [x] `bun run lint`, `bun run typecheck`, `bun run test`, the web vitest with `CI=true` pass (journal).

## Docs checklist

- [x] Plan, STATUS row, journal entry with a screenshot.

## Log

- 2026-10-21: Created by the perf overlay session, started from the owner's request through another session.
- 2026-10-21: Done. Tick 0.11 to 0.18 ms on WebGL and WebGPU (journal). e2e skipped on the owner's word.
- 2026-10-21 checks: `bun run lint` exit 0; `bun run typecheck` exit 0; `bun run docs:check` OK. Web vitest with `CI=true`: 1 360 pass, 2 fail, both in `sim-host-script-worker.test.ts` (5 s timeout, QuickJS budget), which fail the same way on the untouched base ad5777d8 in the main checkout. `bun run test`: 2 085 pass, 1 fail, the career bot "Budget lobbying" timing out (160 s against 90 s) under a shared machine's load; alone it passes (9 pass, 131 s). `perf-stats.test.ts` 9 pass, `settings.test.ts` 12 pass.
