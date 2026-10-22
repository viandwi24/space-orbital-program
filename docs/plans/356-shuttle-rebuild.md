---
id: 356
title: 'Shuttle rebuild: a lofted orbiter, a cargo bay with clamshell doors and a keel port, pre-docked ports'
status: done
owner: 'part visuals session (Claude)'
depends: [302, 308, 309, 345]
phase: 0
created: 2026-10-22
updated: 2026-10-22
---

# 356 — Shuttle rebuild

## Goal

The owner wants the Wayfarer Shuttle rebuilt (2026-10-22). They sent KSP stills in `refs/shuttle-ksp-reference/` (ref-42 on the pad, ref-43 in orbit with the bay open) and our current look (ref-41). Their points:

- The orbiter should read as a shuttle, not a round rocket with a dome.
- The payload should ride in a real cargo bay, with doors that open along the length.
- It should be docked there on a port, KSP style: two ports attached face to face in the Hangar start docked in flight, and "Undock" lets the payload go.

Markings stay fictional: no flags and no country names.

## Design (ADR 0300 for the ports)

- **The orbiter's cross-section** is a rounded square (a superellipse) whose corners touch the 2.5 m node circle. So the joint rim stays at the node radius (ADR 0212) while the body reads boxy. The nose, bay and aft are lofts of that section, not revolves. The black heat tiles cover the belly up to a chine line on each side.
- **`stock.orbiter-bay`** is a new 2.5 m part, 9 m long:
  - two clamshell doors on the top (+Z), hinged along the sills, which open outward along the whole length;
  - a yellow lined inside, frames, and fore and aft bulkheads;
  - a **keel** node on the floor that faces up (+Z), for a docking port.

  `stock.bay` closes the shell while the doors are shut (ADR 0261), so the payload is shielded. The old round `stock.cargo-bay` stays for other craft.

- **A docking face node:** an attach node can be marked `face: 'docking'`.
  - The Hangar offers to attach one docking face onto another by turning the part over: face to face, the KSP way.
  - The sim starts such a pair **docked**, so Undock (and a new "Undock on stage" build option) separates them with the port's gentle push.
  - Undocking a pair that was built docked releases both ports and blocks capture for a while, as an undock after a capture does.
  - Re-docking works through the normal magnet and capture.
- **The rest of the stack:**
  - wings: a double delta with black leading edges, tiles under and elevon lines;
  - the tail: a swept fin with a black leading edge and a rudder line;
  - the ET: denser foam ribs, an intertank band and a nose spike;
  - the SRBs: segment joints and an aft skirt.

## Steps

1. Plan, ADR 0300, before screenshots (ref-41/42/43 angles: front, three-quarter, the bay).
2. The renderer: a loft helper; the new `orbiter-nose`, `orbiter-bay` (with dynamic doors) and `orbiter-aft`; the `delta-wing`, ET and SRB detail; and a `liner` material.
3. Stock: `stock.orbiter-bay`, the docking face node on the ports, and `stageUndock` on `stock.docking-port`.
4. Core, editor and sim: the node `face`; the Hangar flips a docking face onto a docking face; spawn marks built pairs docked; undock releases them.
5. Wayfarer: nose, orbiter bay, aft (the OMS propellant in it). A station module (a side port with a cabin, a probe core, an airlock and a port) is docked on a keel port inside the bay.
6. Tests and docs, then push in pieces.

## Acceptance criteria

- [x] The part tests pass: seams (node rims), winding, triangle budgets and boot lists (renderer 758, stock suites).
- [x] Attaching a docking port onto another docking port's face in the Hangar gives a valid design (`docked-ports.test.ts`).
- [x] A sim test shows the pair is docked at spawn, and Undock in orbit separates them (`pre-docked.test.ts`). The payload drifts out slowly and in a straight line, with the gap growing and no recapture. Brought back from 9 m, the two dock again.
- [x] The Wayfarer design builds and its pre-flight checks pass (`missions.test.ts`). A new headless flight test takes it to a 79 km orbit on the ascent autopilot, opens the bay, and the module drifts out at 0.09 m/s (`mission-flights.test.ts`).
- [x] Before and after screenshots at the reference angles are in the journal.

## Docs checklist

- [x] ADR 0300, `docs/STATUS.md`, journal `356-shuttle-rebuild.md`, ADR index row, architecture notes (`simulation.md` docking, `plugin-system.md` node `face` and `hollow`).

## Log

- 2026-10-22: claimed (plan-numbers notes), surveyed, before shots taken.
- 2026-10-22: built and tested. Changes from the design:
  - the bay is hollow in the sim, because a module undocked inside its solid box was flung out at 10 m/s;
  - undocked ports ignore each other until they are 5 m apart, because the magnet pulled the payload back after the cooldown;
  - the side port is a new part, because the hub's side ports stand too far out for the bay;
  - the far wing has a "tiles on top" setting;
  - the OMS propellant moved into the aft, and the orbiter got lighter so the stack stays controllable.
- Follow-up, not fixed here: guidance's `autoStage` never sees a flameout (`ignited && flameout`, while the engine clears `ignited` as it flames out).
