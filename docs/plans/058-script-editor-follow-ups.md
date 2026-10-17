---
id: 058
title: "Script editor follow-ups"
status: done
owner: "editor-2 session (Claude, 2026-10-17)"
depends: [036]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 058 — Script editor follow-ups

## Goal

What plan 036 left out of the script editor that an agent can build and prove: replace and find options, go to line, line commands and comment toggling, deeper suggestions, a real syntax check before Run (compiled in the sandbox, not run), optional auto-closing, on-screen keys for touch, and the key handling in Firefox and WebKit. What needs a person (a screen reader, a keyboard-only run) is written as a checklist for the human in the journal, not faked.

## Context

- ADR 0066 (the editor is a textarea with our own key handling), ADR 0038 (sandbox guarantees hold), ADR 0063 (touch), journals 030 and 036, `research/scripting.md`.
- Checked online 2026-10-17 (recorded in `research/scripting.md`): MDN `KeyboardEvent.isComposing` (https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/isComposing) defines the flag only between `compositionstart` and `compositionend`; Safari fires `compositionend` before the keydown that commits, so that keydown has `isComposing === false` and `keyCode === 229` (MDN does not say; a guard on `keyCode === 229` is the common fix and is tested by a synthetic event here, a real IME needs a person). WAI-ARIA APG combobox (https://www.w3.org/WAI/ARIA/apg/patterns/combobox/): DOM focus stays on the input, `aria-activedescendant` points at the option in the `listbox`, `aria-controls` names the popup, `aria-autocomplete="list"`; the pattern is written for single-line inputs, a multiline textarea is not covered, and `combobox` is not an allowed role of `textarea`, so the editor keeps `textbox` semantics with those attributes (already so since 036).

## Scope

Decisions per draft candidate (draft order kept; nothing dropped):

1. **Screen reader and keyboard-only run by a person: not doable by an agent.** Written as a checklist for the human in the journal. What an agent can do toward it is done in item 7 (the IME guard, the live-region texts are unit-tested, no new announcements added without a test).
2. **Find: replace, replace all, match case, whole word, Ctrl/Cmd+G to a line** (pure functions in `script-editing.ts`, find bar in `CodeEditor.svelte`).
3. **Line commands:** Ctrl/Cmd+/ toggles line comments on the touched lines, Alt+Up/Down move the touched lines, Shift+Alt+Up/Down duplicate them. (Ctrl+Shift+D, VS Code's key, is "bookmark all tabs" in Firefox, so it is not used.)
4. **Auto-closing of brackets and quotes as an option, off by default** (ADR 0066 said "no" as a default; this adds the choice). Stored in its own `localStorage` key, read through a validating parser.
5. **Deeper suggestions:** members of `ship.target.`, `ship.orbit.`, `ship.nodes[i].`, `ship.engines[i].`, `ship.wheels[i].`, `ship.parts[i].`, `ship.position/velocity/up/nose.`, `ship.orientation.`, `ship.attitude.`, `bodies[id].` and `bodies[id].orbit.`/`.atmosphere.`, taken from the same table (each checked against the shapes `telemetry.ts` really produces); argument names of `addNode({`, `setNode(id, {` offered inside the object literal. ("From the part data" for `engines[0].` means the fields of the telemetry entry, which is what a script can read; the part ids are not static.)
6. **A real syntax check before Run, compiled in the sandbox without running:** `checkScriptSyntax` in `packages/scripting` (QuickJS `compileOnly`, same wrapper and line mapping as the runner), a `check` message in the script Worker, and a second, lazily opened sandbox in the page for checks (same iframe, same CSP, ADR 0038 unchanged; closed after 30 s idle and when the panel closes). The engine's error and line show in the problems list as an error; Run is not blocked by it (the engine decides at Run). Needs an ADR (second sandbox instance and its lifecycle).
7. **Key handling in other engines:** an IME guard that also covers `keyCode 229` and a composition flag, tested with synthetic events in vitest; `e2e/editor.e2e.ts` extended and run once in Firefox and once in WebKit (one engine at a time, `workers: 1`). macOS Ctrl+Space switches input sources: documented, and a "Suggest" button exists in the touch bar (item 8). Real IME and dead keys need a person: checklist.
8. **Touch:** an on-screen bar (Tab, Shift+Tab, Undo, Redo, Suggest) shown when the primary pointer is coarse (`(pointer: coarse)`), buttons keep editor focus (no blur on press).

**Out:** a full editor library (ADR 0066 stands: items 6 and 4 did not make the textarea unmanageable); multi-cursor, folding.

## Steps

1. Find options, replace, go to line (pure + component).
2. Line commands and comment toggling; auto-close option.
3. Member tables and nested completions; argument names.
4. `checkScriptSyntax` in `packages/scripting` + tests; Worker `check` message; page-side checker (second sandbox) + problems list integration; ADR.
5. IME guard; touch bar; hint text.
6. e2e extended; run Chromium, then Firefox, then WebKit (`E2E_PORT=5238`, one at a time).
7. Browser check (app browser, one tab) with JPG screenshots; docs, guide, journal with the human checklist; roadmap entry removed or replaced.

## Acceptance criteria

- [x] `cd apps/web && bunx vitest --run src/lib/script-editing.test.ts`: `findAll` honours match-case and whole-word (`ship` does not match inside `shipment` when whole-word is on); replace-one replaces the current match and moves to the next; replace-all replaces every match and leaves the selection sensible; the replaced text is a single undo step; `lineStarts`/go-to-line gives the right offset, clamps past the end, rejects non-numbers.
- [x] Same file: comment toggle comments every touched non-blank line, uncomments when all are commented, keeps relative indentation, round-trips; move up/down keeps the selection on the same text and does nothing at the first/last line; duplicate down/up copies the touched lines and selects the copy.
- [x] Same file: with auto-close on, typing `(`, `[`, `{`, `"`, `'`, `` ` `` inserts the pair with the caret between; typing the closer steps over it; Backspace between a pair removes both; no auto-close inside strings/comments or before a word character; off by default returns null for all of them. The stored option is parsed (garbage gives off).
- [x] `script-editing.test.ts` / `script-api.test.ts`: the nested completions offer exactly the members listed for each receiver above, no members after unknown receivers, `addNode({ ` offers `time prograde normal radial` minus those already written; and a test that every nested member name equals a key the real telemetry produces (`buildTelemetry` over a fixture with a target, an orbit, a node, an engine, a wheel) so the table cannot drift.
- [x] `cd packages/scripting && bun test`: `checkScriptSyntax` returns `{ ok: true }` for valid scripts including top-level `await`, and `{ ok: false, message, line, column? }` with the line of the player's source (wrapper offset removed) for a missing bracket, a stray `}`, `await` misuse in a non-async function, and an unterminated string; it never executes the script (a script with `print(1)` or an infinite loop leaves no logs and returns at once); the runner's own error line for the same source agrees.
- [x] `cd apps/web && bunx vitest --run`: protocol parser accepts a `check` request and a `checked` answer and rejects malformed ones; the checker controller debounces, drops stale answers, closes the sandbox after idle, and reopens on the next check; Worker core answers a check without a runner; the sandbox tests (`script-sandbox*.test.ts`, probe, frame) stay green and unchanged in what they assert.
- [x] Sandbox guarantee: the checker sandbox is the same `createScriptSandbox` (same `sandbox` attribute without `allow-same-origin`, same CSP document); a test asserts the checker never passes a port to the sim Worker and `[manual]` the panel's containment line still reads "Runs isolated" while the checker is open.
- [x] IME: synthetic `keydown` with `isComposing`, with `keyCode 229`, and inside a `compositionstart`..`compositionend` leaves text, history and completion untouched for Tab, Enter, Escape, Ctrl+Z, Ctrl+Space and brackets (vitest on the key-handler helper).
- [x] Touch bar: appears with `(pointer: coarse)` emulation and not otherwise; Tab/Shift+Tab/Undo/Redo/Suggest do what the keys do; pressing them does not blur the textarea; they have accessible names.
- [x] `E2E_PORT=5238 bunx playwright test e2e/editor.e2e.ts --project=chromium` then `--project=firefox` then `--project=webkit`, each alone: the 036 flow plus find options and replace, comment toggle, move line, an invalid script showing the engine's error in the problems list before Run with its line button; no console errors. Any engine-specific failure is fixed or recorded with its cause (a failing engine is not skipped silently).
- [x] `[manual]` Built-in browser, production build on 5238: the syntax error appears while typing without pressing Run, suggestions for `ship.target.`, replace, Ctrl+/; JPG screenshots `docs/journal/assets/058-*.jpg` (~85).
- [x] `bun run test`, `cd apps/web && bunx vitest --run`, `bun run typecheck` (0 errors), `bun run build`, `bun run docs:check`, prettier clean on touched files.

## For the human (not acceptance criteria; an agent cannot meet them)

Screen-reader and keyboard-only pass, real IME and dead keys, macOS Ctrl+Space: checklist in journal 058, mirrored in STATUS open issues. A follow-up draft is created for what the person finds.

## Docs checklist

- [x] `STATUS.md`, journal 058 (with the human checklist), ADR (checker sandbox), `research/scripting.md`, `guides/scripting.md` (editor section), roadmap entry removed, plans README if it lists plans.

## Log

- 2026-10-17 — Created as draft by plan 036.
- 2026-10-17 — Refined draft → ready at the human's request (session: editor-2 session). Criteria made measurable; the person-only item stays a human checklist; the parse check is kept (compiled in the sandbox, ADR needed), not deferred.
- 2026-10-17 — Started (editor-2 session).
- 2026-10-17 — Done. Evidence in journal 058. Chromium, Firefox and WebKit pass `e2e/editor.e2e.ts` (one engine at a time). Found by the WebKit run: Safari does not focus a clicked button, so the find bar keeps the focus itself. Not done by an agent: the screen-reader, keyboard-only and real-IME passes (checklist in journal 058; draft 072 collects the findings and the panel's layout on small screens). Deviation from the Scope list: the macOS Ctrl+Space alternative is a Suggest button on touch screens only (draft 072 item 3); the tablet "on-screen Tab and undo" is shown for a coarse pointer, emulated in Chromium and WebKit only.
