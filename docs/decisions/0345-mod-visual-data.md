# 0345 — Mod visual data: plasma palettes, post profiles, bigger images, KTX2

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/405-mod-visual-data.md
**Builds on:** ADR 0330 (graphics v2: mods supply data, never shaders), ADR 0170 (typed patches), ADR 0313 (images in packages), ADR 0160 (KTX2 in glTF)

## Context

The graphics v2 looks are data-driven inside the renderer (plan 399's plasma palettes, plan 400's plume templates). A mod could supply only a plume template, through a part's `visual.plume.template`. Plan 405 opens the rest of the look to data, staged as plans 397 and 403 are.

## Decision

1. **A body's plasma palette**: `BodyDefinition.plasma` (`plasmaPaletteSchema`: a glow, a hot glow, three trail colours, a streak, a wrap, a shock, 4 to 8 gradient stops from 0 to 1 ascending, and optional scales 0 to 4; colours are linear RGB 0 to 1 times 2^`intensity`, −4 to 6). It is on the body and not in `appearance`, which is required to carry a palette of surface colours and which the home body does not have; a mod gives Home a palette with a typed patch (`target: 'body'`, `path: 'plasma'`). The renderer's `paletteFor` takes the data first, then the body's stock one, then the gas's.
2. **A post-processing profile registry**: `ctx.postProfiles` (`post-profile`, `postProfileDefinitionSchema`): bloom's strength (0 to 2), radius (0 to 1) and threshold (0 to 10), and a factor on the exposure (0.25 to 4); each optional, the stock look where absent. The last registered profile is the one drawn, in every view; the catalog carries the list (`Catalog.postProfiles`), the web host passes the last one to `RendererConfig.postProfile`, the WebGL bloom pass and the WebGPU bloom node are built with its numbers and the environment multiplies its exposure. There is no tone-map choice: the engine has one (ACES).
3. **Images**: PNG, WebP and KTX2 (`.ktx2`, `image/ktx2`) as asset kinds, up to **4 MiB** an image (from 512 KiB) and **32 MiB** all told (from 6 MiB, which stays the models' own limit), sides up to 4096 (a PNG's header, a KTX2's); a KTX2 must be 2D or a cube, 1 to 14 levels, no supercompression but BasisLZ or Zstandard. A package with a KTX2 is **format 4** (`MOD_PACKAGE_VERSION`); older games refuse it with the update message. Validation is at parse, before the trust prompt, and each message names the file.
4. **Plume templates** needed no change: `part.visual.plume.template` (plan 400) is data a mod gives its own engines or patches onto a stock one.
5. **Mod API 0.1.122**: additive (`ctx.postProfiles`, `definePostProfile`, `BodyDefinition.plasma`).

## Left open in plan 405 (it stays in progress)

- Cloud and weather maps, sky and ocean coefficients as mod data: they need the consumers of plans 397 (the cloud map and the weather cover feed the shader today; no map image reaches it) and 401's coefficients, which are not data yet; a field no pass reads would be a promise.
- Meshopt for glTF: not done; the decoder and a lazy loader are a plan of their own, and no model in the game needs it.
- A consumer of the image assets beyond crew portraits (plan 406's planet maps).

## Consequences

- A mod installs a recoloured re-entry, a long plume and a moody post profile with data and a typed patch; `examples/mod-visual-sample` does all three.
- A world's post look changes with the mod set, so it needs a reload, like bodies.
