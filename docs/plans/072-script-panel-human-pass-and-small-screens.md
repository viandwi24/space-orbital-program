---
id: 072
title: "Script editor: the human pass and the panel on small screens"
status: draft
owner: ""
depends: [058]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 072 — Script editor: the human pass and the panel on small screens

## Goal

Act on what a person finds with a screen reader, a keyboard only, a real input method and a tablet, none of which an agent could do in plan 058, and fix the layout of the script panel on small screens, which plan 058's browser runs showed is cramped.

## Context

- Journal 058 has the human checklist. Findings are added to this plan's Log by the person who ran it.
- Found in plan 058 (not done): at 1024x768 the instrument deck covers the lower part of the script panel (the touch bar, the Run button and the problems list are partly behind it), and the flight's touch overlay (throttle track, Cut and Full chips) intercepts taps on the panel's lower right when touch controls are on (Playwright reported the intercepting elements). The editor itself works.
- macOS: Ctrl+Space switches input sources, so the explicit "suggest" key is unusable there; the Suggest button exists only on touch screens.

## Scope

**In (to be ordered at refinement):**
1. The human findings (screen reader: are the suggestions, the syntax error announcement and the Escape-then-Tab hint sensible, is the live region too chatty; keyboard only; IME composition, dead keys).
2. The script panel on 1024x768 and on tablets: no overlap with the instrument deck or the touch overlay (the panel scrolls above them, or the deck yields).
3. A second key for "suggest" on macOS, and the Suggest button for every pointer if the person finds it useful.

**Out:** an editor library (ADR 0066).

## Acceptance criteria

- [ ] To be made measurable at refinement, from the findings.

## Docs checklist

- [ ] STATUS, journal, `guides/scripting.md`.

## Log

- 2026-10-17 — Created as draft by plan 058.
