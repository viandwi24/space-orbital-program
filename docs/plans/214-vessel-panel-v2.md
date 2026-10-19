---
id: 214
title: Vessel panel v2 and the part inspector
status: in-progress
owner: "Worker B"
depends: [204, 213]
phase: 7
created: 2026-10-18
updated: 2026-10-19
---

# 214 — Vessel panel v2 and the part inspector

## Goal

The flight vessel panel is 340 px wide and resizable from 300 to 440 px, with four tabs: Overview, Parts, Resources and Comms. A part inspector (320 px) opens from a click on a part in 3D or on its row. Up to three inspectors can be pinned, stacked left of the panel and never over the vessel. Values can be typed with units, and advanced controls sit under "More". Rows and parts highlight each other both ways. Every per-part-type control in the rancangan §7.6b P0 column is reachable, built from descriptors. Hot parts show a temperature bar. The inspector is one component that the Hangar reuses (plan 218).

## Context

- Rancangan §7.1–7.4 (width, tabs, inspector, two-way highlight, text states), §7.6b table (P0 controls per part type).
- ADRs: 0205 (vessel panel v2, part inspector and HUD layout spec), 0153 (vessel panel controls from descriptors), 0174 (descriptors and compact snapshot), 0107 and 0140 (refs visual language, tokens, 10 px floor).
- Research:
  - 05 §3.2: the panel has Overview, Parts, Comms (`apps/web/src/lib/vessel-panel/VesselPanel.svelte`); four descriptor kinds `toggle | value | trigger | mode` (`packages/core/src/action-groups.ts:6`); rows are 44 px; hover highlights in 3D (`packages/renderer/src/renderer.ts:147`).
  - 05 §3.3: per part type, what has controls today; tanks, pods and many parts have none.
  - 05 §4.2: the panel is 18.75rem = 300 px (`apps/web/src/routes/flight/+page.svelte:1125-1135`); tabs are 32 px on coarse pointers (`VesselPanel.svelte:271`).
  - 05 §3.4: `apps/web/src/lib/hud/ResourcesPanel.svelte` is read-only and vessel-wide.
  - 03 §1 and §2 (KSP1 PAW and KSP2 Part Manager), 04 §6 (layout lessons).
- Depends on 204 (Base layout regions) and 213 (per-container resources, rates, transfer and lock commands).

## Scope

