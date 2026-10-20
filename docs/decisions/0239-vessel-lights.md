# 0239 — Vessel lights: a module, a lamp visual and a small light budget

**Status:** accepted
**Date:** 2026-10-20
**Plan:** plans/242-light-part.md
**Builds on:** ADR 0174 (action groups; `stock.lights` and the U key already existed), ADR 0214 (electric charge), ADR 0224 (per-instance module state in the snapshot)

## Context

The Lights group and its key existed but no part joined it. A lit part also needs a picture: a glow on the part and light on its surroundings, without a light per lamp (each light costs every lit pixel).

## Decision

1. **The module.** `stock.light`: `on`, `colour` (one of warm, white, red, amber, green, blue), `brightness` 0..1, `blink`, `drain` (EC/s at full brightness). Its toggle is in `stock.lights`, so U switches every lamp; colour is a mode, brightness and blink are "More" controls; all four are Hangar build controls (the initial state). While on it draws `drain × brightness` per second in flight and on rails; given less than half of it, it goes out. The power budget counts a lamp that starts on.
2. **The parts.** `stock.light-spot` (18° half cone, 120 m, 0.04 EC/s) and `stock.light-flood` (60°, 45 m, 0.08 EC/s): small boxes with a radial node, so they can sit on a side, or on any face with a surface link (ADR 0235); the lens looks along the part's +X. They unlock with the Electrics node.
3. **The visual.** `PartVisual.lamp` (`module`, `pos`, `dir`, `angle`, `range`; API 0.1.94). The model draws an emissive lens while the snapshot says `on` (and, if `blink`, half of each second) and offers a reading to the scene. Procedural generator `light` draws the housing.
4. **The budget.** The scene owns a pool of `LAMP_BUDGET` (4) spot lights without shadows. Each frame the lit lamps are listed and the nearest to the camera that are within 600 m and within three of their own ranges take a light each; the rest keep only the glow. The count of lights never changes, so no shader is rebuilt when a lamp goes on.

## Consequences

Shadow-casting vessel lights stay out of scope. A mod can add a lamp with its own part and `visual.lamp`. The lens and cone are in the part frame, so a tilted or surface-mounted lamp points where it is turned.
