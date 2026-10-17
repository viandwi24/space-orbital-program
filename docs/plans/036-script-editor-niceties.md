---
id: 036
title: Script editor niceties
status: done
owner: "script session (Claude, 2026-10-17)"
depends: [032]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 036 — Script editor niceties

## Goal

The editor conveniences players of a code-editing game ask for, added without breaking keyboard navigation and without an editor library: Tab indentation with a way out, auto-indent, bracket matching, find, undo that works after the editor's own edits, suggestions for the script API from one typed table, and a light check for obvious mistakes.

## Context

- Read: plan 030 (the textarea over a painted layer), plan 032 (why this was pushed out), ADR 0038 (CodeMirror rejected for size), ADR 0066 (this plan's decisions), `research/scripting.md` (editor section, 2026-10-17), `guides/scripting.md`.
- The editor is `apps/web/src/lib/hud/CodeEditor.svelte`; its tokenizer is `script-highlight.ts`.

## Scope

**In:** `script-api.ts` (the API table), `script-editing.ts` (pure editing logic), `CodeEditor.svelte` (keys, completion list, find bar, problems list, live region), the highlighter reading the table, tests, one browser e2e, docs.

**Out (draft 058):** a check by a person with a screen reader and by keyboard only, Firefox and WebKit runs of the key handling, replace, deeper completions, a parse for the check, auto-closing brackets (the draft says no).

## Steps

1. The API as a typed table with a test against the real sandbox; the highlighter reads it.
2. Pure editing functions with tests: indent, outdent, newline, closing bracket, bracket match, marks, find, completions, history, lint.
3. The component: Tab and Escape-then-Tab, Enter, undo and redo, find bar, completion list with ARIA, problems list, hint and live region; Escape does not reach the flight page's pause menu.
4. Browser check in the app browser on a production build; one Chromium e2e (`workers: 1`).
5. Docs: ADR 0066, research, guide section, journal, draft 058.

## Acceptance criteria

- [x] `cd apps/web && bunx vitest --run src/lib/script-editing.test.ts`: Tab indents at the caret and every touched line of a selection (blank lines stay blank), Shift+Tab takes a tab or up to four spaces and keeps the selection on the same text, and the two round-trip; Enter keeps the indentation, goes one level deeper after `{ ( [` (not inside a string or comment) and splits a pair onto three lines; a closing bracket on an indentation-only line outdents; no bracket is closed for you.
- [x] Same file: the bracket next to the caret is matched over nested pairs and ignores strings and comments; marks split tokens without changing the text; find lists non-overlapping matches (case-insensitive by default) and steps with wrap-around.
- [x] Same file: completions offer the globals from the second letter, the members of `ship` after `ship.` (28), nothing in strings and comments, after another receiver, after a digit or for a finished word; accepting replaces the typed prefix.
- [x] Same file: undo and redo walk the edits in order, typing runs merge until a pause or a change of kind, a new edit drops the redo tail, a selection-only change adds no step, the stack is capped; lint reports unpaired brackets with the opener's line, unterminated strings and comments, unknown `ship` members with the nearest name, assignment to a read-only member (not `==`, `===`, `>=`), un-awaited `wait`, `waitUntil`, `nextTick`, is quiet on valid code and stops at 20.
- [x] `src/lib/script-api.test.ts`: the API table equals what a real script sees (`Object.getOwnPropertyNames(globalThis)` minus ECMAScript, and `Object.keys(ship)`) and fails when an entry is removed (checked once by hand: removing `warp` fails it).
- [x] `bun run check` in `apps/web`: 0 errors, 0 warnings; `bunx playwright test e2e/editor.e2e.ts --project=chromium`: type with auto-indent, accept a suggestion with Tab, see the un-awaited `wait` reported, undo and redo, find with "1 of 2" then "2 of 2", Escape closes find, Escape then Tab leaves the editor without the pause menu, no console errors.
- [x] `[manual]` Built-in browser, production build: the same behaviours with real key events (Enter after `{` indents, `}` lines up, a suggestion list shows the member and its description and Tab accepts it, bracket pair highlighted, problems list with a line button, Ctrl+Z and Shift+Ctrl+Z step through the edits, Escape then Tab moves focus on and the pause menu stays closed, find highlights and counts). JPG screenshots `docs/journal/assets/036-*.jpg`. **Not done by a person:** a screen reader and a keyboard-only run (draft 058).
- [x] `bun run test`, `cd apps/web && bunx vitest --run`, `bun run typecheck`, `bun run build`, `bun run docs:check`; prettier clean on touched files; the script sandbox tests stay green.

## Docs checklist

- [x] `STATUS.md`, journal 036, ADR 0066, `research/scripting.md`, `guides/scripting.md`, draft 058, roadmap entry.

## Log

- 2026-10-17 — Created as draft by plan 032.

- 2026-10-17 — Refined draft → ready at the human's request (session: script-editor session). Library rejected again (research and ADR 0066); the accessibility check by a person stays open (draft 058).
- 2026-10-17 — Done. Evidence in journal 036. Escape had to be kept from the flight page (it opens the pause menu); found in the first browser run. Not done: a person's screen-reader and keyboard-only pass (draft 058).
