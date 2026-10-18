---
id: 218
title: "Hangar: part inspector, action group editor, Δv by body, power budget, pre-flight report"
status: draft
owner: ""
depends: [214, 217, 208]
phase: 7
created: 2026-10-18
updated: 2026-10-18
---

# 218 — Hangar: part inspector, action group editor, Δv by body, power budget, pre-flight report

## Goal

In the Hangar, clicking a part opens the same inspector as in flight (plan 214), with build-time settings (fuel fill, thrust limiter, gimbal, chute settings, crossfeed, staging switch), applied to every symmetry counterpart. An action group editor lets the player pick a group, click parts and choose each part's action. Δv and TWR per stage use a chosen body and situation (sea level, an altitude, vacuum). A power budget shows day and night EC balance. A pre-flight report warns about a missing control source, a pod without crew, a probe without an antenna, and a crewed vessel without a parachute. Crew can be assigned to seats in the Hangar.

## Context

- Rancangan §8.6–8.8, §8.10 (crew in the Hangar), §4.3b.4 (pre-flight report items), §4.3 (power budget day and night).
- ADRs: 0207 (Hangar interaction model), 0205 (shared inspector), 0203 (power rules and per-part settings), 0174 (custom action groups in the design), 0083 (trip planner), 0109 (control needs a command source), 0148 (Hangar verdict levels), 0152 (crew assignment at launch).
- Research:
  - 05 §2 table: no editor tweakables; a design part holds only index, part, parent, symmetry, tilt and link (`packages/core/src/protocol.ts:433-463`); `SelectionCard.svelte` offers a stage dropdown, sliders and Move/Detach/Delete/Keep (`apps/web/src/lib/vab/SelectionCard.svelte:77-132`).
  - 05 §2 table: action-group editor missing; `design.groups` exists in core (`protocol.ts:457-462`) and nothing in the Hangar reads it.
  - 05 §2 table: Δv only Sea level / Vacuum (`apps/web/src/lib/editor/stats.ts:16`), gravity always the home body's (`apps/web/src/lib/vab/controller.svelte.ts:131`); trip planner has a destination list (`apps/web/src/lib/vab/StatsStrip.svelte:124-189`).
  - 05 §2 table: pre-flight checks in `apps/web/src/lib/editor/checks.ts:47-223`, confirm dialog at `apps/web/src/routes/vab/+page.svelte:221-241`.
  - 15d §B2: crew can only be assigned on the Launch screen (`apps/web/src/lib/launch/launch-model.ts:106`).
  - 02 §7–10: KSP editor tweakables, action group editor, Engineer's Report.
- Depends on 214 (inspector component), 217 (editor carry state and symmetry sets), 208 (power model and budget function in core).

## Scope

**In:**
- Inspector in the Hangar: the 214 component in "design" mode. Build-time descriptors write per-part settings into the design; changes apply to all symmetry counterparts unless "Only this part" is set.
- Per-part design settings field (from ADR 0203; added here if 210 has not) read by the sim at load.
- Action group editor: a mode in the Hangar with stock groups (Stage, Gear, Lights, RCS, SAS, Brakes, Abort, Parachutes, Solar, Engines) and Custom 1–10; select a group, click a part, choose its actions; writes `design.groups`.
- Δv/TWR picker: body from the loaded bodies, situation sea level, altitude (number), vacuum; gravity and pressure from that body.
- Power budget panel: producers and consumers by part, day and night totals, battery hours; uses 208's budget function.
- Pre-flight report: new checks (no control source; pod without crew; probe without antenna; crewed without parachute) at the warning level, on the existing list and dialog; also shown on Launch.
- Crew seats in the Hangar: assign from the available roster; the Launch screen shows and keeps the assignment.

**Out:**
- Offset and rotate gizmos, re-root (P1).
- Fairing editing (plan 219).
- In-flight action group editing (P1, §7.7).

## Touches

