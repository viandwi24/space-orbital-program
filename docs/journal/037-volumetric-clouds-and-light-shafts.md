# 037 — Volumetric cumulus

**Plan:** plans/037-volumetric-clouds-and-light-shafts.md · **Session(s):** clouds session (Claude, 2026-10-17) · **Date:** 2026-10-17 · **ADR:** [0059](../decisions/0059-cumulus-slab-march.md) · **Research:** [three.md](../research/three.md) (plan 037)

## What was done

| Where | What |
|---|---|
| `renderer/src/cloud-volume.ts` (new), `test/cloud-volume.test.ts` (33 tests) | the constants the shader imports and the pure maths: slab interval, height profile, density with ragged base, coverage shape, erosion octaves, dual-lobe phase, multiple scattering, scatter gain, powder, fill, billow shade, roll-off, sun optical depth, analytic march, jitter |
| `shaders/planet.glsl.ts` | the cumulus block of the planet pass: slab interval, coverage once per pixel, 3 to 6 steps with erosion, light per step, one opacity and one mean radiance fed to the unchanged composite; `uCloudTop` |
| `planet.ts`, `presets.ts` | `uCloudTop`; defines `CLOUD_STEPS`, `CLOUD_DETAIL`; preset fields `cloudSteps` (3, 4, 6) and `cloudDetail` (1, 2, 3) |
| `cloud-model.ts` | one comment line: the cumulus is a slab |
| `docs/journal/assets/037-before-*.png`, `037-after-*.png` | pad, 3 km, 12 km, orbit, hillside; `high`, 1920 x 1080 |

## Method

As journal 039 and 048: production builds (`NODE_ENV=development vite build`), one of the tree at the start of the session (`base`) and one per iteration, served by a 10-line Bun static server on port 5211 with a POST endpoint that writes canvas PNGs; built-in browser pane (hidden), canvas forced to 1920 x 1080 at ratio 1, rAF stubbed, governor off, a vessel from the VAB's two-stage example. Scenes: pad (`pad-morning`), 3 km / 12 km / orbit (a second vessel straight above the pad, camera yaw 0.9, pitch 0.02, 40 m), hillside (26.5 km east, 5.5 km north, ground 1 698 m, camera 25 m behind at pitch 0.04, worst of four yaws). Frame time = minimum of 30 windows of 8 frames; sync = eight single frames with a read-back. Screenshots after 70 frames so the exposure has settled. Contrast = standard deviation of Rec. 709 luminance over a fixed rectangle.

## Results

Frame time, sync ms (throughput in brackets where recorded), baseline then this plan:

| Scene | `high` before | `high` after | `medium` before | `medium` after |
|---|---|---|---|---|
| pad | 13.8 (11.8) | **14.5** (12.2) | 11.1 (9.6) | **12.1** (9.8) |
| 3 km | 9.8 (8.9) | **11.3** (9.4) | 8.9 (8.2) | **9.6** (8.2) |
| 12 km | 7.2 (6.4) | **8.1** (6.6) | 6.6 (5.8) | **7.5** (5.8) |
| orbit | 3.6 (3.0) | **4.6** (3.0) | 3.5 (2.8) | **4.6** (2.8) |
| hillside, worst of four | 12.6 (11.7) | **13.5** (12.0) | 11.8 (10.4) | **11.7** (10.1) |
| hillside, the other three | 5.6 to 6.9 | **13.2 to 13.5** | 11.1 to 11.5 | 11.6 |

