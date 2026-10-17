# 0066 — The script editor stays a textarea; its keyboard behaviour is our own code

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/036-script-editor-niceties.md
**Builds on:** ADR 0038 (the editor is a textarea over a painted layer; CodeMirror weighed and rejected for size). Research: `research/scripting.md` ("The script editor without a library, plan 036").

## Context

Plan 036: Tab indentation, auto-indent, bracket matching, find, correct undo, completion of the script API, and a check for obvious mistakes. The question was whether this is the point at which to take an editor library, and how Tab can indent without trapping a keyboard user (WCAG 2.1.2).

## Decision

1. **No library.** `@codemirror/view` alone is 1.26 MB unpacked (6.43.14, MIT; npm registry, 2026-10-17) with `@codemirror/state` and the language packages on top; the whole feature list here is about 530 lines of pure code (`script-editing.ts`) and a 140-line API table, plus the component (about 750 lines with its markup and styles), and the textarea keeps native input, IME and screen-reader behaviour. Reconsider if the editor needs real parsing (multi-cursor, folding, a JavaScript grammar for lint).
2. **Logic in pure functions** (`script-editing.ts`): text and selection in, text and selection out. The component owns the textarea and the key events and applies the results. Every behaviour has unit tests; the keyboard path has one browser test (`e2e/editor.e2e.ts`).
3. **Tab indents; Escape, then Tab, leaves.** This is the convention CodeMirror documents for the same reason (its page says Tab is not bound by default so the default setup has no keyboard trap). After Escape the next Tab is not intercepted; any other key restores indentation. The hint under the editor says so and the textarea is described by it (`aria-describedby`); a polite live region announces "Tab now moves focus out of the editor". The editor stops Escape from reaching the flight page, whose Escape opens the pause menu: Escape inside the editor belongs to the editor (a second Escape outside it opens the menu).
4. **One undo stack of our own.** Setting a textarea's `value` (indent, auto-indent, completion) discards the browser's undo history, so the browser's undo would undo only what was typed since the last such edit. All edits are recorded (typing and deleting runs merged within a second), Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, Ctrl+Y and the browser's own `historyUndo`/`historyRedo` events are intercepted and answered from it. A script replaced from outside (sample, import) resets it.
5. **One typed API table** (`script-api.ts`): the globals and `ship` members with signature and one-line description. The highlighter colours from it, completion lists it, the check "ship.altitud is not part of the API; did you mean ship.altitude" uses it, and `script-api.test.ts` runs the real sandbox and fails when the table and the engine disagree. The "API reference popover" of the draft is the description shown in the completion list.
6. **Completion** after `ship.` (any prefix) and for a global from its second letter; Ctrl+Space asks explicitly; Up/Down move, Enter or Tab accept, Escape closes; ARIA `aria-activedescendant` plus announcements. **No auto-closing of brackets or quotes** (the draft said so; it fights typing). Closing a bracket on an indentation-only line takes one level off first.
7. **The check is not a parser.** It reports brackets that do not pair, strings and comments that never end, unknown or read-only `ship` members, and `wait()`, `waitUntil()`, `nextTick()` without `await`. It never blocks Run; the engine's own error with its line still decides.

## Alternatives considered

- **CodeMirror 6 or Monaco:** size and a second input model to make accessible; rejected in ADR 0038 and again here.
- **`document.execCommand('insertText')` to keep the native undo:** deprecated, behaves differently in Firefox and WebKit; an own stack is testable.
- **Tab always indents (no escape):** a keyboard trap.
- **Tab always moves focus (indent by another key):** players coming from other editors expect Tab to indent; the Escape convention is the established middle.
- **Linting by compiling the script in the page:** `new Function` is blocked by the page's CSP and the sandbox is the place to compile (the engine's error and line).

## Consequences

- The scripting guide gets a section on the editor. A person with a screen reader and a keyboard-only person still need to try it (the plan's manual check was done by an agent with synthetic keys only).
- New script API names must be added to `script-api.ts`; the test says so when they are not.
