---
id: 387
title: "Space Center camera: the whole site on opening, each building from its best angle; a visual QA pass"
status: done
owner: "ui-v3 session (Claude, 2026-10-23)"
depends: [259, 349]
phase: 7
created: 2026-10-23
updated: 2026-10-23
---

# 387 — Space Center camera and a visual QA pass

## Goal

The owner's request of 2026-10-23, in two parts.

1. **Camera.**
   - On opening the Space Center, show the whole site zoomed out in one view.
   - Selecting a building flies to the right angle for it, not from behind it.
2. **Visual QA.** Check the other visuals are safe.

## Context

- ADR 0326 (this plan's decisions), plan 259 (pins and framing), plan 349 (the Buildings strip)
- `Scene.setSiteFocus` and the site rig (yaw, pitch, distance) in `packages/renderer/src/scene.ts`

## Scope

**In:**
- `lib/space-center/site-camera.ts`, pure: `siteBoxes`, `fitAll`, `bestView`, the occlusion test, and `shortestTurn`.
- `Scene.setSiteCamera`: a compass view turned into the rig in the camera frame, eased along the shortest arc. A drag or the wheel cancels it.
- The Space Center page:
  - **Overview** on opening, on a site switch, back from a building (Esc or Overview), and when the Buildings strip opens or closes.
  - **A building's best view** when it is selected from the strip, a pin, or a click.
  - The interface insets are measured each time: the top bar, the strip and bar at the bottom, and the panel on the right.
- The QA pass at 1280 × 800 and 1920 × 1080: a Sandbox world, a new Career world, and a branch.

**Out:**
- Fixing the renderer and terrain findings below; they belong to other sessions.

## Acceptance criteria

- [x] On opening, the whole site is in view from its front at 40°. A one-building branch still shows about 180 m of ground.
- [x] A building is framed from its entrance side at about 32°, filling about 55 % of the free view. The camera walks round a blocking building and never ends below the ground.
- [x] Esc or Overview returns to the whole site. Opening the strip re-frames the site above it.
- [x] `site-camera.test.ts`: the fit-all box, the best angle from entrances, the occlusion fallback, shortestTurn, and the stock site's boxes.
- [x] Screenshots of the QA pass are in the journal, with the findings listed.

## Docs checklist

- [x] `docs/STATUS.md`
- [x] ADR 0326 and its index row
- [x] Journal `387-space-center-camera-and-visual-qa.md`

## Log

- 2026-10-23: Written from the owner's request (relayed by the main session) and done the same day.