**In:**
- Panel width 340 px default, drag handle 300–440 px, stored in settings; below 300 px (drawer on narrow screens) sliders become a number with − and + buttons.
- Tabs: **Overview** (group switches with counts, e.g. "Engines 3/4"), **Parts** (grouped by type, search box, stage filter), **Resources** (per container: bar, amount, capacity, rate, time to empty, lock; transfer picker using 213's command), **Comms** (moved as is).
- **Part inspector** component in `apps/web/src/lib/inspector/`: name, highlight, pin, descriptors as controls, typed values with units, "More" section, action group membership, temperature bar when hot. Opens on a 3D part click (new renderer `partAt(x, y)`) or a row click.
- Pins: up to 3, stacked left of the panel; a fourth pin replaces the oldest; pins never cover the vessel (they sit in the right-hand region the HUD spec of 215 reserves).
- Two-way highlight: row hover lights the part; 3D hover lights the row.
- Descriptor gaps filled for the P0 column of §7.6b that exist as parts today or from 207–213: pod/probe ("Control from here", rename and vessel type, crew list with EVA and transfer), engine (limiter with a number, status text: thrust, Isp, flow, flameout reason), tank and battery (bars, lock), decoupler (decouple, "staged" switch), reaction wheel (mode), control surface (axis switches, authority, deploy), legs, wheels, solar, antenna, experiment.
- Status always as text plus colour.

**Out:**
- Parachute, RCS, docking and fairing rows beyond what their own plans add (they register descriptors; the panel shows them with no extra code).
- Editing action groups in flight (P1, §7.7).
- The Hangar side of the inspector (plan 218).

## Touches

- **Size:** L
- **Edits:**
  - `apps/web/src/lib/vessel-panel/VesselPanel.svelte`, `apps/web/src/lib/vessel-panel/vessel-model.ts` and its test
  - new `apps/web/src/lib/inspector/` (`PartInspector.svelte`, `inspector-model.ts`, `units.ts`, tests)
  - `apps/web/src/lib/hud/ResourcesPanel.svelte` (retired from the dock or reduced to vessel totals)
  - `apps/web/src/routes/flight/+page.svelte` (panel region, pins, click to inspect)
  - `apps/web/src/lib/settings/settings.ts` (panel width)
  - `packages/renderer/src/renderer.ts`, `packages/renderer/src/scene.ts` (`partAt`, hover highlight back to the page)
  - `mods/stock/src/modules.ts`, `mods/stock/src/comms.ts`, `mods/stock/src/science.ts`, `mods/stock/src/solar.ts` (missing descriptors)
  - `packages/core/src/protocol.ts` (`rename-vessel` and `set-vessel-type` only if 223 has not added them; otherwise reuse)
- **Shared contracts:** the inspector component's props (`part`, `descriptors`, `oncommand`, `pinned`) are the contract plan 218 consumes. Descriptor kinds stay the four of ADR 0174; a `unit` and `More` flag on `PartActionDescriptor` are additive.

## Design notes

- The panel reads only the snapshot and descriptors; it never computes rates (213 does).
- Typed values parse units with a small table (`kN`, `%`, `m`, `s`, `atm`, `K`); invalid input reverts with a message.
- `partAt` raycasts the active vessel's part meshes only; it costs one raycast on click, not per frame. Hover uses the same call on pointer move, throttled to 20 Hz.
- Narrow screens follow plan 215's breakpoints: the panel becomes a drawer, and pinned inspectors collapse to tabs inside it.

## Steps

1. Inspector model and units parser with tests; descriptor additions (`unit`, `more`).
2. `PartInspector.svelte` with pin, typed values, More, temperature bar.
3. Renderer `partAt` and hover callbacks; click to inspect; two-way highlight.
4. Panel v2: width and resize, tab set, Parts grouping, search and stage filter.
5. Resources tab on 213's snapshot with the transfer picker and locks.
6. Fill missing descriptors for the §7.6b P0 column.
7. Vitest and Chromium e2e.

## Acceptance criteria

- [ ] `apps/web` vitest `lib/inspector/inspector-model.test.ts`: "50 kN" on a 200 kN engine sets the limiter to 25 %; "abc" reverts with a message; a fourth pin drops the oldest.
- [ ] `apps/web` vitest `lib/vessel-panel/vessel-model.test.ts`: Overview count reads "Engines 3/4" for four engines with one off; stage filter keeps only that stage's parts.
- [ ] Chromium e2e `e2e/vessel-panel.e2e.ts` gains: the panel is 340 px wide by default and 440 px after dragging the handle far right; clicking the engine in 3D opens its inspector; typing "50 kN" changes the snapshot's limiter.
- [ ] Chromium e2e `e2e/resources-tab.e2e.ts`: `window.__orbitalDebug.setResource` half-fills two tanks; the Resources tab shows rate and time to empty; a transfer from the picker moves fuel; locking a tank shows "Locked" as text.
- [ ] `bun test mods/stock/test/modules.test.ts` covers the new descriptors.
- [ ] `bun run check:affected` passes.
- [ ] CI is green on the plan's ready tag (full suite, ADR 0126).

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/214-vessel-panel-v2.md` written.
- [ ] `docs/architecture/overview.md` updated (inspector component shared by Flight and Hangar).
- [ ] `docs/architecture/plugin-system.md` updated (descriptor `unit` and `more`).
- [ ] New ADRs written for any decision made here, linked above.

## Log

- 2026-10-18 — Created from refs/rancangan-terpadu.md (release roadmap).
- 2026-10-19 — Worker B. The resize grip is the panel's left edge (the panel stands at the right): dragging it left widens it, so the e2e drags "far left" to 440 px. Typed units are descriptor data (`units`, `more` on `PartActionDescriptor`, additive), so the inspector needs no per-module code. Filled from §7.6b P0: engine status, thrust and Isp as text and the limiter in % and kN; heat shield ablator; control surface authority and per-axis switches (`setAxis:<axis>`, ADR 0220's keyed ids). Not done here, left as follow-ups: pod rename and vessel type (plan 223's commands), the reaction wheel's mode, a crew list with EVA and transfer in the inspector (the crew card does it), decoupler "staged" switch. The narrow-screen drawer keeps the inspectors beside it rather than as tabs inside it. `ResourcesPanel` stays in the dock as the vessel totals (plan 213 already reads the snapshot). Debug API: `partOnScreen`.
