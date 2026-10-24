---
id: 369
title: "Cached shadow maps for the static site"
status: done
owner: "Worker A"
depends: [363, 373, 384]
phase: 8
created: 2026-10-22
updated: 2026-10-24
---

# 369 — Cached shadow maps for the static site

## Goal

A ranked item from plan 363's research (`docs/research/frame-budget-and-efficiency.md` §5). The owner asked for efficient rendering and a playable frame rate on 2026-10-22.

When this is done, the site's still casters are drawn into the sun's shadow map only when the sun or the shadow frustum moves past a threshold, and the pad costs less GPU time with the same shadows.

## Context

- The sun's shadow map re-renders every caster every frame (`packages/renderer/src/environment.ts`), at 2048 or 4096 texels, with every part casting.
- Since ADR 0310 (plan 373) the sun always casts on WebGPU and a preset with shadows always has its shadow taps (`renderer-webgpu.ts` ~293), because three r186's shadow node drops its map when `castShadow` goes off. A cache must not toggle `castShadow`.
- Static casters:
  - each site's buildings are one mesh per site (ADR 0321, plan 384);
  - other home-planet sites have their own `SiteBuildings` (`environment.ts` ~231, `otherSite`);
  - moon stones are instanced near the camera and re-placed when the baked patch moves (`moon-stones.ts` ~83): static only between patch bakes.
- At the pad the sun moves by a fraction of a degree a minute.

## Scope

**In:** split casters into static (the site meshes, other sites in view) and dynamic (vessels, effects, moon stones unless the patch is unchanged); a cached static map.
**Out:** the vessel's own shadow quality.

## Steps

1. Measure the pad's GPU time with `measure-graphics.ts` and capture `capture-graphics.ts` before.
2. ADR: which casters count as static, the threshold, and how the dynamic casters join (a second, smaller map, or drawn over a copy of the cached one), within three r186's WebGPU shadow node.
3. Implement; warm any new shadow pipeline per preset at load (ADR 0310).
4. Measure after.

## Acceptance criteria

- [ ] GPU time at the pad (`measure-graphics.ts` pad scene) falls, before and after in the journal; `capture-graphics.ts` shadows unchanged.
- [ ] `measure-sunrise.ts` shows no pipeline compiled after load.
- [ ] `bun test packages/renderer` passes.
- [ ] `bun run typecheck` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` board row; journal; ADR for the cache.

## Log

- 2026-10-22 — Drafted by plan 363.
- 2026-10-24 — Rewritten by the coordinator after an audit against main @ 4c546c02: still valid; the plan 261 `castShadow` note replaced by ADR 0310 (the sun always casts, taps always built); static casters scoped to one mesh per site (ADR 0321), other sites and moon stones; depends adds 373 and 384.
- 2026-10-24 — Worker A: done by measurement. ADR 0357: the site's casters (23 meshes, ~190k triangles) cost about 0.1 ms of GPU time at the pad; a cache needs a per-frame depth copy that costs as much. Not built.
