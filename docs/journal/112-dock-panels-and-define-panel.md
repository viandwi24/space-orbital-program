# 112 — Dock panels, the Panel library and `definePanel`

**Plan:** [plans/112-dock-panels-and-define-panel.md](../plans/112-dock-panels-and-define-panel.md) · **Session:** Agent 2 (Dev B, MacBook Pro M2 13"), 2026-10-18 · **ADRs:** [0149](../decisions/0149-define-panel-view-nodes-panel-input-canvas-and-the-dock.md) (new), [0102](../decisions/0102-vessel-panel-part-actions-dock-panels-and-the-mission-center.md), [0144](../decisions/0144-flight-hud-refs-layout-what-has-no-data-yet.md) · **Research:** none

**Status when written: criteria met here except the selector cost on the M5 and Firefox.**

## What was done

| Where | What |
|---|---|
| `packages/core/src/panels.ts` | `PanelDefinition`, `PanelInput`, `PanelNode` (section, readout, meter, switch, button, list, sparkline), `PanelCanvas`, schemas, `sortPanels`; `registries.panels`, `ctx.panels`, report kind `panel`; API_VERSION 0.1.45 |
| `packages/sdk` | `definePanel` and the types; `test/panel.test-d.ts` compiles a full panel under `lib: ["ESNext"]` |
| web `lib/dock/` | `panel-input.ts` (from `computeTelemetry`), `evaluate.ts` (selectors to a plain tree, sparkline memory, errors kept per panel, `commandOf`), `canvas.ts` (real 2D context behind `PanelCanvas`), `dock-model.ts` (rail, add, remove, toggle), `Dock.svelte`, `PanelLibrary.svelte`, `ModPanel.svelte`, `PanelView.svelte`; `ui/Sparkline.svelte` |
| web flight | the dock in the left stack (at the right below 1280 px); Orbit, Resources, Target and Script are host panels; the AppBar's Dock button works; `Flight.panelInput()` and `Flight.command()`; the touch throttle keeps clear of an open panel |
| settings | `dock: { panels, open }` in format 3 with a default (no format bump) |
| `examples/mod-sample` | the Beacon panel: altitude and speed readouts, an altitude sparkline, a Stage button, a blinking canvas |
| tests | core `panels.test.ts` (4), SDK type test, sample test (+1), web `dock/dock.test.ts` (7), `layout-model.test.ts` (+1), `settings.test.ts` (+1, 2 updated); e2e target and mobile open the Target panel in the dock |
| docs | ADR 0149, mod guide section, plugin-system, boundaries |

## What surprised me

- **The snapshot has no altitude**, and bodies carry no radius: every mod would have redone the HUD's telemetry. Selectors read a `PanelInput` the host builds once per update (ADR 0149 point 2).
- **A dock in the left column does not fit a tablet.** At 1024 x 768 the capsules stack, the first-flight guide and staging fill the left side; the rail ended under the staging panel. Below 1280 px the dock stands at the right, where the 088 right column was, and the old tests of that column (clear of the deck, the Run button taps) hold there.
- **A scroll container hides overlap only visually.** The script editor inside a scrolling dock area still measured past the deck; the open area is now a column whose child shrinks and scrolls itself.
- **The right column starts under the toolbar**, so its limit is the space above the deck less the toolbar row.
- **Maneuver stays by the navball** (ADR 0149 point 7): it belongs to the node being edited in view.
- **Slow machine**: `editor.e2e.ts` "replace, go to line…" takes 3.1 min here (limit 3 min); it passes with a longer timeout and is unchanged by this plan.
- Indicative selector cost: ten Beacon panels in a fraction of a millisecond per update here; the 0.3 ms criterion is for the M5.
