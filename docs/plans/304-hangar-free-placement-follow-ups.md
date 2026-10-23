---
id: 304
title: "Hangar free placement follow-ups: plane handles, mirrored inner offsets, the root's own tilt and offset, e2e"
status: draft
owner: ""
depends: [279, 348, 357]
phase: 0
created: 2026-10-21
updated: 2026-10-24
---

# 304 — Hangar free placement follow-ups

## Goal

Finish what plan 279 left out of ADR 0258: the move gizmo has plane handles, the inner parts of a mirrored copy have their offsets reflected, the root part's own tilt and offset are no longer ignored, and the gizmo is covered by an e2e test.

## Context

- ADRs: 0258 (free placement; "As built" lists these leftovers), 0297 (plan 348: placement never moves the vessel), 0301 (plan 357: symmetry pivot, re-root through side links), 0071.
- Re-root is done: plan 348 added the Root tool (`apps/web/src/lib/editor/reroot.ts`), and plan 357 extended it through radial and surface links and parts with a tilt or an offset.
- Journal: `docs/journal/279-hangar-free-placement-and-surface-mount.md` (Not done).
- Code: `packages/core/src/design.ts` (the root is placed at `ROOT_PLACEMENT`, so its own tilt and offset are ignored), `apps/web/src/lib/editor/state.ts` (`setPlacement`, mirror copies), `apps/web/src/lib/editor/frames.ts` (`mirroredAcrossAxis`, plan 357), `packages/renderer/src/vab/gizmo.ts` (only the three axes `x`, `y`, `z`; `nearestGizmoAxis`).

## Scope

**In:**
- Plane handles (XY, YZ, ZX) on the move gizmo.
- Offsets of the inner parts of a mirrored sub-assembly copy reflected like the copy's root. First check whether plan 357's `mirroredAcrossAxis` already covers this; if it does, add a test and close the item.
- The root part's own tilt and offset: either resolve them (they turn and move the whole design frame) or refuse them in the editor, so a saved design never carries a value that is ignored.
- The e2e test of plan 279 (move a part 0.5 m with the gizmo, save, reload: same place). e2e is paused by the owner; write it, and run it only when the owner allows e2e again.

**Out:** Re-root (done, plans 348 and 357). New parts.

## Steps

1. Plane handles: pick by screen distance to the handle square, drag in the plane.
2. Mirrored inner offsets (check `mirroredAcrossAxis` first).
3. The root's own tilt and offset: resolve or refuse; record the choice in the Log, or an ADR if it changes the design format.
4. e2e test.

## Acceptance criteria

- [ ] `bun test packages/renderer`: a plane handle is picked by screen distance, and a drag on it moves a part in two axes at once.
- [ ] web vitest: a mirrored sub-assembly copy has its inner parts' offsets reflected.
- [ ] `bun test packages/core` or web vitest: a design whose root has a tilt or an offset either resolves with it applied and launches upright, or cannot be made in the editor.
- [ ] e2e: moving a part 0.5 m with the gizmo and saving reloads it at the same place (run when the owner allows e2e).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/304-hangar-free-placement-follow-ups.md` written.
- [ ] ADR 0258's "As built" note updated.
- [ ] New ADRs written for any decision made here, linked above.

## Log

- 2026-10-24 — Rewritten by the coordinator after an audit against main @ 4c546c02: re-root is done by plan 348 (ADR 0297, `editor/reroot.ts`) and extended by 357, so the ADR step is removed; plane handles, mirrored inner offsets, the root's own tilt and offset, and the e2e test (e2e paused by the owner) remain; depends add 348 and 357 (not 378: nested editing does not touch the gizmo).
- 2026-10-21 — Drafted from plan 279's leftovers.
