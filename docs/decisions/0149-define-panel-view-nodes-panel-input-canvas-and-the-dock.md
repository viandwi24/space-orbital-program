# 0149 — `definePanel`: view nodes over a panel input, a small canvas, and the dock

**Status:** accepted
**Date:** 2026-10-18
**Plan:** [112](../plans/112-dock-panels-and-define-panel.md)
**Builds on:** ADR 0102 points 4 and 5 (dock panels, isolation), ADR 0057 (trusted mods), ADR 0104 (define points), ADR 0144 (flight HUD layout), `docs/architecture/boundaries.md` (mods: SDK only, no DOM)

## Context

ADR 0102 decides the dock (a left rail, one panel open, a Panel library) and `definePanel` with a declarative, environment-neutral view bound to pure selectors and validated commands, plus an optional canvas. Open: what a selector reads (the snapshot has no altitude and bodies carry no radius), the exact node set, the canvas interface, where the choice is stored, and which existing panels move.

## Decision

1. **Definition.** `PanelDefinition { id, title, icon, order, contexts, view, canvas? }` in a core `panels` registry, `definePanel` in the SDK. `icon` is an icon name or `{ path }` (ADR 0146 point 4); `contexts` is a non-empty subset of `flight`, `map`, `mission-center`; `order` places it in the rail (host panels use 100 to 500).
2. **Selectors read a panel input**, not the bare snapshot: `PanelInput { snapshot, vessel, altitude, speed, time }`, where `vessel` is the active vessel's snapshot (or null), `altitude` metres above the radius of its body, `speed` its speed relative to that body, `time` sim seconds. The host builds it once per HUD update (10 Hz); selectors are pure functions of it.
3. **View nodes** (plain objects, functions only as selectors): `section { title?, children }`, `readout { label, value(input) → string | number | null, unit? }`, `meter { label, value(input) → 0..1 | null }`, `switch { label, value(input) → boolean, command(input, on) → Command | null }`, `button { label, command(input) → Command | null }`, `list { label?, items(input) → { name, value? }[] }`, `sparkline { label, value(input) → number | null, samples? }` (the host keeps the last `samples`, default 60, values). A command goes to the sim's `dispatch`, which validates it like any other.
4. **Canvas.** `canvas?: { height, draw(c: PanelCanvas, input) }`. `PanelCanvas` is a declared subset of Canvas 2D (`width`, `height`, `clear`, `fill`/`stroke` style setters, `lineWidth`, `beginPath`, `moveTo`, `lineTo`, `arc`, `rect`, `closePath`, `fill`, `stroke`, `fillText`), so a mod imports only `@orbital/sdk`; the host adapts a real canvas and calls `draw` only while the panel is open.
5. **Errors stay in the panel.** A selector, command builder or draw that throws marks that panel as failed with the message; the HUD and the other panels go on.
6. **The dock.** A rail at the left edge of the flight screen under the capsules, one panel open beside it; below 1280 px wide the capsules stack, the first-flight guide and staging fill the left column, so the dock stands at the right (where Orbit, Resources and Target stood since ADR 0144), its rail on the edge; the AppBar's Dock button shows or hides it; a Panel library (a dialog) adds and removes panels. Settings keep `dock: { panels: string[], open: string | null }` (a field of settings format 3 that falls back to the default, no format bump).
7. **What moves.** Orbit, Resources, Target and Script become host panels in the dock (`host.orbit`, `host.resources`, `host.target`, `host.script`); the AppBar's Script button opens `host.script`. The Maneuver panel stays by the navball: it belongs to the node being edited in the view and appears with it; a later plan may dock it once nodes can be edited from a list.

## Alternatives considered

- **Selectors over the raw snapshot only** — rejected: every mod would recompute altitude from positions and a radius the snapshot does not carry.
- **Mod-supplied Svelte or DOM** — rejected by ADR 0102.
- **A settings format 4** — not needed: the field defaults when absent.

## Consequences

- SDK additive: `definePanel`, `PanelDefinition`, `PanelNode`, `PanelInput`, `PanelCanvas`; core `registries.panels`; API_VERSION bump.
- The flight page gains the dock and loses the fixed right column of Orbit, Resources and Target.
