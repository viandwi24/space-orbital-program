# 0348 — The sequencer: keyframe tracks over robotic joints, and a module's calls on other parts

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/282-robotics-articulated-vessels.md
**Builds on:** ADR 0262 (point 4: the sequencer), ADR 0269 (kinematic robotic joints), ADR 0224 (per-part settings), ADR 0174 (custom action groups)

## Decision

1. **A module may call other parts: `ModuleDefinition.drive`.** After its `update` each step in flight, a module's `drive(ctx, dt)` returns `ActionCall`s `{ part, module, action, args }`: the target by design index, one of its modules and an action. The sim runs each as the target's own action (`moduleAction`), and skips a call that names no part, module or action of the vessel, or that the target refuses (a locked joint, a bad value). Nothing else of the module system changes; the calls are deterministic as `update` is. (API 0.1.125.)
2. **The sequencer** is the module `stock.sequencer` on a controller disc (`stock.sequencer`, "Cue"). Its `tracks` (at most 8) each name a joint's design index and an action (`setTarget`) and keyframes `{ t, value }` (at most 32, linear between, held at the ends); its `mode` is `once`, `loop` or `pingpong`. The clock runs while the part's `setPlaying` toggle is on; a track's value goes out as the joint's target on every step the clock ran, including the one it ended on, and the joint moves at its own speed, so the sequencer adds no physics. When the clock stops the joints are free again.
3. **The tracks are per-part settings** (`settings['stock.sequencer']`, ADR 0224), so they are saved with the design and the vessel, and old designs load unchanged. The Hangar edits them in a panel on the selected sequencer (a joint, keyframes with time and value, the mode); each edit is one undo step. In flight the part's own controls (Play sequence, Rewind) run it; there is no separate flight timeline.
4. **Axis groups, the first slice:** `stock.robotic` gains `setAxis` (-1..1 across the whole travel, a `value` control under "more"), which a script, an action group's value or a track can call. Binding a key pair or a stick to it in the group editor is not part of this decision.
5. **Two parts:** the alligator hinge ("Jaw": a hinge about the back edge of its lower jaw, 0 to 150°; the pivot is the generator's and the config's) and a long-reach piston ("Reach": 1.35 m, a stepped rod). Both are the existing joint kinds with other data and generators; the rod of the piston is one rigid mesh, so its stages are steps of the rod, not nested tubes that slide apart.

## Consequences

- A sequencer cannot drive a part of another vessel, and a call by index reaches the part with that design index on the sequencer's vessel only.
- The sequencer needs no power of its own; the joints draw their charge as before.
