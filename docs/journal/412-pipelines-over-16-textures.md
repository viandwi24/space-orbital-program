# 412 — Pipelines over 16 sampled textures

**Plan:** [plans/412-pipelines-over-16-textures.md](../plans/412-pipelines-over-16-textures.md) · **Session:** Worker B, 2026-10-24 · **ADRs:** 0368

## What was done

| Where | What |
|---|---|
| `apps/web/scripts/probe-textures.ts` | hooks WebGPU: fragment textures per pipeline layout, pipelines created more than once, failed pipelines; `--gate` |
| `renderer/tsl/terrain.ts` | the fine and mid patches in one texture, a viewport each, no clear, an offset in the fetch |
| `renderer/tsl/lut-sky.ts`, `texture-pack-model.ts` | the transmittance and scattering tables in one 288 x 64 texture; the scattering baked apart and copied |
| `renderer/test/texture-pack.test.ts` | lookups stay in their own table, the halves, the budget |

## Findings

- It needs a pixel ratio of 2 (the owner's display): the governor then draws the half-size pass and its `planet-edge` variant, which reads the half-size target as the 17th texture. At a ratio of 1 the widest pipeline had 16 (`planet-full·high`).
- Only `planet-edge` really had 17. `ShadowMaterial`, `MeshLambertNodeMaterial` and `MeshStandardNodeMaterial` failed with "Invalid BindGroupLayout": three shares the object bind group layout, and the invalid one cascaded. Before the fix at DSF 2 the flight page showed four failed pipelines; after it, none, at Low, Medium and High, at ratios 1 and 2, and with the sample planet mod.
- `ShadowMaterial` is created 13 times with or without the failure: not a retry loop (plan 412 asked).
- The error predates plans 403 to 406 (checked at 99a4f004).
- After the fix, `planet-edge·high` has 15 textures, `planet-half·high` and `planet-full·high` 14 (16 and 16 before at ratio 1, 17 for the edge). Screens: `412-after-3km.jpg`, `412-after-60km.jpg`, `412-after-orbit.jpg` (ground, sky and clouds as before).
- A flight cell read p95 66 ms while the failure was on screen. Whether the failure caused the pad's 26 ms was not settled here: the machine's load was 8 to 9 when this landed.

## Not done

- The pad p95 at a ratio of 2 on a quiet M5 (load 3 or less), before and after: for Worker A's 410 table.
- Ultra and the WebGL path were not probed (the limit here is WebGPU's; WebGL's 16 units apply to the GLSL pass with about 13 samplers).
