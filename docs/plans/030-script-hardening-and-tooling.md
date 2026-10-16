---
id: 030
title: Script hardening and tooling follow-ups
status: done
owner: "script-hardening session (Claude, 2026-10-16)"
depends: [018]
phase: 2
created: 2026-10-16
updated: 2026-10-17
---

# 030 — Script hardening and tooling follow-ups

## Goal

Scripts will be shared between strangers, so the sandbox must be honest and as strong as a static web build allows, and the script panel must be pleasant to use. When this is done: the script Worker runs inside an opaque-origin sandboxed iframe whose own CSP forbids every network request (no same-origin `fetch`, IndexedDB, storage or cookies reachable even after an engine escape, no hosting headers needed); the panel can share a script (text, link, file) and import one (file, pasted text, link) with a stranger-code warning and an explicit confirm before the first Run; the editor has syntax highlighting, line numbers and error-line marking; a script that blocks inside a native builtin is still terminated with the page live; the whole thing is verified by hand in the built-in browser, including the sample ascent to orbit that plan 018 left unticked.

## Context

- Read: ADR 0031 (alternatives considered: the iframe option is decided here), ADR 0020, ADR 0022, ADR 0026 (design system), `architecture/scripting.md`, `guides/scripting.md`, `research/scripting.md` (CSP for workers), journals 015, 017, 018.
- Plan 018's `[manual]` criterion (orbit from the panel, native-builtin runaway in the browser) is repeated and ticked here.

## Scope

**In:**

- Hardened container (ADR 0038): the script Worker is created from a blob inside `<iframe sandbox="allow-scripts">` (no `allow-same-origin`: opaque origin) whose `srcdoc` carries a `<meta>` CSP (`default-src 'none'`, `connect-src 'none'`, one hashed inline script, `worker-src blob:`, `'wasm-unsafe-eval'`). The blob Worker inherits origin and CSP. The page makes the `MessageChannel` and transfers one end to the iframe (on to the Worker) and one to the sim Worker, so ticks still travel sim Worker <-> script Worker directly. Removing the iframe is the hard kill.
- A runtime self-test of the sandbox from inside both contexts (same-origin fetch, IndexedDB, localStorage, cookies, Cache storage), shown in the panel; a reachable probe turns the "isolated" line into a warning.
- Share (copy text, copy link as a URL fragment, save file) and import (file, pasted text, `#script=` link): imported text is shown, never run without the confirm dialog; size caps, decompression-bomb safe.
- Editor: syntax highlighting (own tokenizer, no dependency), line numbers, error-line marking (the runner reports the script line of an error and rewrites its stack frames to script lines).
- Design: new syntax tokens in `tokens.css` with contrast tests; panel follows ADR 0026.
- The per-tick budget is raised from 10 ms to 200 ms (measured: a 0.4 ms tick spiked to 220 ms on a busy machine; the script is off the sim thread so the budget only bounds runaways).
- Hosting requirements for plan 023 (headers, CSP) written down in `architecture/scripting.md`.

