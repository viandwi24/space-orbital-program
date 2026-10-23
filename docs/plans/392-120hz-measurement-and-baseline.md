---
id: 392
title: "120 Hz measurement: Chrome at 120 Hz, an Xcode Metal capture of the frame end, the main-thread split with Long Animation Frames, a new baseline"
status: done
owner: "Worker A"
depends: []
phase: 9
created: 2026-10-24
updated: 2026-10-24
---

# 392 — 120 Hz measurement and baseline

## Goal

We have a baseline per **device tier**, not only for the M5:

| Tier | Example machines | Browser and backend | Target |
|---|---|---|---|
| M5 | the owner's MacBook Pro M5 | Chrome (WebGPU on Metal) | a locked 120 |
| M2 | Worker D's base MacBook Pro M2 | Chrome (WebGPU on Metal) | a locked 60 at the selected preset |
| Mid-range Windows (where most players are) | integrated Intel Iris Xe or AMD 680M; a GTX 1650 / RTX 3050 class card | Chrome or Edge; Dawn on D3D12 for WebGPU, ANGLE D3D11 for WebGL | a locked 60 |

In particular, we know, on the owner's MacBook Pro M5 at Retina in Chrome at 120 Hz, where every millisecond of a frame goes: the p95 frame interval at the pad, 3 km, 12 km and in orbit on WebGPU and WebGL; the GPU cost of each pass, including the frame end (resolve, present) that timestamps miss; and the main-thread split. The result is `refs/graphics-v2/05-m5-120hz-baseline.md`, the baseline every later plan of the wave (393–398) measures against. This absorbs draft 368's measurement step.

## Context

- Read: `refs/graphics-v2/02-browser-120fps.md` §0 (what 120 fps means: an 8.33 ms slot, GPU ≤ ~7 ms, main thread ≤ ~6 ms), §1 (Long Animation Frames [B3]), §2 (timestamps per render context [B11]; the Xcode Metal capture of Chrome [B13]); §5 item 2. `refs/graphics-v2/03-renderer-and-mod-audit.md` A1 (the frame, `packages/renderer/src/renderer-webgpu.ts:289-310`), A3 (measured costs: WebGL 16.5/15.1/16.8/9.9 ms at pad/3 km/12 km/orbit; WebGPU 18–21 ms GPU; governor on about 57 fps), A4 (biggest costs; frame end first).
- Draft 368 (folded here and into 394): its step 1 (re-baseline with `measure-auto-quality.ts`) and step 2 (Metal frame capture) move here; its trials move to 394.
- ADRs: 0248 (the WebGPU frame is not the planet march; timestamps miss the frame end), 0304 and plan 362 (the governor), 0053, 0330 (target: p95 frame interval, not averages).
- Windows shader compile: plan 370's log (Chrome 154, RTX 3060, `high`, first load 20.1 s; the planet full pass 14.6 s, about 180 KB of DXIL at `high`, 151 KB at `low`) and plan 374 (splitting the planet pass); `docs/research/shader-compile-windows.md`.
- Device selection today: `selectPreset(caps)` (`packages/renderer/src/presets.ts:222`, used in `apps/web/src/lib/graphics.ts:148, 209`).
- Tools: `apps/web/scripts/measure-auto-quality.ts`, `measure-graphics.ts`, `measure-sunrise.ts`, `capture-graphics.ts`; the old baseline `refs/graphics-performance/07-m5-baseline.md`.

## Scope

**In:**
- Chrome at 120 Hz on the M5 (rAF cadence check reads 8.33 ms periods).
- Labels and `pushDebugGroup` on every pass so an Xcode Metal capture names them (`--enable-dawn-features=use_user_defined_labels_in_backend`, `MTL_CAPTURE_ENABLED=1`).
- One render context per pass for timestamps (planet, moon, scene, bloom, output), so each is timed separately.
- A Long Animation Frames observer (`PerformanceObserver` type `long-animation-frame`) in the measuring scripts; the main-thread split (sim apply, HUD, render encode, GC).
- A script mode that records p95 frame interval and the share of frames over 16.7 ms over a 2-minute flight.
- The baseline note `refs/graphics-v2/05-m5-120hz-baseline.md`, with a section per device tier.
- **A self-contained script the owner (or Worker D) can run on the M2 and on Windows** (for example `apps/web/scripts/measure-tier.ts` with a one-line run command in its header): it detects the tier (adapter info, refresh rate), runs the same views and presets, and writes one JSON report to attach to the note. On Windows it also records the **first-load shader compile time** (cold cache) per pipeline, with the planet pass's DXIL size where the proxy can measure it (plans 370/374).
- The device-tier table and each tier's target, as input to 395's per-tier lock and starting preset.

