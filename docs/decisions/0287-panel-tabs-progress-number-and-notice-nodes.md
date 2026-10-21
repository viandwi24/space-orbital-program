# 0287 — Mod panel nodes: tabs, progress, number fields, notices, button tones and one-column sections

**Status:** accepted (owner's request, 2026-10-22)
**Date:** 2026-10-22
**Plan:** plans/332-guidance-panel-tabs.md
**Amends:** ADR 0149 (panel nodes), ADR 0285 point 1 (built-in UI)

## Context

The owner asked for the Guidance Computer's UI to look good and tidy, "with many menus, maybe with tabs". Its panel is one long column: every program's Engage button, every read-out of every program, and the Rendezvous autopilot in a second panel. The built-in panel nodes (ADR 0149, 0285) have no way to group a panel into pages, to type a number (a target altitude), to show progress, or to say in one line why a button is off. A mod could draw all of it in its own sandboxed frame (ADR 0285 point 1), but then it would not follow the HUD's theme, keyboard handling and v3 components, and every mod would rebuild the same widgets.

## Decision

1. **`tabs`**: `{ kind: 'tabs', label, tabs: [{ id, label, badge?(input), children }], active?(input) }`. The host draws a segmented tab strip (v3 "Segmented / tabs") and the chosen tab's children. Which tab is open is the host's UI state, per panel; when `active(input)` returns a tab id that differs from its last value (a program was engaged), the host opens that tab. A `badge` (short text, null for none) marks a tab, for example the engaged program.
2. **`progress`**: `{ kind: 'progress', label, value(input) (0..1 or null), text?(input) }`: a bar with a caption, for the share of a job done.
3. **`number`**: `{ kind: 'number', label, unit?, min, max, step?, value(input), command(input, value) }`: a numeric field; the host clamps the entry to `min..max` and sends the command when the player commits it (Enter or leaving the field).
4. **`notice`**: `{ kind: 'notice', text(input), tone?(input) }` with tones `info`, `warn`, `active`: one line, hidden when the text is null. For "why is this off" and the engaged program's status.
5. **Button `tone`** `primary` or `danger` (default: the secondary button), and **section `columns`** 1 or 2 (default 2, as before).
6. All are additions: existing panels draw as before. Paths of nodes inside a tab are `<tabs path>.<tab>.<child>`.

## Consequences

- API 0.1.104. The web host gets the drawing (`PanelView.svelte`) and the evaluation (`evaluate.ts`); evaluation runs every tab's selectors, so a hidden tab's command is still current when it opens.
- The Guidance Computer uses them: one panel with a tab per program (Ascent, Orbit, Rendezvous, Landing, Log), the Rendezvous panel folded into it.
