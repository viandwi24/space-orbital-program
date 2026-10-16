# 0038 — The script Worker runs in a sandboxed iframe with a no-network CSP

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/030-script-hardening-and-tooling.md
**Amends:** ADR 0031 (where the script Worker lives; the Worker-per-Run, watchdog and command filter stay). Resolves the "sandboxed iframe" alternative ADR 0031 left open.

## Context

ADR 0031 put each Run's script in its own Worker spawned by the sim Worker and said so honestly: that Worker is same-origin, so after an escape from QuickJS-WASM (unaudited upstream) the attacker would have `fetch` to the game origin and its IndexedDB. A CSP for the Worker could only come from response headers of the Worker script, which a static build does not control. Scripts are about to be shared between strangers.

Checked for this decision (`research/scripting.md`, 2026-10-16): a sandboxed iframe without `allow-same-origin` has an opaque origin; a `blob:` Worker created in it inherits that origin and the creator's CSP (MDN, Using web workers); a `<meta>` CSP in the iframe document can therefore govern the Worker with no header at all. Measured in the Claude app's browser: from the iframe document and from the Worker, same-origin `fetch`, IndexedDB, localStorage, cookies and Cache storage are all blocked, while the same probe in the game page reaches all five.

## Decision

**The script Worker is created inside `<iframe sandbox="allow-scripts">` (never `allow-same-origin`) from a blob; the iframe document carries a CSP that forbids the network.**

- Page (`script-sandbox.ts`, `script-sandbox-web.ts`): per Run it creates the iframe, with `srcdoc` built from `static/sandbox/script-sandbox.html` and the bundled bootstrap (`script-sandbox-document.ts`). The policy is `default-src 'none'; script-src 'sha256-<bootstrap>' 'wasm-unsafe-eval'; worker-src blob:; connect-src 'none'` plus `'none'` for every other fetch directive. The page makes a `MessageChannel`, sends the iframe the Worker's script text, a copy of the QuickJS `.wasm` bytes (the iframe cannot fetch them) and `port2` (transferred), and gives the sim Worker `port1` with `script-start`.
- Iframe (`script-sandbox-frame.ts`): refuses to do anything unless `window.origin === "null"` and the message comes from its parent; builds the Worker from the text, transfers the port and the wasm to it, relays only the Worker's self-test report and errors to the page.
- Worker (`script-sandbox-worker.ts`): `createScriptRunnerIn` with `wasmBinary`; talks to the sim Worker over the port, so the protocol and `script-channel.ts` (watchdog, boot timeout, command filter) are unchanged; the sim Worker sees a `ScriptWorkerLike` over a port (`script-port.ts`).
- **Hard kill = removing the iframe** (the page does it whenever the script's status leaves `starting`/`running`, on Stop and on dispose). That kills a Worker stuck inside a native builtin. It needs the main thread to be alive, which it is while the game renders.
- **Self-test** (`script-sandbox-probe.ts`): from the iframe document and from the Worker the probe tries same-origin `fetch(no-cors)`, IndexedDB, localStorage, cookies and Cache storage. The panel says "Runs isolated" only when both contexts reported all five blocked, shows the table under "What the sandbox checked", and turns the line into a warning naming what was reachable. A sandbox that does not start fails the Run with a message (fail closed; there is no fallback to the old same-origin Worker).
- The two frame scripts are bundled to classic scripts by `apps/web/scripts/build-sandbox.ts` (`dev` and `build` run it; output `static/sandbox/*.js`, gitignored).
- **Per-tick budget 10 ms -> 200 ms, first tick 200 -> 300 ms** (still below the 500 ms watchdog). The script is off the sim thread, so the budget now only bounds runaways, and a wall-clock budget is load-sensitive: a 0.4 ms tick spiked to 23.8, 45.3, 100.7 and 220.3 ms on a busy machine with software rendering and was killed at 10 and at 50 ms (journal 030).
- `srcdoc`, not `src`: the frame fetches nothing; the policy names its single script by hash; it behaves identically in dev and in a static build. A `src` iframe was also blocked by the Claude app's browser (`ERR_BLOCKED_BY_CLIENT`), so it could not have been verified here.

**What remains possible after an escape from QuickJS (documented in `guides/scripting.md` and the panel):** the attacker runs in a Worker with no storage, no cookies, no network and no handle on the page; it can burn CPU and memory until the watchdog or Stop removes the iframe, send arbitrary messages to the sim Worker over its port (shape-checked, command-filtered, then `commandSchema`; only `throttle`, `attitude`, `stage` and `action` for the script's own vessel pass), and try to use side channels and browser bugs. A browser or CSP bug is outside what this can promise. The script text is also still the player's to read before running: imports show a stranger-code confirm.

## Alternatives considered

- **Keep the nested Worker and ask the host for `Content-Security-Policy: connect-src 'none'` on the Worker script.** Needs response headers on a static host that is not chosen; fragile; opaque origin not obtained (IndexedDB stays). Kept as an additional layer for plan 023 (below), not as the mechanism.
- **Run QuickJS in the iframe's main thread.** A native-builtin runaway would freeze the iframe's thread (possibly the page's: process sharing) with no way to stop it short of removing the iframe from a frozen process. Rejected; the Worker is the killable unit.
- **`sandbox` iframe loaded by `src` with a CSP header.** Best form once the host sets headers; blocked in the browser used for verification, and needs a header per file. The `srcdoc` document is the same policy delivered by `<meta>`.
- **Route snapshots through the page** (page <-> iframe <-> Worker with `postMessage`). Puts a main-thread hop (frame-bound) in every tick. The transferred `MessagePort` keeps ticks between the two Workers.
- **A syntax-checking CodeMirror editor.** Not a sandbox matter; see `research/scripting.md` (own tokenizer, no dependency).

## Consequences

- **Hosting requirements (plan 023):** nothing is required for the sandbox to work on a static host. If the host sets a CSP on the game page it must allow what the page already needs plus: `frame-src about:` (the `srcdoc` iframe; also `child-src` if used), the iframe's inline script by hash (a `srcdoc` document inherits the parent's CSP in addition to its own, so the parent's `script-src` must allow `'sha256-<hash of static/sandbox/script-sandbox-frame-main.js>'`, or `'unsafe-inline'` is needed there, which is worse), `worker-src 'self' blob:` for the sim Worker's own needs, and `connect-src 'self'` as before. Recommended extra headers: `Cross-Origin-Opener-Policy: same-origin` and `Permissions-Policy` denying unused features; `X-Content-Type-Options: nosniff`; no CORS headers (`Access-Control-Allow-Origin: *` is not needed: the page fetches the bundles itself). Serving `static/sandbox/*` with `Content-Security-Policy: sandbox allow-scripts` is possible but unused (documents are `srcdoc`).
- The page's own CSP, if added without these, makes scripts fail closed with "the script sandbox did not start".
- Cost: an iframe per Run (about 165 KB of Worker text posted, a 0.5 MB wasm copy transferred, a Worker spawn), a build step before `dev`/`build`, nothing new at run time in the sim.
- Supported where sandboxed iframes, blob Workers with inherited CSP, `MessagePort` transfer and `'wasm-unsafe-eval'` are. Verified in Chromium only (Claude app browser); Safari and Firefox are draft plan 032. If the sandbox cannot start, scripts do not run.
- Residual: QuickJS-WASM is still unaudited; the CSP and the opaque origin bound what an escape reaches, they do not prevent it. The sim Worker still receives messages from that Worker.
- Docs: `architecture/scripting.md` (arrangement, hosting list), `guides/scripting.md` (what to trust), ADR 0031 gets a pointer.
