# 055 — Phone layout and real-device passes

**Plan:** plans/055-phone-layout-and-real-device-passes.md · **Session(s):** phone session (Claude, 2026-10-17) · **Date:** 2026-10-17 · **ADRs:** [0091](../decisions/0091-phones-stay-unsupported-tablet-layout-fixed.md) · **Research:** [phones-and-real-devices.md](../research/phones-and-real-devices.md)

## What was done

| Where | What |
|---|---|
| ADR 0091 | phones and tablets in portrait stay unsupported in v1.x (no compact HUD exists; no phone GPU, thermal or browser-chrome measurement is possible without a device); the tablet layout is fixed; the notice says what to do; safe areas; audio `interrupted` |
| `lib/layout/layout-model.ts` (+ test, 12 cases) | pure: height above the deck, script panel width, throttle anchor, screen class (`phone-portrait`, `phone-landscape`, `tablet-portrait`, `small-window`, `ok`) and the notice wording |
| `routes/flight/+page.svelte` | measures the instrument deck and the top-left stack; `--deck-h`, `--above-deck`, `--script-w` on `.ui`; `.tl` (script panel, guide) and `.tr` limited above the deck and scroll inside; below 1280 px `.bl` (maneuver, orbit) stands on top of the deck; safe-area margins |
| `hud/TouchControls.svelte` | the throttle takes an anchor: past the script panel when it is open, otherwise between the guide and the deck |
| `ui/SmallScreenNotice.svelte` | wording by screen class, `data-screen` |
| `app.html`, `ui/tokens.css`, `ui/Dialog.svelte` | `viewport-fit=cover`; `--safe-top/right/bottom/left`; a `dvh` line on dialogs |
| `audio/engine.ts` (+ tests) | `onstatechange` publishes; a gesture resumes `interrupted` as well as `suspended` |
| `e2e/mobile.e2e.ts` | geometry guard, taps, target scroll, no sideways scroll, notice per class, meta |
| `product/browser-support.md`, roadmap, plans 072 and 073 | the new state; the roadmap entry moves to draft 073 |

## Findings

- At 1024x768 the instrument deck (about 262 px high) covered the maneuver and orbit strip, the lower part of the script panel and, with `.tr`'s constant `290px`, was only approximately cleared on the right. The columns now read the measured deck height instead of constants.
- **The guard catches the defect:** with the old `+page.svelte` restored and rebuilt, `mobile.e2e.ts` at 1024x768 failed with "script panel overlaps the instrument deck" (the target-scroll test passed on the old layout, as the right column already scrolled); with the fix all pass.
- A first version put the panels above the touch overlay (`z-index: 3`) and centred the throttle in the whole space above the deck. That moved the throttle's top under the first-flight guide, so the existing touch test (tapping the top of the slider) failed on both tries. The throttle now centres below the guide (measured), the z-index is gone, and a test asserts the throttle clears the guide and the deck.
- Screenshots (Chromium, touch, JPG 85): `assets/055-tablet-1024x768-flight-script-touch.jpg`, `055-tablet-1180x820-flight-script-touch.jpg`, `055-phone-portrait-390x844-menu-notice.jpg`, `055-phone-landscape-844x390-menu-notice.jpg`, `055-tablet-portrait-768x1024-menu-notice.jpg`.
- The built-in browser (1024x768) was used for the first look and closed before Playwright ran; viewport emulation was reset by closing the tab.

## Verification

Commands and results are in the plan Log (final run). Playwright: Chromium only, `workers: 1`, `E2E_HEADERS=1`, port 5242: 14 passed (12 of `mobile.e2e.ts`, 2 of `touch.e2e.ts`). Firefox and WebKit were not run: the change is layout CSS and one engine's geometry is the claim.

## Human device checklist (nothing here has been done)

Use the production build over HTTPS or on the LAN (`bun run build`, then `bun apps/web/scripts/serve.ts 5300`; open `http://<your Mac's IP>:5300` on the phone). Record the device, OS and browser version for each item.

**A. iPad (Safari), landscape, then the same in Chrome on the iPad**
- [ ] The menu loads, no notice shows (the screen is at least 900x500). Rotate to portrait: the notice says "Turn the tablet to landscape"; rotate back: it goes away without a reload.
- [ ] VAB: build the two-stage example (button on the page), pinch zoom works, one finger orbits, Launch works.
- [ ] Flight: touch controls show by themselves. Drag the throttle slider; Full and Cut; the steering pad (no drift when you lift the thumb); roll buttons; Stage. Two thumbs together: throttle and pad at once. Rest a palm near the pad edge: no stray steering.
- [ ] Open the script panel: the panel sits left, the throttle is right of it, the Run button and the problems list are reachable, no panel is under the instrument deck. Tap Run; the editor's on-screen key bar works.
- [ ] Right column: scroll it with a finger to reach the Target card; it does not slide under the deck.
- [ ] Safe areas: in the browser's full-screen/home-screen mode check that the menu bar and the right column are not under the camera cut-out or the home indicator.
- [ ] Frame rate: Settings, Graphics. Note the preset Automatic picked. Fly to orbit; note whether the quality governor lowered it and subjective smoothness; feel the back of the device after 10 minutes.
- [ ] Audio: sound starts after the first tap. Flip the silent switch: note whether sound stops (Web Audio follows the switch on iOS). Receive or place a call during flight, end it, tap the screen: sound comes back (this is the `interrupted` fix). Lock and unlock the screen; switch apps and back.
- [ ] The notice and nothing else shows on `/roadmap` and `/credits` as before.

**B. Android tablet (Chrome), landscape**: the same items A (no silent switch; check the notification-shade pull-down does not steal a drag at the screen top).

**C. A phone in landscape (iPhone Safari, Android Chrome) — to learn, not to pass**
- [ ] The notice reads "Phones are not supported: panels may overlap"; Continue anyway works.
- [ ] Menu, VAB, flight: write down what is unusable (what overlaps, what is off screen, the smallest control you can hit). These notes start plan 073.
- [ ] Frame rate and heat with the `low` preset: seconds to reach 30 fps steady, whether the governor reaches its floor, whether the browser kills the tab.
- [ ] Browser chrome: does the address bar hiding change the layout height (the page is `position: fixed; inset: 0`)? Does a notch or home indicator cover a control?

**D. A phone in portrait**: the notice says to turn the phone; after Continue anyway note whether anything works.

Results go to plan 073's Log. If A and B pass and C is promising, the human may ask for plan 073 to be refined.

## Decisions made

ADR 0091.

## Open questions / follow-ups

- Plan 073 (draft): the compact phone HUD and VAB, to be built from the checklist results.
- Plan 072 (draft): its layout item is fixed here; the human editor pass remains.
- A `ResizeObserver` on the deck would replace the per-frame measurement in `updateInsets` (it already ran per frame before this plan; not changed).
- Firefox and WebKit were not run for the new e2e file; the geometry could differ by font metrics. `bun run e2e` (smoke) covers the flight screen in all three engines at 1440x900 only.
