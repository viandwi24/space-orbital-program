---
id: 358
title: "An inverse side link, so a booster on a radial decoupler can become the root"
status: draft
owner: ""
depends: [357, 378]
phase: 7
created: 2026-10-22
updated: 2026-10-24
---

# 358 — Inverse side link for the re-root

## Goal

Plan 357 (ADR 0301 point 4) re-roots through side links by writing them as surface links on the old child (`apps/web/src/lib/editor/reroot.ts`). It refuses a booster on a radial decoupler: the decoupler separates at its `radial` node, and a surface link would host the core tank on the decoupler's `surface` instead, so staging would no longer let the booster go; and the core tank usually has no free node to hang by.

When this is done, a design can store a link where the child touches the parent's node with its own surface, and the Root tool uses it, so a booster on a radial decoupler can become the root and still stage.

## Context

- ADR 0301, ADR 0034 (radial links), ADR 0235 (surface links), ADR 0297 (placement), ADR 0315 (nested editing).
- `packages/core/src/design.ts`: `DESIGN_FORMAT_VERSION = 4` (~33), `placeStack`, `placeRadial`, `placeSurface`; no inverse placement yet.
- `packages/sim/src/vessel.ts` (`splitVessel` by node name).
- `apps/web/src/lib/editor/reroot.ts` (`surfaceLinkOnto`, the refusals), `frames.ts`, `state.ts`, `scene.ts`, `checks.ts`, `missions.ts`; `apps/web/src/lib/vab/controller.svelte.ts`, `placement-pick.ts`; `packages/renderer/src/vab/` (`picking.ts`, `highlight.ts`, `view.ts`).

## Scope

**In:** a link kind with `parentNode` a real node and `node` `"surface"`, the point and normal in the child's frame, and a tilt for the twist: validation, placement (`placeInverse`), the design format bump 4 → 5 with old designs still loading, the sim attachments (the decoupler keeps `radial`), every reader of the child's node; `reroot` uses it for side links.
**Out:** anything else in the Root tool.

## Steps

1. ADR for the link kind and the format version 4 → 5.
2. Core: validation and `placeInverse`; old designs load unchanged; tests.
3. Sim: separation of a booster rocket re-rooted on a booster, headless.
4. Editor: `reroot`, and every reader of the child's node, including nested editing (plan 378, ADR 0315), Hangar placement (b995cd4d, ADR 0297) and symmetry about the parent (1e504195, plan 357); tests.

## Acceptance criteria

- [ ] `bun test packages/core` passes a test placing a part on an inverse link at the pose a radial link gives the other way round, and a format 4 design still loads.
- [ ] `bun test packages/sim` passes: the booster rocket re-rooted on a booster stages, and the core separates from the booster.
- [ ] `cd apps/web && bunx vitest run src/lib/editor/reroot.test.ts` passes with a booster on a radial decoupler as the new root.
- [ ] `bun run typecheck`, `bun run docs:check`, `bun run build` pass.

## Docs checklist

- [ ] ADR, `docs/STATUS.md` row, journal, the design format notes in `docs/architecture/`.

## Log

- 2026-10-22: drafted from plan 357.
- 2026-10-24 — Rewritten by the coordinator after an audit against main @ 4c546c02: still valid; `reroot.ts` still refuses and writes surface links, no `placeInverse`; states the format bump 4 → 5; the reader step adds nested editing, placement and symmetry; depends adds 378.
