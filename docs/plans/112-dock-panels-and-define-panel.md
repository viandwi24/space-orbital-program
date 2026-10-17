---
id: 112
title: "Dock panels, the Panel library and `definePanel`"
status: draft
owner: ""
depends: [088]
phase: 7
created: 2026-10-17
updated: 2026-10-17
---

# 112 — Dock panels, the Panel library and `definePanel`

## Goal

A left dock rail holds panels, one open at a time; a Panel library adds and removes panels (persisted); mods register panels with `definePanel` using a declarative, environment-neutral view bound to snapshot selectors and validated commands, plus an optional canvas area drawn through an SDK drawing interface; the existing Orbit, Resources, Target, Maneuver and Script panels move into the dock.

## Context

- ADRs: 0102, 0104
- Read: ADR 0102 points 4 and 5, ADR 0057 (trusted mods), `docs/architecture/boundaries.md` (mods import only the SDK, no DOM), `apps/web/src/lib/hud/*Panel.svelte`.

## Scope

**In:**
- `definePanel({ id, title, icon, order, contexts, view, canvas? })`; view node types: section, readout, meter, switch, button, list, sparkline; selectors are pure functions of the snapshot; commands go through `dispatch`.
- SDK `PanelCanvas` interface (a declared subset of 2D drawing calls) and its host adapter.
- Dock rail, Panel library, persistence in settings; host-registered page panels (Script, Maneuver).
- Error isolation: a panel that throws shows an error state.
- `examples/mod-sample` adds a panel.

**Out:** a sandbox for panel code (mods are trusted, ADR 0057).

## Touches

- **Size:** M
- **Edits:** `packages/sdk`, `packages/core`, `apps/web/src/lib/hud`, `apps/web/src/lib/settings`, `mods/stock`, `examples/mod-sample`
- **Shared contracts:** **SDK (`definePanel`, `PanelCanvas`)**

## Design notes

Selectors run at the 10 Hz HUD cadence; canvas draws only while visible; measure 10 panels' selector cost.

## Steps

1. SDK types and schema.
2. Host renderer for view nodes.
3. Canvas adapter.
4. Dock and library; move existing panels.
5. Sample mod panel.

## Acceptance criteria

- [ ] `packages/sdk` type test: a panel definition compiles without DOM types (`lib` without `dom`).
- [ ] vitest: the sample mod's panel renders a readout bound to altitude and updates with the snapshot; a panel whose selector throws shows an error and the HUD keeps working.
- [ ] vitest: the Panel library adds and removes a panel and the choice survives a reload (settings).
- [ ] Measurement: 10 panels' selectors under 0.3 ms per HUD update (M5).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/112-dock-panels-and-define-panel.md` written.
- [ ] `plugin-system.md`, `guides/writing-a-mod.md` (panels), `architecture/boundaries.md` if the drawing interface needs a note.
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0102, 0104).
