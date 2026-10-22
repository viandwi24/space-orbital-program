# 0302 — The programs list is a modal popover with Open panel, Vessel and Stop

**Status:** accepted
**Date:** 2026-10-22
**Plan:** plans/359-programs-popover.md
**Supersedes in part:** ADR 0276 point 8 (the programs list as a plain card over the status bar)
**Builds on:** ADR 0276 (vessel programs), ADR 0287 (the Guidance Computer opens the engaged tab), ADR 0208 (Fly from the Mission Center)

## Context

The "N program" chip opened a plain card with a Stop per vessel. The owner wanted a proper popover. They wanted a way to open a program's panel, and a way to fly the vessel that runs it.

## Decision

1. **A modal dialog anchored to the chip.**
   - It is a `<dialog>` opened with `showModal`, so focus stays inside and goes back to the chip when it closes.
   - It sits above the chip with an arrow pointing at it, and is kept inside the window.
   - The backdrop is 42 % black with a 10 px blur. Without `backdrop-filter`, it is 55 % black instead.
   - A click on the backdrop or Escape closes it. Escape is caught on the dialog first, because Flight uses Escape for its own menu.
2. **Grouped by vessel.** The vessel flown comes first, then the others by name. Its name heads the group, and the group is boxed when there is more than one. The flown vessel says "Active vessel"; the others have **Vessel**.
3. **Actions.**
   - **Where they act.** In Flight they act there through `pageShell.flight`. Vessel switches the focus the same way as the vessel menu's Control, and Open panel opens the dock panel. On other pages, the focus is set to the vessel (as Mission Center's Fly does) and the page goes to `/flight?panel=<id>`. Flight opens the panel once it is loaded.
   - **The panel.** A script's panel is Script. An autopilot's panel is the first Flight panel registered by the same mod (the id prefix): `guidance.*` opens the Guidance Computer, which shows the engaged program's tab, and `autodock.*` opens Auto Dock. Without one, there is no Open panel.
   - **Stop.** It disengages an autopilot alone (`autopilot-disengage`). A script row sends `program-stop`, which ends the script and any autopilot on the same vessel.
4. **Kept pure.** What shows and what is sent is decided in `programs-model.ts` and tested there. The popover only draws it.

## Consequences

- The "active vessel" is only known in Flight. On other pages every group has Vessel, which means "go and fly it".
