---
id: 032
title: Script API additions and the sandbox in other browsers
status: draft
owner: ""
depends: [030]
phase: 2
created: 2026-10-17
updated: 2026-10-17
---

# 032 — Script API additions and the sandbox in other browsers

## Goal

What plan 030 pushed out: the script API players will ask for next, and proof that the sandbox frame (ADR 0038) works, or fails closed with a clear message, in the browsers other than the Claude app's Chromium.

## Context

- Read: ADR 0038 and `research/scripting.md` ("Hardened container"), `architecture/scripting.md`, `guides/scripting.md`, journal 030.

## Scope

**In (candidates, to be ordered at refinement):**

1. **Browser matrix.** Run the manual sandbox checks of plan 030 (sample ascent to orbit, native-builtin runaway killed, import flow, the "Runs isolated" report) in desktop Chrome, Firefox and Safari, and a phone browser. Specific questions: does the iframe `<meta>` CSP govern the blob Worker in each (the probe says), does `'wasm-unsafe-eval'` allow QuickJS everywhere, is a `sandbox="allow-scripts"` `srcdoc` iframe allowed to start a blob Worker, does a `src` iframe work outside the Claude app (it was blocked there; if so the document could move to a header-carrying file). Record versions and results in `research/scripting.md`; where a browser fails, decide between a message and a fallback.
2. **Script API additions.** Other bodies' data (`ship.body` is the only one today), target and maneuver information, `Date` hidden for deterministic replays, command refusal feedback to the script (`stage()` returns whether it fired; today only the host logs `! stage: reason`), time warp while a script runs (in plan 030's manual run the warp buttons did nothing while the sample was coasting in orbit and its attitude loop was running; the cause was not investigated, a likely one is that the script's continuing `attitude` commands wake the vessel from rails).
3. **Editor.** Tab indentation (with an Escape-to-leave-the-field convention), auto-indent, bracket matching, an API reference popover; only if players ask, and only after a keyboard-accessibility check.
4. **CPU-bound budget.** A deterministic fuel count (interrupt-handler polls) next to the wall-clock budget, so a loaded machine does not kill a harmless script and replays are reproducible (ADR 0038 raised the wall budget to 200 ms instead).

**Out:** moving scripting to a server.

## Steps

1. Refine; one ADR if the budget or the container changes.

## Acceptance criteria

- [ ] To be written when refined (each executable; `[manual]` only for UI and browsers).

## Docs checklist

- [ ] `STATUS.md`, journal, `architecture/scripting.md`, `guides/scripting.md`, `research/scripting.md`.

## Log

- 2026-10-17 — Created as draft by plan 030.
