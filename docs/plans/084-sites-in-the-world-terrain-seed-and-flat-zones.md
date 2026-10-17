---
id: 084
title: "Sites in the world: a terrain seed per world and a list of flat zones"
status: in-progress
owner: "Agent 1 (measure)"
depends: [077]
phase: 4
created: 2026-10-17
updated: 2026-10-17
---

# 084 — Sites in the world: a terrain seed per world and a list of flat zones

## Goal

Sites are world data and the terrain no longer depends on one launch site: the height function is generated from the world seed, flat zones come from the sites list, the sim places vessels at a site's pad, and the Legacy world reproduces today's heights exactly.

## Context

- ADRs: 0097, 0043, [0142](../decisions/0142-sites-terrain-seed-zones-and-placement.md) (written here)
- Read: ADR 0097 points 1 and 2, ADR 0043, 0030, 0067, `packages/core/src/terrain.ts` (`createTerrainField({ radius, latitude, longitude })`, biome map cache per site), `planet-map.ts`, renderer site placement (`SceneModel.lockLaunchSite`).

## Scope

**In:**
- `Site` type and schema; `sites` in the world fields with the Legacy site at (0, 0), 5 km.
- `createTerrainField({ seed, zones })`; biome map cache keyed by seed; flat zones blended from the list.
- Sim `load-vessel` placement `{ site, pad }` resolved to body-fixed coordinates.
- Renderer: site meshes placed from the site's coordinates, not from the first vessel near the ground.
- GLSL twin of the zone list (a small uniform array, at most 8 zones) for the planet and ground passes.

**Out:** buildings (090), site choice UI (092).

## Touches

- **Size:** M
- **Edits:** `packages/core/src/terrain.ts`, `packages/core/src/planet-map.ts`, `packages/sim/src/terrain.ts`, `packages/sim/src/commands.ts`, `packages/renderer/src/site.ts`, `packages/renderer/src/scene.ts`, `packages/renderer/src/shaders`, `apps/web/src/lib/flight-loop.ts`
- **Shared contracts:** **core types (`Site`, terrain field options), save (sites), protocol (`load-vessel` placement by site)**

## Design notes

Keep the Legacy path bit-identical: same noise salts, same zone; a regression test samples 10 000 directions against today's function.

## Steps

1. Golden samples of today's height function.
2. Seed and zone list in core; Legacy reproduction test.
3. Sim placement by site.
4. Renderer site placement and GLSL zones; GPU against CPU parity (journal 031 method).

## Acceptance criteria

- [x] `packages/core` test: the Legacy world's height function equals the pre-change function at 10 000 random directions (max difference 0).
- [x] `packages/core` test: a second zone at latitude 30 is flat within its radius (height difference under 0.01 m) and blends to the noise at its rim.
- [x] `packages/sim` test: `load-vessel` with `{ site: "legacy", pad: 0 }` places the vessel where today's default does.
- [x] Renderer parity: the baked ground matches `heightAt` within the bounds of journal 031 with two zones.
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/084-sites-in-the-world-terrain-seed-and-flat-zones.md` written.
- [x] `docs/architecture/simulation.md` (terrain), `overview.md` (site), ADR if the zone limit needs one.
- [x] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0097, 0043).
- 2026-10-17 — Claimed by Agent 2 (Dev B, M2). Golden samples first, then ADR 0142, core seed and zones, `Site`, sim placement by site, renderer zones and seed shift, web wiring, docs. Verification on the M2, rebased on `origin/main` after the 081 merge:
  - `bun test packages/core/test/terrain-legacy.test.ts` — 2 pass: 10 000 heights equal the pre-084 function (first 200 max difference 0, SHA-256 of all 10 000 float64 equal), biome maps at 256, 512, 1024 byte-identical; `sites.test.ts` adds the Legacy lake levels (SHA-256 equal).
  - `bun test packages/core/test/sites.test.ts` — 10 pass: a second zone at latitude 30 is flat within its radius (worst 0 m, under 0.01), between 0 and the free terrain half-way through the blend (below it in over half of 64 bearings), equal to it 500 m past the rim; seed shift 0 for Legacy; 9 zones refused.
  - `bun test packages/sim/test/sites.test.ts` — 3 pass: `{ site: "legacy", pad: 0 }` gives the default placement's position and orientation exactly; unknown site and pad refused; a base at latitude 30 places the vessel on its pad on flat ground (`terrainHeight` 0).
  - Renderer parity (`e2e/terrain-parity.e2e.ts`, dev build on port 5211, Chromium/SwiftShader): mid patch mean 0.130 m and worst 1.304 m for Legacy, 0.132 and 1.304 m with a second zone (same 1 000 texels); fine patch 0 (inside the pad's zone); the second zone flat on the GPU (0 m over 10 texels, 45.7 m of relief there before). SwiftShader's worst is above the M5's 0.806 m of journal 031 for both terrains alike; Agent 1 may rerun the test on the M5.
  - `bun test ./packages`, `./mods`, `./examples` — 1312, 84, 7 pass, 0 fail (1319, 85, 7 after rebasing onto the 083 merge); `bunx vitest run` (apps/web) — 889 passed, 2 failed in `sim-host-script-worker.test.ts` (as on `origin/main` on this M2); `bun run typecheck` — 0 errors (after a branded-id fix in the sim test); build ok; `bun run docs:check` — OK; smoke Chromium — 6 passed (3.6 m).
  - `API_VERSION` 0.1.33 (095, 081 and 083 took 0.1.30 to 0.1.32).
- 2026-10-17 — Merge by Agent 1 (M5): rebased on `main` @ c385dcb (clean). `bun run test` 1411 pass, 0 fail · web vitest 101 files, 891 passed · typecheck exit 0 · build exit 0 · docs:check OK · Chromium smoke 6 passed (2.6m). Terrain parity on the M5 (dev build served on 5202, `E2E_DEV_HOOKS=1`): 1 passed (1.3m), the same numbers as the M2 (Legacy mid mean 0.1300 m, two zones 0.1324 m, worst 1.304 m both, second zone 0 m on the GPU).
- 2026-10-17 — Frame budget (checklist step 6, renderer changed), `debug.benchmark(120)` minimum of 5, production-like dev builds of `main` (base) and this branch (after), pad, 500 × 900 at DPR 2, governor off, second page load: **`medium` 7.21 → 7.34 ms** (+0.13 ms, both runs with the pane visible). **`high`: after 14.92 ms with the pane visible; the base `high` runs were taken with the pane hidden (13.03 / 15.53 ms, discarded by the journal 039 rule)**. Merged to unblock 090, 068 and 092; owner `Agent 1 (measure)` until the `high` pair is retaken with the window in view.

