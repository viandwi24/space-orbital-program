---
id: 084
title: "Sites in the world: a terrain seed per world and a list of flat zones"
status: in-progress
owner: "Agent 2"
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

- [ ] `packages/core` test: the Legacy world's height function equals the pre-change function at 10 000 random directions (max difference 0).
- [ ] `packages/core` test: a second zone at latitude 30 is flat within its radius (height difference under 0.01 m) and blends to the noise at its rim.
- [ ] `packages/sim` test: `load-vessel` with `{ site: "legacy", pad: 0 }` places the vessel where today's default does.
- [ ] Renderer parity: the baked ground matches `heightAt` within the bounds of journal 031 with two zones.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/084-sites-in-the-world-terrain-seed-and-flat-zones.md` written.
- [ ] `docs/architecture/simulation.md` (terrain), `overview.md` (site), ADR if the zone limit needs one.
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0097, 0043).
