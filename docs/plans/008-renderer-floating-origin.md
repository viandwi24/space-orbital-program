---
id: 008
title: "Renderer: floating origin"
status: draft
owner: ""
depends: [003]
phase: 1
created: 2026-10-16
updated: 2026-10-16
---

# 008 — Renderer: floating origin

## Goal

`@orbital/renderer` draws a snapshot with Three.js: a sphere for the home body, placeholder meshes for parts (box/cylinder from part dimensions), a camera that follows the active vessel, floating origin re-centring, logarithmic depth buffer, and a map-view mode that draws the orbit line from `OrbitalElements`. It never mutates sim state.

## Context

- Read: `docs/architecture/units-and-frames.md` (floating origin, +Y up), `simulation.md` (snapshot shape).
- ADRs: 0003, 0007.
- Before coding: verify current Three.js docs online for `WebGLRenderer({ logarithmicDepthBuffer })`, `Line2`/`LineSegments` for orbit lines, and GLTF loading (for later). Record in research.

## Scope

**In:** the above; a tiny headless-ish test strategy (renderer math — origin shifting, orbit sampling — in pure functions tested in Bun; Three objects tested in the browser only via plan 009's manual check).
**Out:** real art, terrain, atmosphere scattering, post-processing.

## Steps

1. `src/origin.ts` (pure: given camera anchor & threshold → shift), `src/orbit-line.ts` (pure: sample elements → points).
2. `src/scene.ts` (Three scene, body, vessel meshes, camera rig), `src/map.ts`.
3. Tests for pure parts; journal.

## Acceptance criteria

- [ ] `bun test packages/renderer` passes: origin shift triggers only beyond threshold and keeps relative positions exact (within 1e-9) after shift; orbit sampling of a circular orbit yields points at constant radius within 1e-6.
- [ ] `grep -rn "@orbital/sim" packages/renderer/src` returns nothing (renderer depends on `core` types only).
- [ ] `bun run typecheck`, `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md`, journal, research (Three.js), `architecture/units-and-frames.md` if thresholds changed.

## Log

- 2026-10-16 — Created as draft.
