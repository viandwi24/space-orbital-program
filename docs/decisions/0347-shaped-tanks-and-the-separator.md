# 0347 — Shaped tanks, a separator that is used up, and the catalogue size filter

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/275-size-classes-to-7-5-m.md
**Builds on:** ADR 0256 (size classes), ADR 0212 (node sizes), ADR 0317 (realistic stats), ADR 0268 (English text)

## Context

Plan 289 gave every size class its barrel tanks. The tracker still lacks the tank shapes real stages have (a ring, a ball, the R-7's tapered strap-on, a tank that is also an adapter), a round 0.625 m tank, and a separator ("TS" in KSP: it cuts the stack and leaves nothing). The Hangar's catalogue lists forty-odd parts a class; ADR 0256 already named the classes for a filter.

## Decision

1. **Three generators, four parts.** `tank-toroid`, `tank-sphere` and `tank-taper` (`generators/tank-shapes.ts`). Each keeps forged collars at the node radius at both faces, so the seam rule (rim = node radius within 1 mm, ADR 0212) holds without exceptions; only `stock.tank-booster`'s radial node is off the stack axis, as a booster's is. The collider of every part stays the cylinder of its widest radius and height (nothing a joint or a landing leg feels differs); the radial node of the booster sits at the cone's mean radius.
2. **Volumes decide the fuel, the widest diameter decides the dry mass.** Fuel is `stock.tank-wide`'s density times the shape's volume (torus, sphere, frustum); dry mass follows ADR 0317 by the part's widest diameter, which is what `realism.ts` measures. New eras: `stock.tank-booster` early (the R-7 of 1957), `stock.tank-adapter-3750-1875` modern; the rest mid.
3. **The parts.** `stock.tank-0625` is now a ball on a 0.625 m core (same id; 0.4 m radius, so about 21 u against 18 u as a barrel); `stock.tank-toroid` (1.25 m core, 3.25 m across), `stock.tank-sphere` (1.25 m core, 2.1 m across), `stock.tank-adapter-3750-1875`, `stock.tank-booster` (1.25 m at the foot, 0.625 m at the nose collar, 6 m); the shaped tanks offer three paints (As built, Plain, Bare steel). Tech: toroid and sphere with Shapes, the booster tank with Propulsion, the adapter tank with Super-heavy lift.
4. **A separator is a decoupler that is used up.** `ModuleDecoupler` gets `consume: true`; the context's `detach(node, impulse, { consume: true })` queues the cut with a flag. After the sim has split the vessel (one cut or the simultaneous ones), a consumed part is cut from its other neighbours and removed (`vessel:destroyed`, reason `spent`; the host does not report it as a loss). Neither stage keeps a ring, and no third vessel is left. Three classes: `stock.separator-1250`, `-2500`, `-3750` (a third lighter than the decoupler of the class, one use). **Mod API 0.1.124**: additive (`detach` options, `consume`).
5. **The size filter** lists the classes the shown parts have joints in (XS, S, SM, M, L, XL, XXL; `editor/size-class.ts`), as a toggle row under the search. A part belongs to every class of its sized stack joints (an adapter to two); parts with none (a radial panel, a strut) show only unfiltered.
6. **The 100 m tower.** `size-classes-pad.test.ts` gains a stack of the adapter chain and six 15 m 7.5 m tanks, about 105 m, on ten solid motors: it stands 5 s without sinking or tipping and lifts off.

## Left open

The panelled look of the large tanks (tracker TNK-04), radial tanks (TNK-06), a ring tank in the larger classes, a separator for 5 and 7.5 m, and the owner's look at the new shapes.
