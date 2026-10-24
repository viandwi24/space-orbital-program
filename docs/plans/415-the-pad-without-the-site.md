---
id: 415
title: "The pad without the launch site at 120 Hz: the vessel, the ground and the planet pass near the ground"
status: in-progress
owner: "Worker A"
depends: [398, 410]
phase: 9
created: 2026-10-24
updated: 2026-10-24
---

# 415 — The pad without the launch site

## Goal

Pad mean frame at most 8.3 ms on the M5 at High with the launch site counted (once plan 414 lands its part). This plan owns the 3.6 ms the pad costs over orbit with the whole site off: the vessel, the ground (the mesh terrain of plan 398 and the march) and the planet pass near the ground.

## Context

- Worker B, headed (refs/graphics-v2/07-look-costs.md): with the whole site off the pad takes 11.6 to 12.3 ms, orbit 8.3 ms. Shadows, terrain toggles and clouds were within noise.
- Candidates (coordinator): the mesh's patch count and LOD distances at the pad (398 measured the mesh 1 to 2 ms over the march there); the march still running where the mesh covers the ground; the planet pass sky and haze near the ground; the vessel's materials and shadow casting.
- Code: `packages/renderer/src/tsl/{planet-pass,terrain-mesh}.ts`, `terrain-mesh-model.ts`, `parts/`; ADR 0371.

## Steps

1. Break the 3.6 ms down with per-pass GPU timestamps, headed, under the named measuring flag (taking turns with Worker B).
2. Fix what dominates.
3. `perf:gate` on a production build; before and after screens; merge first.

## Acceptance criteria

- [ ] The breakdown in the journal (ms per pass: planet, mesh prepass, vessel, shadow, post).
- [ ] The pad's mean frame lower by the measured fix, reported against 8.3 ms.
- [ ] `bun test packages/renderer`, `typecheck`, `lint`, `docs:check`; `probe-textures --gate`; compiled in play 0.
- [ ] `perf:gate` table in the journal. [manual: M2 and Windows]

## Docs checklist

- [ ] `docs/STATUS.md`, `docs/journal/415-the-pad-without-the-site.md`, an ADR if the design changes.

## Log

- 2026-10-24 — Created by the coordinator; Worker A.
