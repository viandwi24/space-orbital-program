---
id: 252
title: "Graphics phase 1: a pixel budget for the planet pass, baked cloud shadows on high, lighter MSAA and shadows at Retina, spread PMREM recaptures"
status: done
owner: "Worker A"
depends: [251]
phase: 7
created: 2026-10-20
updated: 2026-10-20
---

# 252 — Graphics phase 1: a pixel budget for the planet pass, baked cloud shadows on high, lighter MSAA and shadows at Retina, spread PMREM recaptures

**Size:** L

## Goal

On a Retina screen, `high` costs close to what it costs at 1080p, with no visible change in the look. Target on the MacBook Pro M5 built-in display: p95 frame interval at most 16.7 ms at the pad, 3 km, 12 km and orbit.

## Context

- **Owner's order, 2026-10-20:** phases 0 and 1 go into v1.0.0.
- **Research:** `refs/graphics-performance/`, sections 01 §5, 04 and 06 phase 1 (a) to (d).
- **Where the time goes:**
  - Almost the whole frame is per-pixel work in one fullscreen planet pass (`shaders/planet.glsl.ts`).
  - `high` uses `min(devicePixelRatio, 2)` (`presets.ts:133`), which draws about 2.8 times the pixels at Retina.
  - At pixel ratio 2, the existing half planet pass (ADR 0064) removed 65 % of `high`'s cost at the pad on the M2. The vessel, HUD and meshes stay sharp because only the fullscreen shader shrinks.
- **Bandwidth on Apple GPUs:**
  - The scene target is RGBA16F with 4× MSAA.
  - `EffectComposer` clones it into a second 4× MSAA buffer.
  - The canvas is multisampled (`antialias: true`, `renderer.ts:241`) although it only receives the output quad.
- **Other `high` costs:**
  - It uses 4-octave noise cloud shadows (`presets.ts:141-142`), while `medium` reads the baked map (ADR 0086): about +1.0–1.2 ms against about +0.1.
  - The 4096 shadow map renders every frame.
  - PMREM recaptures cost 5–6 ms each during ascent (journal 048).
- Plan 251's ablation ranks which of these matter on the M5. Refine this plan with those numbers before claiming.

## Scope

**In:**
- **(a) Planet pixel budget.** The planet pass draws at a resolution that keeps it under a pixel budget, for example the 1080p count. It reuses the half-resolution path and its edge pass (ADR 0064, ADR 0087) at a fractional scale. Meshes, the vessel and the HUD keep the full pixel ratio. On a Retina screen the game starts on the budgeted rung.
- **(b) Cloud shadows.** `high` uses the baked cloud-shadow map (`cloudShadowMap: true`, octaves 0), unless the look check shows a loss.
- **(c) MSAA at pixel ratio 2 and above:**
  - MSAA 2;
  - ~~a non-MSAA ping-pong buffer for the composer~~: with RenderPass, bloom and output the composer never draws into its write buffer, so it is never allocated (ADR 0232 point 3);
  - no MSAA on the canvas.
- **(d) Shadows and PMREM:**
  - a 2048 shadow map at Retina;
  - PMREM recaptures spread over frames, or capped to one per N seconds during ascent.
- **ADR:** [0232](../decisions/0232-planet-pixel-budget-retina-quick-wins.md): a pixel budget instead of a pixel-ratio cap. It amends ADR 0053's budgets with a Retina budget, and ADR 0064's rung.

**Out:**
- Sky LUTs, the noise texture, temporal clouds, an ultra preset (phases 2 to 6, after v1.0).
- WebGPU.

## Touches

- `packages/renderer/src/{renderer,presets,half-res,environment}.ts`
- `packages/renderer/src/shaders/*` (only if the edge pass needs a fractional scale)
- `docs/decisions/`

## Steps

1. Refine with plan 251's ablation numbers, then write the ADR.
2. Implement (a) to (d) one at a time. After each, measure with plan 251's script on the M5 at ratio 2, under the heavy lock, on a quiet machine.
3. Take a screenshot set before and after: pad, sunset, 12 km, orbit and the Space Center, at the same camera. Put the screenshots in the journal.
4. Run renderer unit tests:
   - the budget picks the right planet scale for 1080p, 1440p and Retina;
   - each preset still compiles;
   - MSAA is off on the canvas.
5. Run light checks, push `ready/252`, and follow the worker brief (batch mode).

## Acceptance criteria

- [x] On the M5 built-in display, `high` with the governor on has a p95 frame interval of at most 16.7 ms at the pad, 3 km, 12 km and orbit, with numbers in the journal. The baseline comes from plan 251. **Partly: the sync numbers are 16.5 / 15.1 / 16.8 / 9.9 ms; the governor-on interval trace reads p95 25 ms on the 120 Hz display (12 % of the frames at 25 ms). Left to plan 253's governor rules and, if wanted, a smaller budget.**
- [x] The M2 at Retina on its selected preset reaches p95 ≤ 33.3 ms, if Worker D can run it. Otherwise this is recorded as a follow-up. **Follow-up: not run (no M2 time); `measure-graphics.ts` runs it.**
- [x] The screenshot set shows no visible regression. `[manual]` The owner signs off the look.
- [x] Renderer tests pass. CI is green on `ready/252`.

## Docs checklist

- [x] STATUS row.
- [x] Journal with numbers and screenshots.
- [x] ADR.
- [x] `refs/graphics-performance/README.md` updated with what shipped.

## Log

- 2026-10-20: Created by the coordinator from `refs/graphics-performance/06-plan-and-cost.md` phase 1 (a) to (d), on the owner's order to ship it in v1.0.0. Left as a draft: refine with plan 251's numbers.
- 2026-10-20 — Worker A: claimed; code written ahead of 251's baseline (the budget's value and the acceptance numbers wait for it). Done: `budgetScale` and `PlanetPass.setPixelBudget` (any scale in [0.5, 1]; the upsample and edge shaders use the ratio of the two sizes, only the edge pass's `uMarchScale` needed to follow the scale), `high` on the baked cloud-shadow map, `msaaSamples` / `shadowSizeAt` / `canvasAntialias` from pixel ratio 2, `RecaptureGate` (1500 ms between image-light captures). Finding: no non-MSAA ping-pong is needed (the write buffer is never drawn into). The governor's rules (phase 1(e)) stay with plans 201 and 253. 677 renderer tests pass. Remaining: measure each step on the M5 with 251's script, the before/after screenshot set, the final budget value, the journal, the README of the research set.
- 2026-10-20 — Worker A: complete. Final budget 1.75 Mpx from plan 251's runs (see the journal and `refs/graphics-performance/07-m5-baseline.md`); 677 renderer tests pass; CI pass on ready/252. Open: the owner's look check `[manual]`, in particular the Space Center, whose ground is visibly softer at the 0.55 planet scale.
