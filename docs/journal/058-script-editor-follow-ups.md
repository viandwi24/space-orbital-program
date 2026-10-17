# 058 — Script editor follow-ups

**Plan:** plans/058-script-editor-follow-ups.md · **Session(s):** editor-2 session (Claude, 2026-10-17) · **Date:** 2026-10-17 · **ADRs:** [0085](../decisions/0085-syntax-check-in-a-second-sandbox.md) · **Research:** [scripting, "Script editor follow-ups"](../research/scripting.md)

## What was done

| Where | What |
|---|---|
| `apps/web/src/lib/script-editing.ts` | `findAll` takes options (match case, whole word); nested completions (`ship.target.`, `ship.nodes[0].`, `bodies[id].orbit.`, ...) resolved from the chain before the dot; the keys of the object given to `addNode(` and `setNode(id,`; structural lint problems tagged `syntax` |
| `script-editing-commands.ts` (new) | replace one and all, go-to-line offsets, comment toggle, move and duplicate lines, auto-closing of brackets and quotes |
| `script-editing-keys.ts` (new) | the table of keys as a pure function, with the input-method rule (`isComposing`, composition flag, `keyCode` 229, `key` "Process" and "Dead" are never ours) |
| `script-api.ts` | `MEMBERS` (the nested objects by path), `NODE_FIELDS`, `insert` on an entry |
| `editor-options.ts` (new) | the one option (close brackets and quotes), stored under `orbital.editor`, parsed with zod |
| `hud/CodeEditor.svelte` | find bar with Aa / ab / replace / replace all, go to line bar, the key actions, auto-close, the engine's syntax error in the problems list, on-screen keys on a coarse pointer, "More editor keys and options" |
| `packages/scripting` | `checkScriptSyntax` (`syntax.ts`, QuickJS `compileOnly`), `wrapScript`, `scriptErrorPosition`; the runner's `errorLine` is clamped to the script |
| `script-protocol.ts`, `script-worker-core.ts`, `script-sandbox-worker.ts` | `check` / `checked` messages; the Worker answers without a runner |
| `script-checker.ts` (new) | the page's checker around a second `ScriptSandbox` (idle close, newest answer wins, no retry for 10 s after a failed start); wired in `routes/flight/+page.svelte` and `ScriptPanel.svelte` |
| tests | 1268 `bun test` (+ `syntax.test.ts`, 5); web vitest 807, of which 82 are new (commands, keys, nested completions, members against the real sandbox, checker, worker core, options: 78 in seven new files; protocol 3; lint 1); `e2e/editor.e2e.ts` 4 tests |
| docs | ADR 0085, `architecture/scripting.md`, `guides/scripting.md` (editor section), research, roadmap entry removed, draft 072 |

## What the numbers say

```
packages/scripting  bun test test/syntax.test.ts   5 pass (valid incl. top-level await and the sample ascent; 5 mistakes report the player's line; same line as the runner; `while (true) {}` checked at once, nothing printed; 200 checks in a row)
script-api-members.test.ts   every nested table equals Object.keys of the real sandbox's objects (removing `torque` from the wheel table fails it; checked by hand)
e2e/editor.e2e.ts   Chromium 4 of 4 (separate runs, 1.0 to 2.2 min each: software WebGL), Firefox 3 passed 1 skipped (18 s), WebKit 4 of 4 (26 s)
```

## In the browser (manual criterion)

Production build served by `scripts/serve.ts` (the real CSP headers) on 5238, app browser, one tab. Typing `print(1);` and `let a = ;` showed, without pressing Run and with the status still `idle`, the problem "Line 2 Syntax error: ..." and the line number marked in the gutter: the check works under the production CSP, in the checker's own sandbox. Typing `await addNode({ time: time() + 600, pro` offered `prograde number: Burn along the velocity, m/s.` and not `time`. Screenshots: `assets/058-editor-syntax-error.jpg` (taken at 1024x768), `assets/058-editor-node-keys.jpg`. The app browser does not deliver Ctrl+F or similar chords (journal 036), so find, replace, go to line, comments and moving lines were verified by the Playwright run in three engines, not by hand in the app browser.

