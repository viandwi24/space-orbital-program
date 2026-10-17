# 0040 — Browser support policy and the cross-browser end-to-end suite

**Status:** accepted (point 2, no phones or tablets, amended by ADR 0063: tablets in landscape are supported)
**Date:** 2026-10-17
**Plan:** plans/032-script-api-additions-and-browser-matrix.md
**Amends:** `product/spec.md` (adds a support statement; no scope change). ADR 0008 applies to the scaffolding.

## Context

The game is a public web page. Until now it was exercised only in the Claude app's Chromium. Release (plan 023) needs a stated list of browsers, proof that the pages and the script sandbox (ADR 0038) work in the engines of Chrome/Edge, Firefox and Safari, and a friendly message instead of a blank canvas when the browser cannot run the game. Facts and sources: `research/browser-support.md` (2026-10-17).

## Decision

1. **Support statement** (`product/browser-support.md`, the matrix): desktop Chrome and Edge 97 or newer (Chromium engine), Firefox 114 or newer, Safari 16.0 or newer on macOS; each needs WebGL2, module Workers and WebAssembly with the CSP `'wasm-unsafe-eval'` source. "Supported" means: the end-to-end suite passes in that engine's Playwright build and nothing known is broken. The versions are the platform floor from the feature table, the tested versions are the Playwright 1.64 engines recorded in journal 032 (Chromium, Firefox, WebKit); a floor version older than the tested build is a claim from the feature table, not a test, and the document says so.
2. **Phones and tablets are not supported** for 1.0: no device or emulator was available to run the suite; the layout targets 1280x720 and up; touch input does not exist (keyboard and mouse only). Pages open on a small or touch-only screen get the same unsupported notice only if the capability check fails; otherwise they load and may be unusable. The policy is stated rather than hidden.
3. **Capability gate in the app.** The root layout checks, before starting the game, for WebGL2 (`canvas.getContext('webgl2')`), `Worker`, and `WebAssembly`; if any is missing, `/`, `/vab` and `/flight` show a plain-language notice naming what is missing and the supported browsers, and do not start the renderer or Workers. The check is a pure function (`browser-support.ts`) with unit tests.
4. **End-to-end suite** with Playwright (official `sv add playwright`, ADR 0008) in `apps/web/e2e/`, three projects: `chromium`, `firefox`, `webkit` (Playwright's bundled engines; never the player's installed browsers). Command: `bun run --filter @orbital/web test:e2e` (a `bun run e2e` shortcut at the root). The default suite is the smoke set (loads `/` and `/vab`, builds or loads the two-stage design, launches, runs a script, checks "Runs isolated", warp while a script runs, no console errors); one test, tagged `@orbit`, runs the sample ascent to orbit in real time (about 8 minutes) and is enabled by `E2E_ORBIT=1`: CI time is the reason it is not in the default set; it is run for every engine before a release and for this plan (journal 032).
5. The unit-test command (`bun test`, vitest) stays free of browsers; the e2e suite needs `bunx playwright install chromium firefox webkit` once (about 1 GB in `~/Library/Caches/ms-playwright`).

## Alternatives considered

- **Playwright's `sv add` default** (rewire `test` to run e2e, `playwright install` inside the script): makes the unit command depend on a 1 GB download. Rejected.
- **BrowserStack/real Safari**: needs an account and paid service; not available here. Playwright WebKit is built from WebKit main and "often includes changes before they reach Safari" (research), so a pass is early evidence, not a Safari certificate; the matrix says "WebKit (Playwright)" for what was tested.
- **Claim phones**: untested claims are worse than a stated gap.

## Consequences

- Plan 023 should run the suite against the production build on the real host (including its CSP headers; the hosting list is in `architecture/scripting.md`) and decide on phone support.
- A browser release can break the suite; the floor versions are re-checked at each release (the research file records the date).
