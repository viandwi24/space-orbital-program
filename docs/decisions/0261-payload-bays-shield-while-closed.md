# 0261 — Service bays, cargo bays and payload petals shield their contents while closed

**Status:** accepted (CTO call delegated by the owner, 2026-10-21)
**Date:** 2026-10-21
**Plan:** plans/281-payload-bays-couplers-and-structure.md
**Builds on:** ADR 0224 (fairing shells shield parts: `shieldedParts`), plan 243 (enclosed engines)

## Context

The owner: payload is one of the joys of the game: building space stations, bases on other planets, landing rovers. We already shield parts inside a closed fairing: no drag, no convective heat (`packages/sim/src/debris.ts` `shieldedParts`, `frames.ts`). We have no bay with doors, no Apollo-style adapter whose petals open, no multi-coupler and no truss.

## Decision

1. **A bay is a part with a shell profile and doors.** It reuses `ModuleDefinition.shell` (ADR 0224) for the inside test. A new `ModuleBay` holds the door state (`closed`, `opening`, `open`) and works from the panel, action groups and staging.
2. **Shielding depends on the doors.** Parts inside a bay are shielded only while its doors are closed. When the doors open, the drag of the open doors is added.
3. **Kinds:**
   - service bay: 1.25, 2.5 and 3.75 m, 4 doors;
   - cargo bay: round, 2.5 and 3.75 m, long, 2 doors on top;
   - payload petals: an adapter whose 4 panels hinge open and can be thrown off by staging, Apollo SLA style;
   - container: a closed box for inventory items (ADR 0264).
4. **Payload release:** a part inside a bay can be decoupled only when the doors are open. If the doors are closed, the decoupler refuses and says why.
5. **Structure for stations and bases:**
   - multi-couplers 2/3/4;
   - square and round trusses with hubs;
   - a lattice interstage (Soyuz Blok I);
   - structural tubes that enclose an engine. These use the same shell test as fairings.

## Alternatives considered

- **Shield by bounding boxes only.** Wrong for long, thin bays; the profile test exists.
- **Bays always shield.** Unrealistic and would make doors cosmetic.

## Consequences

- One new module, several new generators. Doors animate through `visual.deploy`.
