---
id: 206
title: Flexible time warp
status: done
owner: "Worker B"
depends: [204]
phase: 7
created: 2026-10-18
updated: 2026-10-19
---

# 206 — Flexible time warp

## Goal

Warp is never refused without a reason. Physics warp ×2, ×4 and ×10 works anywhere, including in the atmosphere and under thrust. Rails warp needs no orbit: it follows a per-body altitude table and engines off. A request above the limit is clamped to the highest allowed level and the time bar says why ("Max 4× — engine running"). Warp drops from rails to physics warp when an engine starts. Warp-to Ap, Pe, SOI, node and alarm pick their own level and stop with a margin. Unseen vessels in an atmosphere freeze during high warp instead of being deleted.

## Context

- rancangan §5.13 (W1–W6), §2.6 (8 segments: 1×, 2×, 4×, 10× physics; 50×, 100×, 1k×, 10k× rails); owner questions §15 #5 and #15.
- Research: `refs/reverse-engineering-ksp-ksp2/01-time-scenes-and-persistence.md` §8 (KSP2 per-scene limit bug), `07-physics-aero-heat-structure.md`, `16-verification-log.md` (KSP1 rails up to 100 000× above 600 km, physics ×2–×4); `15a-physics-audit-raw.md` §8.
- Evidence:
  - `packages/sim/src/commands.ts:420-450`: `warp` and `warp-to` are refused while any vessel is in flight ("time warp needs every vessel on rails").
  - `packages/sim/src/modes.ts:67`: `wakeBlocker` says "set warp to 1 first".
  - `packages/sim/src/modes.ts:208-230`: on-rails debris entering the atmosphere is deleted.
  - `packages/sim/src/constants.ts:4,10`: fixed 0.02 s step, `MAX_WARP = 1e6`; `packages/sim/src/sim.ts:229`: at most 5000 steps per call.
  - Time bar and current control: `apps/web/src/lib/hud/WarpControl.svelte`; host warp tests `apps/web/src/lib/sim-host-warp.test.ts`.
- ADRs: 0202 (flexible time warp).
- Defaults per owner review; may change: a 100k× segment only for Sol worlds (rancangan §15 #5); unseen atmospheric vessels freeze with a warning (rancangan §15 #15).

## Scope

**In:**
- Physics warp: N fixed steps per frame; the host lowers the level with a message when frames fall behind.
- Rails warp limit from a per-body table derived from atmosphere height and terrain, with KSP-like tiers; landed and splashed allowed.
- `warp` command returns the granted factor and a reason instead of a refusal; the time bar shows the reason.
- Automatic transitions: engine on during rails warp drops to the highest physics level; dropping to ×1 unpacks safely (existing path).
- Warp-to targets: Ap, Pe, SOI, node, alarm (alarms arrive in plan 224; the target kind is defined here), each with a safety margin.
- Other vessels outside physics range never limit warp; unseen vessels in an atmosphere freeze above physics warp and a bell entry says so.
- 8 segments in the time bar (9 for Sol).

**Out:** user alarms and transfer windows (plan 224); clock states (plan 205).

## Touches

- **Size:** M
- **Edits:** `packages/sim/src/commands.ts`, `packages/sim/src/modes.ts`, `packages/sim/src/sim.ts`, `packages/sim/src/warp-limits.ts` (new), `packages/sim/src/constants.ts`, `packages/core/src/protocol.ts` (warp reply with granted factor and reason; `warp-to` target kinds), `mods/stock/src/bodies.ts` (per-body table overrides), `apps/web/src/lib/hud/WarpControl.svelte`, `apps/web/src/lib/sim-host.ts`, `apps/web/src/lib/script-api.ts` (`warpTo` targets)
- **Shared contracts:** **protocol** (`warp` reply shape, `warp-to` target union; script `warpTo`), **body definitions** (optional warp table), **sim events** (`warp:clamped`, `vessel:frozen`).

## Design notes

- `warpLimit(core)` is a pure function returning `{ max, reason }`; the command, the time bar and the debug log all use it.
- Physics warp runs whole fixed steps; it never lengthens the step, so determinism and replays hold.
- A frozen vessel keeps its state and is not integrated; it resumes when warp drops to physics levels or below.

## Steps

1. `warpLimit` and the per-body table with sim tests.
2. Physics warp in the sim loop and the host frame budget fallback.
3. Clamp instead of refuse; protocol reply; time bar reason text and 8/9 segments.
4. Automatic transitions and freezing of unseen atmospheric vessels.
5. Warp-to targets with margins; script API.
6. E2e with debug set-up.

## Acceptance criteria

- [x] `bun test packages/sim` passes, including `test/warp-limits.test.ts`: at 5 km with an engine on, max is 10× ("engine running"); at 80 km coasting over the home body, max is the rails tier for 80 km; landed, rails warp is allowed; a 100k× request in a stock world is clamped with a reason.
- [x] `bun test packages/sim` passes `test/warp-transitions.test.ts`: starting an engine during 1k× drops to physics warp in the same tick; an unseen vessel at 30 km in the atmosphere is frozen during 1k× and not deleted.
- [x] `bun test packages/sim` passes `test/physics-warp.test.ts`: 4× physics warp over 10 s matches 1× over 10 s step for step (same final state).
- [x] `apps/web` vitest `hud/WarpControl.test.ts` (extended): the reason text shows next to the clamped segment.
- [x] Chromium e2e `e2e/warp.e2e.ts`: `debugSetOrbit` to 100 km, warp-to Ap stops within the margin before apoapsis; `debugSetLocation` at 10 km, a 1k× request is clamped and the time bar shows the reason.
- [x] `bun run check:affected --e2e e2e/warp.e2e.ts` passes.
- [x] CI green on the `ready/206` tag (`refs/ci/pass/<sha>`, ADR 0126).

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/206-flexible-time-warp.md` written.
- [x] `docs/architecture/simulation.md` updated (warp limits, physics warp, freezing).
- [x] `docs/architecture/scripting.md` updated (`warpTo` targets).
- [x] ADR 0202 linked.

## Log

- 2026-10-18 — Created from refs/rancangan-terpadu.md (release roadmap).
- 2026-10-19 — Refined and done by Worker B (`claim/206`). Decisions (default per owner review): the rails tiers come from the atmosphere top and fractions of the radius (KSP's Kerbin table for the stock home), so no per-body override was needed in `mods/stock/src/bodies.ts`; "engine running" is the throttle up in flight (saved state, so a resumed sim agrees); a stock world's top is 10k×, so sim tests that warped at 1e5–1e6× to skip days now warp at 1e4× with longer steps; the tests that asserted a refusal in flight now assert the physics warp or the clamp; the host's frame-budget fallback stays the n-body budget of ADR 0122 (physics warp runs whole steps, and `maxStepsPerCall` already bounds a frame). Evidence: `bun test packages/sim` 516 pass, including `warp-limits.test.ts` (5), `warp-transitions.test.ts` (2), `physics-warp.test.ts` (1); scripting 62 pass; web vitest 1099 pass including `WarpControl.test.ts` (5) and `sim-host-warp.test.ts` (9); Chromium `e2e/warp.e2e.ts` 2/2 with `debug`, `smoke`, `leave-flight`; `check:affected --build --e2e e2e/warp.e2e.ts` and CI on `ready/206` (journal).
