# 0162 — Script editor: Ctrl/Cmd+I as the second "suggest" key; the human pass stays with the owner

**Status:** accepted
**Date:** 2026-10-18
**Plan:** [072](../plans/072-script-panel-human-pass-and-small-screens.md)
**Builds on:** ADR 0066 (the editor without a library), plan 058 (editor keys, the touch bar), ADR 0102 (the dock)

## Context

The editor opens its suggestion list with Ctrl+Space. On macOS Ctrl+Space switches input sources by default and never reaches the page, so a Mac keyboard has no explicit "suggest" key (typing `ship.` or two letters still opens the list). The other items of plan 072 (screen reader, keyboard only, a real IME, a tablet) need a person.

## Decision

1. **Ctrl+I and Cmd+I suggest**, on every platform, next to Ctrl+Space. It is the alternative trigger of the editors people know (VS Code binds `triggerSuggest` to Ctrl/Cmd+I), it is a single chord with no Shift, and the editor calls `preventDefault` on it as it does for Ctrl/Cmd+F and G. Plain I and Alt+I are left to typing (Alt+I is a dead key on a Mac).
2. The hint under the editor names the Mac key ("Ctrl+Space or Cmd+I suggests" in the keys list), and the guide lists both.
3. **The human pass is not done by an agent.** The checklist of journal 058 stays the owner's; the plan is handed over with the automatable items done and the human items listed, and the Suggest button for every pointer waits for that pass (it is "if the person finds it useful").

## Alternatives considered

- **Alt+Escape** (VS Code's third Mac binding): Option+Esc is the macOS "speak selection" key when that accessibility setting is on, and Escape alone is the editor's "Tab leaves" key: a chord on it would be easy to mistake.
- **Alt+Space**: types a non-breaking space on a Mac and opens the window menu on Windows.
- **A Mac-only key**: two code paths for one action, and the help text would differ per platform.

## Consequences

- Safari binds Cmd+I to "Email this page"; a page's `preventDefault` on keydown wins over it while the editor has focus (checked in WebKit by the e2e test; to be confirmed in real Safari by the owner's pass).
- Firefox binds Ctrl+I to the page info window on Windows/Linux; the same `preventDefault` applies (Firefox not installed on this machine).
