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

- ADRs: 0103, 0051, [0119](../decisions/0119-sun-at-the-root-home-body-tilt-as-orbit-inclination.md) (decisions of this plan)
- Read: ADR 0103 point 4, ADR 0051, 0027 (planet pass, one sun), 0141 (calendar on the root), 0145 (body rotation), `packages/renderer/src/sun.ts`, plan 085.
- Stock choice (ADR 0119): Sun 1.7565e28 kg, radius 261 600 km; home at 13.6 Gm (year 9.2 Ms), tilt 23.44° as the orbit's inclination; recorded in `mods/stock` and the journal.

## Scope

**In:**
- Stock Sun body (`star`, emissive, no surface), home planet as its child with an inclined orbit; the moon unchanged relative to the planet.
- The home body named (ADR 0119 point 1) in the sim, the worker's catalog and the client; save format 6 with `home` and the 5 to 6 migration.
- Renderer: sun direction from the star body; the planet pass, environment and site keyed to the home body; the star drawn emissive; star field already fixed to the system frame.
- Map view: the Sun and the planet's orbit at the system scope.

**Out:** real ephemerides (123), the Sol pack (124), day-based rates reading the calendar (later).

## Touches

- **Size:** L
- **Edits:** `mods/stock`, `packages/core`, `packages/sim`, `packages/renderer/src/sun.ts`, `packages/renderer/src/environment.ts`, `packages/renderer/src/scene.ts`, `packages/renderer/src/renderer.ts`, `apps/web/src/lib` (catalog, flight loop, HUD, VAB, trip, worlds, mission center, space center), `apps/web/src/workers`
- **Shared contracts:** **save format 6 (`SimSave.home`, migration)**, **SDK (`BodyDefinition.star`)**, stock body data, renderer config (`SceneConfig.home`)

## Design notes

The Sun's SOI is infinite; the home planet's SOI is now finite (Laplace, about 84 000 km) and contains the moon and every stock contract.

## Steps

1. Freeze the format-5 save and the parity flight on the old system (done first).
2. Core: `BodyDefinition.star`, save format 6 and its migration, the sub-solar latitude function.
3. Sim: the named home; stock Sun and the home's orbit; the calendar on the Sun.
4. Renderer: sun from the star body, planet pass and environment on the home body, the star sphere.
5. Client: the catalog's home and every `bodies[0]` / parentless-home use; labels star / planet / moon.
6. Screenshots at solstice and equinox, frame times (M5), journal.

## Acceptance criteria

- [x] `packages/sim` test: the headless ascent and moon transfer scenarios give the same results within 1e-6 relative in the home SOI after the change.
- [x] `packages/core` test: the sub-solar latitude oscillates between +tilt and -tilt over one year within 0.01 degree.
- [x] Migration test: a frozen previous-format save resumes with the Sun as root and the vessel's state relative to the home body unchanged.
- [x] Screenshots of the same site at solstice and equinox (sun elevation at noon differs by 2 × tilt within 0.5 degree) with frame times unchanged (M5).
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/122-sun-root-axial-tilt-seasons.md` written.
- [x] `architecture/units-and-frames.md`, `simulation.md`, `overview.md` (environment), ADR if the planet-pass keying needs one.
- [x] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0103, 0051).
- 2026-10-18 — Claimed by Agent 1 and refined: ADR 0119 (named home, save format 6, tilt as the home orbit's inclination so the home sphere is untouched, calendar on the Sun, sun direction from the star body). Inventory of first-body assumptions: about 70 sites (sim 22, core 7, renderer 14, web 20, stock 3, save 6), in the journal.
- 2026-10-18 — Done (Agent 1): Sun, tilted orbit, format 6, home named in sim, renderer and client. Parity within 1e-6 (frozen flight); seasons ±23.44° within 0.01°; the frozen v5 save resumes unchanged; noon at 40° on the solstices 26.56° and 73.44° (2 × 23.44°), renderer within 0.002° of the prediction; pad frame time +0.17 ms (noise). Journal [122](../journal/122-sun-root-axial-tilt-seasons.md).
- 2026-10-18 — Checks: `bun run test` 1549 pass · web vitest 962 pass · typecheck · build · docs:check OK · Chromium smoke 7 pass · worlds, space-center and mission-center e2e 3 pass (the Mission Center lists the Sun as a third body).
