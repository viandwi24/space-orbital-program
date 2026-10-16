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
