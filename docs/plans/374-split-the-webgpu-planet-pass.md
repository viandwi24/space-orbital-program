---
id: 374
title: "Split the WebGPU planet pass so no pipeline is the whole planet"
status: draft
owner: ""
depends: [370]
phase: 8
created: 2026-10-23
updated: 2026-10-23
---

# 374 — Split the WebGPU planet pass so no pipeline is the whole planet

## Goal

The owner's Windows load (plan 370, 2026-10-23) spends 14.6 s compiling one pipeline: the planet pass's full fragment shader. It is about 180 KB of DXIL at `high` and 151 KB at `low`. Everything else compiles side by side in under 1.2 s each. No single pipeline should take more than a few seconds on D3D.

## Context

- `docs/research/shader-compile-windows.md` has the ablation, measured with Dawn's `tint` and Microsoft's `dxc` built on the Mac:
  - no terrain march: −29 % of the DXIL;
  - `low`: −16 %;
  - minimal: −38 %.
  - The rest is spread over the surface shading, the sky and the clouds.
- `packages/renderer/src/tsl/planet-pass.ts` (`compose`, modes full, half, edge, prepass, bake), ADR 0249, ADR 0308.

## Steps

- Decide in an ADR how to split the pass, for example:
  - the terrain march into its own pass, writing the hit distance and normal to a target the shading pass reads;
  - or the sky and clouds into a pass the ground composites over.
- Measure each new pipeline's DXIL with the `tint` + `dxc` proxy (target under 90 KB each), the GPU time at the pad and in orbit (`measure-graphics.ts`), and the picture before and after (`capture-graphics.ts`).

## Acceptance criteria

- [ ] No planet pipeline over 90 KB of DXIL at `high` (proxy), with screenshots unchanged.
- [ ] The owner's Windows log shows the world in under 8 s on a first load.

## Docs checklist

- [ ] STATUS row, journal, ADR for the split, research doc numbers.

## Log

- 2026-10-23 — Drafted from plan 370's Windows report.
