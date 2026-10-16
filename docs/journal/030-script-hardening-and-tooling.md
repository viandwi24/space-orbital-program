# 030 — Script hardening and tooling follow-ups

**Plan:** plans/030-script-hardening-and-tooling.md · **Session:** script-hardening session (Claude, 2026-10-16) · **Date:** 2026-10-16/17

## What was done

The draft was refined to `ready` at the human's request (iframe, blob Worker and CSP checks in `research/scripting.md`), then implemented. ADR [0038](../decisions/0038-script-sandbox-in-an-opaque-origin-iframe.md) puts the script Worker in an opaque-origin `<iframe sandbox="allow-scripts">` whose `srcdoc` carries a no-network CSP; the blob Worker inherits origin and policy, so the old same-origin `fetch` and IndexedDB access of a compromised Worker is gone without any header from a host. No scaffolding, no new dependencies (a highlighter library was weighed and rejected, `research/scripting.md`).

| Area | Files (all under `apps/web` unless noted) |
|---|---|
| sandbox | `src/lib/script-sandbox.ts` (page lifecycle), `script-sandbox-web.ts` (DOM and `$app/paths` wiring), `script-sandbox-document.ts` (srcdoc + CSP hash), `script-sandbox-frame.ts` + `-frame-main.ts` (iframe side), `script-sandbox-worker.ts` (was `script.worker.ts`), `script-sandbox-probe.ts` (self-test), `script-port.ts` (sim-Worker end), `static/sandbox/script-sandbox.html` (template), `scripts/build-sandbox.ts` (bundles the two frame scripts; `dev` and `build` run it), `.gitignore` |
| wiring | `flight-loop.ts` (opens the sandbox on Run, closes it when the script ends), `messages.ts` (`script-start` port, `errorLine`), `sim-client.ts`, `sim-host.ts` (port in, budgets), `sim.worker.ts`, `script-protocol.ts`, `script-worker-core.ts`, `script-state.ts` |
| runner | `packages/scripting/src/runner.ts` (`errorLine`, stack frames mapped to script lines), `index.ts` |
| panel | `src/lib/hud/ScriptPanel.svelte` (rewritten), `hud/CodeEditor.svelte`, `script-highlight.ts`, `script-share.ts`, `ui/tokens.css` (`--syn-*`), `routes/flight/+page.svelte` |
| tests | `script-sandbox{,-probe,-frame,-document,-bundle}.test.ts`, `script-port.test.ts`, `script-share.test.ts`, `script-highlight.test.ts`, `ui/tokens.test.ts`, `script-state.test.ts`, `sim-host-script.test.ts`, `sim-client.test.ts`; `packages/scripting/test/error-line.test.ts`, `budget.test.ts` |
| docs | ADR 0038, `research/scripting.md`, `architecture/scripting.md`, `guides/scripting.md`, plan 018 (manual criterion ticked), draft plan 032 |

## What surprised me

