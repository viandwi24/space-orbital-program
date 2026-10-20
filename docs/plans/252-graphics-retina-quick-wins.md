---
id: 252
title: "Graphics phase 1: a pixel budget for the planet pass, baked cloud shadows on high, lighter MSAA and shadows at Retina, spread PMREM recaptures"
status: draft
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
  - a non-MSAA ping-pong buffer for the composer;
  - no MSAA on the canvas.
- **(d) Shadows and PMREM:**
  - a 2048 shadow map at Retina;
  - PMREM recaptures spread over frames, or capped to one per N seconds during ascent.
- **ADR:** a pixel budget instead of a pixel-ratio cap. It amends ADR 0053's budgets with a Retina budget, and ADR 0064's rung.

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

- [ ] On the M5 built-in display, `high` with the governor on has a p95 frame interval of at most 16.7 ms at the pad, 3 km, 12 km and orbit, with numbers in the journal. The baseline comes from plan 251.
- [ ] The M2 at Retina on its selected preset reaches p95 ≤ 33.3 ms, if Worker D can run it. Otherwise this is recorded as a follow-up.
- [ ] The screenshot set shows no visible regression. `[manual]` The owner signs off the look.
- [ ] Renderer tests pass. CI is green on `ready/252`.

## Docs checklist

- [ ] STATUS row.
- [ ] Journal with numbers and screenshots.
- [ ] ADR.
- [ ] `refs/graphics-performance/README.md` updated with what shipped.

## Log

- 2026-10-20: Created by the coordinator from `refs/graphics-performance/06-plan-and-cost.md` phase 1 (a) to (d), on the owner's order to ship it in v1.0.0. Left as a draft: refine with plan 251's numbers.
