# 358 — An inverse side link

**Plan:** [plans/358-inverse-side-link-for-reroot.md](../plans/358-inverse-side-link-for-reroot.md) · **Session:** Worker C, 2026-10-24 · **ADR:** [0333](../decisions/0333-inverse-side-link.md)

## What was done

| Where | What |
|---|---|
| `core/design.ts` | `DESIGN_FORMAT_VERSION` 5; `isInverseLink`, `placeInverse` (= `placeSurface` with the roles swapped), validation and placement in `resolveVesselDesign` |
| `core/protocol*.ts` | `formatVersion` accepts 5; the link kind is documented on `DesignLink` |
| `web/editor/frames.ts`, `reroot.ts` | `inverseLinkOnto`; the old child that separates at the node it touched keeps it, the old parent hangs on it; reversing an inverse link writes a surface link by the node it hung by |
| tests | `reroot.test.ts` (booster and cone as the new root, round trip back, same poses), `sim/test/inverse-link.test.ts` (format 4 loads, an inverse link needs 5, the decoupler fires and the core goes with the pod) |

## Notes

- The sim needed no change: the parent's attachment keeps `radial`, the child's side is `"surface"`, and `splitVessel` cuts by the decoupler's own node.
- The tilt left over is only a twist about the node: for a decoupler flat on the core it is zero.
- Not done: the Hangar's placement pick still never creates an inverse link (only the Root tool does).
