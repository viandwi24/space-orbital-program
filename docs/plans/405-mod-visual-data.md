---
id: 405
title: "Mod visual data: plasma palettes, plume templates, cloud and weather maps, sky and ocean coefficients, post profiles, larger caps, KTX2 and WebP, and the guide"
status: done
owner: "Worker B"
depends: [399, 400]
phase: 9
created: 2026-10-24
updated: 2026-10-24
---

# 405 — Mod visual data

## Goal

A mod can change the look of the game with data: per-body plasma palettes, plume templates per engine, cloud and weather maps, sky and ocean coefficients, and post-processing profiles. Packages may carry larger images, in KTX2 or WebP, and Meshopt-compressed glTF if that is cheap. Every field is validated at install. A sample mod under `examples/` uses each one, and the mod guide documents them. Mods supply data, never shaders (ADR 0330 §4).

## Context

- Design: `refs/graphics-v2/README.md` (decision 3, the list of mod data); ADR 0330 §4.
- Research:
  - `refs/graphics-v2/03-renderer-and-mod-audit.md` B1 (`:176-188`, the package format; format 2 glTF, format 3 PNG/WebP), B3 (`:209-218`: glTF limits — 2 MiB a model, 6 MiB and 32 files a package, no Meshopt or WebP; images up to 512 KB for portraits only; no visual hooks), B5 (`:229-240`: mods are not sandboxed; the real risks are compile time and the 16-texture limit), B6.3 (`:261-268`: data-only parameter packs are the cheapest path).
  - `refs/graphics-v2/01-ksp-and-mods.md` (the data each look takes: §1 palettes `:45-48`, §3 templates `:74-78`, §4 coefficients `:119`, §6 cloud maps `:196`, post profiles `:233`).
- ADRs: 0057 (mods are data), 0076 (packages carry GLB), 0160 (KTX2 in glTF), 0170 (typed patches), 0311 (everything comes from plugins), 0313 (images in packages), 0308/0310, 0330.
- Code: `packages/core/src/{mods,mod-assets,mod-api,schemas,plugin}.ts`, `tools/mod-build/build-mod.ts`, `docs/guides/writing-a-mod.md`, `examples/mod-sample`.
- Plans: 399 (`PlasmaPalette`), 400 (`PlumeTemplate`), 401 (ocean coefficients), 397 (cloud and weather maps), 403 (KTX2 transcoding and caching), 404 (post settings), 406 (planet maps, which builds on this plan's image path).

## Scope

**In:**
- **New data fields**, each a zod schema in core and a typed patch target (ADR 0170):
  - body `appearance.plasma`: a `PlasmaPalette` (plan 399);
  - part `visual.plume.template`: a `PlumeTemplate` or a stock template id plus overrides (plan 400);
  - body `appearance.clouds`: coverage and type maps (images), layer altitudes, colours, the rain or snow altitude (plan 397);
  - body `appearance.sky` and `appearance.ocean`: Rayleigh, Mie, ozone, scale heights, terrain inscatter exposure; ocean colour, wind (plan 401);
  - a new `postProfiles` registry: per-scene bloom, exposure and tone-map choice (within what the engine's post chain already has).
- **Images:** a general image asset kind (not only portraits): PNG, WebP and KTX2 under `assets/`, referenced by path from the fields above; caps raised (for example 4 MiB an image, 32 MiB a package; final numbers in the ADR, checked against the memory budgets of plan 403); dimension limits per use.
- **Meshopt** (`EXT_meshopt_compression`) for glTF if the decoder is small and loads lazily; otherwise noted as not done.
- **Validation** at install, before the trust prompt: schema, image format and size, KTX2 header, ranges (a palette's intensity, a coefficient's sign), with messages that name the file and field.
- **A sample mod** `examples/mod-visual-sample`: a recoloured plasma palette for Home, a custom plume on one engine, a cloud map, sky coefficients and a post profile; a test that builds, installs and resolves it.
- **The guide:** a "Changing the look" section in `docs/guides/writing-a-mod.md`; fix the stale "Open items" line (`writing-a-mod.md:1104`, `03:213`) that says KTX2 textures and deploy animations in models are not built (they are, ADR 0160).

**Out:**
- Shader hooks of any kind (deferred by ADR 0330 §4).
- Planet albedo, height and normal maps (plan 406).
- Mod rock GLBs and scatter tables (a later plan after 402).
- Mod glTF buildings (ADR 0160 §5; a later plan).

## Design notes

- Every field maps onto a uniform or texture the engine already has; a mod cannot add a pipeline, so the load contract (ADR 0308/0310) holds.
- Images decode off the main thread; KTX2 uses the existing transcoder (`/basis/`).
- A mod's visual data is per world, like bodies: changing the mod set still needs a reload.

## Steps

1. ADR (next free number): the field list, caps, the image asset kind, the post-profile registry, the validation rules.
2. Schemas and typed patches in core, with tests.
3. Image asset kind, caps, KTX2 and WebP in `mod-assets.ts` and the build tool.
4. Renderer: read each field into the look plans' data (palette, template, coefficients, cloud maps, post profile).
5. Meshopt decision and, if cheap, the decoder.
6. The sample mod and its test.
7. The guide and its "Open items" fix; a quick look; journal.

## Acceptance criteria

- [x] `bun test packages/core` passes, including `test/mod-visual-data.test.ts`: each new field accepts the sample's values and rejects out-of-range ones with the field named; patches over stock palettes and templates apply.
- [x] `test/mod-assets.test.ts` (extended): PNG, WebP and KTX2 images within the caps are accepted; an over-cap image, a bad KTX2 header and an unreferenced path are refused with the file named.
- [x] `examples/mod-visual-sample/test/*.test.ts`: the sample builds, parses, resolves, and its palette, template, cloud map, coefficients and post profile reach the renderer's data (checked on the resolved objects, not by pixels).
- [x] `bun test packages/renderer` passes, including a test that a mod palette and a mod plume template replace the stock ones for that body and engine.
- [x] `bun run typecheck`, `bun run build` and `bun run docs:check` pass.
- [x] e2e paused by the owner: none added.
- [x] A quick look in a browser with the sample installed; before and after screenshots in `docs/journal/assets/405-*.jpg`.
- [x] No frame-time regression against plan 392's baseline with the sample installed (same views as 399–401).
- [ ] [manual] The owner installs the sample and sees the changed plasma, plume and clouds.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/405-mod-visual-data.md` written.
- [x] `docs/guides/writing-a-mod.md`: "Changing the look", new caps and image kinds, and the stale "Open items" line fixed.
- [x] The new ADR linked above and in `docs/decisions/README.md`.
- [x] The mod API version bumped and noted in the guide.
- [ ] `docs/research/stack-versions.md` updated for the Meshopt decoder, if used.

## Log

- 2026-10-24 — Created by the coordinator from refs/graphics-v2 (ADR 0330).
- 2026-10-24 — Stage 1 by Worker B (ADR 0345, API 0.1.122): plasma palettes, post profiles, KTX2 and WebP images with the larger caps, the sample mod and the guide. Cloud and weather maps, sky and ocean coefficients (nothing reads them yet) and Meshopt are open.
- 2026-10-24 — Stage 2 by Worker B (ADR 0362, API 0.1.131): air, ocean and weather data, cloud images, Meshopt allowed; the sample and guide. Done; the owner's install is [manual]. Journal 405.
