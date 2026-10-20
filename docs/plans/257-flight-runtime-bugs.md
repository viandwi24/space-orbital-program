---
id: 257
title: "Flight runtime bugs from the owner's test: set-orbit crash, Debug does not pause, stray touchdown toast, no free physics frame, throttle and SAS after warp, hotkey focus, crash camera noise"
status: ready
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
- 2026-10-20 — Coordinator's read-only investigation on main @ bb8c9665 found all items still present. Likely causes:
  - **(9)** `DebugPanel.svelte:346` keys `{#each designList}` by design name. Names repeat (`vab/library.ts:94-109`), and Svelte throws `each_key_duplicate` in production, which shows `+error.svelte`. Key the list by index or id, dedupe in `(world)/+layout.svelte:113-125` and `flight/+page.svelte:887-901`, and wrap `run()` in try/catch.
  - **(10)** `flight/+page.svelte:926-934` leaves Debug out of `modal`, and opening Debug from the menu clears `pauseOpen`. Hold `'debug'` in both places; this amends plan 203.
  - **(11)** `flight-loop.ts:1571-1575` fires the touchdown, explosion and warning cues for any vessel's `part-damaged` event. Guard them with the active vessel.
  - **(12)** Only 2 physics frames exist (`constants.ts:22`). `thawFrozen` (`warp.ts:160-178`) hands frames to frozen debris after warp, and descending debris keeps its frame (`modes.ts:149-162`). Thaw only vessels that join a frame already in use. When a controlled vessel needs a frame, evict uncontrolled vessels from the farthest frame (`frames.ts`, `wakeBlocker` in `modes.ts:66-81`).
  - **(13)** `flight-loop.ts:729-732` sets `sentThrottle` before the result arrives. On a refusal, reset it so the next frame resends, and reconcile with the snapshot.
  - **(14)** `stepSasOnRails` (`sas.ts:324-347`) snaps the attitude while the vessel stays on rails at 1×. In `case 'sas'` (`commands.ts:455-470`), call `ensureFlight` when warp is within physics range.
  - **(15)** `typingInField` (`flight-loop.ts:788-808`) counts range and checkbox inputs as typing. Count only text-like fields.
  - **(16)** After `GHOST_HOLD` 5 s (`scene.ts:165, 1523-1537`), the anchor falls back to the body centre, which is inside the planet. Keep the ghost anchor while the active vessel is missing.
  - **Item 7 (camera anchor)** belongs to plan 256. A hidden navmodule gives a zero rect (`flight/+page.svelte:1161-1174`), so the bottom inset becomes about the full height. Use 0 when the rect is empty, and add `navOpen` to the effect.