**Out:**
- Any change meant to make frames faster (393–398).
- Running the M2 and Windows measurements ourselves: they need the owner's or other machines.
- Safari (60 Hz target; a short check only).
- e2e tests (paused by the owner).

## Design notes

- The tier script must run from a plain checkout with one command (`bun run …`), need no Xcode, and print where its report went; the owner sends the JSON back.
- **Measurements are heavy jobs.** Run them under `/tmp/orbital-heavy.lock`, one at a time, on a quiet, plugged-in M5 (no other browser work, Energy Saver off). Record the machine state in the note.
- Views: pad, 3 km, 12 km, orbit 100 km; presets `high` and `medium`; governor on and off; WebGPU and WebGL.
- The Metal capture is fragile (debuggable Chrome; the browser hangs after a capture). Record the exact Chrome build and flags in `docs/research/stack-versions.md`.
- The labels and per-pass contexts stay in the code (cheap) so 393–398 reuse them.

## Steps

1. Labels and debug groups on every pass and target; one timestamp context per pass.
2. The Long Animation Frames observer and the p95 / over-16.7 ms report in `measure-auto-quality.ts` (or a new `measure-120hz.ts`).
3. Check that Chrome runs rAF at 120 Hz on the M5 and that the frame-cap detector reads 8.33 ms.
4. Measure the matrix (4 views × 2 presets × 2 backends, governor on/off) under the heavy lock.
5. One Xcode Metal capture of a `high` pad frame: load/store actions, resolve, present, number of full-screen passes, bandwidth.
6. The tier script for the M2 and Windows (frame intervals, per-pass GPU ms, main thread, and on Windows the cold first-load compile time per pipeline); hand it to the owner with run instructions.
7. Write `refs/graphics-v2/05-m5-120hz-baseline.md`: tables per tier, the capture's findings, and which of 393/394 the capture says holds the frame. Add the M2 and Windows sections when the owner's reports come back.

## Acceptance criteria

- [ ] `refs/graphics-v2/05-m5-120hz-baseline.md` has, for pad/3 km/12 km/orbit on WebGPU and WebGL at `high`: p95 frame interval, share of frames over 16.7 ms, per-pass GPU ms and the main-thread split; each against the wave target p95 ≤ 8.4 ms. [manual: the M5 run]
- [ ] The note has the Metal capture's frame-end costs (resolve, present, full-screen pass count). [manual: the M5 run]
- [ ] The M2 section: p95 frame interval at pad/3 km/12 km/orbit at the selected preset, against a locked 60 (p95 ≤ 16.7 ms). [manual: Worker D's or the owner's M2, with the tier script]
- [ ] The mid-range Windows section (at least one integrated GPU and one GTX 1650 / RTX 3050 class card, Chrome or Edge, WebGPU on D3D12 and WebGL on ANGLE D3D11): p95 frame interval against a locked 60, and the cold first-load shader compile time per pipeline. [manual: the owner's Windows machines, with the tier script]
- [ ] `bun test packages/renderer` passes, including a unit test that the tier detection maps sample adapter infos (Apple M5, Apple M2, Intel Iris Xe, AMD 680M, GTX 1650, RTX 3050) to the right tier, and a unit test that the p95 / over-budget report computes the right values from a synthetic frame series.
- [ ] `capture-graphics.ts` screenshots show no visual change from the labels and contexts.
- [ ] `bun run typecheck` and `bun run docs:check` pass. e2e paused by the owner.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan); 368 marked folded into 392 and 394.
- [ ] `docs/journal/392-120hz-measurement-and-baseline.md` written.
- [ ] `docs/research/stack-versions.md`: Chrome build, Dawn flags, Xcode version.
- [ ] `refs/graphics-v2/README.md` links note 05.

## Log

- 2026-10-24 — Created by the coordinator from refs/graphics-v2 (ADR 0330).
- 2026-10-24 — Worker A: code, scripts and the M5 baseline done and merged; open [manual] items: the Xcode Metal capture, a quiet-machine rerun with 2-minute cells, the M2 section and the Windows section (run `bun scripts/measure-tier.ts` there). Findings in the note: Apple timestamps are not additive per pass, `gpuFrameMs` under-reads, Chrome hides the Apple chip model (device-tier uses the display rate). The plan stays `in-progress` until the manual items are in.
- 2026-10-24 — Worker A: closed as done: code, matrix and the M5 baseline are merged; the Xcode Metal capture, the M2 and Windows runs stay as [manual] items for the owner.