**Out (new draft plan 032):** script API additions players will ask for (other bodies' data, target/maneuver info, command refusal feedback, `Date` hidden for deterministic replays) and verification of the sandbox in Safari, Firefox and non-Chromium engines (not available to this session; the design uses only standard APIs and fails closed). Out entirely: moving scripting to a server.

## Design notes

- Why `srcdoc`, not `src`: the frame fetches nothing (its CSP says so), the policy names the one inline script by its SHA-256 (computed by the page from the bundled bootstrap), and it works the same in `vite dev` and a static build. Costs: a CSP on the page itself must allow the hash (plan 023 note), and a document loaded by `src` was blocked outright by the Claude app's built-in browser (journal 030).
- Both frame scripts are bundled to classic scripts by `apps/web/scripts/build-sandbox.ts` (run by `dev` and `build`, output `static/sandbox/*.js`, gitignored): a blob Worker cannot import, and the page fetches the Worker text and the `.wasm` bytes itself because the iframe has no network.
- The iframe refuses to run anything if `window.origin` is not `"null"` (opened as a page, or sandboxed with `allow-same-origin`).
- Imported-script flow: import replaces the editor text (the previous text is kept for "Put my script back"), a banner says where it came from, the Run button says "Run imported script", the confirm dialog names the vessel and what a script can do, confirming clears the flag.

## Steps

1. Refine; record the checks in `research/scripting.md`; ADR 0038.
2. Runner: `errorLine`, mapped stack frames. Budget constants.
3. Sandbox: probe, frame, worker entry, bundle script, document builder, page-side lifecycle, port adapter in the sim Worker, flight-loop wiring.
4. Share/import module, highlight tokenizer, `CodeEditor`, panel, route integration, tokens.
5. Tests; manual run in the built-in browser; screenshots `docs/journal/assets/030-*.png`.
6. Docs: architecture, guide, journal, STATUS, plan 018 Log, draft plan 032.

## Acceptance criteria

- [x] From inside the sandbox contexts, same-origin `fetch`, IndexedDB, localStorage, cookies and Cache storage of the game origin are unreachable: the probe (with a positive control in the game origin where every probe is `reachable`) reports `blocked` for all of them in the iframe document and in the script Worker. Unit: `script-sandbox-probe.test.ts` (positive control, closed scope, one reachable item loses "contained", hung IndexedDB). Real browser: `[manual]` below shows both contexts' reports. What vitest cannot show is that a real browser applies the CSP and the opaque origin; the manual check covers it, and the positive control run in the page's own origin is recorded in the journal.
- [x] The sandbox document's policy forbids the network and loads nothing else: `script-sandbox-document.test.ts` (connect-src, default-src, worker-src, script-src is exactly the bootstrap hash plus `wasm-unsafe-eval`, no `'self'`/`unsafe-*`/URLs; the hash matches the inlined script; a bootstrap that could end its script element is refused; `SANDBOX_ATTRIBUTE` has no `allow-same-origin`).
- [x] The two bundles are real classic scripts and work: `script-sandbox-bundle.test.ts` builds them, checks no `import.meta`/imports, boots QuickJS from the bytes given and runs a script over a real `MessageChannel` (`print` line and `throttle` command come back), and sees the Worker's self-test report.
- [x] The frame refuses to run when its origin is not opaque, ignores messages not from its parent, relays only the report and errors (`script-sandbox-frame.test.ts`); the page side removes the iframe on close, fresh iframe per Run, fails (and removes the frame) on timeout or frame error, retries failed asset loads, and is "contained" only when both contexts reported all-blocked (`script-sandbox.test.ts`); the port adapter carries messages and `terminate()` stops delivery (`script-port.test.ts`).
- [x] A script blocked in a native builtin is still killed when the Worker is in the iframe: `[manual]` below; the existing real-thread tests of the sim host (`sim-host-script-worker.test.ts`) keep passing.
- [x] A script error carries its script line and the error text names script lines: `bun test packages/scripting` (`error-line.test.ts`); the line reaches the page (`sim-host-script.test.ts`, `script-state.test.ts`).
- [x] Share/import: links round-trip including non-ASCII, decode refuses damaged, foreign, oversized and non-UTF-8 links with a reason and does not expand a 10 MB bomb (`script-share.test.ts`); imported text is checked and normalised; `[manual]`: import from pasted text and from a link shows the banner and runs only after the confirm dialog.
- [x] Syntax highlighting: tokenizer tests (`script-highlight.test.ts`), the editor shows line numbers and marks the error line (`[manual]`, screenshot).
- [x] The panel uses the ADR 0026 tokens; every new syntax token meets 4.5:1 on the editor field and on the error-line band (`tokens.test.ts`).
- [x] `[manual]` In the built-in browser with nothing else reloading the page (own dev server on a port that ignores other sessions' edits): the sample ascent from the panel reaches orbit (also ticks plan 018's `[manual]` criterion); `('a'.repeat(3e6)+'b').indexOf('a'.repeat(2000)+'c')` is terminated while the HUD clock keeps running; a script imported from pasted text and one from a link are shown, run only after confirming, and a script error marks its line; screenshots `docs/journal/assets/030-*.png`.
- [x] Hosting requirements for plan 023 are listed in `architecture/scripting.md`.
- [x] `bun test packages/scripting`, the web tests (`bun run --filter @orbital/web test`), `bun test`, `bun run typecheck`, `bun run build`, `bun run docs:check`, `prettier --check` pass.

## Docs checklist

- [x] `STATUS.md`, journal 030, `architecture/scripting.md`, `guides/scripting.md`, ADR 0038 (+ 0031 amended note), `research/scripting.md`, plan 018 Log, draft plan 032.

## Log

- 2026-10-16 — Created as draft by plan 018.
- 2026-10-16 — Refined draft → ready at the human's request (session: script-hardening session).
- 2026-10-16 — ready → in-progress (script-hardening session).
- 2026-10-17 — Deviations from the draft, all recorded in ADR 0038 and journal 030: the iframe document is delivered as `srcdoc` (a `src` sandboxed iframe was blocked by the verification browser, and `srcdoc` needs no fetch); the per-tick budget went from 10 to 200 ms (first tick 300 ms) after harmless ticks of 23.8, 45.3, 100.7 and 220.3 ms were measured; the draft's script API additions and the Safari/Firefox check moved to draft plan 032 (not available to this session). Also fixed a flaky pre-existing test (`budget.test.ts` recursion, now a 5 s budget).
- 2026-10-17 — in-progress → done. `[manual]` run in the built-in browser: sample ascent to a 76.6 km periapsis, runaway terminated with the HUD running, imports from pasted text and a link, error line marked; plan 018's manual criterion ticked. Not exercised by hand: Copy text/link and Save file (clipboard and download permissions), "Put my script back".