## What surprised me

- **Safari does not focus a clicked button.** The Escape-closes-find test failed only in WebKit: after "Replace all" the focus was on the page, not in the bar. The find bar's buttons now put the focus back in the find or replace field, and Escape from any control of the bar closes it.
- **A syntax error at the end of the input is one line past the script**: the engine reports a missing `}` on the wrapper's closing line. Both the check and the runner's `errorLine` are clamped to the script's last line (a Run used to mark a row that does not exist).
- **A finished script closes its sandbox**, so the panel's line goes back to "checked at the first Run"; the e2e asserts "Runs isolated" while a script runs, with the checker's sandbox open next to it.
- **`Control+a` in Playwright on macOS moves the caret to the line start** (Emacs binding); the test uses `fill('')`.
- **At 1024x768 the instrument deck covers the lower part of the script panel**, and the flight's touch overlay intercepts taps on it when touch controls are on (Playwright named the throttle track and the Cut and Full chips as the intercepting elements). Existing layout, found here; draft 072. The touch e2e runs at 1440x900 with the overlay turned off.
- The existing completion test for a finished word ("nothing to offer when the typed word is the only match") also applies to the nested members: `ship.parts[0].position.z` offers nothing.

## Decisions (ADRs)

0085: the syntax check compiles in a second sandbox of the same kind; the Run's sandbox, its containment line and the sim Worker are untouched.

## Human checklist (nobody has done this)

An agent cannot do these; they are not acceptance criteria. Findings go into draft 072.

1. **Screen reader (VoiceOver on macOS, NVDA on Windows), keyboard only.** Tab into the editor; read the hint; type `ship.target.` and listen: is the list announced once, is the highlighted entry read with its description, is it too chatty while typing? Press Escape: is "Tab now moves focus out of the editor" read, and does the next Tab leave? Type `let a = ;`: after about half a second "Syntax error on line 1: ..." should be read once; is it clear, is it repeated? Is the problems list (buttons "Line N") usable? Open find (Ctrl/Cmd+F): are "N of M" and "Replaced. N left" read? Is "Go to line" with a bad number read as an alert?
2. **Keyboard only, no mouse:** every function above (find, replace, go to line, the options checkbox under "More editor keys and options") reachable and leavable.
3. **A real input method (Japanese, Chinese or Korean IME) in Safari, Chrome and Firefox:** compose text with Enter to commit; Tab, Enter and Escape during the composition must not indent, break a line or open the pause menu. Dead keys (US International, a French or German layout): accents typed, nothing else changes. The guard is tested with synthetic events (`isComposing`, `keyCode` 229, "Process", composition events) in three engines; a real IME has not been run.
4. **macOS:** Ctrl+Space (switches input sources) does not reach the page; typing `ship.` or two letters still opens the list. Cmd+G, Cmd+/ and Alt+Up/Down behave in Safari, Chrome and Firefox (Alt+Up on a Mac moves lines; check it does not also move the caret).
5. **A tablet or phone:** the Tab, Shift+Tab, Undo, Redo and Suggest buttons are shown, keep the on-screen keyboard open and do what the keys do. (Emulated in Chromium and WebKit only; the layout under the instrument deck is draft 072.)

## Open questions / follow-ups

- Draft 072: the human findings, the panel on 1024x768 and tablets, a second key for "suggest" on macOS.
- The checker adds an iframe and a Worker while the panel is open; the cost has not been measured on a low-end machine (about one Run's sandbox start).

## Verification output

```
bun run test                              1268 pass, 0 fail (141 files)
cd apps/web && bunx vitest --run          90 files, 807 pass
bun run typecheck                         0 errors (svelte-check 1536 files, all packages exit 0)
bun run build                             ok
bun run docs:check                        OK
prettier --check on every touched file    clean
E2E_PORT=5238 bunx playwright test e2e/editor.e2e.ts --project=chromium|firefox|webkit  (one at a time, workers 1)
                                          chromium 4 passed (run as separate invocations after fixing the tests; the first invocation overlapped a second one on the same port and failed), firefox 3 passed 1 skipped, webkit 4 passed
```
