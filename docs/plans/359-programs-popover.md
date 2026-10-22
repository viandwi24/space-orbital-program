---
id: 359
title: "The status bar's programs list as a popover: glass backdrop, Open panel, Vessel and Stop, grouped by vessel"
status: done
owner: "ui-v3 session (Claude, 2026-10-22)"
depends: [320, 321, 322, 332]
phase: 7
created: 2026-10-22
updated: 2026-10-22
---

# 359 — The programs popover

## Goal

The owner's feedback of 2026-10-22: the status bar's "N program" chip should open a real popover. It should have a dark glass backdrop behind it, an Open panel button when the program has a panel, and a Vessel button that makes the program's vessel the active one.

## Context

- ADR 0302 (this plan's decisions), ADRs 0276–0277 (vessel programs), ADR 0287 (the Guidance Computer's tabs)
- `lib/layout/StatusBar.svelte`, `lib/programs-model.ts`

## Scope

**In:**
- A modal `<dialog>` anchored above the chip, with an arrow. It has a dark (about 42 %) backdrop with a blur, and a plain darker backdrop where blur is missing. A click on the backdrop or Escape closes it. Focus stays inside while it is open and goes back to the chip.
- The rows are grouped by vessel, with the flown vessel first and its name shown prominently.
- Per vessel: **Vessel** when it is not the vessel flown in Flight. In Flight it switches the focus the same way as the vessel menu's Control. On other pages it goes to Flight with that vessel.
- Per row:
  - **Open panel** when the program has a panel. A script opens the Script panel. An autopilot opens the first Flight panel of the mod that registered it, for example the Guidance Computer, which opens on the engaged tab.
  - **Stop**: an autopilot is disengaged alone. A script stops the vessel's programs, since there is no script-only stop command.
- Unit tests for the model (panel, groups, Stop command, link) and for which buttons render.

**Out:**
- Step counts or progress in the row: the snapshot does not carry them.

## Steps

1. The model: `panelOf`, `programGroups`, `stopCommand`, `flightHref`, `ProgramActions`.
2. `ProgramsPopover.svelte`; the status bar uses it.
3. The layout's actions; Flight's `pageShell.flight` hook and its `?panel=` link.
4. Tests, screenshots, docs.

## Acceptance criteria

- [x] The chip opens the popover above it, over a glass backdrop. A click outside or Escape closes it (in Flight too, before Flight's own Escape).
- [x] Open panel shows only for a program with a panel and opens it on the right vessel. Vessel is hidden for the vessel flown. Stop stays on every row.
- [x] From the Space Center, Open panel goes to Flight with the vessel and the Guidance Computer open (screenshot).
- [x] `programs-model.test.ts` and `ProgramsPopover.test.ts` pass, and svelte-check is clean. e2e was not run.

## Docs checklist

- [x] `docs/STATUS.md`
- [x] ADR 0302 and its index row
- [x] Journal `359-programs-popover.md`

## Log

- 2026-10-22: Written from the owner's feedback (relayed by the main session) and done the same day.
