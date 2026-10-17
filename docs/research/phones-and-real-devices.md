# Phones and real devices (plan 055)

**Checked:** 2026-10-17. Facts only; what we chose is in ADR 0091. Earlier facts on touch and audio: `web-audio-and-touch.md`.

## Audio on mobile Safari

- MDN, `BaseAudioContext.state` (https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state, 2026-10-17): states are `running`, `suspended` (paused by the app via `suspend()`), `interrupted` (paused by something outside the app: a conferencing or phone app taking the audio hardware, a closed laptop; in iOS Safari leaving the page, switching tabs, minimising or switching the screen off), `closed`. Calling `resume()` on a `suspended` context during an interruption makes it `interrupted` again; an interruption while `suspended` does not change the state until `resume()` is called. Recovery: call `resume()` (MDN's example resumes then retries playback) and listen to `statechange`.
- Consequence: the engine used to resume only a `suspended` context; it now resumes `interrupted` too and publishes on `statechange`.

## Safe areas and viewport units

- MDN, `env()` (https://developer.mozilla.org/en-US/docs/Web/CSS/env, 2026-10-17): `safe-area-inset-top/right/bottom/left` are the distances from each edge where content is not cut off by a notch or rounded corners; 0 for a plain rectangle; with a fallback value for an unknown variable. The page does not mention the viewport meta; that `viewport-fit=cover` is what makes the layout viewport cover the whole screen and the insets non-zero is general knowledge (WebKit's notch article), not re-fetched here.
- MDN, CSS `<length>` (https://developer.mozilla.org/en-US/docs/Web/CSS/length, 2026-10-17): default viewport units equal the large viewport (`lvh`), so `100vh` is taller than the visible area while mobile toolbars show; `dvh` follows the toolbars, `svh` is the smallest. Use `dvh` after a `vh` fallback line. The flight and VAB pages are `position: fixed; inset: 0`, which follows the visible viewport and needs no `vh`; `Dialog` now has a `dvh` line.

## Not verified by us

- WebGL2 limits and frame times on real phone GPUs, thermals, the silent switch, a real call, a notch and the browser chrome: no device. They are the human device checklist of journal 055.
