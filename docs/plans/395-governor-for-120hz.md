---
id: 395
title: "A governor for 120 Hz: a 7 ms budget, a lock at 120 or 60, the TAAU scale as the fast axis, 120 in the frame-rate setting"
status: draft
owner: "Worker A"
depends: [393]
phase: 9
created: 2026-10-24
updated: 2026-10-24
---

# 395 — Governor for 120 Hz

## Goal

The governor chooses its target per device tier (392's tiers): a locked 120 on the M5 tier in Chrome or Edge; a locked 60 at the selected preset on the M2 tier; a locked 60 on mid-range Windows (integrated Iris Xe / 680M, GTX 1650 / RTX 3050 class). The starting preset is picked per tier too, so an M2 or a Windows integrated GPU does not start at `high` and spiral down. Within that, the quality governor holds a locked 120 on a 120 Hz display (Chrome, Edge), or a locked 60 when 120 is out of reach or on Safari, never in between. Its budget is 7 ms of GPU time per frame. Its fast axis is the TAAU input scale (0.5–0.75 of the side), which allocates nothing and builds no pipeline; preset steps stay the slow axis. The frame-rate setting offers 120.

## Context

- Read: `refs/graphics-v2/02-browser-120fps.md` §1 (lock-aware targets, 85 % of the vsync period; change internal resolution first, never the preset in flight) and §5 item 3. `refs/graphics-v2/03-renderer-and-mod-audit.md` A5 (the governor, `packages/renderer/src/quality-governor.ts`: the ladder `:31-80`, render scale 1 → 0.85 `:48`, the pixel-budget rule `:59-68`, the over/judder/p95 rules `:122-145`; a locked 60 or 30 today) and A7 (frame rate limit Display/60/30).
- Code: `packages/renderer/src/quality-governor.ts` (739 lines), its tests `packages/renderer/test/quality-governor.test.ts`; `FrameCapChoice = 'display' | '60' | '30'` (`apps/web/src/lib/graphics.ts:84`); Settings (`apps/web/src/lib/ui/SettingsDialog.svelte:68-107`).
- Plan 362's governor (steps presets, unit-tested to settle) and journal 362 ("not re-measured on the M5 at 120 Hz"). Plan 393 provides the TAAU input scale.
- ADRs: 0233 (the governor: a locked 60 or 30, fast down, up on evidence) — **amended here**; 0304 (auto quality steps presets on WebGPU); 0053; 0310; 0330 points 1–2.

## Scope

**In:**
- **Per-tier target and starting preset.** The tier (from 392's detection) sets the lock target (120 or 60) and the starting preset: `selectPreset(caps)` (`packages/renderer/src/presets.ts:222`, called from `apps/web/src/lib/graphics.ts:148, 209`) picks by tier, with the M2 and Windows integrated GPUs starting below `high`, from 392's measured numbers. A player's saved choice still wins.
- The lock target from the measured vsync period, capped by the tier: 120 (budget 8.33 ms, GPU 7 ms) or 60; Safari defaults to 60.
- The fast axis: TAAU input scale 0.75 → 0.5 in small steps, before any preset step; no reallocation, no new pipeline.
- Over/judder/p95 rules re-tuned to the 120 Hz slot; trial bans and dwell times kept.
- 120 in the frame-rate setting (`FrameCapChoice` gains `'120'`); on battery the default limit stays 60 (02 §1).
- Synthetic frame-series unit tests.
- An ADR amending 0233 and the plan 362 governor.

**Out:**
- The player-facing resolution-scale slider and the *Ultra* preset (404).
- e2e tests (paused by the owner).

## Design notes

- Keep the governor a pure state machine fed rAF intervals and per-pass GPU timestamps (392's contexts).
- Drop from 120 to 60 only when the smallest scale at the floor preset still misses; climb back to 120 only on evidence (ADR 0233's "up on evidence").
- The learned level is saved per backend and per lock target.

## Steps

1. ADR amending 0233 and plan 362's governor: lock targets, budget, axes.
2. Lock-target detection from the vsync period and the device tier; Safari at 60; `selectPreset` per tier.
3. The TAAU scale as the fast axis; the ladder reordered.
4. `'120'` in `FrameCapChoice`, Settings and the frame cap; battery default 60.
5. Synthetic frame-series tests.
6. Measure on the M5 with 392's tooling under `/tmp/orbital-heavy.lock`.

## Acceptance criteria

- [ ] `bun test packages/renderer`: `quality-governor.test.ts` passes, with new cases from synthetic frame series — a steady 9 ms series at 120 Hz steps the TAAU scale down before any preset step; a series that misses at scale 0.5 on the floor preset locks to 60; a recovered series climbs back to 120 only after its dwell; no step changes a resource size.
- [ ] `bun test packages/renderer`: `selectPreset` and the tier target — sample capabilities for the M5, M2, Intel Iris Xe, AMD 680M, GTX 1650 and RTX 3050 give the expected starting preset and lock target (120 for the M5 on Chrome, 60 for the others and for Safari).
- [ ] Measured on the M2 and on mid-range Windows with 392's tier script: a locked 60 (p95 ≤ 16.7 ms) at the selected preset, governor on. [manual: the owner's or Worker D's machines]
- [ ] `bun test apps/web` (vitest): the frame-rate setting stores and applies `'120'`.
- [ ] `measure-sunrise.ts` with `STEP_TO` shows no pipeline compiled on a governor step.
- [ ] Measured on the M5, Chrome, `high`, governor on: p95 frame interval at pad/3 km/12 km/orbit against the wave target p95 ≤ 8.4 ms, and fewer than 1 % of frames over 16.7 ms in a 2-minute flight; recorded in the journal. [manual: the M5 run]
- [ ] `bun run typecheck`, `bun run build` and `bun run docs:check` pass. e2e paused by the owner.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/395-governor-for-120hz.md` written.
- [ ] `docs/architecture/` renderer doc: the governor section.
- [ ] ADR amending 0233 (and plan 362's governor), linked above.
- [ ] Player-facing help for the frame-rate setting, if it lists the options.

## Log

- 2026-10-24 — Created by the coordinator from refs/graphics-v2 (ADR 0330).
