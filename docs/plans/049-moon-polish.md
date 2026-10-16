---
id: 049
title: "Moon polish: light on airless bodies, dust and plume light on the moon"
status: done
owner: "moon-polish session (Claude, 2026-10-17)"
depends: [044]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 049 — Moon polish

## Goal

A vessel on the moon is lit like a vessel on the pad (v1 must-fix of ADR 0048), a plume near the moon's ground kicks up dust and lights the ground, and the rest of the moon's polish (terrain shadows, stone geometry, a terrain kind per body) is drafted with reasons (plan 052).

## Context

- Plan 044, ADR 0054 (`MoonPass`, one height function); `journal/assets/044-moon-surface.png` (the vessel renders almost black). Cause: the sun colour came from the home planet's atmosphere model at the camera's altitude over the home planet, and the image-based light cube was captured around the home planet's vertical, so the vessel had no light but the direct sun and its shadow side was black (ADR 0058). `effects/system.ts` skipped every vessel whose SOI is not the first body.
- Research: [airless-lighting.md](../research/airless-lighting.md). ADR [0058](../decisions/0058-light-and-dust-on-an-airless-body.md).

## Scope

**In:** light on an airless body (`airless-light.ts`, the `uAirless` branch of the sky-env shader, exposure, white sun); dust, plume light and no smoke on any airless body with a ground (`Effects` takes a ground height per body); tests; screenshots; measured numbers.
**Out (draft 052):** terrain shadows from the baked patch, stones as geometry, a `terrain` kind on `BodyDefinition`. Radar altitude over the moon needed nothing: the sim's `terrain` function already gives the moon its own field (`sim.worker.ts`) and the snapshot carries `terrainHeight` for any body with a field (`snapshot.ts`).

## Steps

1. Research and ADR 0058. 2. `airless-light.ts`, environment (white sun, bounce and floor, exposure), `sky-env` branch, `EnvironmentLight`, scene and renderer plumbing. 3. Effects: ballistic particle pool per airless body, `vacuumDustRate`, plume light not dimmed by air, `groundHeight(body, direction)`. 4. Tests (`moon-effects.test.ts`). 5. Measure and shoot in the browser (production build, static server, built-in browser) against a build of HEAD. 6. Docs.

## Acceptance criteria

Metric: Rec. 709 luma (0.2126 R + 0.7152 G + 0.0722 B, 0 to 255) of the canvas pixels in a 10 x 10 patch at the projected centre of the upper tank of the stock two-stage vessel, camera 16 m from it, 1920 x 1080 ratio 1, `high`, sun at 35 degrees elevation, exposure settled; "sunlit" = mean of the three brightest of eight camera yaws, "shadow side" = mean of the three darkest.

- [x] **Sunlit side comparable to the pad:** moon sunlit luma between 0.8 and 1.5 times the pad's at the same sun elevation. Measured 206.2 against 141.6 (1.46); before the change 222.9 against 141.2.
- [x] **Shadow side dark but not crushed:** moon shadow-side luma at 35 degrees at least 40 and under half the sunlit side; at 8 degrees (low sun) at least 12. Measured 62.1 (0.30 of 206.2) and 17.6; before the change 23.3 at 35 degrees.
- [x] **Plume light and dust on the moon, no smoke:** a burning engine near the moon's ground fills the moon dust pool and lights the ground; the first body's smoke pool stays empty; no dust high above the ground; pool inside half the preset's smoke capacity on low. `moon-effects.test.ts` (9 tests), `journal/assets/049-moon-landing-dust.png`.
- [x] **Home-planet scenes unchanged:** `Environment.state.airless` is null at the home planet (test), the light-cube `up` is the planet's `uCamUp` there, the first body's smoke path is the same loop. Pad luma before/after 141.2 / 126.9 and 141.6 / 124.3 (sunlit / shadow side); image difference of the two pad screenshots, mean 4 of 255 per channel (animated clouds and water between frames).
- [x] **Frame budget (ADR 0053 amendment):** `high`, 1920 x 1080 ratio 1, benchmark of 90 frames: pad 11.66 ms (HEAD build 11.65 to 11.76), moon surface 4.75 ms, moon surface with a burning engine and dust 4.70 ms.
- [x] **Preset-switch hitch not worse than plan 048's:** a build of HEAD against a build of HEAD plus these changes, same session, same protocol: to low 31 to 57 (HEAD) and 28 to 37 (this), to medium 34 to 43 and 33 to 35, to high 44 to 45 and 33 to 43 (ms, `setPreset` plus first frame; the machine was busier than during plan 048, whose own numbers were 17 to 26; the GPU is shared with other sessions). No difference between the two builds beyond that noise.
- [x] **Screenshots:** `docs/journal/assets/049-moon-lander-sun.png`, `049-moon-low-sun.png`, `049-moon-landing-dust.png`, `049-moon-orbit.png`, and the before pair `049-before-moon.png`, `049-before-pad.png`, `049-after-pad.png`.
- [x] All repo checks (see the journal).

## Docs checklist

- [x] STATUS, journal 049, ADR 0058 and the ADR index, research, draft 052.

## Log

- 2026-10-17 — Created as draft from plan 044 (found, not done).
- 2026-10-17 — Orchestrator review of plan 044 screenshots: the vessel on the moon surface renders almost black (`044-moon-surface.png`) — part lighting/environment light on airless bodies is wrong. This is a v1 must-fix (ADR 0048), together with plume light/dust on the moon; the rest of this plan stays polish.
- 2026-10-17 — Refined draft → ready at the human's request (session: moon-polish session).
- 2026-10-17 — Started (moon-polish session). The terrain-shadow, stones and terrain-kind items moved to draft 052; radar over the moon already works (the sim gives each body its own field).
- 2026-10-17 — Done. Evidence in the acceptance criteria above and journal 049: sunlit 206.2 against the pad's 141.6, shadow side 62.1, dust and plume light on the moon, the pad unchanged, pad 11.66 ms, moon 4.75 ms, no hitch change against a build of HEAD.
