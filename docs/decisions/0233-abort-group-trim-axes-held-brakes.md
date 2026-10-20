# 0233 — The Abort group is the design's custom slot 0; trim on three axes; keys that were pending

**Status:** accepted
**Date:** 2026-10-20
**Plan:** plans/245-keys-abort-stopwarp-trim.md
**Builds on:** ADR 0174 (action groups and the design's custom groups), ADR 0206 (key profiles), ADR 0161 point 4 (pitch trim), ADR 0225 (the Hangar's group editor)

## Context

The KSP key profile of ADR 0206 lists keys that no handler served: Backspace (abort), `/` (stop warp), Alt+A/D/Q/E (yaw and roll trim) and Alt+X (reset the trim). B brakes as a toggle, though in KSP the brakes work while the key is held. The release audit found no `stock.abort` group and a HUD that shows no trim at all.

## Decision

1. **The Abort group is the design's custom slot 0.** Stock action groups are made of descriptors, and a descriptor belongs to one group, so a stock `stock.abort` made of "decouplers and armed parachutes" would take them out of their own groups. KSP's Abort is a group the player assigns. So the design's `groups` take slot 0 (`ABORT_SLOT`, group id `custom.0`, label `Abort`), and the Hangar's group editor lists it first, before Custom 1–10, and edits it the same way. No new registry, format version or sim command; a design without slot 0 has an empty Abort group.
2. **Backspace aborts.** In flight it cuts the throttle at once, then fires `custom.0`: triggers fire, switches go on unless the whole group is already on (the rule of every group). The toast says "Abort: engines cut, Abort group fired", or, with no part in the group, "Abort: engines cut" and where to set it. In the map with a node selected Backspace still deletes the node (ADR 0061).
3. **`/` stops warp:** the same as stepping down to 1× in one press.
4. **Trim on three axes.** The `trim` command takes `pitch`, `yaw` and `roll`, each optional: an omitted axis keeps its value, 0 clears it, so Alt+X sends three zeros. The sim adds each trim to its axis of the demand, with or without SAS (`effectiveControl`). A key steps 0.05, within -1..1. The vessel snapshot carries `trim` while any axis is not zero, and the deck draws a `TRIM P +0.05 Y 0.00 R 0.00` chip over the read-outs.
5. **Brakes on hold.** A new action `brakesHold`: the KSP profile binds it to B and unbinds the toggle `brakes`; Classic keeps C as the toggle and gives `brakesHold` Alt+C. Key-down sets the brakes group on, key-up (or the window losing focus) sets it off.
6. **No action stays pending.** The `later(...)` declarations are gone; every action in the table has a handler and appears in the help overlay.

## Consequences

- `PartAction` groups and designs written before this keep working: slot 0 is new, 1–10 are unchanged, and the design schema's slot range widens to 0–10 (additive).
- The command schema's `trim.pitch` becomes optional (additive); `Snapshot` gains an optional `trim`.
- A mod's own script functions for abort and trim are out of scope.
