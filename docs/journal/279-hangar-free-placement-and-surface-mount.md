# 279 — Hangar free placement: surface attach anywhere, the offset (format 4), Move and Rotate tools with a gizmo, free mode, tilted ports that dock

**Plan:** [plans/279-hangar-free-placement-and-surface-mount.md](../plans/279-hangar-free-placement-and-surface-mount.md) · **Session:** worker (Claude), 2026-10-21 · **ADR:** [0258](../decisions/0258-hangar-free-placement-offset-and-rotate.md)

## What was done

The owner tested the Hangar and could not build "like KSP's anarchy mode": put a part anywhere, move it on x, y and z with the keyboard, turn it freely.

| Where | What |
|---|---|
| `core/protocol.ts`, `protocol-schemas.ts` | Design format 4: `parts[i].offset {x, y, z}` (m, parent's axes) and `freePlacement: true`. API 0.1.97 |
| `core/design.ts` | `DESIGN_FORMAT_VERSION` 4, `migrateVesselDesign` 1–3 → 4 unchanged; `withOffset` (the offset turned by the parent's rotation, added after the attach transform; the tilt pivots about the moved attach point); validation (format 4, finite); `tiltOfMatrix` (inverse of `tiltMatrix`, gimbal lock handled); `isOffset`. The root ignores an offset as it ignores a tilt |
| `web/editor/state.ts` | `setPlacement` (offset and/or tilt, any angle, one undo step, symmetry copies follow as mirror images via `memberTransform`: the offset turned by the members' angle on a shared parent, reflected across YZ for a mirror pair or across XY for an inherited mirrored copy; the tilt by `mirrorTilt` for the other half of a mirror pair); `setTilt` now goes through it; `nudgedOffset` and `turnedTilt` (local or absolute axes; the new tilt is `P⁻¹ B P T`); `setFreePlacement`; `onShapeSide`; `join` drops the root's old offset when a part is attached somewhere new; new designs are format 4 |
| `web/editor/bounds.ts` | The touch bound: oriented-box separating-axis test (`obbsTouch`), `partsOffParent` (collider vs parent's collider grown by 0.25 m) |
| `web/editor/checks.ts` | Launch check `off-parent` (warning, free mode only): "A part is not touching its parent." |
| `web/keybindings.ts` | New scope `tool` ("Move and rotate tools (Hangar)"): W/S, A/D, Q/E, F (axes), R (reset); `vab` keys 1/2/3 (Place, Move, Rotate) and H (snap to nodes); a "Move and rotate tools" help group (the settings Controls list shows them and they can be rebound) |
| `web/vab/tool-keys.ts` | What a tool key does: Move 0.1 m (Shift 0.01 m) along X/Y/Z; Rotate 15° (Shift 5°): W/S pitch about X, A/D roll about Z, Q/E yaw about Y |
| `web/vab/controller.svelte.ts` | `tool`, `toolFrame`, `snapNodes`, `freePlacement`, `toolTarget`, the gizmo model, keyboard and gizmo drag (a live preview, one undo step on release; Shift fine, Alt no snap; a move drag turns pixels into metres along the projected axis, a rotate drag follows the pointer's angle about the gizmo centre). In the Move/Rotate tools a drag from a part orbits instead of carrying it. Surface placement: with node snapping off the rings are ignored (`pick` gets `ignoreNodes`) and the held part goes on the face at the cursor; with it on, a radial site is used only where the hit is on the collider's side (`onShapeSide`), so parts no longer float off a pod's slope or a cone |
| `renderer/vab/gizmo.ts`, `view.ts`, `scene-model.ts` | `VabScene.gizmo`: three arrows (Move) or three rings (Rotate) in the tool's axes, drawn over everything at a constant screen size (`GizmoKit`), picked by screen distance (`nearestGizmoAxis`, `gizmoAxisNear`), `gizmoScreen` for the drag maths |
| `web/vab/ToolPill.svelte`, `SelectionCard.svelte`, `BuildContext.svelte` | Place / Move / Rotate segments, Local/Absolute, Nodes, Free toggles; tilt sliders −180°…180°; the offset read-out and Reset offset; a context chip with the tool's keys |
| Tests | `core/test/design-offset.test.ts` (offset maths, parent axes, radial, root, schema, migration 1–3 → 4 resolves identically, `tiltOfMatrix`); `web/editor/placement.test.ts` (offset, undo, save/load, bound and free mode, launch check, carry drops the offset, free tilt past 90°, symmetry copies around and mirror pairs, local/absolute nudges and turns, a docking port on a tank's side, `onShapeSide`, OBB test); `web/vab/tool-keys.test.ts`; `renderer/test/vab-gizmo.test.ts`; `sim/test/free-placement.test.ts` (an offset and tilted part's pose, collider source, mass and CoM in the sim; two vessels with ports tilted 90° about Z and about X dock in 2.9 s and undock with the mass conserved) |

### How to use it (default keys)

- **1** Place tool, **2** Move tool, **3** Rotate tool (KSP's keys). Select a part (click), then:
  - Move: **W/S** up/down (Y), **A/D** left/right (X), **Q/E** forward/back (Z), 0.1 m; **Shift** 0.01 m.
  - Rotate: **W/S** pitch (about X), **A/D** roll (about Z), **Q/E** yaw (about Y), 15°; **Shift** 5°.
  - **F** local (the part's) / absolute (the vessel's) axes; **R** resets the offset (Move) or the rotation (Rotate).
  - Or drag an arrow (Move) or a ring (Rotate) of the gizmo; Shift fine, Alt no snap.
- **H** (or the "Nodes" toggle) turns node snapping off: a held part goes on any face at the cursor, facing the face's normal.
- "Free" toggle: free mode (saved in the design); a moved part may leave its parent. Without it a moved part must still touch its parent's collider grown by 0.25 m (the notice says "turn on Free mode").
- The symmetry group follows; "only this" (the selection card's toggle) moves one part, which leaves its group.

## Why the owner could not do it before

- **No offset and no tool**: a part could only sit on a node, a radial site or a surface point; nothing moved it off that spot, and the tilt sliders stopped at ±90°.
- **The rings won over the faces**: a ring within 36 px of the pointer took the click, so on a small or zoomed-out vessel nearly every face was inside a ring's snap; there was no way to switch snapping off (Alt does the opposite: rings only).
- **Radial parts floated off curved parts**: a part with a side node always took the radial site on the collider's cylinder, which is wider than a pod's cone or a nose cone, so it hung in the air beside the visible face.
- Parts with only stack nodes (a docking port) were *not* refused on a surface: `surfaceTarget` picks the node best facing the face; a test now proves it. The 0.05 m surface tolerance was not the blocker either: every stock part's visible mesh lies inside its collider except wheels, the launch clamp, the fairing panel, the control surface (0.08 m), the suit and the flag (measured by a scratch script over the stock models).

## What surprised me

- **A port tilted on a tank's top sits inside the tank's radius.** The first docking test stalled at 0.44 m: the tanks' colliders touched before the faces met. The test now offsets each port 0.8 m outward, which is what a player does with the Move tool (or they put the port on the side with a surface link).
- **The `state` placement of `load-vessel` positions the centre of mass**, not the root: the docking test finds Beta's face-to-CoM vector in a scratch sim with the same orientation first.

## Decisions made

ADR 0258 is followed with these differences (recorded in its Consequences):

- The fine move step is 0.01 m (the task), not 0.02 m.
- The root part is neither offset nor tilted (the resolver ignores both, as it already ignored a root tilt): turning the whole vessel's frame or re-rooting is plan 304.
- No plane handles on the move gizmo (plan 304).
- The bound applies to parts with an offset; a tilt alone pivots about the attach point, which stays on the parent.

## Not done

- **e2e** (move 0.5 m with the gizmo, save, reload): not written; the owner said not to run e2e. The save/reload of an offset is covered by `placement.test.ts`; the e2e is in plan 304.
- **Screenshots** of the gizmo: no browser run in this session (the plan's screenshot criterion was about new parts; this plan adds none).
- The gizmo's look was not checked in a browser.

## Verification output

```
bun test packages/core/test/design*: 56 pass, 0 fail
bun test packages/sim/test/free-placement.test.ts: 2 pass, 0 fail (tilted ports: captured after 2.86 s)
bun test packages/renderer/test/vab-gizmo.test.ts: 4 pass, 0 fail
apps/web vitest src/lib/editor src/lib/vab src/lib/keybindings.test.ts: 260 passed
bun run lint: All matched files use Prettier code style! (root and apps/web)
bun run build: ✔ done
bun run typecheck: packages exit 0; svelte-check 2084 FILES 0 ERRORS 0 WARNINGS
bun run test: 2125 pass, 0 fail (662 s)
apps/web CI=true bun run test: Tests 2 failed | 1392 passed; the two known
  sim-host-script-worker.test.ts failures (they fail on main too)
bun run docs:check: docs-check: OK (236 plans, 244 ADRs)
```

Before `bun run build` in a fresh worktree, svelte-check also reports two errors in `src/lib/script-sandbox-web.ts` (the sandbox scripts are build outputs); they go away after the build.
