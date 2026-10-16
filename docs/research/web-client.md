# Web client — what `apps/web` relies on

Checked 2026-10-16 (plan 009).

## Vite 8 Web Worker import

Source: https://vite.dev/guide/features#web-workers (2026-10-16).

- `new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' })` is detected by Vite only when `new URL(...)` appears directly inside `new Worker(...)` and the options are static literals. Anything else is treated as a static asset.
- Alternative: `import SimWorker from './sim.worker?worker'` then `new SimWorker()` (`&inline` embeds, `&url` gives the URL).
- Worker scripts may `import` (ESM). In the dev server this is native module-worker support, in production Vite bundles the worker. We use the `new URL` form (spec step 1) in `sim-client.ts`; `vite build` output is checked in plan 009 (`.svelte-kit/output/client/_app/immutable/workers/`).
- `worker.format` lives on the Worker Options page (https://vite.dev/config/worker-options); the default is `iife`. A worker that statically imports bundled code works in `iife`; if the build complains about code splitting, set `worker: { format: 'es' }` in `vite.config.ts`. Outcome is recorded in the journal.

## QuickJS WASM in the sim Worker (plan 015)

Checked 2026-10-16; sources and package details in `research/scripting.md`. Result (journal 015): `import url from '@jitl/quickjs-wasmfile-release-sync/wasm?url'` works in the module Worker in dev and in `vite build` (one 503 KB asset in `build/_app/immutable/workers/assets/`), passed as `wasmLocation` of `newVariant(releaseSync, ...)`. Importing the `quickjs-emscripten` barrel in a bundled app emits all four variants' `.wasm` files (4.3 MB of dead assets) because the bundler follows each variant's `new URL(...)` before tree-shaking; the Worker therefore imports `@orbital/scripting/runner` (only `createScriptRunnerIn`) and the variant package directly. The page imports `ascentScript` from the `@orbital/scripting/samples/ascent` subpath for the same reason.

## Rapier compat inside a module worker

Source: package contents of `@dimforge/rapier3d-compat@0.21.0` (`dist/rapier.mjs`, 4.1 MB, the 2.9 MB `.wasm` is embedded in the JS rather than fetched; the only `fetch` is the generic wasm-bindgen branch for a URL/Request argument that `RAPIER.init()` does not pass) and https://rapier.rs/docs/user_guides/javascript/getting_started_js. `init()` therefore needs no network or asset path and runs in any context with `WebAssembly`, including a module worker. The README of the compat package does not discuss workers; confirmed empirically by the manual run (journal 009).

## SvelteKit 3 page options (adapter-static)

Source: https://svelte.dev/docs/kit/page-options (2026-10-16).

- `prerender = true` (root layout, already set) writes a static HTML file per page; `ssr = false` makes the page an empty shell rendered only in the browser, the documented option for pages using browser-only globals. `csr` stays true (default).
- `/vab` and `/flight` build canvases and a Worker: each gets `+page.ts` with `export const ssr = false;` (prerender stays true from the root layout, producing a shell). With `fallback: '200.html'` in the adapter the output also works for unknown paths. Verified by `bun run build` and by loading the routes (journal).

## Svelte 5 runes

Source: https://svelte.dev/docs/svelte/$state (2026-10-16).

- `$state` makes arrays and plain objects deeply reactive proxies; `$state.raw` is only reassigned, not mutated (good for snapshots replaced wholesale at ~10 Hz). `$state.snapshot` gives a plain copy.
- Class instances are not proxied; put `$state` on class fields. Exported reassigned `$state` from `.svelte.ts` is not allowed: export an object or getters.
- Render loop and worker messages are plain TypeScript outside Svelte: a `requestAnimationFrame` loop and `onmessage` handlers write into plain variables; only a throttled (10 Hz) HUD object is copied into `$state.raw`. Setup/teardown in `onMount` (returns the cleanup) because the pages are `ssr = false` shells.

## vitest 4 config from `sv`

`apps/web/vite.config.ts` (generated, 2026-10-16 by `sv@1.1.1`) has `test.projects` with one `server` project (`environment: 'node'`, `include: ['src/**/*.{test,spec}.{js,ts}']`) and `expect.requireAssertions: true`; tests must assert. `bun run --filter @orbital/web test` runs `vitest --run`.

## localStorage (plan 017)

Source: https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API (2026-10-16).

- Keys and values are always strings; storage is per origin and `localStorage` is shared across same-origin tabs. No size limit is stated on the page (browsers commonly allow about 5 MB per origin).
- `setItem` can throw `QuotaExceededError`; access can throw `SecurityError` when storage is blocked (per the HTML spec; the MDN page shows the try/catch detection pattern). `getItem` returns `null` for a missing key. Hence `saveScript`/`loadScript` wrap every access in try/catch like `saveDraft`.
- The `storage` event fires only in other same-origin documents, not the one that wrote; not used (one flight tab is assumed).

## Design system and HUD (plan 021)

Checked 2026-10-16.

### Fonts: Barlow Semi Condensed and IBM Plex Mono

Sources: https://fontsource.org/fonts/barlow-semi-condensed and https://fontsource.org/fonts/ibm-plex-mono (licence line "OFL-1.1", i.e. SIL Open Font License 1.1; `npm view` of both packages also reports `OFL-1.1`, version 5.3.0), install and import docs https://fontsource.org/docs/getting-started/install.

- OFL 1.1 allows bundling and redistribution with the app; the fonts must not be sold on their own, and a modified font may not use the reserved name. We ship them unmodified.
- `@fontsource/<id>` is the static package; each weight is a CSS file (`400.css`, or `latin-400.css` for the Latin subset only, which is what `apps/web` imports so the browser fetches one woff2 per weight; ids and files verified in `node_modules/@fontsource/*/`). Variable fonts (`@fontsource-variable/*`) were not needed: three weights of the sans and two of the mono are about 70 KB of woff2.
- Neither font is KSP's, and neither is on the "default roster" (Inter, Geist, JetBrains Mono) the antislop guide lists.

### Svelte 5 patterns used

Source: https://svelte.dev/docs/svelte/$state (2026-10-16): `$state.raw` for values that are only reassigned (the 10 Hz HUD object), `$state` on `bind:this` references (the compiler warns `non_reactive_update` otherwise), a component's `export function` is callable through `bind:this` (the navball's `paint`, the map markers' `place`), `.svelte.ts` modules may not export reassigned state. The page keeps per-frame work out of Svelte entirely (ADR 0026).

### Native `<dialog>` for the pause menu and the help overlay

Source: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog (2026-10-16): `showModal()` moves focus into the dialog, makes the rest of the page inert, exposes `role="dialog"` with `aria-modal="true"`, and Esc closes the most recent modal dialog (a `cancel` event, then `close`). Consequences found in the manual run (journal 021): an Esc `keydown` listener on `window` that opens a dialog must call `preventDefault()`, or the same keypress's default action closes the dialog it just opened; and in the headless Chromium used for the run Esc produced a `cancel` event but no `close` event, so the `Dialog` component reacts to `cancel` too.

### Reduced motion and contrast

- https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion (2026-10-16): `reduce` means the user asked for less non-essential motion; baseline widely available since January 2020. `tokens.css` zeroes the motion durations and every animation/transition under it.
- https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio (2026-10-16): contrast ratio `(L1 + 0.05) / (L2 + 0.05)`, success criterion 1.4.3 requires 4.5:1 for normal text (3:1 for large text). The test in `src/lib/ui/tokens.test.ts` uses the sRGB relative luminance with coefficients 0.2126/0.7152/0.0722 and checks every text token against the worst case of each translucent panel (composited over white).
