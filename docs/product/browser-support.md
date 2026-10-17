# Browser support

Decided in [ADR 0040](../decisions/0040-browser-support-policy-and-e2e-matrix.md); facts and sources in [`research/browser-support.md`](../research/browser-support.md) (checked 2026-10-17). Results of the last run: [journal 032](../journal/032-script-api-additions-and-browser-matrix.md).

## What the game needs

WebGL2 (renderer), module Web Workers (simulation and script sandbox), WebAssembly (physics engine, script engine) and, inside the script sandbox, a page policy that allows `'wasm-unsafe-eval'` for the sandbox's own document and blob Workers. If the browser lacks WebGL2, Workers or WebAssembly the game shows a notice naming what is missing and does not start (`lib/browser-support.ts`, `lib/ui/BrowserNotice.svelte`).

## Support matrix (desktop)

| Browser | Minimum version | Why that version | Tested engine (2026-10-17) | Result |
|---|---|---|---|---|
| Chrome, Edge (Chromium) | 97 | `'wasm-unsafe-eval'` (Chrome 97); WebGL2 (Chrome 56, Edge 79); module Workers (80) | Playwright Chromium 156.0.8078.4 | smoke suite and real-time orbit pass |
| Firefox | 114 | module Workers (114); `'wasm-unsafe-eval'` (102); WebGL2 (51) | Playwright Firefox 157.0 | smoke suite and real-time orbit pass |
| Safari (macOS) | 16.0 | `'wasm-unsafe-eval'` (16.0); module Workers and WebGL2 (15) | Playwright WebKit 27.2 (built from WebKit main; a preview of Safari, not Safari itself) | smoke suite and real-time orbit pass |

"Minimum version" is the platform floor from the feature tables, not a tested version: only the three engines in the fourth column are run by the suite. A player on an older release of the same browser may hit a bug nobody has seen; the notice and this table are the whole promise. The detailed per-engine results and the bugs the matrix found are in the journal.

## Tablets (plan 053, [ADR 0063](../decisions/0063-tablets-supported-phones-not.md))

Tablets in **landscape at 1024x768 CSS px or larger** are supported, in the same engines as the table above (Chrome, Safari, Firefox on a tablet). On a coarse primary pointer, or when Settings, Game, Touch controls is On, the flight screen shows a throttle slider (Full, Cut), a steering pad (pitch and yaw), roll buttons and Stage; one finger drags the camera and two fingers pinch to zoom, in flight and in the VAB; buttons grow to 44 px. **Tested in emulation only** (Playwright Chromium with touch events at 1024x768 and 1180x820, the built-in browser; journals 053 and 055): no real tablet was available, so frame times, thermals and browser chrome on real devices are not claimed.

Since plan 055 ([ADR 0091](../decisions/0091-phones-stay-unsupported-tablet-layout-fixed.md)) the flight screen keeps its panels clear of the instrument deck at these sizes: the right column and the script panel scroll above the measured deck, the maneuver and orbit strip stands on top of it below 1280 px, the touch throttle sits beside the script panel, and panels are above the touch overlay. The page covers the whole screen (`viewport-fit=cover`) and the corner panels and touch controls add the safe-area insets; an interrupted audio context (a call on Safari) is resumed by the next tap. The geometry is checked in emulation; the notch, browser chrome and real audio interruptions are on the human device checklist in journal 055.

## Not supported (stated, not hidden)

- **Phones, and tablets in portrait** (ADR 0091: no compact interface exists and no phone GPU or thermal behaviour has been measured). A screen under 900x500 CSS px gets a notice that names the kind of screen and what to do (turn a phone or tablet to landscape, enlarge a small window; for a phone in landscape: "phones are not supported, panels may overlap") with Continue anyway; the game still loads and may be hard or impossible to use. On a phone `selectPreset` picks `low` and the quality governor may go lower; nobody has measured that on a phone. A phone browser that lacks WebGL2, Workers or WebAssembly shows the capability notice instead. Roadmap: draft plan 073, to start from the human's device results (journal 055).
- Browsers without WebGL2, Workers or WebAssembly (the notice appears), and any browser older than the minimum versions above.
- Embedded web views that block sandboxed `srcdoc` iframes or blob Workers: scripts fail closed with "the script sandbox did not start" (ADR 0038); the rest of the game runs.

## How it is checked

`apps/web/e2e/touch.e2e.ts` (plan 053) runs in Chromium only: a touch tablet context flies the two-stage example with the on-screen controls, and a phone-sized context shows and dismisses the notice. `apps/web/e2e/mobile.e2e.ts` (plan 055, Chromium, touch emulation) checks at 1024x768 and 1180x820 that no panel overlaps the instrument deck, the touch throttle clears the script panel, taps reach the panel, the Target card is reachable by scrolling and the menu and VAB do not scroll sideways at 1024x768 to 1366x1024; it also checks the notice per screen class and `viewport-fit=cover`. `E2E_SHOTS=1` writes the screenshots of journal 055.

Plan 023 added `E2E_HEADERS=1 bun run e2e`, which serves the build with the production Content-Security-Policy and headers (`architecture/hosting.md`); the release run (journal 023) used it in all three engines.

`bun run e2e` (Playwright, `apps/web/e2e/`, projects `chromium`, `firefox`, `webkit`; one-time `bunx playwright install chromium firefox webkit` in `apps/web`) runs the smoke suite against the production build. `E2E_ORBIT=1 bun run e2e -- --grep @orbit` adds the real-time sample ascent to orbit (about four minutes of simulation time per engine). Plan 023 should run both against the real host with its headers.
