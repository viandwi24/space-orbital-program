---
id: 019
title: "Visual: flight environment (sky, planet, launch site, lighting)"
status: draft
owner: ""
depends: [008, 016]
phase: 2
created: 2026-10-16
updated: 2026-10-16
---

# 019 — Visual: flight environment

## Goal

The flight view stops looking like a debug scene. The home planet reads as a planet from the pad and from orbit, with a sky and atmosphere, a sun with shadows, a launch site that gives scale, clouds, stars, tone mapping and bloom, all procedural and within the performance budget of `docs/product/visual-direction.md`.

## Context

- Read: `docs/product/visual-direction.md` (the bar), `docs/architecture/units-and-frames.md` (floating origin, +Y north, body rotation), `packages/renderer/src/*`, ADRs 0007, 0012, 0024, journals 008, 009, 016, 017.
- Requested by the human on 2026-10-16 (screenshot comparison with KSP2: "environment like this now would get torn apart in public").

## Scope

**In:** sky dome / atmosphere scattering (day, sunset, space), sun light + shadows following the vessel, ACES (or similar) tone mapping and sRGB output, bloom; planet surface shading (procedural colour by height/slope/noise: grass, dirt, rock, sand, ocean), near-pad detail and a far/orbit view with an atmospheric rim and night side; procedural launch site (pad, tower, apron, a few buildings/props) placed at the stock launch location and rotating with the body; cloud layer; starfield; graphics presets (low/medium/high) for the environment; frame-time measurement.
**Out:** part meshes and effects (020), HUD (021), terrain height/collision (physics stays on the reference sphere), external assets.

## Design notes

- Renderer stays a pure consumer of snapshots. Sun direction derives from body rotation and a fixed star direction (pure function, tested).
- Precision: planet-scale geometry with floating origin and log depth (already in place); near-pad detail must not swim.
- Keep shaders and generators in `packages/renderer` behind small modules (`sky.ts`, `planet.ts`, `launch-site.ts`, `post.ts`) with pure maths split out for Bun tests.

## Steps

1. Refine (verify current three.js docs for `EffectComposer`/`UnrealBloomPass`/`OutputPass`, `Sky` addon or custom scattering, shadow cameras, `toneMapping`), write ADR for the rendering pipeline.
2. Implement; wire presets into the web host.
3. Screenshots and perf; journal.

## Acceptance criteria

- [ ] To be made measurable at refinement. Must include: Bun tests for the pure parts (sun direction vs body rotation, colour ramps, preset selection); `[manual]` screenshots at fixed presets (pad at noon, pad at low sun, ascent ~20 km, orbit ~100 km day side with rim, night side) saved as `docs/journal/assets/019-*.png`; measured frame time at 1080p for each preset recorded in the journal; a written self-review against `visual-direction.md`; `bun run build`, web tests, `bun run typecheck`, `bun run docs:check`, `bun test` pass.

## Docs checklist

- [ ] `docs/STATUS.md`, journal, ADR, research (three.js), `docs/architecture/overview.md`/renderer notes.

## Log

- 2026-10-16 — Created as draft at the human's request (visual overhaul, code-only).
