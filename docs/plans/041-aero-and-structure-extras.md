---
id: 041
title: "Aero and structure extras: struts, fuel lines, tilted parts, wing lift"
status: done
owner: "structure session (Claude, 2026-10-17)"
depends: [033]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 041 — Aero and structure extras

## Goal

The building blocks plan 033 did not add: struts and fuel lines (a part joined to a second part elsewhere on the vessel, with crossfeed for the fuel line), tilted parts (any rotation of a part, so engines and wings can be canted), radial attachment to boxes (wings carry control surfaces), and wing lift with a drag polar. A player can build an asparagus-style booster rocket with fuel lines and struts and fly it to orbit, and a small winged craft glides.

## Context

- ADRs 0015, 0016, 0018, 0033, 0034 (format 2, yaw, radial), 0035 (fin), 0042 (stability read-out), 0045, 0046, 0050 (designs in saves); **new: the ADRs of this plan** (connector parts, format 3 with tilt, wing lift).
- Journals 024 (crossfeed `reach` in `delta-v.ts` mirrors the sim rule), 026, 029, 033. `docs/research/fin-aerodynamics.md`, `docs/research/wings-struts-fuel-lines.md`.

## Scope

**In:**
1. **Connector parts** (strut, fuel line): a part that hangs radially on one part (its tree parent) and has a `link` to a point on the surface of a second part. Format 3. A fuel line carries propellant from its parent end to the target end (one way, KSP convention); a strut is rigid and structural. Both are cut when a split puts the two ends on different vessels. Stock `stock.strut`, `stock.fuel-line`.
2. **Tilted parts**: `parts[i].tilt` (Euler angles about the part's own axes, applied about the attach point). Full rotation in resolve, sim (colliders, inertia, forces, snapshot), engine axis in the Δv descriptor, editor controls.
3. **Radial attachment to boxes**: the (angle, height) site is the ray from the part axis, so a control surface can sit on a wing.
4. **Wing lift**: `stock.wing`, control stays `stock.control-surface`. Lift slope from aspect ratio (`a0 / (1 + a0 / (pi e AR))`), stall, induced drag (`C_L^2 / (pi e AR)`), a parasite term; part incidence by tilt. The editor's stability read-out counts wings through the existing `lift` descriptor.

**Out (draft 063):** landing gear and ground handling of an aeroplane, runway, trim and flaps, a flight-model review for planes (speed/AoA HUD, pitch hold), strut stiffness (the vessel is one rigid body, ADR 0018, so a strut cannot stiffen anything), sweep and Mach effects. Reason: a plane's gameplay is a plan of its own; this plan gives the parts and the physics.

## Design notes

- Format version 3 adds `parts[i].tilt?: {x, y, z}` (rad), `parts[i].link?: {index, angle, y}` and radial links to box parents. Nothing is removed; versions 1 and 2 migrate unchanged. The sim and `resolveVesselDesign` accept all three; the features need 3.
- A connector is a tree part (mass, collider, drag, staging as any part) whose `PartDefinition.connector` is set (`feeds: true` for a fuel line). The sim stores `PartState.link = { peer, point }`; a split clears a link whose ends are on different sides.
- Fuel flow (`reachableParts`): the sources of a fuel line that ends at part X are inserted before X in the draw order, entered even when their `crossfeed` is false (the line is the explicit connection), without passing through it.
- Part rotation: `ResolvedPart.rotation`, `PartState.rotation?` (absent means `qAboutY(yaw)`, so every old save resumes).

## Steps

1. ADRs, research, this plan; API bump.
2. Core: format 3 types and schema, `resolveVesselDesign` with rotation, box radial, links, `PartDefinition.connector`, `ModuleInfo.engine.axis`, tests.
3. Sim: part rotation (colliders, inertia, hooks, snapshot, placement), links (state, split, save check, snapshot), fuel-line flow; tests.
4. Stock: `stock.wing` module and part, `stock.strut`, `stock.fuel-line`; module tests.
5. Renderer: generators for the three parts, connector drawn from the snapshot link, part rotation in the VAB scene and flight.
6. Web: `delta-v.ts` (links, engine axis), editor (connect mode, tilt, box radial, symmetry, undo), stability, VAB UI; tests.
7. Manual: asparagus rocket with fuel lines and struts to orbit; glider; screenshots.
8. Docs, draft 063, commits.

## Acceptance criteria

- [x] `core` design tests: a tilted part and its children resolve to hand-computed positions and rotations; a radial child on a box resolves to the hand position and yaw; a link resolves its far point; refusals (tilt, link or box radial in a version 1 or 2 design, link on a non-connector part, connector part without a link, link to itself); a frozen version 2 fixture and version 1 designs resolve identically after `migrateVesselDesign`.
- [x] Sim, tilted parts: the inertia tensor of a part tilted 90 degrees about Z equals the hand-rotated one (1e-9), centre of mass unchanged, snapshot orientation equals body times part rotation, a tilted engine's thrust leaves along the tilted axis.
- [x] Sim, fuel lines: with two boosters feeding a core engine through lines, the core engine draws from the boosters first and then its own tank (amounts after N seconds match the hand calculation), a booster engine never draws from the core, firing the radial decouplers clears the links and the core then draws only its own tank; a design with no connectors is byte-identical (determinism and `scenario-orbit` green).
- [x] Sim, struts: a strut across a stack decoupler does not hold the halves together (the vessel splits, the link is cleared); a vessel with struts runs twice to the same bytes.
- [x] Wing lift: `wingCoefficients` equals the model hand values (linear region, peak at the stall angle, post-stall, induced drag at C_L 1.0); in the sim the wing force at a stated airspeed and angle equals the hand value (1e-9 relative); a stated glider (hand-computed polar, `(L/D)max` of the whole craft) glides within 15 percent of the predicted L/D.
- [x] `delta-v.ts`: per-stage Δv of an asparagus design with fuel lines equals the hand intervals (1e-9 relative, draw order lines first); a canted engine loses `cos` of its tilt; the same design through the sim's draw rule gives the same booster burnout time.
- [x] VAB editor tests: connector placement (both ends, refusal of a bad second end), undo/redo, symmetry for connectors, tilt, radial on a box, group delete of a connector with its part.
- [x] Renderer generator tests: strut, fuel line and wing inside their bounds with triangle budgets; connector geometry spans the link points.
- [x] `[manual]` an asparagus-style booster rocket with fuel lines and struts built in the VAB (mouse or keyboard) flies to orbit (script/autopilot allowed); a small winged craft glides; screenshots `docs/journal/assets/041-*.jpg`.
- [x] `bun run test`, web vitest, `bun run typecheck`, `bun run build`, `bun run docs:check`, prettier green (other sessions' WIP reported separately); one short single-engine e2e of the VAB at the end.

## Docs checklist

- [x] STATUS, journal 041, ADRs, `simulation.md`, `plugin-system.md`, `guides/writing-a-mod.md`, research, draft 063, roadmap entry removed.

## Log

- 2026-10-17 — Created as draft by the control session (pushed out of plan 033).
- 2026-10-17 — Refined draft → ready at the human's request (session: structure session). Plane gameplay pushed to draft 063 with reasons above.
- 2026-10-17 — Started (in-progress). ADR numbers 0069 and 0070 and plans 061, 062 were taken by plan 054 while refining: this plan uses ADRs from 0071 and draft 063.
- 2026-10-17 — Done. Evidence in `docs/journal/041-aero-and-structure-extras.md`. Deviations: the `[manual]` glider flew from a game save written by `packages/sim/test/glider-save.tool.ts` (a craft cannot start in the air from the VAB; plane take-off is draft 063), and the asparagus rocket was built from the booster rocket example by adding the lines and struts with the new connect tool (mouse for the first end, keyboard for the second); the ascent was a script edited in the panel. The tilt turns about the parent's axes (not the part's own) so a wing pair with equal tilts is mirrored (ADR 0071); wing `damping` defaults to 0 (ADR 0075). Frame cost of bars and wings not measured. `bun run docs:check` and prettier: see the final report (other sessions' unfinished rows are theirs).
