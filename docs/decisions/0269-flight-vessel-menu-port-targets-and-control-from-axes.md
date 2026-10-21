# 0269 — Flight vessel menu, targets resolved at the docking port, controls in the control part's axes

**Status:** accepted (owner's request, 2026-10-21)
**Date:** 2026-10-21
**Plan:** plans/306-vessel-menu-port-targets-control-api-and-auto-dock.md
**Amends:** ADR 0065 (targets), ADR 0084 (target markers), ADR 0208 point 2 (control from here), ADR 0218 (port targets)

## Context

The owner wants to act on nearby vessels from the Flight view, as in KSP: click another vessel to fly it or target it, and target one of its docking ports. Plan 222 already let a target name a port (`TargetRef.part`) and reported a `PortAlignment`, but every other read-out (`target.position`, `target.velocity`, the navball markers, SAS `target`) still measured between the two centres of mass. Plan 221's "Control from here" turned SAS's nose and the navball to the control part, but the keys and RCS translation still acted in the root's axes: with a sideways port chosen, "forward" did not push the port forward.

## Decision

1. **Vessel menu in Flight.** A click on another vessel's mesh (one raycast, `Renderer.vesselAt`), or on its projected marker within 14 px when it is too small to hit, opens a menu: Control this vessel, Set as target, Target a docking port (its free ports), Focus camera, Rename. Hovering shows a tooltip with the name, distance and relative speed. "Control" uses the flight loop's `switchVessel` (the `[`/`]` and map path). Everything in the menu is page state or a command the sim accepts while paused, so the menu works paused. Focus camera points the flight camera at the other vessel's root part (`focusPart` accepts any vessel's part) until the player focuses back or switches.
2. **A port target is measured at the port.** When `TargetRef.part` names a port, the sim resolves `target.position` and `target.velocity` from the own reference point to that port's face, with each point's own velocity. The own reference point is the control part's port face when the control part is a docking port, else the centre of mass (unchanged). SAS `target`/`anti-target` aim along the same line. So the navball target and relative-velocity markers, the Target card's distance and speed and every script that reads `target` follow the port without changes of their own.
3. **The closest approach stays between centres of mass.** `target.approach`, the map's closest-approach pair and the maneuver aids work on orbits; a port is metres from its centre of mass and those numbers are kilometres. Writing it here so nobody "fixes" it.
4. **Controls follow the control part.** The `attitude` command's pitch, yaw, roll and translate are read in the control part's axes and turned into the vessel's axes by the part's rotation in the vessel before they are stored. With no control part (or the root) nothing changes. SAS demands stay in vessel axes (it already uses the control part's nose).

## Consequences

- A vessel controlled from a docking port flies like KSP's: forward pushes along the port's face, SAS target points the port at the target port, the navball shows the port's view.
- Scripts and saved key bindings need no change; old saves have no control part or have one whose axes now apply (intended).
- Renderer additions are two small functions (`vesselAt`, focus on another vessel's part); no change to drawing.
