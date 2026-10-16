# Scripting runtimes (plan 010)

**Checked:** 2026-10-16 · Question: how to run untrusted player scripts with no access to `world`, `fetch` or the DOM, and kill an infinite loop within a budget.

## Dedicated Worker with a restricted global

- MDN, `Worker.terminate()`: "stopped at once", no chance to clean up — works for runaway scripts. https://developer.mozilla.org/en-US/docs/Web/API/Worker/terminate (2026-10-16)
- MDN, `DedicatedWorkerGlobalScope`: a worker scope inherits `fetch`, `XMLHttpRequest`, `WebSocket`, `indexedDB`, `importScripts` (classic), timers, `navigator`, `crypto`, `performance`. No supported mechanism removes them; shadowing (`const fetch = undefined`) only affects the wrapper's own scope, deleting globals is "fragile, not a security boundary". https://developer.mozilla.org/en-US/docs/Web/API/DedicatedWorkerGlobalScope (2026-10-16)
- Bun `Worker`: separate thread, `terminate()` exits "as soon as possible", docs call the API experimental "particularly for terminating workers". https://bun.com/docs/runtime/workers (2026-10-16)
- Consequence: `Function('return this')()` / `(()=>{}).constructor('return this')()` return the real worker global, so `fetch` and `postMessage` are reachable; a Worker is a thread boundary, not a capability boundary. It needs a realm without host globals on top.

## QuickJS compiled to WASM (`quickjs-emscripten`)

- npm `quickjs-emscripten` **0.32.0** (latest, modified 2026-02-16; `npm view quickjs-emscripten version`, 2026-10-16). Variants: `RELEASE_SYNC` (default), `DEBUG_SYNC`, `RELEASE_ASYNC`, `DEBUG_ASYNC` (Asyncify; only needed to suspend guest code on host promises). https://github.com/justjake/quickjs-emscripten (2026-10-16)
- "By default, no host functionality is exposed to code running inside QuickJS": a context has only ECMAScript built-ins (verified by running `Object.getOwnPropertyNames(globalThis)` with 0.32.0 under Bun 1.4.2: `Object`, `Function`, `Math`, `Date`, `JSON`, `Promise`, `Proxy`, typed arrays, ...; no `fetch`, `console`, `setTimeout`, `process`).
- `runtime.setInterruptHandler(fn)`: `fn` is called periodically during execution; returning `true` aborts with `InternalError: interrupted`. A 20 ms wall deadline stopped `while(true){}` after 20.9 ms (measured, Bun, 2026-10-16). `shouldInterruptAfterDeadline(timestamp)` is the packaged deadline form.
- `runtime.setMemoryLimit(bytes)` (docs example `1024 * 640`; unit assumed bytes, option `memoryLimitBytes`), `runtime.setMaxStackSize(bytes)`.
- Host functions: `context.newFunction(name, fn)`, `setProp(context.global, name, handle)`, `context.newPromise()` (deferred; call `runtime.executePendingJobs()` after settling), `context.evalCode`, `context.unwrapResult`, `context.dump`. Handles must be disposed manually (`.dispose()`, `Scope`, `.consume()`).
- Bundlers: the default loader uses `new URL('./file.wasm', import.meta.url)` (handled by bundlers) or `__dirname` in Node; Vite is listed as tested. Cloudflare Workers need a custom variant. Not exercised yet in `apps/web` (plan 010 ships no web integration).
- README: "has not been audited. Please use with care in production settings."

## ShadowRealm (TC39)

Stage 2.7 on the proposal repo page (https://github.com/tc39/proposal-shadowrealm, 2026-10-16); API is `evaluate` / `importValue` only, no timeout or interrupt, and not available in Bun or browsers by default. Not an option.

## Rejected / not pursued

`vm` / `node:vm` (Node/Bun only, not browser, not a security boundary), iframes with `sandbox` (DOM, main thread), `isolated-vm` (native V8 addon, no browser).

## Bundling QuickJS WASM in the web client (plan 015)

**Checked:** 2026-10-16.

- README of quickjs-emscripten (https://github.com/justjake/quickjs-emscripten, 2026-10-16): Vite is listed as tested (5.0.10, Vue example); the default loader locates the `.wasm` with `new URL('./file', import.meta.url)`, "handled automatically by bundlers", with manual configuration as the fallback. Workers are not covered. Variants: `newQuickJSWASMModuleFromVariant(variant)`; `newVariant(base, CustomizeVariantOptions)` customises loading (`wasmLocation`, `wasmBinary`, `wasmModule`, `locateFile`).
- Package contents of 0.32.0 (read from `node_modules`): `@jitl/quickjs-wasmfile-release-sync` exports `./wasm` (`dist/emscripten-module.wasm`, 491 KB) and `./emscripten-module` with a `browser` condition; its loader resolves the file with `new URL("emscripten-module.wasm", import.meta.url)` unless `locateFile`/`wasmLocation` is given. That `new URL` is inside a dependency, which Vite's dev optimiser rewrites into `.vite/deps`; so the app passes the asset URL explicitly.
- Vite asset URL import (https://vite.dev/guide/assets#explicit-url-imports, 2026-10-16): a `?url` suffix imports any file as its resolved public URL (hashed in build). The page does not mention `.wasm` or workers; the outcome in dev and build is recorded in journal 015.

## Sharing scripts: Worker containment, CSP, advisories (plan 018)

**Checked:** 2026-10-16.

- MDN, Using web workers (https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers, 2026-10-16): "The worker thread is killed immediately" by `terminate()`; workers "may spawn more workers" (sub-workers, same origin, URIs relative to the parent worker); workers are, in general, not governed by the CSP of the document or worker that created them, a policy for a worker comes from the response headers of the worker script itself, except for `blob:`/`data:` workers, which inherit the creator's CSP. Consequence: a static build (adapter-static) cannot set a `connect-src` for the script Worker from the repo; it is a hosting decision (draft follow-up). The page gives no browser-support table for nested workers: verified here only in the Claude app's built-in browser (Chromium), see journal 018.
- MDN, `worker-src` (https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/worker-src, 2026-10-16): governs which URLs may be loaded as Worker/SharedWorker/ServiceWorker scripts; falls back to `child-src`, `script-src`, `default-src`. Inheritance and `connect-src` behaviour in workers were not on that page and are not relied on.
- npm `quickjs-emscripten`: latest 0.32.0, modified 2026-02-16 (`npm view quickjs-emscripten version time.modified`, 2026-10-16), unchanged since plan 010. The GitHub security-advisories API returned 404 for the repository (no published advisories visible); the README still says the library is unaudited.
- **Measured here** (Bun 1.4.2, quickjs-emscripten 0.32.0, 10 ms budget, one tick each): the interrupt handler is polled inside the interpreter loop, not inside native builtins. `indexOf` of a 5000-char needle in a 10 MB string: 25.4 s; `3n ** 3000000n`: 108 ms; BigInt modular squaring: 73 ms; `'x'.repeat(8e6).split('').join('-')`: 44 ms; regex catastrophic backtracking, `Array.sort` on 3 million numbers or 2 million strings, `JSON.parse` loops and `replace` on 2 MB: stopped at 12 to 13 ms. So a same-thread budget bounds ordinary loops, not every builtin; only killing the thread bounds those (ADR 0031).
