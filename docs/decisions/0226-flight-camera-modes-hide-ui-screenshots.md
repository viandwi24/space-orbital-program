# 0226 — Flight camera modes, part focus, hide UI and screenshots

**Status:** accepted
**Date:** 2026-10-19
**Plan:** plans/226-camera-modes-and-capture.md
**Builds on:** ADR 0205 (camera framing rule), ADR 0206 (key profiles), ADR 0222 (the v2 UI package)

## Context

The flight camera was one orbit rig (yaw, pitch, log distance) with up away from the body. Plan 226 asks for four modes cycled with V, a part focus, F2 to hide the interface and a PNG screenshot. Open were: how a mode change avoids a jump, what the toolbar's Camera button does (the plan says a menu, the v2 package says a one-press action), and whether a screenshot includes the HTML interface.

## Decision

1. **One rig, a frame per mode** (`packages/renderer/src/camera-modes.ts`, pure). The rig state stays yaw, pitch and distance; the mode picks the rotation from rig space (+Y up) to the world: **Free** up away from the body (the old rig), **Orbital** up along the orbit normal r × v, **Locked** the vessel's orientation (the control part's when one is set, plan 221), **Auto** Free below the atmosphere top (25 km on an airless body) and Orbital above.
2. **No jump:** when the resolved mode changes (a V press, or Auto crossing its altitude), the rig is re-measured in the new frame (`reframe`), so the camera sits where it was. The change is a cut, never an ease, so reduced motion needs nothing more.
3. **Keys and toolbar:** V (KSP profile) or `\` (Classic) goes to the next mode in the order Auto, Free, Orbital, Locked with a toast naming it. The toolbar's **Change camera** is the same one-press action, without a dot (refs `BASE_LAYOUT.md`), instead of the menu in the plan text. The mode is kept per world in local storage (`orbital.camera-mode.<world>`); a new world starts in Free.
4. **Part focus:** "Focus camera" in the part inspector and a middle click on a part aim the camera at that part (`Renderer.focusPart`, by entity id); Backtick goes back to the vessel; a vessel switch clears it.
5. **F2** hides every interface layer of the flight page and the world shell's bars; F2 again or Escape shows them. Hide UI and Screenshot are also in the pause menu.
6. **Screenshot** (F10): `Renderer.capture` draws one frame and reads the canvas with `toBlob` in the same task, so `preserveDrawingBuffer` stays off; the PNG downloads as `<world>-t-<met>.png`. It holds the 3D view only: drawing the HTML interface into it needs a DOM rasteriser, which is not added.

## Consequences

- `@orbital/renderer` exports the mode helpers; `Renderer` gains `setCameraMode`, `cameraMode`, `resolvedCameraMode`, `focusPart`, `focusedPart` and `capture`. No sim or save change.
- The four camera actions of plan 216 are no longer pending: they show in Controls and the help overlay.
