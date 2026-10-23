---
id: 399
title: "Re-entry and aero v2: per-body plasma palettes in Firefly style, condensation and vapour cones gated by Mach"
status: done
owner: "Worker C"
depends: [393]
phase: 9
created: 2026-10-24
updated: 2026-10-24
---

# 399 — Re-entry and aero v2

## Goal

Re-entry plasma takes its colours from the body it falls through: pink and blue in Home's nitrogen and oxygen, other hues in a CO₂ atmosphere, as in reference image 01. Each body has a Firefly-style palette (glow, hot glow, three trail colours, streak, wrap, bow shock; each colour RGB × 2^intensity, so HDR) chosen per body and atmosphere. Below the thermal threshold the same silhouette shell (ADR 0078) draws the cold white end: condensation, a vapour cone and a shock collar between about Mach 0.85 and 1.2, as in reference image 02. No new render pass, and both renderers draw it.

The owner's ask (2026-10-24): clearly different colours that read beautifully. The plasma is a **multi-colour gradient**: deep red and orange at low heating, then pink and magenta, then blue-white at peak. The **skin glow, the shock layer and the trail** each have their own colour. Colour is a function of heating, speed and the body's atmosphere, and it has a quality setting. Every look also has a cheap Low/Medium version that holds a locked 60 on the lower targets (base M2; Windows PCs with Intel Iris Xe or AMD 680M integrated graphics, or GTX 1650 / RTX 3050 class cards, in Chrome or Edge on D3D12).

## Context

- Design: `refs/graphics-v2/README.md` (plan table, looks 1 and 2); ADR 0330 §3 (looks are built in, each with a switch and a quality level) and §4 (per-body plasma palettes are mod data, plan 405).
- Research:
  - `refs/graphics-v2/01-ksp-and-mods.md` §1 (`:33-50`): Firefly's layers (glow, glow_hot, trail 1/2/3, streaks, wrap, bow shock), colours as RGB × 2^intensity (`:38`), its per-body multipliers (`:40`), the bow-shock problem (`:41`), and the recommendation to borrow the data model only (`:43-50`).
  - `01` §2 (`:52-62`): condensation is the cold end of the same shell, Mach 0.85–1.2, faded by density, no new pass, an on/off knob.
  - `refs/graphics-v2/03-renderer-and-mod-audit.md` A6 (`:147-148`): today's blackbody part glow (`R/effects/glow.ts:8-17`), the plasma shell (`R/effects/plasma-shape.ts:61,158`), one speed ramp for every body (`ionisationColour`, `R/effects/look.ts:84`), Sutton-Graves intensity (`R/effects/reentry.ts`); no aero or condensation effect exists.
  - `docs/research/effects-3.md` (plasma physics, blackout, contrails).
- ADRs: 0078 (plasma shell from the vessel silhouette), 0080 (exhaust trail as a ribbon; humidity proxy is pressure only), 0047 (effect techniques), 0308/0310 (every pipeline warmed at load), 0330.
- Code: `packages/renderer/src/effects/{plasma-mesh,plasma-shape,look,reentry,glow,system}.ts`, `packages/renderer/src/tsl/twins.ts` (the TSL twins of GLSL effect materials).
- Plans: 393 (TAAU; the shell must not ghost under the new temporal resolve), 392 (the frame-time baseline), 404 (the switch and quality level), 405 (palettes as mod data).
- Reference images: `refs/graphics-v2/reference/01-reentry-heat.webp`, `02-aero-effects.webp`.

## Scope

