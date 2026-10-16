---
id: 025
title: "Visual: environment follow-ups (launch-site coordinates, ground detail, launch-site art, vegetation)"
status: done
owner: "environment-2 session (Claude, 2026-10-16)"
depends: [019]
phase: 3
created: 2026-10-16
updated: 2026-10-16
---

# 025 — Visual: environment follow-ups

## Goal

The flight environment of plan 019 stops falling short in the places its journal names, as far as code-only work without terrain geometry can: the launch site is placed by the sim (no renderer heuristic), the lawn is grass instead of noise colour, the launch site is a place instead of boxes, the ground between 1 and 20 km has relief, forests, fields and rivers, and the coast seen from orbit is a coastline instead of speckle. The bar is `docs/product/visual-direction.md` (ADR 0025).

## Context

- Read: `docs/journal/019-flight-environment.md` (self-review, "Surprises"), `docs/journal/020-part-models-and-effects.md` (headroom), ADR 0027 (pipeline; item 11 is superseded here), ADR 0019 (ground tile; physics stays on the reference sphere), `docs/product/visual-direction.md`.
- Human's review of the 019/020 screenshots (2026-10-16): flat blotchy grass, long dark straight lines across it, a plain hangar with a black door, untextured tower and props, lollipop trees, speckled coast, a painted map between 1 and 20 km.

## Scope

**In (ordered at refinement):**
1. **Launch-site coordinates in the sim**: `placeOnSurface` takes body-fixed latitude/longitude (ADR 0030); the renderer's launch-site inference is deleted. No protocol change.
2. **Dark lines**: find and fix (cause: shadows of 10 cm masts, poles and cables at a low sun).
3. **Near ground**: grass albedo with blades, clumps and gaps, mown stripes, instanced tufts with wind; matching ground and tuft colours.
4. **1-20 km ground and coasts**: hill shading, forest crowns, fields and hedgerows, rivers, coast displacement scaled by the map gradient, foam, wet sand.
5. **Launch-site art**: gabled hangar with panelled door, pilasters, clerestory, lights and emblem; glazed control centre and office; containers, vehicles, fences; tower platforms, ladder, umbilicals, floodlit masts; weathering on every material; trees with canopies, shrubs, groves near the pad; floodlights at night.
6. Device tuning, measured frame times per preset (M5 only; M1/M2 and Intel are not available).

**Out (moved to draft plan 027):** terrain heights and LOD (Phase 3, needs the physics ground), layered or volumetric clouds, weather, ocean waves, animated site details, glTF asset swap, M1/M2 measurements, mobile.

## Design notes

- ADR 0030 records the decisions: body-fixed placement; relief as shading only (nothing moves vertices, so vessels cannot float or sink); coast displacement by the map gradient; geometry for near vegetation; weathering patch of `MeshStandardMaterial`; floodlights.
- Sim stays environment-neutral and deterministic; the renderer reads snapshots only and imports only `@orbital/core` and `three`.

## Steps

1. Refine (research in `docs/research/three.md`, ADR 0030, measurable criteria).
2. Sim: body-fixed `placeOnSurface`, tests, `simulation.md`.
3. Renderer: remove the inference; fix the shadow lines; ground shader; launch-site modules; vegetation; presets; floodlights.
4. Tests for the new pure maths; manual screenshots; frame times; self-review.

## Acceptance criteria

- [x] A vessel loaded at t = 0, 1 s or 37 s at three latitude/longitude pairs stands within 1 m horizontally of the body-fixed site, and a vessel on the pad keeps its body-fixed position while it rests (`bun test packages/sim/test/launch-site.test.ts`: 10 pass; fails 6 of 10 without the fix).
- [x] The renderer's launch site matches the sim without the heuristic: `lockLaunchSite` and `LAUNCH_SITE_MAX_ALTITUDE` are gone, a vessel placed at the turned +X axis is exactly under the pad (`scene.test.ts`, fails when the default site is moved by 0.001 rad), the site root stands on the turned +X axis for several body rotations (`site-placement.test.ts`).
- [x] The long dark lines are found and fixed: thin steel never casts shadows (`SiteParts.thin`); `025-pad-morning.png` against `019-pad-morning.png`.
- [x] New pure maths has tests: `layoutTufts` (deterministic, budget, radius, never on pavement, density falls to the rim), `isPaved`, shrubs beside and not on buildings and roads, the patch markers of `weatherMaterial` and `windMaterial` against three's own shader chunks (`bun test packages/renderer`: 147 pass).
- [x] [manual] Before/after screenshots at the 019 camera presets (`019-pad-noon|low-sun|morning|close` against `025-pad-noon|low-sun|morning|close`), a launch-site overview (`025-site-overview.png`), a lawn and grove close-up, a night shot, ascent shots at 3 and 12 km, coast at 6 km, orbit coast and rim, all in `docs/journal/assets/025-*.png`.
- [x] [manual] Frame times per preset at 1080p against journals 019/020 are in the journal; `high` stays within 16.7 ms on the M5 in the throughput metric at all three scenes; the pad scene is at the limit in the synchronous metric (16.5 ms). M1/M2 not measured.
- [x] [manual] Written self-review against `visual-direction.md` naming what still falls short (journal 025).
- [x] `bun test`, `bun run typecheck`, `bun run build`, `bun run docs:check`, prettier.

## Docs checklist

- [x] STATUS, journal 025, ADR 0030 (+ index), `docs/research/three.md`, `docs/architecture/simulation.md`, draft plan 027 for the pushed-out scope.

## Log

- 2026-10-16 — Created as draft by the environment session (pushed out of plan 019).
- 2026-10-16 — Refined draft -> ready at the human's request (session: environment-2 session). Items ordered; the "Needs an ADR and an API bump" of item 1 became: ADR 0030, no API bump (the placement fields are unchanged, only their meaning is now body-fixed). Criteria made measurable, none weakened.
- 2026-10-16 — Status in-progress (owner: environment-2 session). Concurrent session: plan 022 (VAB) works in `apps/web/**` and `packages/renderer/src/vab/**`; this plan touched only environment modules, the sim placement and no `apps/web` file.
- 2026-10-16 — Deviation: terrain heights and LOD (draft item 2), weather and clouds (item 4), animated site details and glTF swap (item 5) and device measurements (item 6, partly) are not done; they are draft plan 027. Added beyond the draft: floodlights at night.
- 2026-10-16 — Done. Evidence in journal 025: `bun test` 659 pass at the last full run; typecheck, build, docs:check green.
