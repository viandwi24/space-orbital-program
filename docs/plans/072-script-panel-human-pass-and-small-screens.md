---
id: 072
title: "Script editor: the human pass and the panel on small screens"
status: blocked
owner: "Agent 2"
depends: [058, 112]
phase: 6
created: 2026-10-17
updated: 2026-10-18
---

# 072 — Script editor: the human pass and the panel on small screens

## Goal

Act on what a person finds with a screen reader, a keyboard only, a real input method and a tablet, none of which an agent could do in plan 058, and fix the layout of the script panel on small screens, which plan 058's browser runs showed is cramped.

## Context

- Journal 058 has the human checklist. Findings are added to this plan's Log by the person who ran it.
- Found in plan 058 (not done): at 1024x768 the instrument deck covers the lower part of the script panel (the touch bar, the Run button and the problems list are partly behind it), and the flight's touch overlay (throttle track, Cut and Full chips) intercepts taps on the panel's lower right when touch controls are on (Playwright reported the intercepting elements). The editor itself works.
- macOS: Ctrl+Space switches input sources, so the explicit "suggest" key is unusable there; the Suggest button exists only on touch screens.
- Foundation (ADR 0102, 0107): the script panel moves into the dock (plan 112) and the HUD is re-laid out in the refs style (plan 088). A human pass on the old layout would be stale; run it after plan 112.

## Scope

**In (to be ordered at refinement):**
1. The human findings (screen reader: are the suggestions, the syntax error announcement and the Escape-then-Tab hint sensible, is the live region too chatty; keyboard only; IME composition, dead keys).
2. The script panel on 1024x768 and on tablets: no overlap with the instrument deck or the touch overlay (the panel scrolls above them, or the deck yields).
3. A second key for "suggest" on macOS, and the Suggest button for every pointer if the person finds it useful.

**Out:** an editor library (ADR 0066).

**Realignment (2026-10-17):** item 2 is re-checked in the dock layout of plan 112 at 1024x768 and 1180x820; item 1's findings also cover the refs components (switches, segmented controls) the panel now uses.

## Touches

- **Size:** S
- **Edits:** `apps/web/src/lib/hud/ScriptPanel.svelte`, `apps/web/src/lib/hud/CodeEditor.svelte`, `apps/web/src/lib/keybindings.ts`, `docs/guides/scripting.md`
- **Shared contracts:** none

## Steps

Refined 2026-10-18 by Agent 2 ([ADR 0162](../decisions/0162-script-editor-second-suggest-key-and-human-pass.md)). The agent does the automatable items; the human pass (item 1, the Suggest button for every pointer) is the owner's and gates `done`.

1. **Agent:** a second "suggest" key: Ctrl+I and Cmd+I, next to Ctrl+Space (ADR 0162); the editor's hint and keys list name it; `guides/scripting.md`.
2. **Agent:** re-check item 2 in the dock layout (plan 112) at 1024x768 and 1180x820 with `e2e/mobile.e2e.ts`.
3. **Owner:** run journal 058's human checklist (screen reader, keyboard only, a real IME and dead keys, macOS keys, a tablet), with the refs components the panel now uses (switches, segmented controls) and Cmd+I in real Safari, Chrome and Firefox. Findings go into this Log; each one either becomes a fix here or a new draft.
4. **Owner:** decide whether the Suggest button is shown for every pointer (today: touch screens only).

## Acceptance criteria

- [x] vitest: Ctrl+I and Cmd+I are `suggest`; plain I, Alt+I and Ctrl+Shift+I are left to the browser (`script-editing-keys.test.ts`).
- [x] e2e (Chromium, WebKit): Cmd+I and Ctrl+I in the editor open the suggestion list, type nothing and keep the focus (`editor.e2e.ts`, "nested suggestions and the keys of a node").
- [x] e2e (Chromium): at 1024x768 and 1180x820 in the dock layout the script panel does not overlap the instrument deck, the touch throttle is clear of it, and the Run button receives taps (`mobile.e2e.ts`, the three `tablet-*` tests per size).
- [ ] Owner: the human checklist of journal 058 run, findings in the Log, each one fixed or filed as a draft.
- [ ] Owner: the Suggest button for every pointer decided (shown, or kept to touch screens with the reason in the Log).

## Docs checklist

- [x] STATUS row, journal [072](../journal/072-script-panel-human-pass.md), `guides/scripting.md`, ADR 0162.

## Log

- 2026-10-18 — Agent 2: refined (Steps, criteria, ADR 0162). Done: Ctrl/Cmd+I suggests (vitest, e2e Chromium + WebKit); item 2 re-checked in the dock layout at 1024x768 and 1180x820 (`mobile.e2e.ts` tablet tests, Chromium: 6 passed). Stopped at the human step: the plan is `blocked` on the owner's pass (Steps 3 and 4; the checklist is journal 058's "Human checklist" plus Cmd+I in real browsers and the refs switches and segmented controls). Firefox is not installed on this machine.
- 2026-10-17 — Plan 055 (phone session) fixed item 2 for tablets at 1024x768 and 1180x820 (the script panel and guide scroll above the measured instrument deck; the touch throttle sits beside the open panel; panels are above the touch overlay; `e2e/mobile.e2e.ts` guards it). What remains here is the human pass (item 1) and item 3.
- 2026-10-17 — Created as draft by plan 058.
- 2026-10-17 — Realigned with the owner's Fondasi Orbital decisions (ADR 0102, 0107: run after the script panel moves into the dock).
- 2026-10-18 — Code merged by Agent 1 (bun test 1704 pass, web vitest 1037 pass, typecheck, build, docs:check, smoke 7 passed, editor and mobile e2e 20 passed in Chromium and WebKit); the plan stays `blocked` on the owner's two human steps, its checkpoint pending until they are done.
