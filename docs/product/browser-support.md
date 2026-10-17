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

## Not supported (stated, not hidden)

- **Phones and tablets.** The interface is laid out for 1280x720 and up and takes keyboard and mouse only. No device was available to run the suite, so nothing is claimed. A phone browser that has WebGL2, Workers and WebAssembly loads the game and will probably be unusable; one that lacks them shows the notice.
- Browsers without WebGL2, Workers or WebAssembly (the notice appears), and any browser older than the minimum versions above.
- Embedded web views that block sandboxed `srcdoc` iframes or blob Workers: scripts fail closed with "the script sandbox did not start" (ADR 0038); the rest of the game runs.

## How it is checked

Plan 023 added `E2E_HEADERS=1 bun run e2e`, which serves the build with the production Content-Security-Policy and headers (`architecture/hosting.md`); the release run (journal 023) used it in all three engines.

`bun run e2e` (Playwright, `apps/web/e2e/`, projects `chromium`, `firefox`, `webkit`; one-time `bunx playwright install chromium firefox webkit` in `apps/web`) runs the smoke suite against the production build. `E2E_ORBIT=1 bun run e2e -- --grep @orbit` adds the real-time sample ascent to orbit (about four minutes of simulation time per engine). Plan 023 should run both against the real host with its headers.
