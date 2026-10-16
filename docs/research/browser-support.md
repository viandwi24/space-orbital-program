# Browser support, Playwright and the sandbox in other engines (plan 032)

**Checked:** 2026-10-17. Each fact has its source; "not on the page" means the fetched page did not say and the value is recorded as unverified.

## Playwright (cross-browser test tool)

- `@playwright/test` latest **1.64.1**, modified 2026-10-16 (`npm view @playwright/test version time.modified`, 2026-10-17).
- Install of engines: https://playwright.dev/docs/browsers (2026-10-17): `npx playwright install` installs the default browsers, `npx playwright install webkit` one engine; `--with-deps` adds OS libraries (not needed on macOS). Cache on macOS: `~/Library/Caches/ms-playwright`, "a few hundred megabytes" per browser (measured here: chromium 366 MB + headless shell 203 MB, firefox 294 MB, webkit 299 MB for the 1.64 builds; older builds from other projects share the same cache and were left alone). `PLAYWRIGHT_BROWSERS_PATH` relocates it.
- WebKit on macOS: "built from the latest WebKit main branch, so it often includes changes before they reach Safari ... run WebKit on macOS for the experience closest to Safari" (same page). So Playwright WebKit is a preview of Safari, not Safari itself: a pass is strong evidence, not a certification.
- Web server for tests: https://playwright.dev/docs/test-webserver (2026-10-17): `webServer: { command, url, reuseExistingServer, timeout }` (`port` is deprecated, use `url`); default timeout 60 s.
- Svelte CLI add-on: https://svelte.dev/docs/cli/playwright (2026-10-17) only says `sv add playwright` adds scripts, a config, `.gitignore` entries and a demo test; the details were read from the actual run (`sv` 1.1.1, `bunx sv add playwright="demo:no" --no-git-check --no-install`): it adds `@playwright/test`, a `playwright.config.ts` (webServer `npm run build && npm run preview` on 4173, `testMatch '**/*.e2e.{ts,js}'`), `test:e2e` (`playwright install && playwright test`) and rewires `test` to include it, plus a demo `src/routes/page.svelte.e2e.ts` even with `demo:no`. This repo keeps `test` unit-only, removes the forced `playwright install`, and moves its tests to `apps/web/e2e/` (ADR 0040).

## Engine support for what the game needs

- **WebGL2** (Three.js `WebGLRenderer` needs it): https://caniuse.com/webgl2 (2026-10-17): Chrome 56, Edge 79, Firefox 51, Safari 15 (desktop and iOS); global usage 97.13 %. MDN, `WebGL2RenderingContext` (https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext, 2026-10-17): Baseline "widely available" since September 2021; available in Workers.
- **Module Workers** (`new Worker(url, { type: 'module' })`, the sim Worker): https://caniuse.com/mdn-api_worker_worker_ecmascript_modules (2026-10-17): Chrome 80, Firefox 114, Safari 15.
- **`'wasm-unsafe-eval'` in a CSP** (QuickJS in the sandbox iframe): https://caniuse.com/mdn-http_headers_content-security-policy_script-src_wasm-unsafe-eval (2026-10-17): Chrome 97, Firefox 102, **Safari 16.0** (the 15.4 recorded from memory in `scripting.md` was wrong). MDN `script-src` has no table for it; the semantics (allows WebAssembly compilation without `eval`) are on https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src.
- **Blob Workers inheriting the creator's CSP** and **sandboxed `srcdoc` iframes starting a blob Worker** in Firefox and Safari: no source states this per engine (MDN's Worker pages have no compatibility table in the fetched text). Decided by measurement in Playwright's Firefox and WebKit (journal 032), with the sandbox self-test as the oracle.
- **QuickJS-WASM** (quickjs-emscripten 0.32.0) only needs WebAssembly (baseline in all engines named above); nothing in its README restricts engines (https://github.com/justjake/quickjs-emscripten, 2026-10-16). Measured in the three Playwright engines instead (journal 032).

## Support policy inputs

- Minimum versions the game's own requirements imply: Chrome/Edge 97 (CSP wasm), Firefox 114 (module Workers), Safari 16.0. These are the floor from the platform features above, not tested versions; the tested set is the Playwright 1.64 engines (journal 032 lists their version strings).
- Phones and tablets: not tested here (no device available to this session; Playwright device emulation is viewport and touch emulation on the same desktop engine, not a phone). The layout targets 1280x720 and up (`STATUS.md`). Policy in ADR 0040.
