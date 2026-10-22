---
id: 357
title: "Hangar: symmetry about the parent or the vessel axis (F), and re-rooting through radial and surface links"
status: done
owner: "hangar 348 follow-up session (Claude, 2026-10-22)"
depends: [348]
phase: 7
created: 2026-10-22
updated: 2026-10-22
---

# 357 — Symmetry pivot and re-rooting through side links

## Goal

The two KSP editor features plan 348 left out (ADR 0297, research `research/ksp-editor-placement.md`):

1. While placing a part, F switches the symmetry pivot between the parent part's axis (today's only behaviour) and the vessel's centre axis, as KSP does. The pill and the context chip show which.
2. The Root tool may pass through radial and surface links, and through parts with a tilt or an offset: every link on the path is written again from the other part's side, so that every part keeps its place and turn.

## Context

- ADR 0301 (this plan's decisions); ADR 0297 (plan 348), ADR 0207 (symmetry, mirror), ADR 0235 (surface links), ADR 0258 (tilt and offset)
- `apps/web/src/lib/editor/state.ts` (`planAttachAssembly`, `SymmetrySpec`), `apps/web/src/lib/editor/reroot.ts`, `packages/core/src/design.ts` (`placeStack`, `placeSurface`, `withOffset`)
- `apps/web/src/lib/vab/controller.svelte.ts`, `ToolPill.svelte`, `BuildContext.svelte`, `apps/web/src/lib/keybindings.ts`

## Scope

**In:** `SymmetrySpec.pivot` (`parent` | `vessel`) for ×2–×8 and mirror on a radial or surface target; a carry key `symmetryPivot` (F) and a pill toggle; a pure pose-to-link helper `editor/frames.ts`; `reroot` through stack links with tilt/offset, radial links and surface links, with a pose check that refuses what does not come out the same.
**Out:** e2e (skipped on the owner's instruction); a vessel-level orientation so that a re-root to a part turned about the vertical keeps the vessel's heading in the Hangar (the design has none: the vessel turns about its axis, ADR 0301 point 5); re-rooting through struts and fuel lines.

## Design notes

See ADR 0301. A copy about the vessel axis is the first copy's pose turned about the root's +Y axis (or reflected across the root's YZ plane for a mirror); it hangs by a surface link on whatever vessel part its attach node touches, and a copy that touches nothing is left out. A reversed link is a stack link (tilt inverted, offset re-expressed) or a surface link with tilt and, when the old parent's node is away from the new parent, an offset.

## Steps

1. Plan, ADR 0301, claim in the shared notes.
2. `editor/frames.ts`: poses, `stackLinkOnto`, `surfaceLinkOnto`. Tests through the two features.
3. `SymmetrySpec.pivot`, `planAttachAssembly(…, parts)`; scene preview and attach pass the lookup. Tests in `symmetry-pivot.test.ts`.
4. Controller `symmetryPivot`, carry key F, pill toggle, context chip, keys sheet.
5. `reroot(design, index, parts)` rewrite; tests in `reroot.test.ts`; controller notices by reason.
6. Docs, checks, commit, push.

## Acceptance criteria

- [x] `cd apps/web && bunx vitest run src/lib/editor/symmetry-pivot.test.ts` passes: about a part on the vessel axis both pivots give the same design; ×2 about the vessel on a side booster puts the copy on the opposite booster, turned 180 degrees about the vessel axis (positions and rotations within 1e-6); the same with the parent pivot keeps both copies on one booster; a copy that would touch nothing is left out; a mirror about the vessel lands reflected across the vessel's YZ plane on the other booster.
- [x] `cd apps/web && bunx vitest run src/lib/editor/reroot.test.ts` passes: the stack case of plan 348; a fin on the side of a tank becomes the root (a radial link turned round) and every part keeps its pose relative to it; the same through a surface link; through a tilted and moved stack part; a tipped new root, a connector on the path, a side link with no free node, and a radial decoupler (`separator`, see the Log) are refused.
- [x] `cd apps/web && bunx vitest run src/lib/editor src/lib/vab src/lib/keybindings.test.ts` passes.
- [x] `bun run typecheck`, `bun run docs:check`, `bun run build` pass.

## Docs checklist

- [x] ADR 0301, indexed.
- [x] `docs/STATUS.md` board row, journal `docs/journal/357-symmetry-pivot-and-reroot-through-side-links.md`.
- [x] Keys: the Carrying sheet in `keybindings.ts` lists F.
- [x] Research note `research/ksp-editor-placement.md`: the follow-up section.
- [x] Draft plan 358 for what is refused (board row).

## Log

- 2026-10-22: written.
- 2026-10-22: the acceptance criterion's booster case changed while implementing: the stock radial decoupler separates at its own `radial` node and the sim separates by node name, so turning its side link into a surface link would leave a decoupler that never lets go (and the core tank had no free node anyway). It is refused as `separator` (ADR 0301 point 4); the radial case is tested with a fin on a tank instead; an inverse side link is draft 358.
- 2026-10-22: done. symmetry-pivot 6 and reroot 9 tests pass; editor, vab and keybindings vitest 36 files, 330 tests pass; `bun run typecheck` exit 0 (svelte-check 2214 files, 0 errors); dev Hangar: the pill shows Parent, F while placing a fin with ×2 turns it to Vessel and the chip reads "×2 about the vessel axis (F)"; the Root tool on a booster gives the separator notice.
