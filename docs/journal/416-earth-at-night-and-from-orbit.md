# 416 — Earth at night and from orbit

**Plan:** [plans/416-earth-at-night-and-from-orbit.md](../plans/416-earth-at-night-and-from-orbit.md) · **Session:** Worker A, 2026-11-08 · **ADR:** [0375](../decisions/0375-keep-three-raw-webgpu-for-hot-passes.md)

The owner's M5 test on Low: Earth from space looks poor, the clouds lack detail, no city lights at night. Screens are in `docs/journal/assets/416-before-*` and `416-after-*` (name: `416-<before|after>-<webgpu|webgl>-<low|high>-<day400|night400|deepnight400|night30|day30|night30city|day30city>.jpg`); the scripts are `apps/web/scripts/capture-416.ts`, `probe-416.ts` and `measure-416.ts`.

## What was done

| Where | What |
|---|---|
| `presets.ts` | Low's `nightLights` on (the lights are the bake's alpha, one more read on the night side) |
| `night-lights.ts` | density rewritten: clusters on lowland coasts (a coast boost under 140 m), a 2 km sparkle baked at the texel, faint roads (a thin ridge of a 28 km noise); still none on water, ice or high ground. Gain 0.12 to 0.9 at day-level exposure, and `lightsExposureScale(exposure)` (day exposure over the exposure now, 0.12 to 1) so on screen they read the same from orbit by day-level exposure and on the ground at the night's 4x. `PlanetUpdate.exposure` carries the adapted exposure to the pass; `uCityLights` is now that scale (0 when the preset has the lights off) |
| `tsl/planet-pass.ts`, `shaders/planet.glsl.ts` | where the bake is not read (a pixel over 8 m, on the night side, under a blend weight) the same lights from the procedural formula, gated by `uCityLights` |
| `scaled-space-model.ts` | the bake's face follows the device, not the preset: 2048 on `m5`, `discrete-high` and a 120 Hz `apple`; 1536 on `m2` and a 60 Hz `apple`; 1024 on everything else and until the GPU is known. The same for every preset, so a preset switch never rebakes it (and a Low on the M5 is 1.9 km a texel no more: 0.56 km, from 512) |
| `bake-detail.ts` (new), pass and GLSL bake | after `surfaceAt`, per texel, once: albedo variation from three fine octaves (2.4, 1.2, 0.6 km), a normal tilted by their gradient, tints for forest (darker, greener), desert (warmer) and beach (sandy, below 40 m). Bake time only |
| `tsl/clouds.ts`, `planet.ts` | the cloud map has mips (`LinearMipmapLinear`, `generateMipmaps`), on both backends; the WebGL map follows the cover on every preset (it was baked once at Low) |
| `cloud-far.ts`, `tsl/planet-pass.ts`, `shaders/planet.glsl.ts` | the shell reads the map's density at the pixel's mip level (plus 2), adds a tiling detail of 53, 16 and 5 km (gated near cloud by a wide blur of the map, faded where a pixel is over 5 to 14 km), tilts the normal by the height's gradient (sun side brighter) and shades what a higher bank toward the sun covers. The march's own coverage is not evaluated where the shell is the whole cloud. The shell and its map are in the WebGL program at every preset (they were compiled in only with shafts or cloud-shadow maps) |
| `relevance.ts` | see below |
| `docs/architecture/overview.md` | the bake, the lights and the shell as built |

## What surprised me

- **There was no cloud shell in orbit.** Plan 410's relevance gave the clouds level 0 above the air, and the planet pass's cloud block (the march and the far shell of plan 403) sits behind that gate. The clouds seen from 100 km and up were the old cirrus layer: the blurry streaks of the "before" screens (`setLookOff('clouds')` and `('farShell')` left them as they were; a forced red in the block showed nothing). So the plan's "give the shell relief" had nothing to act on. `relevanceOf('clouds')` now returns 1 above the air (the shell is the stand-in), with the test changed to match, and the shell shows from orbit for the first time since plan 410. The cirrus is unchanged and still drawn under it.
- The map's density is a step (cumulus edges are a threshold on a 1.8 km texel), so a plain relief of it was faceted. What reads as cloud is the map at a softer mip (+2 levels), 70 % of it, plus the detail noise at full weight, gated by a wide blur of the map so the noise only shapes the edge near cloud.
- The coordinator's rule changed mid-task (every automated browser muted): `capture-416.ts`, `probe-416.ts` and `measure-416.ts` use `scripts/lib/chromium`.
- `measure-first-frames.ts` showed 1280 ms for the first Flight to Map toggle once at Low; it did not repeat in two more runs (24 and 12 ms) and the baseline reads 24 ms: the machine was loaded (other workers), I take it as noise.

## Verification

- Orbit A/B, interleaved base (main 9200d27d, a worktree on port 5231) and branch, headed Chromium on the M5, WebGPU, governor off, the 100 km orbit view, 15 s a cell after an 8 s warm-up, `/tmp/orbital-measuring` held, load averages 3.7 to 4.9 (other workers running):

| preset | side | runs | mean ms | p95 ms | worst ms | GPU ms |
|---|---|---|---|---|---|---|
| low | base | 2 | 8.33 | 9.30 | 9.5 | 0.45 |
| low | new | 2 | 8.33 | 9.30 | 9.4 | 0.25 to 0.29 |
| high | base | 4 | 8.37 | 9.30 | 150.9 (one frame) | 1.4 to 1.6 |
| high | new | 4 | 8.33 | 9.30 | 9.5 | 1.5 to 1.6 |

  A first round at High (two pairs) read 9.2 against 10.1 ms, with a noisy base and branch alike (a base cell at 10.09, a branch cell at 10.94); the four-pair round above is the one to trust, and no cell over 8.4 ms is explained by the change.
- `probe-dusk.ts`: pipelines before dusk 92, after 92, 0 built. `probe-textures.ts high --gate` and `low --gate`: gate ok, no pipeline over 15 sampled textures, none failed (the shell and the bake add no texture binding: the map is the same node).
- `measure-first-frames.ts` at Low, the 12 s after the loading screen: WebGPU worst 26 ms (baseline 29 ms), WebGL worst 56 ms in one frame.
- The M2 and Windows (1536 and 1024 faces, the shell on a lower tier) are `[manual]`.

## Not done

- The WebGPU bake of a 2048 face is 12 passes spread over 6 frames, as before: no frame over 50 ms was seen in the 12 s after the loading screen (26 ms worst, WebGPU Low), WebGL worst 56 ms in one frame at +146 ms.
- The cirrus layer under the shell is untouched; it is the old blurry look and could go (or get the same detail) in a later plan.
