---
id: 226
title: Camera modes, hide UI and screenshots
status: done
owner: "Worker C"
depends: [216]
phase: 7
created: 2026-10-18
updated: 2026-10-19
---

# 226 — Camera modes, hide UI and screenshots

## Goal

The flight camera has four modes, Auto, Free, Orbital and Locked, cycled with V and named in a toast. The camera can focus a part. F2 hides the whole UI. A screenshot key saves the view as a PNG download. The toolbar Camera button works.

## Context

- rancangan §11.1 (modes, V, toast, part focus, toolbar Camera enabled), §11.2 (F2 hide UI, screenshot as a PNG download).
- Research:
  - 15b §1a: one orbit rig, yaw/pitch/log zoom 2 m–5 km (`packages/renderer/src/camera-rig.ts:24,31-46`); `Renderer` has no mode API (`packages/renderer/src/renderer.ts:109-160`); the only camera action is Map (`apps/web/src/lib/keybindings.ts:96`); `packages/renderer/src/camera-presets.ts` is dev tooling only.
  - Doc 13 §6: the toolbar Camera button is disabled (`apps/web/src/lib/hud/AppBar.svelte`); §7.1 recommends Auto/Free/Orbital/Locked with V and a toast, and `canvas.toBlob` for screenshots.
  - rancangan §7.6c: side panels no longer shift the camera (plan 215). This plan keeps that rule in every mode.
- ADRs: 0206 (key profile: V camera, F2 hide UI, screenshot key), 0205 (camera framing rule).
- Plan 216 defines the keys; plan 222 adds the docking port frame that Locked can use when present.

## Scope

**In:**
- Mode API on the renderer: `setCameraMode('auto' | 'free' | 'orbital' | 'locked')`.
  - Auto: Free near the surface, Orbital in space (switch at the body's atmosphere top, or a fixed altitude on airless bodies).
  - Free: today's rig, horizon-up.
  - Orbital: up axis is the orbit normal.
  - Locked: the rig turns with the vessel (or with the control part).
- V cycles modes; a toast names the mode. The mode is kept per world.
- Part focus: a "Focus camera" action in the part inspector, and middle-click on a part; Backtick resets to the vessel.
- F2 hides every HUD layer; F2 again or Escape restores it.
- Screenshot key and toolbar entry: render one frame (with or without UI, a setting) and download a PNG named with world and MET.
- Toolbar Camera button opens a small menu with the four modes, hide UI and screenshot.
- Reduced motion: mode changes cut instead of easing.

**Out:** IVA and cockpit view. Chase camera, photo mode and cinematic paths (P2).

## Touches

- **Size:** M
- **Edits:**
  - `packages/renderer/src/camera-rig.ts`, `packages/renderer/src/renderer.ts`
  - `apps/web/src/lib/flight-loop.ts`, `apps/web/src/lib/keybindings.ts`, `apps/web/src/lib/hud/AppBar.svelte`
  - `apps/web/src/routes/flight/+page.svelte` (hide-UI state)
  - `apps/web/src/lib/download.ts` (PNG save)
  - `apps/web/e2e/camera.e2e.ts` (new)
- **Shared contracts:** renderer camera mode API; no sim or save format change (the mode lives in page state per world).

## Design notes

- The rig keeps one state (target, distance, yaw, pitch). Modes only change the reference frame the yaw and pitch are measured in. Switching mode keeps the view direction, so the picture does not jump.
- Screenshot uses `preserveDrawingBuffer` only for the capture frame, not always, to avoid a frame-time cost.

## Steps

1. Reference frames per mode in the rig, with unit tests.
2. Renderer API and V binding with the toast.
3. Part focus and Backtick reset.
4. F2 hide UI.
5. Screenshot to PNG; toolbar Camera menu.
6. Chromium e2e.

## Acceptance criteria

E2E setup uses the plan 203 debug API (ADR 0200). This plan does not depend on 203; if 203 is not done yet, set up with `launchTwoStage` and `runScript` from `apps/web/e2e/support.ts` and record that in the Log.

- [x] `bun test packages/renderer` passes, including `test/camera-modes.test.ts`: in Orbital the rig's up vector equals the orbit normal; switching Free → Orbital keeps the view direction within 0.5°; Locked follows a 90° vessel roll.
- [x] `apps/web` vitest: keybinding V maps to `cameraMode` in the KSP profile.
- [x] Chromium e2e `apps/web/e2e/camera.e2e.ts`: `debug.setOrbit` (plan 203) to low orbit; V three times shows the toasts "Orbital", "Locked", "Auto" in order (starting from Free); F2 hides the HUD root (no HUD test id is visible); the screenshot key triggers a download whose name ends in `.png` and whose size is over 10 KB.
- [x] `bun run check:affected --build --e2e e2e/camera.e2e.ts` passes.
- [x] CI is green on the `ready/*` tag for this plan.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/226-camera-modes-and-capture.md` written.
- [x] `docs/architecture/overview.md` updated (renderer camera modes).
- [x] Help overlay and `docs/product/glossary.md` list the camera modes.

## Log

- 2026-10-18 — Created from refs/rancangan-terpadu.md (release roadmap).
- 2026-10-19 — Worker C refined to ready and claimed (claim/226). Checked against the code: the rig is `camera-rig.ts` (yaw, pitch, distance) placed in `SceneModel.placeCamera` with up away from the body; a debug-only part focus by definition existed; plan 216 declared `cameraMode` (V in the KSP profile, no key in Classic), `cameraReset` (`), `hideUi` (F2) and `screenshot` (F10) as pending. Plan 203's debug API is on main, so the e2e uses `debug.setOrbit`. ADR 0226.
- 2026-10-19 — Default per the owner's UI rule (ADR 0222, the v2 package): the toolbar's **Change camera** is a one-press action without a dot (BASE_LAYOUT.md, CONCEPT.md), not the menu the plan text describes. One press goes to the next mode, like V; Hide UI and Screenshot are on their keys and in the pause menu.
- 2026-10-19 — Default: the screenshot holds the canvas only. Drawing the HTML interface into the image needs a DOM rasteriser library, which this plan does not add; the "with UI" setting is left out.
- 2026-10-19 — Default: a new world starts in Free (today's camera), so V goes Orbital, Locked, Auto, Free. The mode is kept per world in local storage.
- 2026-10-19 — Evidence: `packages/renderer/test/camera-modes.test.ts` 4 pass (Orbital up = orbit normal; Free → Orbital keeps the view within 0.5°; Locked follows a 90° roll; Auto and the V order); `keybindings.test.ts` (V is `cameraMode` in the KSP profile); `check:affected --build --e2e e2e/camera.e2e.ts` all passed (e2e 1 passed: toasts Orbital, Locked, Auto; F2 leaves no `hud-*` visible; F10 downloads a `.png` over 10 KB); CI `refs/ci/pass/450b3591`.
