# 0331 — Experiment conditions: a door that is open and a part that points

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/298-satellites-and-telescope.md
**Builds on:** ADR 0178 (science: situations, experiments), ADR 0259 (the mission parts)

## Context

The space telescope (`stock.telescope`, plan 303) has an aperture door and an observation experiment, but a run only checked the situation: it succeeded in high orbit with the door shut and the tube pointing anywhere.

## Decision

1. **`ExperimentDefinition.needs`**, optional and additive (API 0.1.120): `open` is the id of a module of the same part whose snapshot says `open: true` (the telescope's `stock.animate`); `pointing` is the angle, in degrees, the part's forward axis (+Y, along the tube) may be off its target. An experiment without `needs` is unchanged.
2. **The target** is the vessel's set target (a body or another vessel; ADR 0064), else the body it orbits: a telescope left alone looks at the planet below. The set target gives the player a way to point at something else without a new concept.
3. **`ModuleExperiment` checks it** when the run starts (refused: `INVALID` with the reason: "the aperture door is closed", "pointing 10° off its target; needs within 5°", "no target to point at") and every step of the run: a run that loses its door or its pointing stops and its progress is lost, as one that leaves its situation does.
4. **Two small `VesselApi` additions** for it: `sibling(moduleId)` (another module's snapshot on the same part) and `targetDirection()` (the unit direction to the target in the part frame, on rails too). The observation has `needs: { open: 'stock.animate', pointing: 5 }`; the other experiments none.

## Alternatives considered

- **Put the pointing in the telescope's own module** — rejected: the condition is a property of the experiment (a mod's gamma-ray detector wants the same), and the experiment module already owns the run.
- **Pointing at a catalogue of stars or a sky map** — out of scope (plan 298).

## Consequences

- A telescope has to be turned: SAS target or planet-pointing modes (ADR 0064) do it; the run reason says how far off it is.
- The orbiter probe bus with its own engine and high-gain arms (an open choice of plan 298) are not part of this.
