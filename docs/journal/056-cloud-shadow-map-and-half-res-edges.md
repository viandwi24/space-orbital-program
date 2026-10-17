# 056 — Baked cloud-shadow map, sharper half-resolution edges, the burning pad's smoke

**Plan:** plans/056-cloud-shadow-map-and-half-res-edges.md · **Session:** shadows session (Claude, 2026-10-17), together with plan 062 · **ADRs:** [0086](../decisions/0086-baked-cloud-map-shared-by-shafts-and-ground-shadows.md), [0087](../decisions/0087-edge-pass-at-the-half-resolution-rung.md), [0088](../decisions/0088-smoke-noise-in-a-texture.md) · **Research:** [three.md](../research/three.md) (plans 056 and 062)

**Status when written: criteria met in their refined form.** One absolute figure is not reproducible: `medium`'s 13.3 ms budget at the pad and the hillside reads over for HEAD itself on this machine today (below), so the frame criterion is the difference to HEAD. Not measured on M1/M2, Intel or a phone-class GPU (none available): drafts 038 and 066 hold them.

## What was done

| Where                                                           | What                                                                                                                                                                                           |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `effects/smoke-noise.ts`, `field.ts`, `shaders.ts`, `system.ts` | the smoke puff's value noise baked into a 256 x 256 tiling RGBA8 texture (two texel reads instead of sixteen hashes), `discard` for pixels with alpha under 0.004; tests `smoke-noise.test.ts` |
| `light-shaft.ts`, `shaders/cloud-field.glsl.ts`, `planet.ts`    | the cloud map is RG8 2048 x 1024: red coverage (shafts), green density (ground shadows); `cloudMapAt` in GLSL                                                                                  |
| `presets.ts`, `planet.glsl.ts`                                  | `cloudShadowMap` (`medium` true): `sh *= 1 - 0.45 * density` from one fetch; `CLOUD_SHADOW_MAP` define                                                                                         |
| `half-res.ts`, `planet.glsl.ts`, `planet.ts`, `environment.ts`  | `isEdgePixel` twin and tests; `halfEdge` in the planet shader; `planet-edge` material and mesh (same program, `uEdgeOnly`, full pixel angle, `uMarchScale`)                                    |
| `docs/journal/assets/056-*.jpg`                                 | before/after: cloud shadows (`medium`), half-rung crops (ridge, cloud rim, full frame, full-resolution reference), burning pad (`high`, `medium`)                                              |

## Method

Production builds of clean copies (`git archive HEAD` in the scratchpad plus this plan's renderer files; the main tree held other sessions' work), `NODE_ENV=development vite build` for the `__orbital` hook, a small Bun static server on port 5236 that also saves canvas JPEGs, one tab of the built-in browser (hidden), canvas forced to 1920 x 1080 at ratio 1, rAF stubbed, governor off. Scenes by synthetic snapshots of the 23-part booster rocket (the live snapshot with the vessel moved): pad (`pad-morning`), 3 km, 12 km, 100 km straight up, the hillside of journal 050 (26.5 km east, 5.5 km north, 1.75 km, yaw 1.57 and 3.14), `ridge3` and `ridge6` (250 m up, sun 3 and 6 degrees at the azimuth of the hill, camera toward it), and the burning pad (the rocket at 14 m with the engines on, 6 s of effects stepped). thr = minimum of 8 windows of `benchmark(8)`, sync = minimum of 8 means of 8 `benchmark(1)`. **Every number is from a second page load of its build** (a new shader text ran 25 to 40 ms on the first load) and **the table is the minimum over two or more pages per build**: one build read 1.5 ms apart on two pages the same hour. The harness is not committed (scratchpad); the burning pad is `H.burn`, the A/B helpers toggle `material.visible`.

## Frame times, sync ms, HEAD then this plan (minimum over pages)

| Scene                | `high`             | `medium`           |
| -------------------- | ------------------ | ------------------ |
| pad                  | 16.91 to **16.56** | 13.20 to **13.32** |
| 3 km                 | 14.21 to **13.08** | 11.42 to **11.47** |
| 12 km                | 11.52 to **10.91** | 9.17 to **9.33**   |
| orbit                | 4.74 to **4.36**   | 4.06 to **4.01**   |
| hillside 1.57        | 16.86 to **16.04** | 13.73 to **13.80** |
| hillside 3.14        | 17.17 to **15.89** | 13.71 to **13.76** |
| ridge, sun 3 degrees | 15.27 to **15.80** | 11.47 to **12.08** |
| ridge, sun 6 degrees | 15.24 to **16.10** | 11.58 to **12.00** |
| burning pad          | 22.57 to **15.82** | 16.04 to **12.88** |

The difference is -1.3 to +0.9 ms on `high` and -0.05 to +0.6 on `medium`; the ridge rows are where plan 062's reads run. **The budgets (16.7 / 13.3)**: `high` is under 16.7 everywhere (worst 16.56 at the pad, 16.10 at the ridge); `medium` is over 13.3 at the pad (13.20 on HEAD, 13.32 here) and the hillside (13.7, 13.8) on this machine today. Journal 054 measured HEAD at 11.16 and 12.26 for those scenes; the machine was 15 to 20 percent slower today (several pages, the same builds), so HEAD plus this plan's difference (+0.1 at the pad, +0.1 at the hillside, +0.6 at the ridge) is 11.3, 12.3 and 12.9 on journal 054's machine, under 13.3. That is arithmetic, not a measurement.

