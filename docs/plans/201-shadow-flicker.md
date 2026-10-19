---
id: 201
title: Shadow flicker on the high preset
status: in-progress
owner: "Worker B"
depends: []
phase: 7
created: 2026-10-18
updated: 2026-10-19
---

# 201 — Shadow flicker on the high preset

## Goal

Shadows on the High preset no longer flicker near the pad. The shadow map is allocated once, the planet shader reads this frame's shadow matrix, and the quality governor stops bouncing between presets.

## Context

- rancangan §8b.11 (owner report, three likely causes in order).
- Research: `refs/reverse-engineering-ksp-ksp2/15b-presentation-release-audit-raw.md` §2 (graphics presets and the governor).
- Evidence:
  - `packages/renderer/src/quality-governor.ts`: drops resolution, then preset, below about 55 fps, and steps back up after calm.
  - `packages/renderer/src/environment.ts:232-261` (`settleShadowMap`): a preset change resizes the shadow map (4096 ↔ 2048) a few frames later; `map.setSize` reallocates the depth texture.
  - `packages/renderer/src/environment.ts:398`: the planet ground shader samples `shadow.map.depthTexture`.
  - `packages/renderer/src/environment.ts:417`: `shadowMatrix` is copied before three.js updates it for this frame.
- ADRs: 0053 (frame-budget governor).

## Scope

**In:**
- Allocate the shadow map once at the largest size of the player's chosen preset; the governor lowers shadow resolution through the viewport or the update rate, never by reallocating.
- Copy the planet shadow matrix after the shadow pass.
- Governor hysteresis: a longer calm period before stepping a preset up.
- Governor level and its changes shown in Debug → Info (plan 203). If 203 has not merged, log each change to the console with a `[governor]` prefix.

**Out:** the `nearSite` 300 m threshold (cause 3, unlikely per the photo); new graphics presets.

## Touches

- **Size:** S
- **Edits:** `packages/renderer/src/environment.ts`, `packages/renderer/src/quality-governor.ts`, `packages/renderer/src/presets.ts`, tests in `packages/renderer/test/`
- **Shared contracts:** none (a governor event the debug log may read, internal to the renderer).

## Design notes

Keep the depth texture object stable for the life of the renderer. A lower shadow budget renders into a sub-rectangle or skips frames; the shader's texel size uniform follows the sub-rectangle.

## Steps

1. Shadow map allocated once; governor uses viewport or update rate.
2. Shadow matrix copy moved after the shadow pass.
3. Hysteresis in the governor; governor events exposed (console until 203 is in).
4. Tests and a manual check note in the journal.

## Acceptance criteria

- [ ] `bun test packages/renderer` passes, including `test/preset-switch.test.ts` (extended): switching High → Medium → High keeps the same depth texture object and never calls `setSize` after start-up.
- [ ] `bun test packages/renderer` passes `test/quality-governor.test.ts` (extended): a frame-time trace that oscillates around 55 fps causes at most one preset change in 30 s.
- [ ] `bun test packages/renderer` passes `test/shadow-matrix.test.ts`: the matrix the planet uniform holds after a render equals the shadow camera's matrix of the same frame.
- [ ] `bun run check:affected --build --e2e e2e/smoke.e2e.ts` passes (Chromium; shaders compile).
- [ ] CI green on the `ready/201` tag (`refs/ci/pass/<sha>`, ADR 0126).
- [ ] [manual] On the M5 with High and "Adjust quality while playing" on, no flicker at the pad for 2 minutes.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/201-shadow-flicker.md` written.
- [ ] ADR 0053 consequences noted in the journal; a new ADR only if the governor contract changes.

## Log

- 2026-10-18 — Created from refs/rancangan-terpadu.md (release roadmap).
- 2026-10-19 — Worker B. The map is allocated at the first preset's size and only grows when the player raises the preset (the governor never goes above the player's choice). A lower preset keeps the map at its size: no viewport sub-rectangle (three's object shaders map the whole texture, so a sub-rectangle needs a patched shadow matrix for every material) and no skipped updates (a stale map with a moving floating origin is a flicker of its own). The shadow matrix is computed with `LightShadow.updateMatrices` after the light is placed, so the planet gets this frame's. The governor holds 30 s between preset changes (`presetDwellSeconds`) and waits 60 s of calm before a trial into the next preset up (`presetProbationSeconds`). Its last five changes show in Debug → Info ("Graphics changes"); each still goes to the debug log as before.