- **Size:** L
- **Edits:**
  - `apps/web/src/routes/vab/+page.svelte` (inspector column, group editor mode, power panel)
  - `apps/web/src/lib/vab/SelectionCard.svelte` (replaced by the inspector or reduced to Move/Detach/Delete/Keep)
  - new `apps/web/src/lib/vab/ActionGroupEditor.svelte`, `apps/web/src/lib/vab/PowerBudget.svelte`, `apps/web/src/lib/vab/CrewSeats.svelte`
  - `apps/web/src/lib/editor/state.ts` (settings and groups edits as undo steps), `apps/web/src/lib/editor/stats.ts`, `apps/web/src/lib/editor/checks.ts` and tests
  - `apps/web/src/lib/vab/StatsStrip.svelte`, `apps/web/src/lib/vab/StageEditor.svelte` (body and situation picker)
  - `apps/web/src/lib/vab/controller.svelte.ts` (gravity from the chosen body)
  - `apps/web/src/lib/launch/launch-model.ts`, `apps/web/src/routes/launch/+page.svelte` (crew from the design)
  - `packages/core/src/protocol.ts`, `packages/core/src/design.ts` (per-part settings, crew seats in the design if not present)
- **Shared contracts:** the inspector props from 214; `VesselDesign.parts[].settings` and a design `crew` list (additive); `design.groups` as in ADR 0174.

## Design notes

- The inspector decides "flight" or "design" from its props; descriptors carry a `phase` (`flight`, `build`, `both`) so one module list serves both.
- Settings and group edits are editor steps, so undo works and the design autosave picks them up.
- Δv for an altitude uses the body's pressure at that altitude; with plan 212's curves the result matches the flight HUD.
- Report checks read the design and the roster; "pod without crew" only fires when the pod has seats and crew are assigned to none of them.

## Steps

1. Design settings field and resolver support; inspector in design mode with symmetry apply. Tests.
2. Δv and TWR by body and situation in `stats.ts`; picker UI.
3. Power budget panel from 208's function.
4. Action group editor writing `design.groups`.
5. Pre-flight report checks; shown in the Hangar and on Launch.
6. Crew seats in the Hangar; Launch reads them.
7. Vitest and Chromium e2e.

## Acceptance criteria

- [ ] `apps/web` vitest `lib/editor/checks.test.ts`: a pod with no crew and no probe core gives "No control source"; a crewed pod without a parachute gives "Crewed vessel without a parachute"; a probe without an antenna gives "Probe without antenna".
- [ ] `apps/web` vitest `lib/editor/stats.test.ts`: the same stage has more Δv in vacuum than at home sea level, and its TWR on the moon at sea level is higher than at home.
- [ ] `apps/web` vitest `lib/editor/state.test.ts`: setting the limiter to 60 % on one of four symmetric boosters sets all four; undo resets all four in one step.
- [ ] Chromium e2e `e2e/hangar-inspector.e2e.ts`: open the moon shot, click an engine, set the limiter to 50 %, launch; in flight the vessel panel shows 50 % for that engine.
- [ ] Chromium e2e `e2e/hangar-groups.e2e.ts`: assign the legs to Custom 1 in the group editor, launch, press 1 (KSP profile), the legs deploy.
- [ ] `e2e/editor.e2e.ts` and `e2e/launch.e2e.ts` pass on Chromium.
- [ ] `bun run check:affected` passes.
- [ ] CI is green on the plan's ready tag (full suite, ADR 0126).

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/218-hangar-inspector-groups-report.md` written.
- [ ] `docs/architecture/overview.md` updated (inspector in design mode, report checks).
- [ ] `docs/architecture/plugin-system.md` updated (descriptor `phase`, per-part settings for mod modules).
- [ ] New ADRs written for any decision made here, linked above.

## Log

- 2026-10-18 — Created from refs/rancangan-terpadu.md (release roadmap).
