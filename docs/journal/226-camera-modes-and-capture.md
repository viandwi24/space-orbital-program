# 226 — Camera modes, hide UI and screenshots

**Plan:** [plans/226-camera-modes-and-capture.md](../plans/226-camera-modes-and-capture.md) · **Session:** Worker C, 2026-10-19 · **ADRs:** [0225](../decisions/0225-flight-camera-modes-hide-ui-screenshots.md), [0206](../decisions/0206-key-profiles-ksp-default-orbital-classic.md), [0222](../decisions/0222-ui-fidelity-build-menu-branch-centers-deep-space-dish.md)

## What was done

| Where | What |
|---|---|
| `packages/renderer` | `camera-modes.ts` (pure: frames per mode, `reframe`, `resolveMode`); `SceneModel.placeCamera` measures the rig in the mode's frame and re-measures it when the resolved mode changes; part focus by entity id; `Renderer.setCameraMode`, `focusPart`, `capture` |
| web, flight | V / `\` and the toolbar's Change camera cycle the mode with a toast; the mode per world in local storage; "Focus camera" in the part inspector, middle click on a part, Backtick back; F2 hides the page's layers and the world shell's bars, Esc or F2 shows them; F10 and the pause menu save a PNG |
| web, keys | the four camera actions of plan 216 are wired (no longer pending) and listed in the help overlay |
| tests | `packages/renderer/test/camera-modes.test.ts` (4), `keybindings.test.ts` (+1), `e2e/camera.e2e.ts` |

## What surprised me

- **The toolbar's Camera was a menu in the plan and a one-press action in the v2 package** (BASE_LAYOUT.md: "Change camera" has no dot). The owner's rule (ADR 0222) wins: one press is the next mode; Hide UI and Screenshot live on their keys and in the pause menu.
- **A screenshot needs no `preserveDrawingBuffer`:** `toBlob` called in the same task as the draw reads the frame before the browser clears it.
- **Classic had no camera key** (V is the speed reference there); it gets `\`, which no profile used.
- **ADR numbers raced:** Worker A's plan 219 took 0224 while this plan was in progress, so this one is 0225; the shared notes now say to take the next number after a fetch.

## Decisions made (link ADRs)

- ADR 0225. In the plan's Log: the one-press camera button, a screenshot of the canvas only, a new world starts in Free.

## Open questions / follow-ups

- A "with the interface" screenshot needs a DOM rasteriser (a library choice).
