# 0264 — EVA inventory and deployed science stations

**Status:** accepted (CTO call delegated by the owner, 2026-10-21)
**Date:** 2026-10-21
**Plan:** plans/284-eva-inventory-and-deployed-science.md
**Builds on:** ADR 0125 (off-world bases, base kit, drill), plan 225/249 (EVA v2, helmet and chute), ADR 0261 (containers)

## Context

The owner wants parts that are left on a planet "for research or something", and stations and bases built on other worlds. KSP 1.11 added inventories: small parts carried in containers and attached by engineers on EVA. Breaking Ground added deployed science: a control station, power units, an antenna and long-running experiments that a kerbal sets on the ground and that send science over time. We have bases (base kit, drill, ice, one ISRU step) but no inventory.

## Decision

1. **Cargo parts:**
   - A part may declare `cargo: { volume, stackable? }` (additive).
   - Containers (`ModuleInventory`, capacity in litres) and each astronaut (a small personal inventory) hold cargo items.
   - Items are stored as part definitions with their state.
2. **EVA construction:**
   - An engineer on EVA can take an item, attach it to a surface of a vessel (surface link, ADR 0235) or detach a cargo part back into an inventory.
   - Any astronaut can place a deployable item on the ground.
3. **Deployed station:**
   - Deployable items placed on the ground form a landed "station" vessel on surface rails, kept by the base system (ADR 0125).
   - It needs one control station in range, enough power (its panel or RTG) and a comms link (its antenna or a relay).
   - Its experiments yield science per day, more when a scientist set them up.
   - Items: control station, field RTG, field solar panel, field antenna, goo monitor, weather station, ionograph, passive seismometer (impacts nearby give a bonus).
4. **Robotic scanning arms** (on rovers) study surface features. The arm is a deploy animation, not a joint (ADR 0262 point 8). Surface features are seeded rocks per biome, from the existing stone lattice (ADR 0068).

## Alternatives considered

- **Deployed science without inventory** (a part that becomes a station when landed): simpler, but not how players expect to carry kits, and inventory serves base building too.

## Consequences

- Save format additions for inventories and stations; plan 284 writes the migration (additive).
- Contracts and career can ask for deployed stations later (draft plan from 284).
