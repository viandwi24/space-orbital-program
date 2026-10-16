---
id: 020
title: "Visual: part models, materials and effects"
status: draft
owner: ""
depends: [019]
phase: 2
created: 2026-10-16
updated: 2026-10-16
---

# 020 — Visual: part models, materials and effects

## Goal

Vessels look like rockets: every stock part has a procedural mesh that reads as its function (capsule, tanks, engine bell, decoupler, reaction wheel, legs, heat shield) with PBR materials, and the flight view shows engine plumes, liftoff smoke, staging separation, re-entry glow and destruction effects driven by snapshot data.

## Context

- Read: `docs/product/visual-direction.md`, ADR 0012 (host-supplied part shapes), ADR 0014 (part shape), ADR 0023 (part temperature in snapshots), `mods/stock/src/parts.ts`, `packages/renderer/src/scene.ts`, journal 019.

## Scope

**In:** a visual descriptor for parts that mods can provide through the SDK (additive, e.g. a `visual` style/kind with parameters) or a renderer-side generator registry keyed by part id with a fallback — decide by ADR; procedural mesh generators (lathe/extrude) per kind with detail (bands, seams, windows, bell, struts); PBR materials with procedural textures; vessel orientation and per-part placement correct; landing-leg deploy animation from module state; engine plume (throttle, ambient pressure, flameout), liftoff smoke/dust, separation puff, re-entry glow from `PartSnapshot.temperature`, explosion on `vessel:destroyed`/`part:damaged`; effects respect presets.
**Out:** imported models/textures (later), audio.

## Steps

1. Refine (ADR for the visual descriptor and mesh provider interface so assets can replace generators later).
2. Implement generators, materials and effects; tests for the pure geometry/plume maths.
3. Screenshots and perf; journal.

## Acceptance criteria

- [ ] To be made measurable at refinement. Must include: Bun tests for generators (bounds match part dimensions, node positions match attach nodes) and plume/glow functions; `[manual]` screenshots (two-stage vessel on the pad, liftoff with plume and smoke, vacuum plume, staging, re-entry glow, explosion) in `docs/journal/assets/020-*.png`; frame time within the budget; self-review; all repo checks pass.

## Docs checklist

- [ ] `docs/STATUS.md`, journal, ADR, `docs/guides/writing-a-mod.md` (how a mod gives parts a look), `plugin-system.md` if the SDK changes.

## Log

- 2026-10-16 — Created as draft at the human's request (visual overhaul, code-only).
