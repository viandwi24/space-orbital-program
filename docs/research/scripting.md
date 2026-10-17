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

## Hardened container: sandboxed iframe, blob Worker, CSP (plan 030)

**Checked:** 2026-10-16.

- MDN, `<iframe>` (https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe, 2026-10-16): without `allow-same-origin` the resource "is treated as being from a special origin that always fails the same-origin policy (potentially preventing access to data storage/cookies and some JavaScript APIs)"; `allow-scripts` alone lets it run scripts; combining `allow-scripts` and `allow-same-origin` for same-origin content is "strongly discouraged" because the document can remove the attribute. The page does not name IndexedDB or workers.
- HTML Standard, sandboxing flags (https://html.spec.whatwg.org/multipage/browsers.html#sandboxing-flag-set, 2026-10-16): the sandboxed origin flag "forces content into an opaque origin, thus preventing it from accessing other content from the same origin"; opaque origins serialise as `"null"`; `document.cookie` and `localStorage` are blocked. IndexedDB is not mentioned there (measured below).
- MDN, `Worker()` constructor (https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker, 2026-10-16): the URL must be same-origin with the caller, or a `blob:` or `data:` URL; a `blob:` URL inherits the origin of the document that created it; `data:` workers have an opaque origin; with a CSP on `worker-src` "you will need to allow the `blob:` origin". `NetworkError` if the script's MIME type is wrong.
- MDN, Using web workers (https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers, 2026-10-16): workers are in general not governed by the CSP of their creator, but "if the worker script's origin is a globally unique identifier (for example, if its URL has a scheme of data or blob). In this case, the worker does inherit the CSP of the document or worker that created it." This is what lets a `<meta>` policy in the iframe document govern the Worker without any response header.
- CSP Level 3 (https://w3c.github.io/webappsec-csp/, 2026-10-16), section 3.3: a `<meta>` policy does not support `report-uri`, `frame-ancestors` or `sandbox` (and not Report-Only). So the `sandbox` flags come from the iframe attribute, and `frame-ancestors`/`sandbox` as headers are an option for the host (plan 023). The read of the full spec was truncated (316 KB); the `connect-src` and local-scheme inheritance text was not read there, the behaviour below was measured instead.
- MDN, `script-src` (https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src, 2026-10-16): `'wasm-unsafe-eval'` allows WebAssembly compilation without allowing `eval`; `'unsafe-eval'` would override it. The compatibility table was not in the fetched text; browser versions for it (Chrome 97, Firefox 102, Safari 15.4) were from memory; plan 032 checked them: Safari is **16.0**, the others as stated (`browser-support.md`).
- Not verified online: whether Safari and Firefox apply the iframe `<meta>` CSP to a blob Worker and allow a sandboxed iframe to start a blob Worker. They are plain, standard features, the design fails closed (a sandbox that does not start means scripts do not run, with a message), and checking is draft plan 032.

**Measured in the Claude app's built-in browser (Chromium), dev server, 2026-10-16:**

- A `<iframe sandbox="allow-scripts">` loaded by `src` (same-origin URL) is **blocked by the app** (`net::ERR_BLOCKED_BY_CLIENT`, network panel) for any URL, including `/robots.txt`; the same URL with `allow-scripts allow-same-origin` or no sandbox loads. A `srcdoc` iframe with `sandbox="allow-scripts"` runs and reports `window.origin === "null"`. Hence the document is delivered as `srcdoc` (ADR 0038). A normal Chrome is not known to behave this way; not tested.
- Inside that iframe (document and blob Worker, `<meta>` CSP `default-src 'none'; connect-src 'none'; worker-src blob: ...`) the self-test reports, for both contexts: origin opaque, `fetch(no-cors)` to the game origin blocked, `indexedDB.open` blocked, `localStorage` blocked, `document.cookie` blocked, `caches.open` blocked. The same probe run in the game page itself reports all five reachable (positive control). The blob Worker created from the `srcdoc` document started and ran QuickJS from `wasmBinary` bytes under `script-src 'sha256-...' 'wasm-unsafe-eval'` (no `'unsafe-eval'`).
- `new URL(x, import.meta.url)` in the emscripten glue throws when the bundle replaces `import.meta.url` by `about:blank` (an invalid base); a valid dummy base is needed even though `wasmBinary` is supplied (found by the first manual run).
- Wall-clock script budget: with software-rendered WebGL and other sessions running, the sample ascent's worst tick time was 12.5, 15.9, 23.8, 45.3, 100.7 and 220.3 ms in different runs (last tick 0.2 to 0.5 ms). A 10 ms and a 50 ms budget each killed a harmless script; 200 ms did not (ADR 0038).

## Code editor and highlighter (plan 030)

**Checked:** 2026-10-16 (`npm view`, unpacked sizes from the registry).

- CodeMirror 6: `codemirror` 6.0.2 + `@codemirror/lang-javascript` 6.2.5, MIT, the core packages together are a few hundred KB unpacked once state, view, language and commands are counted; a full editor for a 100-line script.
- `sugar-high` 2.6.0 (MIT, 98 KB unpacked, highlight only), `prismjs` 1.30.0 (MIT, 2.0 MB unpacked), `highlight.js` 11.12.0 (BSD-3-Clause, 5.5 MB unpacked).
- Decision: none of them. The script text is short, only colour is needed, and a textarea over a painted layer keeps native editing, IME and accessibility. A 90-line tokenizer (`script-highlight.ts`) colours keywords, the script API names, strings, numbers and comments; it is not a parser, a wrong colour never changes what a script does.

## The sandbox in Chromium, Firefox and WebKit (plan 032)

**Measured:** 2026-10-17, Playwright 1.64.1 engines on macOS (Chromium 156.0.8078.4, Firefox 157.0, WebKit 27.2), the production build, `apps/web/e2e/` (journal 032). Answers to the questions of the plan 030 draft:

- **Does the iframe `<meta>` CSP govern the blob Worker?** Yes in all three: the Worker's self-test (same-origin `fetch`) is blocked by the policy in each (Chromium and Firefox log the violation as a console error; the e2e suite expects exactly the `/robots.txt` pair from Chromium).
- **Does `'wasm-unsafe-eval'` allow QuickJS everywhere?** Yes: the script engine booted from `wasmBinary` and the sample ascent ran in all three. Firefox additionally logged a CSP error for zod's `new Function('')` probe; the Worker bundle now sets zod `jitless` before @orbital/core loads (`script-sandbox-jitless.ts`).
- **May a `sandbox="allow-scripts"` `srcdoc` iframe start a blob Worker?** Yes in all three.
- **Opaque-origin behaviour differs in WebKit:** `document.cookie` in the sandboxed frame returns `""` and `caches` in the blob Worker is an empty store instead of throwing (Chromium and Firefox throw `SecurityError`). Experiment (cookie `sentinel=game-secret` and Cache `sentinel-cache` created in the game origin, then read from the sandboxed frame and its blob Worker): WebKit saw neither (`cookie ""`, `caches.has` false, `keys []`), `localStorage` threw in all three. So WebKit is isolated, but the old probe (any working API = reachable) reported `frame.cookie, worker.caches` reachable and turned the panel line into a warning. The probe now looks for page-planted sentinels (`isolated` = works but sees none of the page's data).
- **Does a `src` iframe work outside the Claude app?** Yes: `<iframe sandbox="allow-scripts" src="/sandbox/script-sandbox.html">` loaded (load event, document present, no failed request) in Playwright's Chromium, Firefox and WebKit. The `ERR_BLOCKED_BY_CLIENT` of plan 030 is specific to the Claude app's built-in browser. The document stays `srcdoc` (ADR 0038): it works everywhere, needs no header, and a `src` document would need the host to set a CSP header per file. Moving to `src` with headers is a plan 023 option, not a requirement.

## The script editor without a library (plan 036)

**Checked:** 2026-10-17.

- npm `@codemirror/view` 6.43.14: licence MIT, **1,261,210 bytes unpacked**, dependencies `@codemirror/state`, `style-mod`, `w3c-keyname`, `crelt` (https://registry.npmjs.org/@codemirror/view/latest, 2026-10-17). Language and autocomplete packages come on top. Not taken (ADR 0038, ADR 0066).
- CodeMirror's page on the Tab key (https://codemirror.net/examples/tab/, 2026-10-17): Tab is deliberately not bound in the default setup so that it meets the WCAG "no keyboard trap" criterion; when an app binds it, it should document an escape: press Escape, then Tab, and the editor skips that Tab so focus moves on. The same convention is used here.
- WCAG 2.1 Understanding SC 2.1.2 No Keyboard Trap (https://www.w3.org/WAI/WCAG21/Understanding/no-keyboard-trap.html, 2026-10-17): focus that can enter a component must be able to leave it with the keyboard alone; if that takes more than arrow or Tab keys, the user must be told how.
- Measured in the Claude app's browser (Chromium) and by Playwright's Chromium (`e2e/editor.e2e.ts`): Ctrl+F sent as a synthetic key in the app browser is not delivered to the page (the editor's handler was verified by dispatching the event); in Playwright's Chromium it is. The `beforeinput` events `historyUndo` and `historyRedo` (the menu route) are handled but were not observed in either; the keyboard route is. Not measured in Firefox or WebKit.

## Script editor follow-ups (plan 058)

**Checked:** 2026-10-17.

- `KeyboardEvent.isComposing` (https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/isComposing, 2026-10-17): true only for key events between `compositionstart` and `compositionend`; a constructed `new KeyboardEvent(...)` has `false`. The page does not say what Safari does at the end of a composition; the common account (not verified here against a real IME, which needs a person) is that Safari fires `compositionend` *before* the keydown of the key that commits, so that keydown has `isComposing === false` with `keyCode === 229` (`key` is `"Process"` in some browsers). The editor therefore treats `isComposing`, a composition flag set by `compositionstart`/`compositionend`, `keyCode === 229`, `key === "Process"` and `key === "Dead"` as input-method keys and does nothing with them (`script-editing-keys.ts`, unit tests plus a synthetic-event e2e in all three engines).
- WAI-ARIA Authoring Practices, combobox pattern (https://www.w3.org/WAI/ARIA/apg/patterns/combobox/, 2026-10-17): DOM focus stays on the input; `aria-activedescendant` on it names the option in a `listbox` popup; `aria-controls` names the popup; `aria-autocomplete="list"`. The pattern is written for single-line inputs and a multiline textarea is not covered; `combobox` is not an allowed role for `textarea`, so the editor keeps those attributes on the textarea (as since plan 036) and the screen-reader behaviour is a human check (journal 058).
- QuickJS `compileOnly` (quickjs-emscripten-core 0.32.0, `ContextEvalOptions.compileOnly`, `dist/index.d.ts`: "compile but do not run"; the result is bytecode that can be run later). Measured here (`packages/scripting/test/syntax.test.ts`): a script of `print(1);\nwhile (true) {}` compiles and returns at once with nothing printed; syntax errors carry `script.js:LINE:COLUMN` in the stack like runtime errors, an error at the end of the input (unclosed bracket) is reported on the wrapper's closing line, one past the script.
- Firefox's "Find again" is Ctrl+G and Safari's is Cmd+G; Firefox's Ctrl+Shift+D bookmarks all tabs. The editor takes Ctrl/Cmd+G inside the textarea (like Ctrl/Cmd+F since plan 036) and uses Shift+Alt+Up/Down for copying lines instead of VS Code's Ctrl+Shift+D. Measured in Playwright's engines: see journal 058.
