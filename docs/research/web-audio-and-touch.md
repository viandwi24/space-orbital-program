# Web Audio, autoplay, touch and small screens (plan 053)

**Checked:** 2026-10-17 (MDN and Chrome developer pages fetched that day). Facts only; what we chose is in ADRs 0061 to 0063.

## Autoplay policy

- MDN, Web Audio best practices (https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices, 2026-10-17): the rule is "create or resume context from inside a user gesture"; a context created outside a gesture is `suspended` and must be started with `resume()`; states are `suspended`, `running`, `closed`.
- Chrome, Web Audio autoplay policy (https://developer.chrome.com/blog/web-audio-autoplay, 2026-10-17): a suspended context makes no sound; it resumes by itself only after user interaction with the page and a source `start()`; the article's own list of gesture events is click, contextmenu, auxclick, dblclick, mousedown, mouseup, pointerup, touchend, keydown, keyup. Contexts in iframes need the parent's grant. `resume()` returns a promise.
- Consequence for us: one `AudioContext` created lazily on the first `pointerup`/`keydown` (the game's first interaction is always one of them), `resume()` called again in the same handler; before that the engine reports `locked` and creates nothing. MDN's page says nothing about `suspend()` on a hidden tab; that is our choice (`visibilitychange`), the API is plain `AudioContext.suspend()`/`resume()`.

## Built-in nodes versus AudioWorklet

- MDN AudioWorklet (https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet, 2026-10-17): custom processing runs on the Web Audio rendering thread, not the main thread, loaded with `audioWorklet.addModule(url)`, secure context only, baseline since April 2021. The page does not say when built-in nodes suffice; that is our judgement: oscillators, a looped noise `AudioBufferSourceNode`, `BiquadFilterNode` and `GainNode` already run on the audio thread and need no extra script file, so they cost no main-thread time beyond parameter updates and no CSP `script-src` entry for a worklet module. The game uses built-in nodes only.

## Pointer type and touch

- MDN `pointer` media feature (https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/pointer, 2026-10-17): `none`, `coarse` (limited accuracy, a finger), `fine`; it tests the primary pointing device only, `any-pointer` tests all. We use `(pointer: coarse)` for the primary and `(any-pointer: coarse)` is deliberately not used, so a laptop with a touchscreen keeps the keyboard layout unless the player turns the touch controls on in settings.
- MDN Pointer Events, pinch zoom (https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events/Pinch_zoom_gestures, 2026-10-17): cache active pointers by `pointerId` on `pointerdown`, replace on `pointermove`, with two pointers compare `Math.hypot` of the distance to the previous distance, remove on `pointerup`/`pointercancel`, set `touch-action: none` so the browser does not pan or zoom the page.
- Viewport: the page already has `<meta name="viewport" content="width=device-width, initial-scale=1">` (`apps/web/src/app.html`); the pages are `position: fixed` full-screen with `touch-action: none` on the canvas.

## Not verified by us

- Real phones and tablets: none available to this session. Playwright device emulation (touch events, viewport, user agent) runs the same desktop engine; it proves the layout and the input mapping, not a device's GPU, thermals or browser chrome. Recorded as such in ADR 0063.
