# 250 — Panels and vessels: the audit's leftovers

**Plan:** [plans/250-panel-inspector-vessel-polish.md](../plans/250-panel-inspector-vessel-polish.md) · **Session:** Worker C, 2026-10-20 · **ADRs:** none (ADR 0205, 0226 stand)

## What was done

| Where | What |
|---|---|
| `vessel-panel/ControlRows.svelte`, `stepper.ts` | below 300 px a value control's slider gives way to − and + (a container query; `stepped` keeps the control's grid and range) |
| `hud/panel-room.ts`, flight page | the inspectors leave room for the open vessel panel at every width (it counted zero below 1280 px) |
| `dock/Dock.svelte`, settings | the dock panel resizes 260–400 px by a grip on its free edge; `interface.dockWidth` is kept |
| `hud/{OrbitStrip,ResourcesPanel,CrewPanel}.svelte` | the legacy `--t-xs` and `--t-sm` became `--t-button` and `--t-value` (same sizes) |
| `renderer/camera-modes.ts`, `scene.ts` | Locked on a docking port uses the port frame: the rig's up points out of the face (`portFrame`) |
| `hud/MapCardView.svelte`, `map-card.ts`, flight loop | a click on a vessel dot in the map opens a card with its name and Switch to (`onMapPick`) |
| tests | `stepper`, `panel-room`, `type-scale`, `map-card` (bun), `camera-modes` (+2), `e2e/panel-polish.e2e.ts` (not run locally) |

## Open questions / follow-ups

- The 1280 × 720 overlap and the sub-300 px stepper have unit tests only; the e2e checks the dock resize at 1920 px.
- The map card shows the name and Switch to; situation and distance would need the snapshot's vessel row.
