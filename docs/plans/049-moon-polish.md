---
id: 049
title: "Moon polish: ground effects, terrain shadows, rocks, more airless bodies"
status: draft
owner: ""
depends: [044]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 049 — Moon polish

## Goal

Landing on the moon feels as good as launching from the pad: exhaust kicks up dust on the regolith, the sun casts long shadows from the rim of a crater, stones are real geometry you can land next to, and adding a third airless body is a data change.

## Context

- Plan 044 and ADR 0054 (`MoonPass`, one height function). Found, not done there: `effects/system.ts` skips every vessel whose SOI is not the primary body (`v.soi !== this.primary`), so no dust, ground flash or plume light on the moon; terrain does not shadow terrain (only vessels cast shadows on it); the stones are a normal-map illusion; the terrain of a body is chosen by "has a parent" (`sim.worker.ts`, `scene.ts`).

## Scope

**In:** ground effects for any body with a terrain field (`Effects` takes a ground-height function per body); sun-direction terrain shadow from the baked patch (a short march); instanced stones near the camera from the same cell hash as the shader; a `terrain` kind on `BodyDefinition` (or a registry of terrain fields in `@orbital/sdk`) replacing "has a parent"; HUD radar altitude on the moon (`radar.ts` uses the home terrain).
**Out:** more planets (needs its own plan), surface features to interact with.

## Acceptance criteria

- [ ] To be made measurable at refinement (screenshots of a landing with dust and of a low sun; frame budget on the moon surface; a test mod body with its own terrain renders).

## Docs checklist

- [ ] STATUS, journal, ADR for the terrain kind, `overview.md`.

## Log

- 2026-10-17 — Created as draft from plan 044 (found, not done).
