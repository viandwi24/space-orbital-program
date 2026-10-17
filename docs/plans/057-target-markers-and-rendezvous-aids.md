---
id: 057
title: "Target markers and rendezvous aids"
status: draft
owner: ""
depends: [035]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 057 — Target markers and rendezvous aids

## Goal

What plan 035 left out of targeting: showing the target where the player looks (navball, map, flight view) and the aids a rendezvous needs beyond a number in a card.

## Context

- ADR 0065 (target state, relative vectors, closest approach on two conics about one body), journal 035, plan 045 (the navball marker for a node as the model for a target marker).

## Scope

**In (candidates, to be ordered at refinement):**

1. Navball markers for the target and its anti-target, and the relative-velocity ("target prograde" and "target retrograde") markers, with a speed reference "target" in the speed readout.
2. Map view: the target's marker and orbit, the vessel's and the target's positions at the closest approach, a click on a body or an orbit to target it.
3. A closest approach across spheres of influence (a vessel on its way to the moon, or a vessel in the moon's sphere and a target in the planet's): `predictPatchedConics` of the vessel against the target's motion, in the sim or the page.
4. A node helper: "plan a node at the closest approach", ascending and descending nodes of the two orbits, and a Hohmann transfer to the target's orbit.
5. A target in the flight view: an off-screen arrow and a distance label near the target's mesh.

**Out:** docking, other vessels as controllable, a rendezvous autopilot.

## Steps

1. Refine; each candidate may become its own plan.

## Acceptance criteria

- [ ] To be written when refined.

## Docs checklist

- [ ] `STATUS.md`, journal, `guides/scripting.md` if the script API grows.

## Log

- 2026-10-17 — Created as draft by plan 035.