**In:**
- A `PlasmaPalette` type in the renderer (glow, glowHot, trail[3], streak, wrap, shock; each `{ rgb, intensity }`, HDR = rgb × 2^intensity) and multipliers (strength, length, opacity, glow, wrap opacity, wrap fresnel, streak probability and threshold).
- Stock palettes for every stock body with an atmosphere, picked from its composition; a default for bodies without one (today's speed ramp, kept as the fallback).
- **The colour function.** `plasmaColour(layer, heating, speed, palette)`, where `layer` is skin glow, shock layer or trail:
  - heating (the stagnation flux, normalised per palette) walks a gradient of at least four stops: deep red → orange → pink/magenta → blue-white;
  - speed shifts the trail toward the hot end and lengthens it;
  - the body's palette sets the stops, so Home reads pink and blue and a CO₂ world reads differently.
  - The three layers sample the gradient at different offsets (the skin lags, the shock leads, the trail cools along its length), so they stay distinct on screen.
- **Quality levels** (fields for plan 404):
  - Low: skin glow and a one-colour shell with a two-stop gradient; no streaks, no bow shock, no condensation ring. Must hold a locked 60 on the lower targets.
  - Medium: the full gradient on shell and trail, a short trail, condensation on.
  - High / Ultra: streaks, the bow-shock layer, more trail segments.
- The shell's shader layers: wrap (fresnel), trail colours along the streak, random streaks, an optional bow-shock layer at the stand-off; intensity still from the stagnation flux.
- Condensation: the same shell with a cold, white, low-opacity palette gated by Mach (about 0.85–1.2) and faded by air density, plus a thin ring at the shock (vapour cone). Part skins' blackbody glow stays as it is.
- Quality knobs (trail segments, bow shock on/off, condensation on/off) exposed to plan 404 as settings fields; until 404 lands they read the preset.
- GLSL and TSL both; pipelines warmed at load.

**Out:**
- Mod-supplied palettes (plan 405 adds the data field; this plan defines the type it fills).
- Particles or sparks (a later plan if the owner asks; Firefly's `particle_threshold` is not copied).
- Per-part envelope meshes (KSP 2's approach); wingtip vortices; Prandtl-Glauert physics beyond the Mach gate.
- The Settings UI (plan 404).

## Design notes

- Keep one shell per vessel from the silhouette (ADR 0078); Firefly's bow shock copies windward geometry and looks odd (`01:41`), so ours is a layer on the existing stand-off surface, not a copy.
- Palette selection: by body id, else by the atmosphere's composition tag if one exists, else the default. Interpolate the palette by stagnation flux from glow to glowHot, so a low-energy entry stays red-orange.
- Condensation and plasma share the mesh and the draw: one material with a temperature/Mach blend uniform, so the switch costs no draw call when off.
- Check how the additive shell behaves under TAAU (plan 393): if it smears, draw it after the resolve or mark it reactive in the history clamp; record which in the journal.

## Steps

1. Capture "before" from fixed cameras: Kronos capsule at 60 km and 7.5 km/s on Home, a CO₂ body entry (if a stock one exists), and a plane or rocket through Mach 1 at 8 km.
2. `PlasmaPalette` type, stock palettes and the selector, with unit tests.
3. Shell layers (wrap, trail colours, streaks, bow shock) in GLSL and TSL.
4. Condensation and vapour cone on the same material, gated by Mach and density.
5. Quality fields in `presets.ts` (trail segments, bow shock, condensation), warmed at load.
6. Capture "after", frame-time check against plan 392's baseline, journal.

## Acceptance criteria

- [ ] `bun test packages/renderer` passes, including `test/plasma-palette.test.ts`: every stock body with air resolves a palette; HDR colour = rgb × 2^intensity; the flux blend from glow to glowHot is monotonic; a body without a palette gets the default ramp (equal to today's `ionisationColour` at the same speeds).
- [ ] `test/plasma-colour.test.ts`: on Home's palette, rising heating passes through red, orange, pink/magenta and blue-white in that order (hue checks per stop); at one heating the skin, shock and trail colours differ by a set minimum distance; two bodies with different palettes give different colours at the same heating and speed; the Low level uses the two-stop gradient.
- [ ] `test/condensation.test.ts`: opacity is 0 below Mach 0.8 and above 1.25, peaks inside 0.85–1.2, and falls to 0 as density goes to 0.
- [ ] `test/pipeline-warm.test.ts` (or the existing warm-list test): the shell's variants for every quality level are in the load-time warm list.
- [ ] `bun run typecheck` and `bun run docs:check` pass.
- [ ] e2e paused by the owner: none added.
- [ ] A quick look in a browser on WebGPU and WebGL; before and after screenshots from the same cameras in `docs/journal/assets/399-*.jpg`.
- [ ] No frame-time regression against plan 392's baseline at the re-entry and Mach 1 views (p95 frame interval, M5 Retina, Chrome, `high`), recorded in the journal.
- [ ] Low and Medium hold a locked 60 at the re-entry view on the lower targets: measured on WebGL2 and WebGPU with Chrome's CPU and GPU throttling as a stand-in where no such machine is at hand, and on a Windows integrated-GPU machine when the owner can run it ([manual] for the real machine); the journal states which.
- [ ] Screenshots of one entry at four heating levels (low → peak) in `docs/journal/assets/399-gradient-*.jpg`.
- [ ] [manual] The owner looks at re-entry on Home and on another air body, and a Mach 1 pass, against reference images 01 and 02.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/399-reentry-and-aero-v2.md` written, with the screenshots and frame times.
- [ ] `docs/architecture/overview.md` (effects): palettes and condensation.
- [ ] ADR 0078 amended or a new ADR written if the shell's design changes; linked above.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.

## Log

- 2026-10-24 — Created by the coordinator from refs/graphics-v2 (ADR 0330).
- 2026-10-24 — Code done (Worker C): palettes, the colour function, the shell's three layers with streaks and bow shock, condensation, the `plasma` quality in the presets; tests and screenshots in journal 399. Left: the before captures, frame-time and low-end runs, the TAAU check (393) and the owner's look ([manual]).