**Smoke** (A/B of the smoke mesh's `material.visible` in one page, the burning pad, minimum of interleaved windows, sync): HEAD `high` 21.4 with / 13.9 without (7.5 ms), `medium` 16.5 / 11.7 (4.9 ms); this plan `high` 2.4 ms, `medium` 1.2 to 1.4 ms (13.7 / 11.3 and 11.4 / 10.0). Before the discard the texture alone gave `high` 2.4 and `medium` 3.0 (noisy); the discard is the other half on `medium`.

**Cloud shadows on `medium`**: one page, `CLOUD_SHADOW_MAP` on against off, pad scene at 2.2 km, sun 28 degrees: 7.7 percent of the pixels darker by 7.1 levels on average, 1.2 percent lighter by 10.7 (two frames of the same build differ in 1.3 percent of pixels: the shafts' jitter). Cost: inside the noise of the table (+0.12 at the pad, +0.07 at the hillside). The shadow is subtle at the home body's 0.42 cover (45 percent at most, under scattered cumulus): `056-before-` / `056-after-cloud-shadows-medium.jpg` show it as soft darker patches under the cumulus.

**Half rung** (this plan, sync, minimum of 8 windows): `high` pad 11.21, hillside 8.36, ridge 8.30; `medium` 8.79, 7.49, 6.96 (full resolution 16.6 / 16.0 / 16.1 and 13.3 / 13.8 / 12.0). The edge pass on against off in one page: `high` pad +1.04, ridge +1.07, hillside +1.46, 3 km +0.85; `medium` pad +0.85, hillside +1.34, ridge +1.33. An unconditional `discard` in the edge pass costs nothing, so the cost is the four texel fetches per pixel and the shading of the edge pixels. The first build's chroma threshold (0.08) and an earlier luminance test marked a whole cloud (mask views in the build; ADR 0087), not only its rim.

## Hitch

Journal 048's protocol (nine `setPreset` plus first frame, ms, call + first frame, page after its tables and about 100 s): this plan 12+53 (`high`, first), 2+16, 3+438 (first `low`), then 11 to 25 each; two repeats 11 to 30. HEAD, the same hour: 1+24, 0+18, 1+709 (first `low`), then 10 to 24. The first switch is slower here in one run (65 against 25 ms), the first visit to `low` faster (441 against 709); steady switches are in journal 054's 29 to 57 ms range and under it. Not worse beyond the noise of one run each; the first-switch figure should be re-measured when a second machine is available.

## Look review against `visual-direction.md`

- **Burning pad**: the smoke is the same smoke (`056-*-burning-pad-*.jpg`; the two frames differ in tree and cloud positions because the sim time of each page differs). With the noise from a texture, the puffs' lumps are the same size and the lighting is unchanged. There are still vertical streaks in the lower left of the smoke (stretched sprites near the camera against the ground); they are on HEAD too (the first screenshot of this session), and look like a depth-fade artefact at the near plane: not touched.
- **Half-rung edges**: the ridge's staircase is one pixel long and the clouds' rims lose their beaded outline: indistinguishable from full resolution at 1:1 (crops at 4x in `056-*-half-*.jpg`). Inside a ridge's haze there is a 2-pixel checker (the jitter of the second march); it is on HEAD too and stronger after plan 062's reads, visible at 4x, not at 1:1.
- **Cloud shadows**: honest but modest at cover 0.42 (above); the edges are soft (1.8 km texel), which fits cumulus shadows seen from the ground; a close look from 300 m shows a faint diamond pattern of bilinear interpolation on the softest shoulders.

## What surprised me

- A glsl syntax error (a splice left `* hiL;`) passed typecheck and `vite build` and showed only as a black frame and a console error. The build is not a shader check.
- The first edge criterion (brightness contrast of the four texels, 5 percent) marked every cloud: the march's jitter makes the inside of a cloud as contrasty as its rim. Chroma (how blue) separates sky from cloud and ignores brightness.
- `medium`'s noise cost was a ground-shadow cost the map removes, but the real news of the burning pad was that the smoke noise, not the particle count, was the cost: 16 hashes per pixel per sprite over a few million pixels.
- The same build read 1.5 ms apart on two page loads an hour apart (and another build lower than HEAD in some rows): a table is the minimum over pages, and only interleaved A/B in one page (the `visible` switches, the defines) resolves a tenth of a millisecond.
- The draft's "re-bake as `uCloudAngle` moves" was a misreading of ADR 0070: the lookup rotates, the map does not.

## Not met / not done

- M1/M2, Intel, phone measurements: not available (drafts 038 and 066).
- `medium`'s absolute 13.3 ms at the pad and the hillside on this machine today (HEAD included).
- A tile mask in front of the edge pass (would save most of its 0.4 to 0.5 ms test cost): ADR 0087.
- The governor in the live frame loop with the edge pass: not run (hidden pane, journal 039).

## Verification output

```
bun test packages/renderer      547 pass, 0 fail
bun run test                    1254 pass, 0 fail
apps/web vitest --run           805 pass (90 files)
bun run typecheck               all packages and svelte-check: 0 errors
bun run build                   done
bun run docs:check              see the plan's close
prettier --check                packages/renderer, the new docs: clean
```

Mutants: the lattice wrap of the smoke noise, the edge test's chroma branch and the penumbra of the terrain reads each make their tests fail (5 failures together), restored.
