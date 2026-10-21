---
id: 311
title: "Lights: a flat panel light, an angled light, navigation lights, OrbitX names"
status: in-progress
owner: "part visuals session (Claude)"
depends: [242]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 311 — Lights: panel, angled, navigation

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

**Out:** light colour by temperature (Kelvin).

## Steps

1. Generators.
2. Parts, in the tech node of the existing lights.
3. Tests: visuals, boot ids, snapshot.

## Acceptance criteria

- [ ] `bun test mods/stock packages/renderer` passes with the new parts.
- [ ] The navigation lights start red, green or white, and blink.

## Docs checklist

- [ ] `docs/STATUS.md`, journal `311-lights-panel-angled-nav.md`.

## Log

- 2026-10-21 — Started on the owner's question.
