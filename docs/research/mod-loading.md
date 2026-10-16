# Runtime mod loading (plan 046)

Checked **2026-10-17**.

| Topic | Fact used | Source |
|---|---|---|
| `import()` of a blob URL | Dynamic `import()` is allowed in the main thread, shared workers and dedicated workers (not service workers or worklets). MDN names `blob:` URLs as the way to import module source that was fetched as text, with the caveat that fetch destination, CSP and module resolution are the user agent's, not the page's. Verified in Bun 1.4.2 (`URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))` then `import(url)` returns the namespace). The browser run (journal 046) repeats it in the real page and Worker. | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import |
| Module workers | `new Worker(url, { type: 'module' })` has ES module semantics; Chrome/Edge 80, Firefox 114, Safari 15. The sim Worker already is one (Vite bundles `sim.worker.ts`), so `import()` inside it is available. | https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker |
| CSP | The game page sets no CSP of its own (`app.html`, hooks and `static` contain none); only the script sandbox frame has one (ADR 0038) and mods never run there. A host that adds `script-src` later must allow `blob:`; recorded in ADR 0057. | repo grep, 2026-10-17 |
| Bundling a mod | `Bun.build({ entrypoints, format: 'esm', target: 'browser', plugins, minify })` returns `{ success, outputs, logs }`; `external` leaves imports in place (a bare specifier cannot resolve from a blob URL, so not used). A plugin `onResolve` + `onLoad` in a namespace serves a virtual module: used to replace `@orbital/sdk` with a shim that reads the host's SDK. | https://bun.com/docs/bundler |
| Storage of bundles | IndexedDB holds strings of any size within the origin quota (`research/save-and-load.md`); a bundle is tens of KB. Its own database `orbital-mods`, as saves (ADR 0050) use `orbital-saves`. | `research/save-and-load.md` |
| Zip | Not used: reading a zip in the browser needs a dependency or `DecompressionStream` plus a hand-written container parser; a JSON envelope with the code as a string needs neither and can be inspected in a text editor before trusting it. | design decision (ADR 0057) |
| SHA-256 | `crypto.subtle.digest('SHA-256', bytes)` is available in browsers, Workers, Bun and Node; used to show the player a fingerprint of the code and to detect an edited envelope. | https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest |
