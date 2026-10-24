# 0351 — Deployables break in strong airflow; the Hangar names the part that replaces a hidden one

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/280-power-comms-science-life-support.md
**Builds on:** ADR 0259 (surface-mounted parts), ADR 0257, ADR 0148 (pre-flight checks)

## Decision

1. **A break pressure on the module, not a new module.** `stock.solar-panel` and `stock.antenna` take `breakQ` (Pa, optional). Each step in flight, a part that is deployed (a panel's `deployed`; a dish or whip's `enabled`, which is what the model's deploy animation follows) and in dynamic pressure `½ρv²` above `breakQ` breaks: the panel folds, the antenna switches off, `broken` is saved with the module state, the panel's readout and the action's reason say "Broken by the airflow", and no action or staging step undoes it. Folded or switched off, a part never breaks. A fixed panel and the parts without `breakQ` never break. Stock values: 40 kPa folding array, 30 kPa wings, 25 kPa the big tracking arrays, 20 kPa the folding dish, 60 kPa the whip. A speed of 400 m/s at 0.5 kg/m³ is 40 kPa, so a capsule at its terminal speed (about 44 kPa at sea level) would break a deployed folding array: they are for the vacuum, as KSP's are.
2. **`catalog.replacedBy`** on a part definition names its successor. A hidden stack part from before plan 280 (the stack solar panels, the RTG, both antennas, the instruments with a surface-mounted twin, the life-support pack, the scrubber and the data drive) says which surface-mounted part replaces it. The Hangar's pre-flight report gets a `legacy-part` warning, naming each such part and its successor, with the parts at fault highlighted. It is a caution, it does not block Launch, and the design still resolves and flies (a test flies one). The Hangar does not replace parts on its own: a swap changes the vessel's shape.
3. **Mod API 0.1.127**: additive (`catalog.replacedBy`; the break pressures are module config).

## Left open

A toast on the break in flight; breaking for the airlocks and the science booms (plan 284 decides what deployed science is); an offer that swaps the part in one click.
