---
id: 035
title: Script access to targets and maneuver nodes
status: draft
owner: ""
depends: [032]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 035 — Script access to targets and maneuver nodes

## Goal

What plan 032 pushed out of the script API because the game has nothing to read yet: scripts that can ask for the selected target and a planned maneuver, and for other bodies' state over time.

## Context

- After plans 044 (moon and SOI transitions) and 045 (maneuver nodes), which add the sim and UI concepts this needs (ADR 0048 notes it becomes cheap after 045).
- Read: plan 032 (`bodies` ships there: static data of every body), `architecture/scripting.md`, ADR 0039.

## Scope

**In (candidates, to be ordered at refinement):**

1. **A target and a maneuver node in the sim and the UI** (neither exists: the sim has one controlled vessel per script and the map view has no nodes). They need their own plan and ADR first (state in the sim snapshot, commands, map UI); the script API (`ship.target`, `ship.node`, `bodies[id].position(t)`) follows.
2. **Other bodies' state over time** (position and velocity at a time, from the body's orbit): needs the multi-body sim (the home world is the only body today).

**Out:** moving scripting to a server.

## Steps

1. Refine after a sim plan adds targets/nodes.

## Acceptance criteria

- [ ] To be written when refined.

## Docs checklist

- [ ] `STATUS.md`, journal, `architecture/scripting.md`, `guides/scripting.md`.

## Log

- 2026-10-17 — Created as draft by plan 032 (the draft 032 listed "target and maneuver information"; the sim has no such concept).
- 2026-10-17 — The maneuver-node half (`ship.nodes`, `addNode`, `setNode`, `removeNode`, `warpTo`, SAS `maneuver`) shipped with plan 045 (ADR 0056). Left here: `ship.target` and other bodies' state over time (the body-state half needs `kepler` body orbits in the script `bodies`).
