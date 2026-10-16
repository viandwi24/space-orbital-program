---
id: 054
title: "Light shafts through the clouds and an ozone sky at the golden hour"
status: draft
owner: ""
depends: [037]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 054 — Light shafts through the clouds and an ozone sky at the golden hour

## Goal

Crepuscular rays when a low sun is behind or between cumulus, and the blue-hour colour of a sky with an ozone layer, both as stated in the draft of plan 037 and pushed out of it.

## Context

- Plan 037 and ADR 0059 (the cumulus slab, whose density the rays have to follow); `atmosphere-model.ts`, `shaders/atmosphere.glsl.ts`, `shaders/sky-env.glsl.ts` (the march, its CPU twin and the image-based light that share the atmosphere GLSL).

## Scope

**In (candidates):**

1. Light shafts: sun transmittance through the cloud slab inside the atmosphere march (a coverage read per march sample at the cloud altitude, or a screen-space radial blur of the cloud mask toward the sun), faded with the sun's elevation; a budget of about 1 ms at the pad.
2. An ozone absorption layer (Chapman profile, about 25 km) in the atmosphere model, the CPU twin and the sky-env pass, with the `aerialPerspective` and sky-colour tests extended.
3. An aurora curtain on the night side at high latitude (optional).

**Out:** terrain (031), water (038), the cumulus itself (037).

## Steps

1. Refine: decide between a per-sample coverage read and a screen-space radial blur by measuring the cost; verify the ozone coefficients online.
2. Pure maths and tests, shader, screenshots at golden hour, frame times against ADR 0053's amendment.

## Acceptance criteria

- [ ] To be written at refinement; every visual item carries `[manual]` screenshots under `docs/journal/assets/` and a frame-time table per preset.

## Docs checklist

- [ ] STATUS, journal, ADR, `docs/research/three.md`.

## Log

- 2026-10-17 — Created as draft by the clouds session (pushed out of plan 037: the shafts need the cloud occlusion inside the atmosphere march or a second pass; the ozone layer changes the atmosphere model, its CPU twin and the sky-env pass, so it needs its own review of the sky colour).
