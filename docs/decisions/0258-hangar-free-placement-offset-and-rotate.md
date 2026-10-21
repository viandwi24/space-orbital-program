# 0258 — Hangar free placement: offset and rotate gizmos, design format 4

**Status:** accepted (CTO call delegated by the owner, 2026-10-21)
**Date:** 2026-10-21
**Plan:** plans/279-hangar-free-placement-and-surface-mount.md
**Builds on:** ADR 0034 (radial, yaw, symmetry), 0071 (format 3, tilt about the parent's axes), 0235 (surface links), 0218 (docking merge)

## Context

The owner: in KSP a docking port (and any part) can be placed "anarchically": tilted, perpendicular, moved freely in x, y and z and rotated freely in the VAB. Today a part is placed only by a stack node, a radial `{angle, y}` or a surface link `{point, normal}` (within 0.05 m of the parent's shape). Tilt exists (format 3), but the Hangar's sliders stop at ±90° and there is no translation offset and no gizmo. KSP has an offset tool and a rotate tool with 15° snap (5° with Shift), a grid snap for offset, and a local/absolute toggle; stock offset is bounded, and players use mods to remove the bound ([forum: offset without limit](https://forum.kerbalspaceprogram.com/topic/154448-how-to-offset-surface-attached-parts-without-limit), [editor devnotes](https://forum.kerbalspaceprogram.com/topic/87376-editor-being-revised-for-090-what-would-you-like-to-see)).

## Decision

1. **Design format 4** adds `parts[i].offset?: { x, y, z }` (metres, in the parent's frame at the attach point, applied after the attach transform and before the tilt). Format 3 designs migrate unchanged. `resolveVesselDesign`, `placeStack`/`placeRadial`/surface placement apply it; the sim, Δv and drag see the moved part like any part. Children move with their parent.
2. **Tilt is free:** any angle on every axis (the ±90° slider limit goes), the root part included.
3. **Gizmos in the Hangar:** a move gizmo (three axes and three planes) and a rotate gizmo (three rings), toggled by keys (Move `2`, Rotate `3`, as players know them; rebindable), with **local/absolute** frame (`F`), snap 15° and 0.1 m, fine snap 5° and 0.02 m with Shift, no snap with Alt. Symmetry copies follow as mirror images (ADR 0071's rule). Reset puts offset and tilt back to zero.
4. **Bounds:**
   - **Normal mode:** the moved part's collider must still touch or overlap its parent's collider, enlarged by 0.25 m.
   - **Free mode** (a Hangar toggle, saved per design): no bound.

   The vessel is one rigid body (ADR 0018), so a floating part is physically fine. A launch check warns "part not touching its parent" in free mode.
5. **Docking ports** may be surface-linked or offset and tilted like any part. Capture and merge (ADR 0218) use the port's own frame, so an angled port docks along its own axis. Plan 279 proves it with a test: two vessels with ports tilted 90° dock.

## Alternatives considered

- **KSP's stock bound only.** Players asked the owner for the freedom KSP needs a mod for.
- **Offset in world/vessel space.** Breaks when the parent moves; the parent frame keeps sub-assemblies intact.

## Consequences

- API minor bump (format 4 field), `guides/` and the Hangar help card updated.
- The Δv and stability read-outs already use resolved positions; no change.
- As built by plan 279 (2026-10-21): the fine move step is 0.01 m (not 0.02 m); the move gizmo has the three axis arrows but no plane handles; the root part is neither offset nor tilted (the resolver ignores both, as it already ignored a root tilt) and the bound applies to parts with an offset (a tilt alone pivots about the attach point). Those three are plan 301. Snap to nodes is a toggle (key H, the "Nodes" button): off, a held part goes on any face at the cursor; on, a radial site is used only on the collider's side, so parts sit on a pod's or a cone's visible face. The API went to 0.1.97, a patch: the field is additive (`conventions/versioning.md`).
