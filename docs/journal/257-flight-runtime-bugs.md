# 257 — Flight runtime bugs from the owner's test

**Plan:** [plans/257-flight-runtime-bugs.md](../plans/257-flight-runtime-bugs.md) · **Session:** Worker C, 2026-10-20 · **Source:** [owner manual test](../reviews/2026-10-20-owner-manual-test.md) items 9–16

## Root cause and fix per item

| # | Item | Root cause | Fix and test |
|---|---|---|---|
| 9 | Set orbit: "Internal Error" | **Not reproduced.** In the dev build on this branch Set orbit worked from the pad, from orbit, for Low orbit, Cinder orbit, Transfer to Cinder and a spawn from a design, with the map open after it; the sim tests (spawn, repeat, throttle after) pass. "Internal Error" is not a string of this code: it reads like a browser error name (Firefox's `InternalError`) shown by the fatal card. Open until the coordinator's investigation or a stack from the owner's browser | none yet |
| 10 | Debug does not pause | the Flight page's modal effect held the clock and froze the sim for the menu, help, settings and the Save and Load dialogs, and only quieted the keys for Debug (plan 203's choice); on other pages (plan 248) nothing held it | `dialogOpen` (`flight-modal.ts`) counts Debug with the rest; the layout holds `debug` while its panel is open. Test `flight-modal.test.ts`. Seen working in the browser: the chip reads "PAUSED · MENU" |
| 11 | Touchdown toast while flying | `part-damaged` of **any** vessel called `director.touch`, which shows the toast: a booster or debris landing far away read as the player's touchdown | `isOwnTouchdown`: the event must be the active vessel's. Test `touchdown-cue.test.ts` |
| 12 | "no free physics frame" | a world keeps two physics frames; vessels left landed or in orbit far away (in flight, not yet idle long enough for rails) hold them, and waking the vessel the player flies had no way to make room | `makeRoom`/`makeRoomAt` (`modes.ts`): the first frame whose vessels are all landed or in a stable orbit goes on rails; used by `wake`, `ensureFlight` and Debug's set location. Test `free-frame.test.ts` (failed before: refused) |
| 13 | throttle does not apply after warp | the page counted a throttle as sent when it queued it; the sim refuses one at rails warp or without a frame, and the page never sent it again after the warp dropped | `throttle-retry.ts`: a refused throttle is sent again when the warp changes. Test `throttle-retry.test.ts` |
| 14 | SAS snaps after warp | `stepSasOnRails` points the nose analytically at the target on every rails step, at any warp: a pointing change on a vessel still on rails at 1× turned it 180° in one step | at physics warp (≤ 10×) the rails turn is bounded to 30°/s (`SAS_RAILS_RATE`); above it the analytic hold stays. Test `free-frame.test.ts` (failed before: dot −1.0); the rails SAS tests in `maneuver` and `target` now step 8 s |
| 15 | hotkeys lost after a panel click | the key handlers skipped every `HTMLInputElement`, so a range slider or a switch that kept the focus after a click silenced the keys | `isTypingTarget`: only text-like inputs, textareas, selects and content-editables count; the world layout's P handler uses it too. Test `typing-target.test.ts` |
| 16 | crash camera noise | with the vessel gone the camera fell back to the render origin with the world axes (below the ground, only the sky shader to see); the view in the screenshot is that | `holdSubject` (`camera-hold.ts`): the flight camera holds the last vessel's place until another is followed. Test `camera-hold.test.ts` |

## Notes

- Items 11–16 reproduce from the code and tests above, not from the owner's screenshots; each test fails on the old behaviour (the sim ones were run before the fix).
- The e2e is paused by the owner.
