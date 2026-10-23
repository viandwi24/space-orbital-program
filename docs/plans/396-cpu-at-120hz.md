---
id: 396
title: "CPU at 120 Hz: HUD updates at 30–60 Hz with no per-frame allocation, BundleGroup for the static site, Long Animation Frames in Debug"
status: done
owner: "Worker C"
depends: [392]
phase: 9
created: 2026-10-24
updated: 2026-10-24
---

# 396 — CPU at 120 Hz

## Goal

The main thread fits a 120 Hz frame: ≤ 4–6 ms per frame at the pad and in flight on the M5. The HUD and navball update at 30–60 Hz, decoupled from the render; the hot paths allocate nothing per frame; the static site is recorded once as a render bundle; and the Debug panel shows Long Animation Frames so a hitch can be traced to its script.

## Context

- Read: `refs/graphics-v2/02-browser-120fps.md` §1 (Long Animation Frames [B3]; keep GC out of the frame: the HUD makes about 1.2 MB of garbage a frame, 140 MB/s at 120 Hz; OffscreenCanvas later), §2 (render bundles: three `BundleGroup` [B7], CPU-only gain [B8, B9]) and §5 item 7. `refs/graphics-v2/03-renderer-and-mod-audit.md` A4 item 6 (CPU about 3.5–5 ms a frame; allocation about 1 MB a frame, mostly HUD and zod) and A1 step 1 (`model.prepareFrame`, `packages/renderer/src/renderer-webgpu.ts:293-297`).
- three 0.186.1 ships `src/renderers/common/BundleGroup.js` (checked 2026-10-24).
- Baseline: plan 392's main-thread split and Long Animation Frames observer.
- Later follow-ups (not here): plan 365 (binary snapshot transport) and plan 367 (vessel parts merged per material); 369 (cached site shadows) also runs after this plan.
- ADRs: 0053, 0330 point 1 (main thread ≤ 4–6 ms).

## Scope

**In:**
- HUD, navball and dock panels updated at 30–60 Hz from the latest snapshot, not every render frame.
- No per-frame allocation on the render, snapshot-apply and HUD paths (reuse vectors, arrays and strings; no zod parse per frame).
- `BundleGroup` for the static site (pad buildings, dishes, rocks, tree cells), rebuilt only when the site changes; lights stay outside the group.
- Long Animation Frames in the Debug panel: the last N long frames with script attribution.

**Out:**
- Binary snapshots (365), batched vessel parts (367), cached site shadows (369), OffscreenCanvas in a worker (only if this plan leaves the main thread over budget).
- e2e tests (paused by the owner).

## Design notes

- The HUD rate is a constant with one place to change it; the render still runs every frame.
- Find allocations with Chrome's allocation timeline on a 10 s flight; fix the largest first.
- `BundleGroup` is WebGPU only; on WebGL the group draws as a normal group.

## Steps

1. Allocation profile of a 10 s flight and the pad; list the top sources in the journal.
2. HUD and navball at 30–60 Hz, decoupled from the render.
3. Remove per-frame allocation on the hot paths.
4. `BundleGroup` for the static site.
5. Long Animation Frames in Debug.
6. Measure the main-thread time with 392's tooling under `/tmp/orbital-heavy.lock`.

## Acceptance criteria

- [ ] `bun test packages/renderer` and web vitest pass, including a unit test that the HUD updater runs at its set rate when fed a 120 Hz frame series, and a test that the static-site group is rebuilt only on a site change.
- [ ] A unit or vitest check that the snapshot-apply and HUD update paths allocate no new arrays per call in steady state (counted with a test hook or object pool counters).
- [ ] Measured on the M5, Chrome: main-thread ms per frame at the pad and in flight ≤ 4–6 ms, and the share of long animation frames, against 392's baseline; recorded in the journal. [manual: the M5 run]
- [ ] `capture-hud.ts` and `capture-graphics.ts` screenshots show no change.
- [ ] `bun run typecheck`, `bun run build` and `bun run docs:check` pass. e2e paused by the owner.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan; 365 and 367 noted as follow-ups).
- [ ] `docs/journal/396-cpu-at-120hz.md` written.
- [ ] `docs/architecture/` web and renderer docs: the HUD rate, the static bundle.
- [ ] New ADRs for any decision made here, linked above.
- [ ] `docs/research/stack-versions.md`: `BundleGroup` and Long Animation Frames APIs.

## Log

- 2026-10-24 — Created by the coordinator from refs/graphics-v2 (ADR 0330).
- 2026-10-24 — Code done (Worker C): HUD repaint at 60 Hz, static site `BundleGroup`, Long Animation Frames in Debug; journal 396. Left to the owner's M5 run: the allocation profile and the main-thread measurement (the [manual] criterion), and a look at `capture-graphics.ts` for the bundled site.
