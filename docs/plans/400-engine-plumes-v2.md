---
id: 400
title: "Engine plumes v2: Waterfall-style templates (mesh, material, controllers), templates per engine, one light per cluster"
status: draft
owner: "Worker C"
depends: [393]
phase: 9
created: 2026-10-24
updated: 2026-10-24
---

# 400 — Engine plumes v2

## Goal

Engine plumes look like reference image 03: a bright core, a shaped outer flame, shock diamonds at sea level and a wide, faint plume in vacuum, each engine with its own look. A plume is a **template**: a list of effects, each a mesh plus a material plus controllers, in the style of Waterfall. Stock engines carry their templates as data. There are no particles, and a cluster of engines casts one light.

The owner's ask (2026-10-24): **real variety per engine** — very long tails and short ones; bright and glowing, or thin and faint; red, yellow, orange, and also blue. The look follows the propellant and the engine, and length and width follow throttle, chamber pressure and ambient pressure (expansion in vacuum). Every look also has a cheap Low/Medium version that holds a locked 60 on the lower targets (base M2; Windows PCs with Intel Iris Xe or AMD 680M integrated graphics, or GTX 1650 / RTX 3050 class cards, in Chrome or Edge on D3D12).

## Context

- Design: `refs/graphics-v2/README.md` (look 3); ADR 0330 §3 (the engine owns the technique) and §4 (plume templates per engine are mod data, plan 405).
- Research:
  - `refs/graphics-v2/01-ksp-and-mods.md` §3 (`:64-82`): Waterfall's effect = model + material (Additive, Alpha, **Additive Volumetric** with a depth fade) + controllers + modifiers (`:68`); controllers throttle, thrust, **atmosphere density^0.5128**, Mach, ignition and flameout, noise (`:69`); no particles (`:70`); lights and distortion are the costly knobs (`:71`); the recommendation (`:74-82`).
  - `refs/graphics-v2/03-renderer-and-mod-audit.md` A6 (`:149`): today's plume is two nested additive cones and a nozzle sprite (`R/effects/plume-mesh.ts`), shaped by the isentropic expansion factor (`R/effects/plume.ts:1-7`), with a ramp-up flash, per-bell clusters, `color` and a ground-light disc. B3 (`:214`) and B6.2 (`:256`): a mod can set only shape numbers and `color`.
- ADRs: 0047 (effect techniques), 0080 (exhaust trail ribbon), 0308/0310 (warm at load), 0330.
- Code: `packages/renderer/src/effects/{plume,plume-mesh,ground-glow,lamp,system}.ts`, `packages/renderer/src/tsl/twins.ts`; stock engines in `mods/stock/src/parts/`; part visual schema in `packages/core/src/schemas.ts` (`plume`).
- Plans: 393 (TAAU: depth for the soft fade, reactive mask), 392 (baseline), 404 (switch and quality), 405 (templates as mod data).
- Reference image: `refs/graphics-v2/reference/03-engine-plumes.webp`.

## Scope

**In:**
- A `PlumeTemplate` type: effects, each `{ mesh, material, controllers, modifiers }`.
  - Meshes: a fixed set (cone, cylinder, bell, billboard, diamond strip), parameterised.
  - Materials: additive, alpha, additive volumetric (soft fade against scene depth, so a plume meets the pad and parts without a hard line).
  - Controllers: throttle, normalised thrust, atmosphere density (default exponent 0.5128), Mach, ignition and flameout time, random and smooth noise, each through a remap curve.
  - Modifiers: float, colour, UV scroll, scale.
- Today's expansion-factor shape kept as the default template, so an engine without a template looks as it does now.
- **Propellant base templates**, which an engine's template extends:

  | Propellant | Look |
  |---|---|
  | Kerolox | orange-yellow, bright, with a sooty dark core near the nozzle |
  | Hydrolox | faint blue-white, near invisible at sea level, with visible Mach diamonds |
  | Methalox | blue to purple, clean |
  | Hypergolic | orange-red, translucent |
  | Solid | very bright white-yellow, with a long smoke trail (the existing trail ribbon, ADR 0080) |
  | Ion / electric | a faint blue thread |

