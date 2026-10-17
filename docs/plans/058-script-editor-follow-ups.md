---
id: 058
title: "Script editor follow-ups"
status: draft
owner: ""
depends: [036]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 058 — Script editor follow-ups

## Goal

What plan 036 left out of the script editor, mostly what needs a real person or a parser.

## Context

- ADR 0066 (the editor is a textarea with our own key handling), journal 036 (what was checked and how).

## Scope

**In (candidates, to be ordered at refinement):**

1. **A check with a screen reader and with keyboard only, by a person** (VoiceOver, NVDA): is the Escape-then-Tab convention found, are the suggestions and problems read sensibly, is the live region too chatty? The plan 036 checks used synthetic keys only.
2. Firefox and WebKit runs of `e2e/editor.e2e.ts` and of the key handling (IME composition, macOS Ctrl+Space which switches input sources, dead keys).
3. Replace in find; whole-word and case options; Ctrl+G to a line.
4. Completion of members deeper than `ship.` (`ship.target.`, `ship.orbit.`, `bodies[id].`) and of the argument names of `addNode`; `ship.engines[0].` from the part data.
5. A real parse for the check (the engine's own syntax error, with its line, shown before Run): compile in the sandbox without running.
6. Auto-closing of brackets and quotes as an option, comment toggling (Ctrl+/), duplicate line, move line.
7. Touch: an on-screen Tab and undo for tablets (ADR 0063).

**Out:** a full editor library unless 5 and 6 grow beyond a textarea (ADR 0066).

## Steps

1. Refine; each candidate may become its own plan.

## Acceptance criteria

- [ ] To be written when refined.

## Docs checklist

- [ ] `STATUS.md`, journal, `guides/scripting.md`.

## Log

- 2026-10-17 — Created as draft by plan 036.
