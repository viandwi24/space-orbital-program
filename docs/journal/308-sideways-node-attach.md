# 308 — Attach to sideways nodes

**Plan:** [plans/308-sideways-node-attach.md](../plans/308-sideways-node-attach.md) · **Session:** part visuals session (Claude), 2026-10-21

## What was done

- **`attachTargets`:** a parent node at right angles to the child's node is now offered, with the tilt that turns the child's node to face it (`AttachTarget.tilt`, from `rotationBetween` and `tiltOfMatrix`). `join` writes the tilt on the attached part.
- **`resolveVesselDesign`:** a stack link passes when the node directions face each other either before the tilt (as before, so old tilted designs still resolve) or after it.
- **Horizon Station:** an airlock with a small docking port on the hub's east port, and a cupola on its west port.

## What surprised me

- At first the turn was offered on every node. That put an upside-down match on every stack node and a sideways one on the shuttle's radial decoupler, and the shuttle blueprint picked the wrong one. Now the turn is a fallback: only perpendicular nodes, and only where no straight match exists.

## Verification output

```
apps/web vitest side-nodes, missions, Catalogue: 15 pass
bun test packages/core: 369 pass
```
