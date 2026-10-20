# 244 — Hangar: a ghost that follows the cursor, surface attach on any face, whole-vessel pick-up, Alt for nodes only, a 3D size-mismatch mark

**Plan:** [plans/244-hangar-attach-and-pickup.md](../plans/244-hangar-attach-and-pickup.md) · **Session:** Worker A, 2026-10-20 · **ADRs:** [0235](../decisions/0235-surface-links.md), 0221

## What was done

| Where | What |
|---|---|
| `core/design.ts`, `protocol*.ts` | `DesignLink.surface`, `placeSurface`, `rotationBetween`, validation, schema; tests in `design-surface.test.ts` |
| `editor/state.ts` | `surfaceTarget`, symmetric copies (turn, mirror, inherited); `surface.test.ts` |
| `vab/controller.svelte.ts` | faces and slopes place surface links; Alt keeps to the rings; ring glow (80 px) and snap (36 px); free ghost; Shift-click carries from the root |
| `renderer/vab/*` | roles `solid/ghost/free`, node states `near` and `mismatch`, `nodesNearPointer`, `cursorPoint`, screen-radius helpers; tests in `vab-picking.test.ts` |
| `editor/scene.ts` | `free`, `near`, the mismatch ring; `scene.test.ts` |

## Not done

E2E (paused by the owner); re-rooting a vessel (out of scope in the plan); the look of the glow and the free ghost was not compared in a browser.