Budget: `high` 16.7, `medium` 13.3. The three cheap hillside directions on `high` (mostly cloudy sky) went from 5.6 to 6.9 ms to 13.2 to 13.5 ms: the cloud stage costs up to 7 ms there. I do not know why `medium`'s baseline is flat over the four directions while `high`'s is not; both numbers are from the same protocol (a baseline `medium` measurement taken at a page at 1024 x 768 first read 4 ms and was discarded). `medium` after was measured on a page loaded at `medium`; the first `medium` run, after `setPreset` from `high`, read 25 to 30 ms at every scene (the slow state of journal 039: after a switch the pane's GPU clock stays low), and was repeated on a fresh page.

Preset-switch hitch (`setPreset` + first frame, ms; cold page 90 s old, order high, low, medium, high, low, medium, low, high, medium; this plan against the baseline build, same protocol, same session):

| | first high | first low | first medium | revisits |
|---|---|---|---|---|
| baseline | 227 + 32 | 22 + 57 | 1 + 33 | 31 to 47 |
| this plan | 174 + 31 | 19 + 51 | 1 + 44 | 25 to 65 |

No difference beyond noise. Journal 048's own figures (17 to 38) came from a quieter machine and a different frame definition; the baseline build here reads 31 to 57 for the same switches. A first attempt, 5 s after loading the page, read 625 + and 370 ms for the first switches: the precompile had not finished (it needs about 60 s with a slow GPU), the same as before this plan.

Contrast (12 km, rectangle x 100 to 1800, y 280 to 700, `high`): before 27.06, after 27.33. 3 km (x 0 to 1900, y 580 to 800): 24.01 and 23.59.

## Look review against `visual-direction.md`

Better: at the pad the clouds have grey undersides with a mottled, ragged base and lighter rims where they are thin, instead of flat white shapes with a blue-grey outline (`037-before-pad.png` against `037-after-pad.png`); at 3 km, looking up at the deck, the dark bases with bright silver edges read as thick cloud (`037-after-km3.png`). Nothing blooms: the radiance roll-off holds the sun-lit tops under the post chain's threshold.

Still looks like a debug view, in order of how much it matters:

1. **The silhouettes.** Where a cloud begins and ends comes from the 2D coverage field of ADR 0037; the slab gives it a base, a top and a texture, not a cauliflower outline. From 12 km and from orbit the deck is the same set of white patches as before (the 12 km and orbit screenshots are nearly identical to the before ones).
2. **Billows at the pad are mottling, not lumps.** The erosion octaves are value noise at 210, 70 and 25 m; they roughen the base and the rims but a whole cloud still looks smooth and thick in the middle.
3. **Grain on the edges.** A quarter-step jitter and no temporal accumulation leave a fine dither on cloud edges that is visible at 100 % zoom and hidden at normal size by the bloom.
4. **The ground shadow does not follow the slab.** It is the 2D coverage at the base altitude; at a low sun a cloud and its shadow differ by up to a kilometre of parallax.
5. No light shafts, no ozone colour at the golden hour (draft 054).

## What surprised me

- **A server that did not start looked like a code change that did nothing.** `pkill` followed by a 0.5 s sleep did not free port 5211 in time, the new server exited with `EADDRINUSE`, and the old build kept being served: eight iterations of "the clouds do not change" were all screenshots of the second build. `run.sh` now waits for the port and prints the server log; check that before suspecting the shader.
- **The whole-frame white-out was bloom, not haze.** The 3 km view looked washed white around a bright cloud near the sun; alpha was zero outside the clouds (debug view). Clamping the cloud radiance at 1.2 removed it, a roll-off at 3 keeps the contrast (ADR 0059).
- **Optical depth was the lever for the look.** With an extinction of 0.01 per metre the first step of every ray was opaque and the cloud was a smooth sheet lit like its lowest layer; at 0.003 the marched density and the light show.
- Exposure needs about 50 frames to settle after a scene change; screenshots after 12 frames of the 3 km view were over-exposed and looked like a haze problem.
- Backticks inside a GLSL comment end the TypeScript template literal that holds the shader: the build error pointed at the next line.

## Decisions made (link ADRs)

[0059](../decisions/0059-cumulus-slab-march.md): slab with a 2D coverage, 3 to 6 steps, analytic light, no temporal reprojection, presets `cloudSteps` and `cloudDetail`.

## Open questions / follow-ups

- Draft [054](../plans/054-light-shafts-and-ozone-sky.md): light shafts, ozone layer, aurora.
- Draft 050 (half-resolution planet pass) is the place for a history buffer and temporal accumulation of the cloud edges; the cloud stage's up to 7 ms on `high` in a cloudy-sky view is the first thing to move into it.
- Cloud silhouettes: a second, 3D low-frequency noise on the coverage threshold (per step, at the cost of one more fbm) would make real cauliflower outlines; not tried for lack of budget.
- M1/M2 and Intel not measured; `low` was only checked to compile and render (3 steps, 1 octave).
- Plan 023's uncommitted camera work made two `scene.test.ts` cases fail while it was in progress (vessel centre of the camera); they passed in the final `bun run test`.

## Verification output

```
bun test packages/renderer/test/cloud-volume.test.ts   33 pass, 0 fail
bun run test                                           924 pass, 0 fail (105 files)
apps/web vitest                                        61 files, 498 tests passed
bun run typecheck                                      all packages exit 0; svelte-check 0 errors, 0 warnings
bun run build                                          done
bun run docs:check                                     OK (53 plans, 59 ADRs)
```

Processes started (static server, browser tab) were stopped; checked with `ps -Ao pid=,command= | grep -i "[c]37/serve"`.
