# 0091 — Phones stay unsupported in v1.x; the tablet layout is fixed and the notice says what to do

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/055-phone-layout-and-real-device-passes.md
**Amends:** ADR 0063 (point 3, the notice, and point 4, "no new breakpoints"); `product/browser-support.md`. Does not supersede 0063: its decision that phones are not supported stands.

## Context

ADR 0063 supported tablets in landscape at 1024x768 and up and gave phones a notice. Plan 055 asked whether phones become supported in v1.x. The facts available to an agent without a device:

- The flight screen is an instrument cluster: a 650 to 830 px wide deck (throttle, speed, navball with SAS strip, altitude), a 264 px right column (resources, stage stack, target), the maneuver and orbit strip, the script panel, the first-flight guide. A phone in landscape is about 390 px tall (844x390 and similar); the deck alone is about 260 px of that. Fitting it is a second interface (a compact HUD), not a media query.
- The quality governor and the `low` preset exist (plans 039, 048; `selectPreset` returns `low` for a mobile device), but no phone GPU has ever run the planet pass, so no frame time is known. There is no device and no device-farm account.
- Emulation (Playwright touch and viewport, the built-in browser's resize) runs the desktop engine. It can prove layout geometry and input mapping; it cannot prove frame times, thermals, the browser chrome that eats the viewport, the notch, the silent switch or an audio interruption.
- Known layout defects at 1024x768 (journals 035, 053, 057, 058; plan 072): the maneuver and orbit strip under the instrument deck, the script panel under the deck, the touch throttle over the script panel (taps taken by the overlay), the Target card cut off.
- Mobile Safari facts (`research/phones-and-real-devices.md`, checked 2026-10-17): its `AudioContext` goes to `interrupted` when the page is left or a call or Siri takes the audio, and needs `resume()`; the safe-area insets are 0 unless the page opts in with `viewport-fit=cover`; `100vh` is the large viewport and is taller than the visible area while the toolbars show.

## Decision

1. **Phones, and tablets in portrait, stay unsupported in v1.x.** The reason is stated, not hidden: no compact interface exists, and nothing about a phone GPU or a phone's thermals can be measured here. We do not promise what we cannot verify; a verified phone interface is a post-1.x plan with a device (draft plan 073).
2. **The notice becomes useful.** It names the kind of screen (phone in portrait, phone in landscape, tablet in portrait, a small desktop window) and says what to do: turn the phone or tablet to landscape, make the window larger; for a phone in landscape it says plainly that phones are not supported and panels may overlap. "Continue anyway" stays. The pure classification and wording are in `lib/layout/layout-model.ts` and tested.
3. **The supported layout (tablets in landscape from 1024x768) is fixed:** the flight screen measures the instrument deck and every column above it (the right column, the script panel with the guide) is limited to the space above the measured deck and scrolls inside itself; below 1280 px the maneuver and orbit strip stands on top of the deck instead of under it; the touch throttle sits to the right of the script panel when it is open and centres in the space above the deck; panels sit above the touch overlay so a tap on a panel is never taken by an overlay element. Tested by geometry in Playwright (no overlap, `elementFromPoint` on the last control of the panel) at 1024x768 and 1180x820.
4. **Edge-to-edge and safe areas:** the viewport meta gets `viewport-fit=cover`; tokens `--safe-top/right/bottom/left` read `env(safe-area-inset-*)` (0 where there is no notch); the flight HUD's corner panels, the touch controls and the notice add them to their margins; the dialog's maximum height also has a `dvh` line. Only the resolution of the tokens and the meta can be tested here; how it looks around a real notch is on the human device checklist.
5. **Audio interruptions:** the engine publishes the context's state on `statechange` and a gesture resumes a context that is `suspended` or `interrupted` (not only `suspended`). Tested with a fake context; a real call on a real phone is on the checklist.
6. **Performance preset on phones:** unchanged: `selectPreset` already returns `low` for a mobile device and the governor may lower it further. Whether that is enough is a measurement for the device pass.
7. **Real devices:** a written checklist (journal 055) with exact steps. Nothing on it is claimed.

## Alternatives considered

- **Support phones in landscape with a compact HUD now.** Large, and every claim about it (readable, playable, cool enough, fast enough) would be unverified. A promise we cannot check is worse than a clear notice.
- **Block phones.** A phone may manage the menu or the script panel; blocking is not our call (ADR 0063).
- **Leave the notice as it was.** "May be hard or impossible to use" does not say what to try; turning a phone to landscape or enlarging a window fixes two of the four cases.
- **Hide the Target card or the strip on small screens.** They matter to rendezvous and maneuvers; scrolling above the deck keeps all of it.

## Consequences

- `browser-support.md` states the four screen classes, the fixed tablet layout and what is and is not verified; the notice text differs per class.
- New draft plan 073 (a compact flight HUD and VAB for phones, to be built with a device).
- Plan 072 (script panel on small screens) loses its layout item: the overlap with the deck and the touch overlay is fixed here; its human pass remains.
- The device checklist is the way for the human to move phones from "unsupported" to "supported": results go into plan 073's Log.
