# 217 — Hangar: carry loop, symmetry, rotation, turntable camera

**Plan:** [plans/217-hangar-carry-loop.md](../plans/217-hangar-carry-loop.md) · **Session:** Worker A, 2026-10-19 · **ADRs:** [0221](../decisions/0221-hangar-carry-details.md), [0207](../decisions/0207-hangar-interaction-model.md) · **Research:** 02 §2–5, 05 §2

## What was done

| Where | What |
|---|---|
| `apps/web/src/lib/editor` | symmetry 1–8, mirror pairs (`SymmetrySpec`), radial inheritance onto a symmetric parent, `copyOf`, `withRootTilt`, `moveGroup`/`moveSubtree` with a tilt; `carry.test.ts`, `symmetry.test.ts` |
| `apps/web/src/lib/vab` | drag to carry, let go to place / delete on the catalogue / leave loose, Alt-click copy, empty hand after a place, X / Shift+X / R, carry keys and angle snap, wheel height, middle-click focus, Mirror / Snap / Copy chips (44 px on touch), `window.__orbitalVab` |
| `apps/web/src/lib/keybindings.ts` | `carry` mode and scope; `mirror`; help rows |
| `packages/core` | `mirror?: true` on design parts (type and schema) |
| `packages/renderer` | `worldNormalOf` and the hit normal; `raise`, `focus`; `screenPositionOfMarker`; `vab-picking.test.ts` |
| e2e | `hangar-carry.e2e.ts` |

## What surprised me

- **Most of the carry already existed:** `planCarry`, `moveGroup`, loose assemblies and a keyboard carry (M). The loop is mostly pointer wiring on top of them.
- **The part stayed armed after a place,** so an Alt-click on the vessel did nothing. KSP's empty hand after a click is now the rule.
- **A–D and Space were taken** by detach, sub-assembly and place; a separate `carry` key scope lets WASD turn the carried part only while one rides the cursor.
- **The e2e runs on a production build,** where the dev-only `__vab` handle is absent, so a small read-only hook was added.

## Decisions made (link ADRs)

- ADR 0221; the rest in the plan's Log.

## Open questions / follow-ups

- Surface attach on top and bottom faces and cones (a general surface link in the design format).
- A ghost free under the cursor away from any ring; Shift-click to pick up the whole vessel.

## Verification output

```
check:affected --build --e2e e2e/hangar-carry.e2e.ts: all passed in 468.9 s
  bun test (10 workspaces) 1775 pass, 0 fail; typecheck 11 workspaces + web clean
  e2e hangar-carry.e2e.ts (chromium): 1 passed
vitest editor, vab, keybindings, hud: 28 files, 236 pass (carry.test 5, symmetry.test 7)
renderer vab-picking.test + vab.test: 21 pass
core design.test + design-v3.test: 28 pass (mirror round-trip)
e2e editor, smoke, mobile, touch (chromium): 26 passed
```
