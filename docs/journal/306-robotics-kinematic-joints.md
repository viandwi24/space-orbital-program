# 306 — Robotics: kinematic hinges, servos, rotors and pistons

**Plan:** [plans/306-robotics-kinematic-joints.md](../plans/306-robotics-kinematic-joints.md) · **Session:** part visuals session (Claude), 2026-10-21

## What was done

The owner (relayed): do not stay blocked on ADR 0265; choose the practical approach, record it, build it. ADR 0269 records it: every joint is kinematic, inside the vessel's one body.

1. **Core:** `ModuleDefinition.joint(config, state)` returns `{ kind, axis, pivot, node, value }`.
2. **Sim:** `packages/sim/src/robotics.ts` runs after the docking capture each flight step.
   - It turns or slides the joint's moving side by the change since the pose it applied last, about the joint's current pivot. Being incremental, it does not care about docking merges.
   - If the root is on the moving side, the other side moves the other way.
   - It rebuilds the body at most 10 times a second per vessel (`refreshColliders(…, force)`), so mass, centre of mass, colliders and the drawn part transforms follow.
3. **Stock:** module `stock.robotic` and seven parts, in Surface operations, under the Robotics category and action group:
   - hinge S/M: "Knuckle", "Elbow";
   - servo S/M: "Swivel", "Turntable";
   - rotor "Spinner";
   - piston S/M: "Ram", "Jack".

   Each has a target, a speed and a lock (a rotor has on and reverse), and draws charge while it moves.
4. **Models:** generators `hinge-joint`, `rotary-joint` and `piston-joint`. The moving half is drawn from the applied pose by the articulation modes `hinge`, plus the new `spin` and `slide`.
5. **Hangar:** a `robotics` no-go past 4 robotic parts in a row or 16 per vessel.

## What surprised me

- The sim already had all it needed. `refreshColliders` rebuilds a body between steps, and the renderer re-places every part from the snapshot each frame. So the joint is about 100 lines and the renderer needed no change, apart from the part's own moving half.
- A stack's `top` node faces the root in a design built top-down. So a hinge in a plain stack moves the parts *below* it, by the inverse turn. The test covers exactly that case.
- Box-shaped hinges cannot carry a node size: the seam test measures a round rim at a sized node. Their nodes are unsized, like the truss.

## Open questions / follow-ups

- The sequencer and alligator hinges (ADR 0262 points 3–4) stay in plan 282.
- No reaction torque: an arm swinging in orbit does not turn the vessel (ADR 0269 point 5).

## Verification output

```
bun test packages/sim/test/robotics.test.ts: 2 pass
bun test mods/stock: 162 pass
bun test packages/renderer (parts, part-seams, parts-kit): 36 pass
apps/web vitest checks.test.ts: 9 pass
```
