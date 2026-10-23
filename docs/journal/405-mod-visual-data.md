# 405 — Mod visual data (stage 1)

**Plan:** [plans/405-mod-visual-data.md](../plans/405-mod-visual-data.md) · **Session:** Worker B, 2026-10-24 · **ADRs:** 0345 (0330, 0170, 0313) · **Note:** [refs/graphics-v2/03-renderer-and-mod-audit.md](../../refs/graphics-v2/03-renderer-and-mod-audit.md) B1 to B6

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

## Not done (plan 405 stays in progress, ADR 0345)

- Cloud and weather maps, sky and ocean coefficients as data: nothing reads them yet.
- Meshopt for glTF.
- Before and after screens with the sample installed, and the frame-time check against plan 392's baseline; the owner's install of the sample.
