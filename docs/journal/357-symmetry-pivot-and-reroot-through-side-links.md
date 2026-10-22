# 357 — Symmetry pivot and re-rooting through side links

**Plan:** [plans/357-symmetry-pivot-and-reroot-through-side-links.md](../plans/357-symmetry-pivot-and-reroot-through-side-links.md) · **Session:** hangar 348 follow-up session (Claude) · **Date:** 2026-10-22 · **ADR:** 0301

## What was done

- `apps/web/src/lib/editor/frames.ts`: poses relative to the design root, `relativePose`, `turnedAboutAxis`, `mirroredAcrossAxis`, and the two fits from a pose to a link: `stackLinkOnto` (tilt and offset on a stack link) and `surfaceLinkOnto` (point, normal, tilt, and an offset when an anchor point is used).
- Symmetry pivot: `SymmetrySpec.pivot` (`parent` | `vessel`); `planAttachAssembly(…, parts)` builds the copies about the vessel axis in `vesselCopies` (first copy as today, the others turned or mirrored about the root's axis, each on the vessel part its node touches, nearest surface first; a copy touching nothing is left out). A parent on the vessel axis uses the parent path, so both pivots give the same design there. The scene's ghost and `attachNew`/`attachAssembly` pass the part lookup.
- Hangar: `symmetryPivot` state, carry key `symmetryPivot` (F) while a part is held (F still frames the vessel with nothing held), a Parent/Vessel toggle on the pill in the Place tool (`tool-pivot`), and "×n about the parent / vessel axis (F)" in the context chip (`context-pivot`). The Carrying sheet of the keys overlay lists F.
- `editor/reroot.ts` takes the staging content now. Stack links are turned with the inverse tilt and the offset re-expressed; radial and surface links become surface links of the old parent on the old child's touch point, by a free node of the old parent, with a tilt and an offset. The result must resolve and every pose must match seen from the new root (1e-6), else `path`. New reasons `connector`, `tipped`, `separator`, each with its own Hangar notice.

## What surprised me

- The first booster test failed for a reason the plan did not foresee: the core tank has both nodes taken (stack above and below), so it has no node to hang on the decoupler by. Looking further, even with a free node it would be wrong: the sim separates by node name and the stock radial decoupler cuts at `radial`; as a surface host it would hold the tank on `surface` and never let the booster go. The re-root now refuses that (`separator`), and the inverse link that would allow it is draft 358.
- The tilt of a reversed stack hop lands one part further down the path than intuition says: with tank 1 yawed on the pod, after the re-root the pod carries the inverse turn, not tank 1.

## Verification output

```
$ bunx vitest run src/lib/editor/symmetry-pivot.test.ts src/lib/editor/reroot.test.ts
 Test Files  2 passed (2)
      Tests  15 passed (15)
$ CI=true bunx vitest run src/lib/editor src/lib/vab src/lib/keybindings.test.ts
 Test Files  36 passed (36)
      Tests  330 passed (330)
```

Typecheck, docs check and build: see the plan's Log.

## Open questions

- A booster on a radial decoupler as the root: draft plan 358 (a core link kind).
- With the vessel pivot, a copy that touches nothing is silently left out; the context chip shows the count asked for, not the count placed (the ghost shows the truth).
