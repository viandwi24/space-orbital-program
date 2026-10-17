---
id: 122
title: "The Sun as root, axial tilt and seasons in the stock system"
status: in-progress
owner: "Agent 1"
depends: [085, 081]
phase: 8
created: 2026-10-17
updated: 2026-10-18
---

# 122 — The Sun as root, axial tilt and seasons in the stock system

## Goal

The stock system gains a Sun at its root; the home planet orbits it with an axial tilt, so the game has years, seasons and changing day length; the renderer's sun direction comes from the Sun body; the planet pass draws the home body wherever it is in the tree; existing worlds migrate and fly the same in their home sphere of influence.

## Context

- ADRs: 0103, 0051
- Read: ADR 0103 point 4, ADR 0051, 0027 (planet pass, one sun), `packages/renderer/src/sun.ts` (fixed direction, declination 0.2 rad), plan 085.
- Choose the stock Sun, the home planet's orbit (period sets the year) and tilt at refinement; record the choice in the journal and `mods/stock` data.

## Scope

**In:**
- Stock Sun body (no surface, emissive), home planet as its child with an orbit and a pole; the moon unchanged relative to the planet.
- Renderer: sun direction and colour from the Sun body's position; star field fixed to the system frame; seasons visible in the terminator and snow line if any.
- Planet pass and environment keyed to the home body, not the root (all "first body" assumptions found and replaced).
- Map view: the Sun's sphere and the planet's orbit at system scale.
- Save migration: format bump; the old root becomes the Sun's child; vessel states in the home SOI unchanged.

**Out:** real ephemerides (123), the Sol pack (124).

## Touches

- **Size:** L
- **Edits:** `mods/stock`, `packages/core`, `packages/sim`, `packages/kepler`, `packages/renderer/src/sun.ts`, `packages/renderer/src/environment.ts`, `packages/renderer/src/planet.ts`, `packages/renderer/src/map.ts`, `apps/web/src/lib/hud`
- **Shared contracts:** **save format (body tree root change, migration)**, stock body data

## Design notes

The Sun's SOI is infinite; the home planet's SOI is now finite (Laplace) and must be large enough that the moon and every stock contract stays inside.

## Steps

1. Inventory of "first body is home" assumptions in sim and renderer.
2. Stock Sun and orbit data.
3. Renderer sun from body; planet pass on the home body.
4. Migration with frozen fixture; regression flights.

## Acceptance criteria

- [ ] `packages/sim` test: the headless ascent and moon transfer scenarios give the same results within 1e-6 relative in the home SOI after the change.
- [ ] `packages/core` test: the sub-solar latitude oscillates between +tilt and -tilt over one year within 0.01 degree.
- [ ] Migration test: a frozen previous-format save resumes with the Sun as root and the vessel's state relative to the home body unchanged.
- [ ] Screenshots of the same site at solstice and equinox (sun elevation at noon differs by 2 × tilt within 0.5 degree) with frame times unchanged (M5).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/122-sun-root-axial-tilt-seasons.md` written.
- [ ] `architecture/units-and-frames.md`, `simulation.md`, `overview.md` (environment), ADR if the planet-pass keying needs one.
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0103, 0051).
