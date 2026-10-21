# 0260 — The pod's apex: a parachute that continues the pod's slope, a docking chute ring, or radial chutes

**Status:** accepted (CTO call delegated by the owner, 2026-10-21)
**Date:** 2026-10-21
**Plan:** plans/278-pods-probes-and-parachutes.md
**Builds on:** ADR 0212 (the pod's top node is 0.625 m), plan 209 (parachutes)

## Context

The owner: the parachute looks like a big box that does not blend into the pod's slanted top, and a pod usually wants a docking port on top too. Today the stack parachute is an upright 0.32 m drum on the pod's 0.625 m collar (profile in `refs/part-visuals-and-blueprints/parts-tracker.md` §5.1). In KSP1 one top node takes one part: the Mk1 pod's small top node is for the Mk16 parachute, and the Mk1-3's 1.25 m top node takes either the Mk16-XL or a docking port. A player who wants both puts radial parachutes on the sides ([KSP wiki: Mk1 pod](https://wiki.kerbalspaceprogram.com/wiki/Mk1_Pod), [Mk1-3 pod](https://wiki.kerbalspaceprogram.com/wiki/Mk1-3_Pod)). Real capsules do better: Apollo packs three mains around the docking tunnel under the forward cover, and Dragon packs them in pockets around its nose.

## Decision

1. **Stack nose chute (as KSP):** a frustum whose wall continues the pod's slope, shorter than today, a two-tone cap, no top node. Parameter `taper` (wall slope), with a default that matches the stock pods. When a chute sits on it, the pod collar draws no inward step.
2. **Docking chute ring (better than KSP):** a frustum shell at the pod's apex that holds the mains in a ring around a central tunnel and **has a top node** for a docking port of the same class. On deploy its cover panels pop off (debris) and the canopies come out around the port. One part per pod class (0.625 and 1.25 m). The sim treats it as a parachute part with a node above; the port stays attached when it deploys.
3. **Radial chutes** become slim packs curved to the hull, so a docked pod has a third option.
4. **Larger pods may carry built-in chutes** (the 3-seat pod's `ModuleParachute` in the pod itself), drawn as the forward compartment of the pod. Used by the Selene (Apollo-like) blueprint.

## Alternatives considered

- **KSP's rule only (chute or port).** Simple, but the owner asked for both and real spacecraft do both.
- **Let any part stack on top of a chute.** Would let canopies deploy through parts; the ring keeps the tunnel clear by construction.

## Consequences

- Plan 278 remodels the stack, radial and drogue chutes and adds the ring and the built-in variant.
- The canopy anchor of the ring is off-axis (three anchors around the tunnel): `canopyDynamic` takes several anchors.
