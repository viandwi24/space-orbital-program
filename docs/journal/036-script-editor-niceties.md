# 036 — Script editor niceties

**Plan:** plans/036-script-editor-niceties.md · **Session(s):** script-editor session (Claude, 2026-10-17) · **Date:** 2026-10-17 · **ADRs:** [0066](../decisions/0066-script-editor-without-a-library.md) · **Research:** [scripting, "The script editor without a library"](../research/scripting.md)

## What was done

| Where | What |
|---|---|
| `apps/web/src/lib/script-api.ts` | the script API as one table (globals and `ship` members, signature, one line each); the highlighter, the suggestions and the check read it |
| `script-editing.ts` | pure functions: indent, outdent, newline, closing bracket, bracket match, marks, find, completions, our own undo history, lint |
| `script-highlight.ts` | now `scan` (flat tokens with a "closed" flag) plus `highlight` on top; the API colour comes from the table (it had missed `warp`, `warpTo`, the node functions, `setTarget` and `bodies`) |
| `hud/CodeEditor.svelte` | Tab and Escape-then-Tab, Enter, undo and redo, find bar, suggestion list with ARIA, problems list with line buttons, hint under the editor, polite live region |
| tests | `script-editing.test.ts` (38), `script-api.test.ts` (3, runs the real sandbox), highlight tests, `e2e/editor.e2e.ts` |
| docs | ADR 0066, research, scripting guide ("The editor"), draft 058, roadmap entry |

## What the numbers say

```
script-editing.test.ts    38 pass (indent/outdent round trip, Enter in six situations, brackets, marks, find, completions, history, lint)
script-api.test.ts        the table equals the sandbox's globals and ship members; removing `warp` from it fails the test (checked by hand)
e2e/editor.e2e.ts         1 pass in Playwright Chromium, 1.4 min including the production build; no console errors
bun run test              989 pass; apps/web vitest 619 pass, 1 fail (plan 050's roadmap entry, not this plan)
```

## In the browser (manual criterion)

Production build served on 5218, a generated flight with the script panel open, real key events through the app browser. `while (ship.altitude < 10) {` then Enter gave a tab-indented next line; typing `ship.thr` showed the suggestion `throttle` with its description and Tab took it; `wait(1);` was reported ("wait() does nothing unless you await it") with a line button; the closing `}` landed at the left margin; the matching braces were highlighted. Ctrl+Z three times and Shift+Ctrl+Z twice walked back and forth through exactly the edits made (typing runs as one step). Escape then Tab moved focus to the "Line 1" button of the problems list and the pause menu stayed closed. Find (the event dispatched, see below) highlighted both `ship` matches and counted "1 of 2", "2 of 2". Screenshots: `assets/036-editor-indent-bracket-lint.jpg`, `036-editor-find.jpg`.

## What surprised me

- **Escape opened the pause menu** on the first run: the flight page listens for Escape on the window. An Escape that is meant to tell the editor "Tab may leave now" must not reach it; the editor stops it (a second Escape outside the editor opens the menu as before).
- **Setting a textarea's value throws away the browser's undo history**, so every indent, auto-indent and suggestion would have made Ctrl+Z undo only a few characters. The editor keeps its own stack and intercepts the shortcuts.
- **The highlighter's API list was already stale** (it knew eight of fifteen names). One table, tested against the real sandbox, removes that class of error.
- **A synthetic Ctrl+F is swallowed by the app's browser** (the keystroke never reaches the page); Playwright's Chromium delivers it, so the e2e test covers it. The handler was also checked by dispatching the event.
- **The tokenizer's per-line split made "unterminated template string" hard to see**; a flat `scan` with a `closed` flag was a smaller change than teaching the lint to stitch lines.
- **Typing a single letter popped suggestions on every identifier**; the globals start at the second letter, `ship.` at once.

## Decisions (ADRs)

0066.

## How to test manually (the part no agent did)

With a keyboard only: open the script panel, Tab into the editor, type some code, press Escape and Tab: focus must leave. With a screen reader (VoiceOver, NVDA): after Escape the page should say that Tab now moves focus out; while typing `ship.`, the suggestions should be announced and the highlighted one read with its description; the problems list is a normal list of buttons. Are these announcements too many or too few? That is draft 058's first item.

## Open questions / follow-ups

- Draft 058: a person's screen-reader and keyboard run, Firefox and WebKit key runs (IME, macOS Ctrl+Space switches input sources), replace, deeper suggestions, a parse for the check, an on-screen Tab for tablets.
- The script panel is cramped at 1024x768 (the hint, the problems list and the find bar add height; the panel scrolls).
- Ctrl+Space on macOS is the default shortcut for switching input sources; typing `ship.` or two letters shows the list anyway.

## Verification output

```
bun run test                 989 pass, 0 fail (112 files)
apps/web vitest --run        619 pass, 1 fail (roadmap.test: plan 050 is done but still on the roadmap page)
bun run typecheck            0 errors (svelte-check 1474 files)
bun run build                ok
bunx playwright test e2e/editor.e2e.ts --project=chromium   1 passed
bun run docs:check           OK
```
