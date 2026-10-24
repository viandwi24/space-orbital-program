---
id: 406
title: "Planet mods: albedo, height and normal maps for a mod body; the height map feeds the sim terrain; non-Home hills bodies get sky, sea and clouds"
status: in-progress
owner: "Worker B"
depends: [391]
phase: 9
created: 2026-10-24
updated: 2026-10-24
---

# 406 — Planet mods

## Goal

A mod can add a planet with its own textures: albedo, height and normal maps. The height map feeds the sim's terrain field, so a vessel lands on the ground that is drawn. A non-Home body of type `hills` gets sky, sea and clouds in the planet pass, as Home does. Maps are capped and streamed like the stock bakes (plan 403), and a sample planet mod shows it end to end.

## Context

- Design: `refs/graphics-v2/README.md` ("mods can add planets with textures"; the wave's acceptance: "a mod can add a textured planet that the sim collides with"); ADR 0330 §4 ("planet height maps feed the sim's terrain").
- Research:
  - `refs/graphics-v2/03-renderer-and-mod-audit.md` B3 (`:216`: `terrain` is a closed set — `hills`, `craters`, smooth — and there are no albedo, height or normal textures; a second `hills` body draws without sky, haze, sea waves or clouds, `writing-a-mod.md:216`, draft 071), B6.1 (`:244-251`: the fields needed; the height map must feed the terrain cube bake **and** `createBodyTerrainField`; the planet pass's bindings must cover non-Home `hills` bodies), B5 (`:240`, the 16-texture limit).
  - `refs/graphics-v2/01-ksp-and-mods.md` §7 (`:198-216`: Kopernicus bakes and OnDemand loading; mismatched bakes are the classic complaint).
  - `refs/graphics-v2/04-physics-fling-and-collision.md` (the ground collider from the real terrain, plan 391).
- ADRs: 0067 (body terrain kinds), 0090 (both kinds on any body), 0182 (water), 0306, 0311 ("mods add planets as bodies with their own maps"), 0330, and plan 405's ADR (image asset kind and caps).
- Code: `packages/core/src/body-terrain.ts` (`createBodyTerrainField`), `packages/core/src/schemas.ts` (body `terrain` and `appearance`, `:79-139, :280-282`), `packages/renderer/src/{terrain-model,scaled-space-model,planet}.ts`, `packages/renderer/src/tsl/planet-pass.ts`, `docs/guides/writing-a-mod.md` ("The ground of a body").
- Plans: 405 (image assets, caps, KTX2), 391 (ground collider from the real terrain), 403 (per-body bake and streaming), 398 and 402 (GPU terrain and detail, which should read the same heights), 071 (draft: seed and site on `hills`; fold in or supersede, and say which).

## Scope

**In:**
- A new terrain kind, `{ kind: 'map', height, albedo?, normal?, oceanMask?, heightRange, seaLevel? }`, or `hills` with maps (the ADR picks): equirect or cube images from the package, height as 16-bit PNG or KTX2 R16.
- **Sim:** `createBodyTerrainField` samples the height map (bilinear plus a seeded fine noise below the map's texel, the same function on both sides), so collision matches the drawn ground; the map is decoded once per world in core and shared by the sim Worker and the page.
- **Renderer:** the height map feeds the terrain height cube and the camera patches; albedo and normal feed the scaled-space bake (plan 403) and the near-ground shading; footprint fades as for Home.
- **Planet pass for non-Home bodies:** sky (Hillaire LUTs per body from its `appearance.sky` coefficients, plan 405), sea (where the ocean mask or sea level says), and clouds (plan 397's layers from the body's cloud data), with the per-body bindings inside the 16-texture limit.
- Caps and streaming: maps count against plan 405's caps and plan 403's memory budgets; far bodies evicted.
- A sample planet mod `examples/mod-planet-sample`: a small world with a height map, albedo and an ocean mask, and a scenario that lands a vessel on it.
- Low and Medium versions that hold a locked 60 on the lower targets (base M2; Windows PCs with Intel Iris Xe or AMD 680M integrated graphics, or GTX 1650 / RTX 3050 class cards, in Chrome or Edge on D3D12): smaller map residency and the cheaper sky, sea and cloud levels of plans 397, 401 and 404.

**Out:**
- Mod height functions as code (closed by ADR 0330 §4).
- Mod biome tables and scatter (later).
- Launch-site buildings on mod bodies.

## Design notes

- One height function, two consumers: the sim and the renderer read the same decoded map and the same fine noise, tested to agree.
- Height maps are gameplay data: their hash is part of the package fingerprint, and a save names the mod as today.
- The sim Worker must not hold a large decoded map per body it never visits: decode on first need, keep within a budget.

## Steps

1. ADR (next free number): the terrain kind and map formats, the sim sampling function, residency in the sim Worker, and what happens to draft 071.
2. Capture "before": a second `hills` body from orbit and on the ground (no sky, sea or clouds today).
3. Schema and validation in core; decode and share the map.
4. Sim: `createBodyTerrainField` for the map kind, with tests against the renderer's sampler.
5. Renderer: height cube, patches, scaled-space bake and shading from the maps.
6. Planet pass: sky, sea and clouds for non-Home bodies.
7. The sample planet mod, its scenario and test.
8. Guide, quick look, capture "after", journal.

## Acceptance criteria

- [ ] `bun test packages/core` passes, including `test/body-terrain-map.test.ts`: the sim's height at 1,000 random points equals the renderer's sampler within 1 cm; a map outside the caps or with a bad format is refused with the field named.
- [ ] `bun test packages/sim` passes, including a test that a vessel dropped on the sample planet comes to rest on the map's height at that point (within the collider tolerance of plan 391).
- [ ] `examples/mod-planet-sample/test/*.test.ts`: the sample builds, installs, resolves, and its scenario lands a vessel headless.
- [ ] `bun test packages/renderer` passes, including a binding-count test that a non-Home body with sky, sea and clouds stays within 16 sampled textures, and the warm-list test covering those variants.
- [ ] `bun run typecheck`, `bun run build` and `bun run docs:check` pass.
- [ ] e2e paused by the owner: none added.
- [ ] A quick look in a browser on WebGPU and WebGL; before and after screenshots of the sample planet from orbit, at 3 km and on the ground in `docs/journal/assets/406-*.jpg`.
- [ ] No frame-time regression against plan 392's baseline at Home; the sample planet's views within the same budget.
- [ ] Low and Medium hold a locked 60 on the sample planet on the lower targets: measured with Chrome's CPU and GPU throttling as a stand-in, and on a Windows integrated-GPU machine when the owner can run it ([manual] for the real machine); the journal states which.
- [ ] [manual] The owner installs the sample planet, flies there and lands.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues; draft 071's fate).
- [ ] `docs/journal/406-planet-mods.md` written.
- [ ] `docs/guides/writing-a-mod.md`: "The ground of a body" with the map kind, and the line that a second `hills` body has no sky, sea or clouds corrected.
- [ ] `docs/architecture/overview.md` (terrain and planet pass).
- [ ] The new ADR linked above and in `docs/decisions/README.md`.
- [ ] The mod API version bumped and noted in the guide.

## Log

- 2026-10-24 — Created by the coordinator from refs/graphics-v2 (ADR 0330).
- 2026-10-24 — Stage 1 by Worker B (ADR 0346, API 0.1.123): a hills body takes its biome map from a PNG in its mod's package; the sim and the renderer read the same map; sample mod and tests. Albedo and normal images, the home planet's sky, sea and clouds on a mod planet, streaming and the owner's landing are open. Draft 071 was already done.
