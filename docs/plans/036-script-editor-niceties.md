---
id: 036
title: Script editor niceties
status: draft
owner: ""
depends: [032]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 036 — Script editor niceties

## Goal

The editor conveniences players of a code-editing game ask for, added without breaking keyboard navigation: Tab indentation, auto-indent, bracket matching and an API reference popover.

## Context

- Read: plan 030 (the textarea-over-a-painted-layer editor, `CodeEditor.svelte`, `script-highlight.ts`), plan 032 (why this was pushed out: the draft said "only if players ask, and only after a keyboard-accessibility check").

## Scope

**In (candidates, to be ordered at refinement):**

1. **Tab inserts indentation** with an Escape-to-leave-the-field convention (WCAG 2.1.2 no keyboard trap), announced to screen readers; needs a check with a screen reader and keyboard-only use by a person, which no agent session has.
2. **Auto-indent** on Enter and **bracket matching** (highlight only; no auto-closing).
3. **API reference popover** generated from `guides/scripting.md` or the prelude's names.

**Out:** a full editor library (ADR 0038 weighed and rejected CodeMirror for size).

## Steps

1. Refine when players ask for it and a person can do the accessibility check.

## Acceptance criteria

- [ ] To be written when refined.

## Docs checklist

- [ ] `STATUS.md`, journal, `guides/scripting.md`.

## Log

- 2026-10-17 — Created as draft by plan 032.
