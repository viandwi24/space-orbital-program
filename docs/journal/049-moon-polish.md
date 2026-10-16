# 049 — Moon polish

**Plan:** plans/049-moon-polish.md · **Session(s):** moon-polish session (Claude, 2026-10-17) · **Date:** 2026-10-17 · **ADRs:** [0058](../decisions/0058-light-and-dust-on-an-airless-body.md) · **Research:** [airless-lighting.md](../research/airless-lighting.md)

## What was done

| Where | What |
|---|---|
| `renderer/src/airless-light.ts` (new) | pure: sun fade at the horizon, regolith bounce (albedo 0.135 x irradiance x sin(elevation) / PI), sky floor (1.2e-2 of sun / PI, blue-white), `AIRLESS_EXPOSURE` 0.6 |
| `environment.ts`, `environment-light.ts`, `shaders/sky-env.glsl.ts`, `scene.ts`, `renderer.ts` | with the active vessel in an airless body's sphere: white sun, exposure x 0.6, light cube = two-value dome round that body's vertical (a `uAirless` branch of the existing shader: no new program), `state.airless` / `state.up`, env key |
| `effects/system.ts`, `effects/particles.ts` | a pool per airless body with a ground (half the smoke pool), ballistic step (no drag, no lift, the body's gravity), `vacuumDustRate`, the plume's ground light not dimmed by air, `groundHeight(body, direction)`; first body's smoke unchanged |
| `test/moon-effects.test.ts` | 9 tests |

## Method of the numbers

Production build of the working tree (`NODE_ENV=development vite build`, so `__orbital` exists), served by a small Bun static server (with a POST endpoint that writes canvas PNGs to the scratchpad), built-in browser pane, canvas forced to 1920 x 1080 ratio 1, rAF stubbed, `high`. The moon scenes are synthetic snapshots: the live pad snapshot with the vessel moved to a moon-relative position (sun elevation set by choosing the direction, ground height read back from the baked patch so the vessel stands on the ground), parts rotated with it. Metric as in the plan. Comparison with the old behaviour from a second build of HEAD in a git worktree, same session. The first measurements were of the working tree, which also held plan 037's unfinished cloud work; the numbers in the plan are from a build of HEAD plus only these changes.

## Results

| | before (HEAD) | after |
|---|---|---|
| vessel, sunlit side, 35 deg sun | 222.9 | 206.2 |
| vessel, shadow side, 35 deg | 23.3 | 62.1 |
| vessel, shadow side, 8 deg | - | 17.6 |
| pad sunlit / shadow | 141.2 / 126.9 | 141.6 / 124.3 |
| pad frame (benchmark 90, 1920 x 1080) | 11.65 | 11.66 |
| moon surface frame | - | 4.75 (4.70 with dust) |

Preset switches (setPreset + first frame), HEAD against HEAD plus this, same session, noisy machine: to low 31-57 against 28-37, medium 34-43 against 33-35, high 44-45 against 33-43. Plan 048's numbers (17-26 to low and medium) were from a quieter machine; my first HEAD run in this session gave 17 to low and later ones 31 to 57.

## What surprised me

- **The old moon vessel was not dark everywhere.** At a 35 degree sun the old build lit the sunlit side fine (223) and the shadow side at 23: the "almost black" of the 044 screenshot is the shadow side seen from the sun-behind camera. The cause is as ADR 0058 says: no light but the direct sun.
- **Measure in the same units as the renderer.** `Renderer.project` is in the renderer's own pixel size; the first patches missed the vessel when the canvas size differed from its layout size.
- **Ground height under the vessel matters for synthetic moon scenes**: at the first spot the ground was 21 m above the reference plain, which buried the vessel and produced a "lit equals shadow" reading.
- **Bounce is cheap but the exposure is a choice.** An unattenuated sun makes a white vessel 1.4 times the pad's luma; exposure 0.6 trades that against the regolith, which looks dark (ground luma about 60 at 35 degrees); `AIRLESS_EXPOSURE` is one constant.
- A `$VAR` holding several paths is not split in zsh: `git diff -- $F` printed nothing and my first "HEAD plus my changes" build was HEAD.
- Another session's uncommitted work in the renderer (plan 037) changes `planet.ts`, `presets.ts` and the planet shader; measuring the working tree mixes it in.

## Open questions / follow-ups

- Draft 052: terrain shadows, stones as geometry, a terrain kind per body.
- The dust uses the smoke billboard shader (soft puffs); a flatter, streakier look for a vacuum sheet would be nicer.
- Regolith albedo and exposure are by eye; a human pass on a calibrated display is worth doing.
- Radar over the moon already works (sim's per-body terrain field); not tested in a browser here.
