---
id: 257
title: "Flight runtime bugs from the owner's test: set-orbit crash, Debug does not pause, stray touchdown toast, no free physics frame, throttle and SAS after warp, hotkey focus, crash camera noise"
status: in-progress
owner: "Worker C"
depends: []
phase: 8
created: 2026-10-20
updated: 2026-10-20
---

# 257 — Flight runtime bugs from the owner's test: set-orbit crash, Debug does not pause, stray touchdown toast, no free physics frame, throttle and SAS after warp, hotkey focus, crash camera noise

**Size:** L

## Goal

Fix items 9–16 of `docs/reviews/2026-10-20-owner-manual-test.md`.

## Context

The owner tested by hand on 2026-10-20 and reported these bugs. Screenshots are in `docs/reviews/assets/2026-10-20-owner-test/`.

- **9 (`10.png`):** Debug → Set orbit shows the fatal error card "Internal Error".
- **10:** Debug opened from the menu does not pause; the menu itself does (plan 205's place pause; plan 248 put Debug on every page).
- **11 (`11.jpg`):** A "Touchdown at 17.5 m/s" warning appears while the active vessel flies at 45 km. Probably another vessel's event, such as debris or a booster.
- **12 (`12.jpg`):** "Cannot throttle — no free physics frame (another vessel is in flight far away)" after time warp or Debug set orbit.
- **13:** After warp returns to 1×, throttle does not apply until it is cut and raised again.
- **14:** After warp, SAS turns snap instantly instead of rotating with the vessel's torque.
- **15:** Hotkeys stop working after a panel is clicked, until the canvas is clicked.
- **16 (`13.jpg`):** Crashing into the ground shows a noise image instead of a sensible camera view.

Items 11–16 were seen on a build a few hours older than the Pages build. Check each against current main first. A coordinator's read-only investigation is added to the Log below when it lands.

## Scope

**In:** all items above. Each gets a root cause in the journal, a fix, and a unit test that fails before the fix (sim, web lib, or renderer).

**Out:** new features.

## Touches

`packages/sim/src` (debug set-orbit, frames/physics bubble, warp exit, attitude control), `apps/web/src/lib/{flight-loop,keybindings,hud-controller}.ts`, `apps/web/src/lib/debug/*`, `apps/web/src/routes/(world)/+layout.svelte` (pause holds), `packages/renderer/src/scene.ts` (crash camera).

## Steps

1. Reproduce each item through the debug API in unit tests where possible.
2. Fix them one at a time, with a test each.
3. Write the journal with a root cause per item.

## Acceptance criteria

- [ ] Set orbit no longer crashes. Debug pauses like the menu does.
- [ ] Touchdown toasts are only for the active vessel, or are clearly named.
- [ ] A physics frame is always free for the active vessel after warp or set orbit.
- [ ] Throttle and SAS behave the same after warp as before warp.
- [ ] Hotkeys work after panel clicks, except while typing in an input.
- [ ] A crash shows a sane camera.
- [ ] A unit test exists per fix. Affected unit tests and the typecheck pass. E2E is paused by the owner.

## Docs checklist

- [ ] STATUS row.
- [ ] Journal with a root cause per item.

## Log

- 2026-10-20 — Created by the coordinator from the owner's manual test.
- 2026-10-20 — Worker C: items 10–16 fixed with tests (journal 257). Item 9 (Set orbit, "Internal Error") did not reproduce in the dev build; the plan stays in progress for it.
