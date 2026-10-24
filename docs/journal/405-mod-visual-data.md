# 405 — Mod visual data

**Plan:** [plans/405-mod-visual-data.md](../plans/405-mod-visual-data.md) · **Session:** Worker B, 2026-10-24 · **ADRs:** 0345 (stage 1), 0362 (stage 2) (0330, 0170, 0313, 0341) · **Note:** [refs/graphics-v2/03-renderer-and-mod-audit.md](../../refs/graphics-v2/03-renderer-and-mod-audit.md) B1 to B6

## What was done

| Where | What |
|---|---|
| `core/schemas.ts`, `registry.ts`, `plugin.ts`, `sdk` | `plasmaPaletteSchema` and `BodyDefinition.plasma`; `postProfileDefinitionSchema`, the `postProfiles` registry, `definePostProfile`; API 0.1.122 |
| `core/mod-assets.ts`, `mods.ts`, `tools/mod-build` | KTX2 images, 4 MiB an image, 32 MiB a package, sides to 4096, PNG and KTX2 header checks, format 4 |
| `renderer/effects/plasma-palette.ts`, `post-profile.ts`, `post.ts`, `renderer.ts`, `renderer-webgpu.ts`, `environment.ts` | `paletteFromData`; a profile's bloom in both post chains and its exposure in the environment |
| `web` (`messages.ts`, `catalog.ts`, `sim-host.ts`, `world-renderer.svelte.ts`) | the catalog carries the profiles and the body's palette to the renderer |
| `examples/mod-visual-sample` | green fire over Home, a long hydrolox plume on the Lv engine, a moody profile; its test resolves them into what the renderer reads |
| tests | `mods/stock/test/mod-visual-data`, `core/test/mod-assets` (extended), `renderer/test/mod-plasma` and `post-profile`, the sample's |
| `docs/guides/writing-a-mod.md` | "Changing the look"; the stale "Open items" line fixed |

## Findings

- A plume template was already mod data (plan 400); the stock engines carry theirs.
- The plasma palette is on the body, not in `appearance`: the home body has no appearance, and the schema requires a surface palette in it.
- The 512 KiB image cap was a portrait's; 4 MiB with the 4096 side keeps a 2048² BC7-class KTX2 in.

## Stage 2 (ADR 0362, API 0.1.131)

| Where | What |
|---|---|
| `core/schemas.ts`, `body-images.ts`, `mod-assets.ts` | `BodyDefinition.air`, `.ocean`, `.weather`; `appearance.clouds.map`; `installBodyImages` (the image comes from the mod that set the path); `EXT_meshopt_compression` allowed |
| `renderer/atmosphere-model.ts`, `environment.ts`, `planet.ts`, `weather.ts`, `shaders`, `tsl` | `applyAir` scales the derived coefficients; the sea's two colours are uniforms in both passes; `weatherCover(seed, t, look)` |
| `renderer/body-dress.ts`, `parts/gltf-provider.ts` | a mod's cloud image is the deck's cover; three's `MeshoptDecoder` loads lazily on the first model that uses it |
| `examples/mod-visual-sample` | a teal sea, a redder hazier sky and a steadier cloudier weather for Home, a picture for Vesper's clouds |
| tests | `mods/stock/test/mod-visual-air`, `sim/test/body-images`, `renderer/test/atmosphere-model` and `weather` (extended), `core/test/mod-assets` (Meshopt accepted), the sample's |

Screens: `405-before-3km.jpg` and `405-after-3km.jpg` (the sea from 3 km: Home's blue against the sample's teal under a pinker sky), `405-*-60km.jpg`, `405-*-orbit.jpg`. Frame time as in journal 403 (one measurement session, WebGPU High, the sample installed in the screens, not in the matrix): nothing beyond the noise.

## Not done

- The owner's install of the sample ([manual]).
- A Meshopt-compressed model in the repository: the decoder path is the library's; the inspector accepts the extension (tested) and nothing in stock uses it.
