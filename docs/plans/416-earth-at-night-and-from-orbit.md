---
id: 416
title: "Earth at night and from orbit: city lights on every preset, a sharper orbit bake with baked fine detail, and a cloud shell with relief"
status: done
owner: "Worker A"
depends: []
phase: 9
created: 2026-11-08
updated: 2026-11-08
---

# 416 — Earth at night and from orbit

**Size:** M

## Goal

The owner's M5 test on 2026-11-08, on Low (the new-player default):

- Earth from space looks poor.
- Clouds lack detail.
- There are no city lights at night.

This plan fixes all three without adding per-frame cost (ADR 0375).

## Context

- ADR 0375, ADR 0330, plan 403 (planets from orbit), plan 397 (clouds), plan 364 (scaled-space bake).
- City lights are procedural in `packages/renderer/src/night-lights.ts`, which has CPU, GLSL and TSL versions. The density is baked into the alpha of the normal atlas (`tsl/planet-pass.ts` ~2320–2329) and added on the night side (~2518–2523; WebGL `shaders/planet.glsl.ts` ~1374).
- Low sets `nightLights: false` (`presets.ts` ~149). Lights come only from the bake, and their gain is 0.12. In orbit the exposure stays at day level while the sun is above the horizon as seen from altitude (`environment.ts` ~574, `exposure.ts`).
- Bake face size: Low 512, Medium 1024, High 1536, M5 2048 (`scaled-space-model.ts` 28–44, `scaledCapFor`).
- Orbit cloud shell: `cloud-far.ts`, read from a 2048×1024 map with no mipmaps (`light-shaft.ts` 27–29, `tsl/clouds.ts` 236–292).

## Scope

**In:**
1. **City lights on every preset.**
   - Change Low's `nightLights` to on. The cost is the existing bake alpha read on the night side.
   - Make them visible. Raise the gain, and compensate for exposure so they read at day-level exposure on the night hemisphere seen from orbit.
   - Make the density formula give recognisable clusters along coasts and lowlands, with a fine sparkle at the 1–3 km scale baked in, plus faint connecting lines. They must still never appear on water, ice or high mountains.
   - Near the ground, where the bake is not used, apply the same lights from the procedural function, gated to the night side and by relevance.
2. **Orbit bake resolution by device, not by preset.**
   - The face size comes from GPU memory and tier: 2048 on M5-class, 1536 on M2/M1, 1024 on mid-range Windows, and at least 1024 everywhere.
   - Low keeps its cheap per-pixel path.
   - The bake runs once; it must not stall play. Spread it over frames or tasks if it is over 50 ms.
3. **Bake finer detail.** The bake calls `surfaceAt`. Bake extra octaves of albedo variation and normals (finer than the runtime march uses), plus subtle tints for coast, desert and forest, so orbit shows texture rather than smooth blobs. This costs bake time only.
4. **The cloud shell from orbit.**
   - Give the cloud map mipmaps.
   - Add a tiling detail noise to the shell at about 20–60 km.
   - Add relief shading: a normal from the map gradient, sun-side brightening, and a soft self-shadow toward the sun.
   - Keep the clouds on every preset, at no measurable cost in orbit.
5. **WebGL2 parity** in `shaders/planet.glsl.ts` for all of the above.

**Out:** relief and rock near the ground (plan 417); performance work beyond this plan's own cost (plan 418); real-Earth data such as Blue Marble or SRTM. The home world stays fictional and procedural.

## Steps

1. Take before screenshots on the M5, headed, WebGPU Low and High, from three views: 400 km over the day side, 400 km over the night side with the terminator in view, and 30 km. Save them as `docs/journal/assets/416-before-*.jpg`.
2. City lights: change the preset, the formula, the gain and the exposure compensation, and apply them near the ground. Add a unit test for the density formula: none on water, more on lowland coast than on highland.
3. Bake size by device, and the finer baked detail.
4. Cloud shell mipmaps, detail and relief.
5. WebGL twin.
6. Take after screenshots from the same views. Run `apps/web/scripts/probe-dusk.ts`, which must build 0 pipelines in play, and `probe-textures.ts --gate`, which must stay at ≤ 15 per stage.

## Acceptance criteria

- [x] City lights are visible from 400 km on the night side at Low, Medium and High, on WebGPU and WebGL2 (screenshots).
- [x] The orbit view at Low on the M5 shows finer surface texture than before (side-by-side screenshots).
- [x] The cloud shell shows relief and no aliasing shimmer from orbit (screenshots).
- [x] Orbit stays at 8.3 ms mean on the M5 at Low and High, measured headed (interleaved A/B, the `/tmp/orbital-measuring` flag). If the machine is busy, run the cells at the end and record the load.
- [x] Dusk probe: 0 pipelines. Texture gate passes.
- [x] `bun test packages/renderer`, `bun run typecheck`, `bun run lint`, `bun run docs:check`.

## Docs checklist

- [x] STATUS row, journal `docs/journal/416-earth-at-night-and-from-orbit.md` with screenshots, ADR 0375 linked.

## Log

- 2026-11-08 — Created by the coordinator from the owner's M5 test (no city lights, poor Earth from orbit, flat clouds).
- 2026-11-08 — Done by Worker A, journal 416. City lights on every preset with exposure compensation; bake face by device (2048 / 1536 / 1024, same for every preset); baked fine detail and tints; the far cloud shell shows from orbit again (plan 410's relevance had switched it off above the air; the "before" orbit clouds were the old cirrus) with mips, detail and relief; WebGL twins. Orbit A/B on the M5 (headed, WebGPU, governor off, 100 km orbit, interleaved, load 3.7 to 4.9): Low 8.33 ms both, p95 9.30 both; High 8.33 ms new against 8.37 base (4 pairs; one base run had a 151 ms frame), GPU 1.5 ms both. Dusk probe 0 pipelines; texture gate ok at Low and High. The M2 and Windows are `[manual]`.
