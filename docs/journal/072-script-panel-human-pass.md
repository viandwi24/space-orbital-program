# 072 — Script editor: the human pass and the panel on small screens

**Plan:** [plans/072-script-panel-human-pass-and-small-screens.md](../plans/072-script-panel-human-pass-and-small-screens.md) · **Session:** Agent 2 (Dev B, MacBook Pro M2 13"), 2026-10-18 · **ADRs:** [0162](../decisions/0162-script-editor-second-suggest-key-and-human-pass.md) (new), [0066](../decisions/0066-script-editor-without-a-library.md) · **Research:** none

**Status when written: the agent's part done; blocked on the owner's human pass.**

## What was done

| Where | What |
|---|---|
| `apps/web/src/lib/script-editing-keys.ts` | Ctrl+I and Cmd+I are `suggest` (ADR 0162), next to Ctrl+Space; Shift and Alt variants are left alone |
| `apps/web/src/lib/hud/CodeEditor.svelte` | the hint names Ctrl+I; the keys list says Cmd+I on a Mac |
| `docs/guides/scripting.md` | the keys table |
| tests | `script-editing-keys.test.ts` (+2 chords, +3 left alone), `e2e/editor.e2e.ts` (Cmd+I and Ctrl+I open the list, type nothing, keep the focus) |

Item 2 (the panel on tablets) was fixed by plan 055; the dock of plan 112 did not break it: `mobile.e2e.ts`'s tablet tests pass at 1024x768 and 1180x820.

## What surprised me

- Nothing in the code: the editor already calls `preventDefault` for every key it acts on, so Cmd+I needs no special case in WebKit (Safari binds it to "Email this page"; real Safari is for the owner's pass).
- The touch-layout tests in `mobile.e2e.ts` run in Chromium only (they tap); WebKit ran the editor test.

## Human checklist (for the owner)

Journal [058](058-script-editor-follow-ups.md#human-checklist-nobody-has-done-this)'s checklist, items 1 to 5, plus:

6. **Cmd+I on a Mac** in Safari, Chrome and Firefox opens the suggestion list and nothing else (no mail window, no page info).
7. **The refs components** the panel now uses (switches, segmented controls in the dock): read by the screen reader with their state, reachable and leavable by keyboard.
8. **The Suggest button for every pointer:** useful with a mouse? Record the decision in the plan Log.

## Open questions / follow-ups

- Findings from the human pass become fixes in plan 072 or new drafts.

## Verification output

```
bunx vitest run src/lib/script-editing-keys.test.ts       28 passed
E2E_PORT=5210 bunx playwright test e2e/editor.e2e.ts -g "nested suggestions" --project=chromium --project=webkit
                                                          2 passed
E2E_PORT=5210 bunx playwright test e2e/mobile.e2e.ts -g "tablet-1" --project=chromium --project=webkit
                                                          6 passed (chromium; the tablet tests run there only)
```
