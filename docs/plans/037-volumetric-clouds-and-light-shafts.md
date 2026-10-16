---
id: 037
title: "Volumetric cumulus, light shafts and a sky with depth"
status: draft
owner: ""
depends: [031]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 037 — Volumetric cumulus, light shafts and a sky with depth

## Goal

The cumulus stops reading as a paper deck: a half-resolution ray-marched slab with self-shadowing, darker bases and bright rims, light shafts at low sun and an aurora or ozone term at the golden hour. Pushed out of plan 031 because it is a second rendering pass with its own budget (ADR 0044, "Scope decisions").

## Context

- Read: `docs/journal/027-terrain-and-sky-follow-ups.md` and `031-physical-terrain-and-sky-volumes.md` (self-reviews), ADR 0037 (the lit shell it replaces), ADR 0025 (budget), `docs/research/terrain-physical.md` (the cloud technique notes; verify the details in the original slides before building).

## Scope

**In (candidates, to be ordered at refinement):**
1. A cumulus slab ray-marched at half resolution (8 to 16 samples, a low-resolution noise volume, a light march of 3 to 4 samples toward the sun, temporal reprojection), composited with the existing atmosphere march and the cirrus shell.
2. Crepuscular rays from the same density field.
3. Aurora or ozone term for the golden hour.
4. A budget: the clouds currently cost 2.4 ms at the pad (journal 027); the new pass must stay inside plan 027's `high` numbers.

**Out:** terrain (031), water (038).

## Steps

1. Refine: verify the technique, pick the volume representation, write the ADR.
2. Pure maths and tests (density, light march, composite twin), then the shader, then screenshots and frame times.

## Acceptance criteria

- [ ] To be written at refinement; every visual item carries `[manual]` screenshots under `docs/journal/assets/` and a frame-time table per preset.

## Docs checklist

- [ ] STATUS, journal, ADR, `docs/research/three.md`.

## Log

- 2026-10-17 — Created as draft by the physical-terrain session (pushed out of plan 031).