- **Size controllers.** Length and width follow throttle, chamber pressure (from the engine's data) and the ambient pressure, through the expansion factor (`R/effects/plume.ts:1-7`): long, narrow and diamond-cut at sea level, wide and faint in vacuum. Some engines have very long tails, some short ones.
- **A template for every stock engine** in stock data (the propellant base plus per-engine colour, length, brightness and diamond count); RCS stays separate.
- One point light per engine cluster, placed at the cluster centroid, intensity from summed thrust.
- LOD by screen size: the core only when far; the volumetric layer only at `high`.
- **Quality levels** (preset fields for plan 404):
  - Low: one core mesh and the nozzle sprite per engine, propellant colour and size controllers kept, no diamonds, no cluster light, no volumetric layer. Must hold a locked 60 on the lower targets with a five-engine cluster.
  - Medium: core and outer flame, diamonds, the cluster light.
  - High / Ultra: the additive volumetric layer with the depth fade, noise.

**Out:**
- Particles, heat haze and distortion (a later plan; Waterfall's distortion is its costliest knob).
- Mod-supplied templates (plan 405 adds the field and validation).
- Settings UI (plan 404).

## Design notes

- A small fixed set of shader variants, warmed at load (ADR 0308/0310); the template picks parameters, never code.
- Controllers run on the CPU once per engine per frame and write uniforms; no allocation per frame (plan 396's rule).
- The depth fade needs the scene depth at TAAU's input size (plan 393); on WebGL2 fall back to the additive material without the fade if depth is not available.
- Clusters: engines on one stage whose nozzles lie within a few bell radii share a light; the ground-light disc follows the same cluster.

## Steps

1. Capture "before": the pad at ignition, 12 km, vacuum at 100 km, a five-engine cluster.
2. ADR (next free number): the template format, controller list and the fixed mesh and material set.
3. `PlumeTemplate` types, controllers and curves, with unit tests.
4. Meshes and the three materials in GLSL and TSL; the default template reproducing today's plume.
5. Propellant base templates; a template for every stock engine; cluster lights; the side-by-side test-stand capture.
6. LOD and quality fields; warm list.
7. Capture "after", frame-time check against plan 392, journal.

## Acceptance criteria

- [ ] `bun test packages/renderer` passes, including `test/plume-template.test.ts`: the density controller gives density^0.5128 by default; remap curves clamp; ignition ramps from 0 to 1 over the template's time; the default template matches today's cone sizes for the same pressure ratio.
- [ ] `test/plume-cluster.test.ts`: a five-engine cluster makes one light; two separated stages make two; a cluster's light intensity follows summed thrust.
- [ ] `test/plume-propellant.test.ts`: each propellant base resolves to its colour family (kerolox orange-yellow, hydrolox blue-white, methalox blue/purple, hypergolic orange-red, solid white-yellow, ion blue); hydrolox's core opacity at sea level is below a set floor while its diamonds stay visible; plume length grows with throttle and chamber pressure and width grows as ambient pressure falls.
- [ ] `bun test mods/stock` (or the stock part tests) passes: every stock engine has a valid template, and every template names a propellant base.
- [ ] A side-by-side screenshot set: every stock engine (or at least one per propellant) firing on a test stand at sea level and in vacuum, in `docs/journal/assets/400-engines-sea.jpg` and `400-engines-vacuum.jpg`.
- [ ] Low and Medium hold a locked 60 with a five-engine cluster at the pad on the lower targets: measured with Chrome's CPU and GPU throttling as a stand-in, and on a Windows integrated-GPU machine when the owner can run it ([manual] for the real machine); the journal states which.
- [ ] The warm-list test includes every plume material variant for every quality level.
- [ ] `bun run typecheck` and `bun run docs:check` pass.
- [ ] e2e paused by the owner: none added.
- [ ] A quick look in a browser on WebGPU and WebGL; before and after screenshots in `docs/journal/assets/400-*.jpg`.
- [ ] No frame-time regression against plan 392's baseline at the pad at ignition and the cluster view (p95 frame interval).
- [ ] [manual] The owner looks at plumes at the pad, at altitude and in vacuum against reference image 03.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/400-engine-plumes-v2.md` written.
- [ ] `docs/architecture/overview.md` (effects): plume templates.
- [ ] The new ADR linked above and in `docs/decisions/README.md`.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.

## Log

- 2026-10-24 — Created by the coordinator from refs/graphics-v2 (ADR 0330).
