---
id: 073
title: "A compact flight HUD and VAB for phones, built with a device"
status: draft
owner: ""
depends: [055]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 073 — A compact flight HUD and VAB for phones, built with a device

## Goal

Make phones (landscape first, then portrait) a supported class, if the human's device pass of plan 055 shows the game can run on them. Plan 055 decided in ADR 0091 that phones stay unsupported because no compact interface exists and nothing about phone GPUs or thermals could be measured.

## Context

- ADR 0091 and journal 055 (the human device checklist). Start only with results from that checklist: frame times on at least one iPhone and one Android phone with the `low` preset and the governor, how the browser chrome and the notch change the usable area, whether audio survives a call.
- The flight HUD is a 650 to 830 px wide deck, a 264 px right column and strips; a phone in landscape is about 390 px tall.

## Scope

**In (to be ordered at refinement):**
1. A compact flight HUD for under 900x500: navball, speed, altitude, throttle, stage in a few elements; the rest behind a drawer.
2. A VAB layout for phone landscape and portrait (catalogue as a drawer, stage editor as a sheet).
3. Phone rules: the preset and the governor's floor, an energy-saving mode, the wake lock if the screen sleeps during a long warp.
4. Move the notice to "supported" for the classes that pass.

**Out:** gamepad support, a native app.

## Acceptance criteria

- [ ] To be written when refined, from the device results.

## Docs checklist

- [ ] STATUS, journal, `product/browser-support.md`, an ADR superseding 0091's first point.

## Log

- 2026-10-17 — Created as draft by plan 055 (phone session): the compact interface is unverifiable without a device.
