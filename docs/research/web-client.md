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
