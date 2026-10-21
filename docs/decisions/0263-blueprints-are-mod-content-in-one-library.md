# 0263 — Blueprints are mod content, shown in one Library with the player's own designs

**Status:** accepted (CTO call delegated by the owner, 2026-10-21)
**Date:** 2026-10-21
**Plan:** plans/285-blueprint-library.md, plans/286-real-rocket-blueprints-wave-1.md
**Builds on:** ADR 0041 (vessel library, sub-assemblies), 0083 (trip planner), 0255 (fictional names)

## Context

The Hangar's ready-made designs are five TypeScript functions in `apps/web` (`design.ts`, `editor/examples.ts`), offered as five text buttons in the empty-hangar card. The owner finds the picker ugly and wants a vessel-library style: drawn cards, stats, filters; and complete well-known rockets (Apollo/Saturn V, Soyuz, …) carrying RCS, antennas, crew, parachutes, life support and power.

## Decision

1. **`defineBlueprint` in the SDK** (additive API): `{ id, title, inspiredBy?, category: 'learn' | 'real' | 'mod', goal: 'orbit' | 'moon' | 'planet' | 'station' | 'surface', crew, sizeClass, livery?, design: VesselDesign, labels?: { part: index, text }[], checklist: string[] }`. Stock ships its blueprints as mod content; mods can add theirs. The five old examples become `learn` blueprints.
2. **One Library dialog** with three tabs: Blueprints, My designs, Sub-assemblies. A card shows a render on a blue grid (CSS behind a transparent PNG from `captureThumbnail`, cached in IndexedDB per blueprint version), the name, goal and crew badges, mass, Δv, part count, and a lock when career has not unlocked a part. Filters: origin, goal, crew/probe, size; search; sort.
3. **Detail panel:** a large render with leader-line labels (positions from `Renderer.project`), Δv per stage and TWR (shared Δv module), the trip planner's verdict ("reaches the moon and back with 400 m/s spare"), and the completeness checklist (RCS, antenna, power, parachutes, life support, heat shield). Buttons: load into the Hangar, load as a sub-assembly.
4. **The empty Hangar** shows four featured cards and "Open the Library" instead of five text buttons.
5. **Every stock real-rocket blueprint is flown headless** to its goal in `bun test` (as plan 034 did for the moon shot) and must pass the Hangar's launch checks.
6. **Career:** a blueprint with locked parts is shown with a lock and can be loaded only in sandbox; in career it opens read-only (study, not fly).

## Alternatives considered

- **Keep blueprints in `apps/web`.** Mods could not add any, and the list would stay code.
- **A separate picker from the vessel library.** Two dialogs for "pick a design to start from"; one Library is simpler.

## Consequences

- API minor bump; `guides/writing-a-mod.md` gains a blueprint section.
- Plan 286 onwards depend on the parts plans for the parts each rocket needs.
