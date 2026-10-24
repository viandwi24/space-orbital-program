# 282 — Robotics, part two

**Plan:** [plans/282-robotics-articulated-vessels.md](../plans/282-robotics-articulated-vessels.md) · **Session:** Worker C, 2026-10-24 · **ADR:** [0348](../decisions/0348-sequencer-and-drive-calls.md)

## What was done

| Where | What |
|---|---|
| `core/definitions.ts`, `sim/hooks.ts`, `sdk` | `ModuleDefinition.drive` and `ActionCall` (API 0.1.125): a module's calls on other parts of its vessel, run by the sim after `update` as the target's own actions |
| `mods/stock/src/sequencer.ts`, `parts/robotics.ts` | the module `stock.sequencer` (tracks, keyframes, `once`/`loop`/`pingpong`, `setPlaying` and `rewind`), the part `stock.sequencer` ("Cue"); `valueAt` and `advance` are pure and exported |
| `robotics.ts` | `setAxis` (-1..1 across the travel) and the `axisOf` read-back |
| `parts/robotics.ts`, `renderer/generators/robotic.ts` | the alligator hinge `stock.hinge-alligator` ("Jaw", generator `alligator-joint`) and the long-reach piston `stock.piston-t` ("Reach", a stepped rod); [the jaw closed](assets/282-alligator-closed.jpg) and [open](assets/282-alligator-open.jpg), [the piston](assets/282-piston-t.jpg), [the sequencer disc](assets/282-sequencer.jpg) |
| `web/editor/sequencer-edit.ts`, `vab/SequencerEditor.svelte`, controller | the Hangar's track editor on a selected sequencer: joints, keyframes (time, value), the mode, one undo step each |
| `mods/stock/src/tech.ts`, tests | the three parts unlock with robotics; snapshots and lists updated |

## Tests

`packages/sim/test/sequencer.test.ts`: a two-keyframe track moves a hinge to 90° and back in a looped play, once plays to the end and stops with the joint at the last value, two runs give identical states, a track that names no joint is skipped, the telescoping piston extends to its full length, the alligator hinge folds to its limit (150°), and `setAxis` puts the target in the travel. `web/editor/sequencer-edit.test.ts`: the joints and travel, editing and saving into the design, the limits.

## Not done

- **Axis groups' input**: a key pair or a stick bound to a joint in the Hangar's group editor, and the flight loop sending it. `setAxis` and the sim side exist; the binding UI and the input map do not.
- **A timeline in Flight**: the part's controls play and rewind; there is no scrubber panel.
- The piston's stages are steps of one rigid rod, not tubes that slide apart; true nesting needs per-stage poses from the articulation.
- The Hangar's panel is number fields and a strip of dots, not a draggable timeline.
