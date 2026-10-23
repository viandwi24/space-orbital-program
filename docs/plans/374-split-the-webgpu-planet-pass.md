---
id: 374
title: "Split the WebGPU planet pass so no pipeline is the whole planet"
status: draft
owner: ""
depends: [370]
phase: 8
created: 2026-10-23
updated: 2026-10-24
---

# 374 — Split the WebGPU planet pass so no pipeline is the whole planet

## Goal

The owner's Windows load (plan 370, 2026-10-23) spent 14.6 s compiling one pipeline: the planet pass's full fragment shader, then about 180 KB of DXIL at `high` and 151 KB at `low`. Everything else compiled side by side in under 1.2 s each.

When this is done, no planet pipeline takes more than a few seconds on D3D.

## Context

- `docs/research/shader-compile-windows.md`: the ablation with Dawn's `tint` and Microsoft's `dxc` built on the Mac (no terrain march −29 % DXIL, `low` −16 %, minimal −38 %), and "Next, if the Windows report still shows long compiles" (~108–113).
- Journal 370, open questions: the owner's second-load log (does Chrome's shader cache cut the 20 s?) and a first-load log with the boot preset (ADR 0308 point 8) are still missing.
- `packages/renderer/src/tsl/planet-pass.ts`: one `graph(mode)` builds every mode (~2600; full, half, edge, prepass, bake); `marchTerrain` ~1480. ADR 0249, ADR 0308.
- The DXIL numbers predate the moon pass's growth: c9dcdb1d (small-body terrain), 803ac57f and 3b2ec834 (body appearance, plan 381).

## Scope

**In:** the planet pass's split, if the owner's next Windows log still shows it on the critical path.
**Out:** the scaled-space and sky-map bakes; the boot preset (ADR 0308).

## Steps

1. Gate: read the owner's next Windows log (boot `low`, and a second load). If the world shows in under 8 s on a first load, close this plan with the numbers.
2. Re-measure each planet and moon pipeline's DXIL with the `tint` + `dxc` proxy.
3. ADR for the split, for example:
   - the terrain march in its own pass, writing hit distance and normal to a target the shading pass reads;
   - or the sky and clouds in a pass the ground composites over.
4. Implement; measure DXIL, GPU time at the pad and in orbit (`measure-graphics.ts`), and the picture (`capture-graphics.ts`).

## Acceptance criteria

- [ ] No planet pipeline over 90 KB of DXIL at `high` (proxy), with `capture-graphics.ts` screenshots unchanged.
- [ ] The owner's Windows log shows the world in under 8 s on a first load. [manual: the owner's PC]
- [ ] `bun test packages/renderer`, `bun run typecheck` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` row; journal; ADR for the split; research doc numbers.

## Log

- 2026-10-23 — Drafted from plan 370's Windows report.
- 2026-10-24 — Rewritten by the coordinator after an audit against main @ 4c546c02: still valid; gated on the owner's next Windows log (boot low, second load); DXIL to be measured again since the moon pass grew; line references updated.
