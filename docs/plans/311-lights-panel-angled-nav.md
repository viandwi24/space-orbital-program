---
id: 311
title: "Lights (panel, angled, navigation), the RCS jet redrawn, monopropellant for the blueprints' RCS"
status: done
owner: "part visuals session (Claude)"
depends: [242]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 311 — Lights, the RCS jet, RCS propellant

## Goal

The light family KSP players expect: a flat strip that sits flush on the hull, a light whose housing already points the beam at 45°, small navigation lights (red, green, white; blinking), and OrbitX names for the two lamps of plan 242.

## Context

- The owner asked (2026-10-21) whether we have KSP's lights: flat ones, diagonal ones and others. Plan 242 (ADR 0239) gave a spotlight and a floodlight with colours, brightness and blink.
- The lamp model (`visual.lamp`) already takes any `pos` and `dir`, so an angled lamp is data.

## Scope

**In:**
- generators `light-panel`, `light-angled` and `light-nav`;
- parts `stock.light-panel`, `stock.light-angled`, `stock.light-nav-red`, `stock.light-nav-green` and `stock.light-nav-white`;
- English OrbitX titles for the spotlight and the floodlight;
- tests.

Added on the owner's report of 2026-10-21 (screenshot: Horizon Station's RCS reads "no propellant"; the Kronos RCS jet looks poor):
- monopropellant for every blueprint with RCS, and a test that guards it;
- the RCS jet redrawn as a bright core and a stream of soft puffs.

**Out:** light colour by temperature (Kelvin).

## Steps

1. Generators.
2. Parts, in the tech node of the existing lights.
3. Tests: visuals, boot ids, snapshot.

## Acceptance criteria

- [x] `bun test mods/stock packages/renderer` passes with the new parts.
- [x] The navigation lights start red, green or white, and blink.
- [x] `missions.test.ts`: every blueprint with RCS carries at least 30 units of monopropellant.
- [x] The RCS jet in `/dev/parts` (WebGPU and WebGL): a short bright core, soft puffs that grow and fade.

## Docs checklist

- [x] `docs/STATUS.md`, journal `311-lights-panel-angled-nav.md`.

## Log

- 2026-10-21 — Started on the owner's question.
- 2026-10-21 — Done, with the RCS fixes from the owner's report.