1. **The built-in browser blocks sandboxed iframes loaded by `src`.** `<iframe sandbox="allow-scripts" src="/sandbox/x.html">` fails with `net::ERR_BLOCKED_BY_CLIENT` for any URL (even `/robots.txt`); with `allow-same-origin` or no sandbox it loads, and a `srcdoc` sandboxed frame runs and reports `origin === "null"`. So the document is `srcdoc` (a bonus: no network fetch by the frame, one script named by hash in the policy). Cost: a CSP on the *page* must allow that hash (hosting list in `architecture/scripting.md`).
2. **`import.meta.url` in the bundled emscripten glue.** The bundle must be a classic script (a blob Worker cannot import), so `import.meta.url` is replaced at build time; with `about:blank` as replacement the glue's `new URL(wasm, base)` threw "Invalid URL" even though the bytes are passed in. Any valid base works. Found by the first browser run; `script-sandbox-bundle.test.ts` now runs the real bundle.
3. **Wall-clock budgets are load-sensitive.** On a machine with software-rendered WebGL and other agents running, the sample's tick is 0.2 to 0.5 ms normally but the worst tick of different runs was 12.5, 15.9, 23.8, 45.3, 100.7 and 220.3 ms. A 10 ms budget killed a harmless sample (23.8 ms), so did a 50 ms one (220.3 ms). The budget is now 200 ms (first tick 300 ms; watchdog still 500 ms); it only bounds runaways, since the script is off the sim thread. A deterministic fuel count is listed in draft 032.
4. **Warp did nothing while the sample ran** in orbit (buttons dimmed, "needs the vessel on rails"); the coast and burn were driven at 1x. Not investigated (likely the script's `attitude` commands waking rails); draft 032.
5. **The js tool of the built-in browser shows a stale DOM** for a while after a navigation or HMR update (status text read `idle` while the screenshot showed `running`); screenshots and `find` were reliable. The pane is shared with other sessions: another session's tab (`localhost:5190/vab`) appeared in the tab context; every call passed `tabId`.
6. **Vite reloaded the page on every edit by other sessions** (`mods/stock/src/parts.ts`, `lib/delta-v.ts`): the temporary config `vite.script.config.ts` (deleted) ignored `packages/`, `mods/` and the editor/VAB/delta-v files; `preview_logs` of a dev server is huge (the TTY redraws), do not read it.
7. A pre-existing flake in `packages/scripting/test/budget.test.ts` (`runaway recursion ...`, 25 ms budget) failed once in 6 parallel runs; its budget is now 5 s (it tests classification, not speed).

## Manual run (built-in browser, dev server on 5191, then the production build on a preview server)

The sandbox started ("Runs isolated: no network, no saved data, no access to this page") and the panel's table shows, for the sandbox page and for the script Worker: origin opaque; `fetch`, `indexedDB`, `localStorage`, `cookie`, `caches` all `blocked`. Run in the game page itself (positive control, `probeContainment(window, ...)`): origin `http://localhost:5191`, all five `reachable`.

- **Sample ascent to orbit** (nothing reloaded the page; the panel's Run; the script finished): liftoff, `staged at 66.1 s`, `cut: apoapsis 80085 m`, circularise burn; final orbit **apoapsis 84.6 km, periapsis 76.6 km, e 0.006**, status `finished`, last tick 6.1 ms, worst 108.7 ms. Headless the same script gives 76.2 km periapsis (`bun test`). `assets/030-sample-orbit.png`.
- **Native-builtin runaway** `('a'.repeat(3e6)+'b').indexOf('a'.repeat(2000)+'c')`: status `terminated`, "script stopped responding (no answer within 500 ms); its worker was terminated", the HUD clock kept running (T+00:26 to 00:32 across screenshots) and the page stayed live. `assets/030-runaway-terminated.png`.
- **Import from pasted text** (banner "Imported from pasted text", button "Run imported script", confirm dialog naming the vessel, then `hello from an imported script`, `altitude after 3 s: 34.0 m`, status `finished`, banner gone): `assets/030-import-banner.png`, `030-import-confirm.png`, `030-import-ran.png`.
- **Import from a link** (`/flight#script=v1....`, also when the fragment changes in the open tab): panel opened with the script shown and not run; confirmed; the script's `null.altitude` failed with `Line 5: TypeError: cannot read property 'altitude' of null at <anonymous> (line 5:13)` and line 5 marked in the editor: `assets/030-error-line.png`.
- **Production build** (`vite preview`): the sandbox started from `build/sandbox/*` and a saved script ran (`production build: hello`, `alt 7.50`, `finished`).

Not covered by a screenshot: Copy text / Copy link / Save file (clipboard and download permissions in the pane were not exercised), "Put my script back" (covered by reading the code only).

## Decisions made

ADR 0038 (sandbox iframe, `srcdoc`, probe, budget 200/300 ms). Draft plan 032 holds what was pushed out: the browser matrix (Firefox, Safari, Chrome, phone), script API additions, editor niceties, a fuel-count budget.

## Open questions / follow-ups

- Hosting (plan 023): the list in `architecture/scripting.md` (the page's CSP must allow the sandbox `srcdoc` and its script hash; no CORS needed; optional headers).
- The sandbox was verified in one Chromium only. If a browser fails the probe or cannot start the frame, scripts do not run (fail closed); nothing is done to recover.
- The editor has no Tab indentation (kept the keyboard focus order); players will ask.

## Verification output

```
bun test packages mods                                   558 pass, 0 fail
bun test packages/scripting                              34 pass; 6 parallel runs all green
bun run --filter @orbital/web test (vitest)              287 pass (2 parallel runs green)
bun run typecheck                                        0 errors (svelte-check 1175 files)
bun run build                                            ok (build/sandbox/ holds the two scripts and the template, one .wasm 491 KB)
bun run docs:check                                       OK (31 plans, 37 ADRs)
prettier --check on the files of this plan               clean (the repo-wide check also names .claude/launch.json, packages/renderer/src/site-meshes.ts and apps/web/vite.radial.config.ts: other sessions' files)
```
