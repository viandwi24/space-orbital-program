# 0373 — The site's floodlights are drawn glow, not lights; a small fixed pool of lamps

**Status:** accepted
**Date:** 2026-10-25
**Plan:** plans/414-pad-at-120hz.md
**Builds on:** ADR 0372 (vegetation levels of detail), ADR 0310 (nothing compiles in play), the roadmap brief's "Graphics and playability together"

## Context

Measured headed on the M5, one real point light costs the pad about 0.4 to 1.4 ms: every lit material loops over every light in the scene, at intensity 0 as well, and a light's count is in the shader's key. The scene held 11 lights by day: the site's four floodlights, three plume cluster lights and four vessel lamps. No point or spot light casts a shadow (only the sun does), so the cost is the light loop. Hiding the floods by day was tried and dropped: the night variants of the lit materials were not built by the warm-up, and dusk compiled 48 pipelines.

## Decision

1. **The site holds no light.** Each mast bank's floodlight is drawn: a cone of additive glow from the lamp down and a pool of additive light on the pad and the grass, one `MeshBasicMaterial` whose opacity follows the hour (`setLamps`). It is drawn at opacity 0 from the load, so its pipeline exists and dusk compiles nothing. The planet pass still lights the ground with the floods analytically (`FLOOD_LIGHT_INTENSITY`), and the lit windows and lamp heads were already emissive.
2. **The lights that remain are a fixed pool**, constant in number and present from the load: two vessel lamps (`LAMP_BUDGET`, from 4) and two plume cluster lights (`CLUSTER_LIGHTS`, from 3), at intensity 0 when unused. The scene holds 4 lights, from 11.
3. **Checks**: `test/light-pool.test.ts` (the site holds no light at any hour, the glow is drawn all day, the lamp pool keeps its lights); `apps/web/scripts/probe-dusk.ts` moves the sun from the day to below the horizon and fails if any pipeline is built (0 built here, and 0 on the build before).

## Consequences

- Pad mean frame, interleaved on the M5, headed, 4 pairs: 19.7 ms before (17.6 to 23.9) and 16.8 ms after (16.0 to 18.5); frames over 16.7 ms 62 % to 44 %. A first, dimmer-glow build read 24.3 against 16.6.
- At night the pad is lit by glow instead of light: the warm pool on the pad and the grass and the cones from the lamps, and no longer the warm shading of the tower and the buildings. The owner should judge the look (journal 414, `414-pad-night.jpg` against `414base-pad-night.jpg`).
- A vessel at night has two lamps and two cluster lights, not four and three.
