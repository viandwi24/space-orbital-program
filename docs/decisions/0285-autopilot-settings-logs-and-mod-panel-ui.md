# 0285 — Autopilot settings and logs; mod panels: the built-in nodes plus a mod's own UI in a sandboxed frame

**Status:** accepted (owner's request, 2026-10-22)
**Date:** 2026-10-22
**Plan:** plans/330-docking-blueprints-auto-dock-fly-around-and-panels.md
**Amends:** ADR 0149 (panel nodes), ADR 0271 (autopilots)

## Context

The owner engaged Auto Dock beside a station's port. It stopped at once and the panel showed nothing about why. He asks for:

- logs in the Auto Dock panel;
- options, a visual and actions, like KSP's Docking Port Alignment Indicator;
- mod panels with "a custom iframe or UI": a limited built-in UI, plus the option of the mod's own.

Today a mod panel is a declarative view (readouts, meters, switches, buttons, lists, sparklines) plus a 2D canvas (ADR 0149). An autopilot keeps no record of what it did, and has no options apart from the engage command's `params`.

## Decision

1. **Two ways to build a mod panel** (owner: "a built-in UI system, limited of course, but a mod can also use its own custom UI"):
   - **Built-in (the default):** the declarative nodes plus the panel canvas (ADR 0149). They are themed, keyboard-reachable and testable.
   - **Custom:** `custom: { height, source }`.
     - `source` is the text of an ES module that exports `mount(root, host)`. The page runs it in an iframe with `sandbox="allow-scripts"` and an opaque origin, as it runs player scripts (ADR 0038). The iframe document is a fixed bootstrap whose hash is in the site's CSP; the mod's module is imported from a blob URL.
     - `host.onInput(fn)` gets the panel input (snapshot, flown vessel, time) at every HUD update as plain data. `host.command(c)` sends a command, which the sim validates like any other. `host.resize(px)` asks for a height.
     - The frame cannot reach the page, its storage or the sim. Mods are trusted code (ADR 0057), but a custom UI still cannot break the HUD or bypass validation.
2. **A `select` node.** `{ kind: 'select', label, options: [{ value, label }], value(input), command(input, value) }`. The page draws it as a segmented choice. Like a switch, it returns a command the sim validates.
3. **Autopilot settings live in the sim.**
   - The command `autopilot-settings { vessel, autopilot, settings }` merges plain values (boolean, number, string) into `VesselState.autopilotSettings[autopilot]`.
   - They are saved with the vessel. The snapshot carries them as `vessel.autopilotSettings`.
   - `autopilot-engage` passes the stored settings to `start`, with the command's `params` on top.
   - So a panel's options persist, other pages see them, and a script can set them too.
4. **Autopilot logs.**
   - A step may return `log` (a line or several). The sim keeps the last 30 lines with their sim time on `AutopilotState.log`, and the snapshot shows them as `autopilot.log`.
   - When an autopilot ends, or `autopilot-engage` is refused, the vessel keeps `autopilotLast { id, title, outcome, reason, time, log }`. Outcome `refused` is added for the refusal. The snapshot shows it as `vessel.autopilotLast`.
   - A panel can therefore say why the last run stopped.

## Consequences

- Auto Dock gets the following, all through the SDK:
  - options: speed and where the approach starts;
  - an alignment display;
  - a log;
  - the reason the last run ended.
- A mod that wants a different look draws it on the canvas, or ships its own UI. The dock's frame, title and close button stay the host's.
- The site's CSP lists one more hash: the mod-panel bootstrap.
