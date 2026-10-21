# 0256 — Seven stack size classes, 0.625 m to 7.5 m

**Status:** accepted (CTO call, owner asked for "at least KSP and KSP2, better if possible", 2026-10-21)
**Date:** 2026-10-21
**Plan:** plans/275-size-classes-to-7-5-m.md
**Builds on:** ADR 0212 (node size and seam rule)

## Context

ADR 0212 fixed the stock classes at `[0.625, 1.25, 2.5]`. KSP1 has 0.625, 1.25, 1.875 (Making History), 2.5, 3.75 and 5 m (MH S4); KSP2 shipped up to 5 m (S4 tanks, 5 m docking ports). The real-rocket blueprints need more: a Saturn-V-class first stage (10 m real, 5 m at KSP scale), Proton's 4.1 m core, a Starship-class future rocket. The owner asked to match KSP/KSP2 at least and do better where we can.

## Decision

1. **`NODE_SIZES = [0.625, 1.25, 1.875, 2.5, 3.75, 5, 7.5]`**, named XS, S, SM, M, L, XL, XXL in the catalogue filter. 7.5 m is beyond both games.
2. **Every class gets a full set** over the plans that follow: fuel tanks in two or more lengths, a stack decoupler and separator, an adapter to each neighbour, a nose cone, a heat shield up to 5 m, a docking port up to 3.75 m, a fairing base, and at least one engine or engine plate. The set per class is in plan 275.
3. **Scale stays KSP-like** (the home planet is not real Earth), so a 5 m stage plays the role of Saturn V's 10 m S-IC.
4. ADR 0212's match and seam rules apply unchanged to the new classes.

## Alternatives considered

- **Stop at 5 m (KSP parity).** Leaves no room for the super-heavy blueprints and the owner's "better than them".
- **Procedural diameters (any size).** Flexible, but the catalogue, seams, shrouds and tests all key on classes; a later ADR may add procedural tanks on top of the classes.

## Consequences

- Plan 275 adds the parts; plan 276 adds the engines and engine plates for L, XL and XXL.
- The frame budget and the pad must take a 7.5 m, 100 m-tall vessel: plan 275 measures the pad and the launch clamps at that size.
