# 243 — Fairings: interstage top node, enclosed-engine shielding, 3D section handles, a section at the cursor height

**Plan:** [plans/243-interstage-fairings-handles.md](../plans/243-interstage-fairings-handles.md) · **Session:** Worker A, 2026-10-20 · **ADRs:** [0238](../decisions/0238-interstage-fairings-shell-top-node.md), 0224

## What was done

| Where | What |
|---|---|
| `core/node-size.ts`, `design.ts`, `schemas.ts` | `AttachNode.shellTop`, `effectiveDef`; the design check and placement use it; API 0.1.93 |
| `core/definitions.ts`, `economy.ts` | `ModuleDefinition.cost`, summed by `designCost` |
| `mods/stock` | fairing `interstage` setting, `fairingCost`, `interstage` node on the three bases, `shell()` for an interstage |
| `sim/frames.ts` | the shell part's top counts as covered when a stage hangs on its shell-top node |
| `web/editor/fairing.ts`, `scene.ts`, `checks.ts`, `design.ts` | `setFairingInterstage`, `addFairingSectionAt`, handles in the scene, effective nodes everywhere a node is read |
| `renderer/vab` | node state `handle`, `handleNear`, `offsetOnPlane`, `onVerticalPlane` |
| `web/vab` | handle drag with live preview, a click on the shell adds a section at that height, Interstage button, cost on the status label |
| tests | `design-interstage.test.ts`, stock `fairing.test.ts`, sim `fairing.test.ts` (an interstage stack loads and stages), editor `fairing.test.ts`, `scene.test.ts`, `vab-picking.test.ts` |

## Not done

E2E (paused by the owner). The 3D handles and the click-at-height were not tried in a browser: only the maths (plane offsets, section cuts) is under test. No drag number was measured for the interstage (the sim test checks that it loads and stages, not the drag).
