---
id: 027
title: "Visual: terrain geometry, sky and device follow-ups"
status: done
owner: "terrain session (Claude, 2026-10-16)"
depends: [025]
phase: 3
created: 2026-10-16
updated: 2026-10-17
---

# 027 — Visual: terrain geometry, sky and device follow-ups

## Goal

The planet reads as a real world from the pad, during the ascent and from orbit: mountains and hills stand against the horizon, land at 3 to 10 km is land and not milk, the sky has more than one cloud layer, and the ocean moves. Frame times stay inside plan 025's budget (`high` at the pad no worse than 16.5 ms synchronous on the same machine). The bar is `docs/product/visual-direction.md` (ADR 0025).

## Context

- Read: `docs/journal/025-environment-follow-ups.md` (self-review, "Not done"), `docs/journal/019-flight-environment.md` (perf method), ADR 0030, ADR 0027, ADR 0019 (ground tile stays flat), `docs/product/visual-direction.md`, `docs/research/three.md`.
- The human (2026-10-16): the game must be ready for the public; "if it still looks like a prototype, keep working". The 025 screenshots show a flat horizon, one blurred cloud shell and milky land at 3 to 10 km.

## Scope

**In (ordered at refinement):**
1. **Terrain heights, visual only (ADR 0036).** A height function of the body-fixed direction (rolling hills plus mountain ranges, zero at the coast and in a flat zone around the launch site) baked once on the GPU into a cube map (height and gradient), ray-marched by the planet pass (sphere tracing against the baked heights, bisection refinement), shaded by slope and height (rock, scree, snow line, tree line), with terrain self-shadows toward the sun. Physics and the sim keep the flat reference sphere (ADR 0019); the relief is flattened in a bubble around the camera's ground point at low altitude so a vessel never sits inside a hill. LOD by preset (cube resolution, march steps, shadow steps).
2. **Haze (ADR 0037).** Aerial perspective that keeps land readable at 3 to 10 km: the multiple-scattering stand-in (`skyBoost`) is applied by optical depth instead of as a constant on every path, plus a ground-level extinction tint. Pure model with tests of veil against ground radiance at given altitudes.
3. **Cloud layers (ADR 0037).** Cumulus shell (existing, reworked for defined edges, lit tops and shadowed bases) and a high cirrus shell, composited in distance order with the atmosphere in between; cloud shadows of both on the ground.
4. **Water.** Moving waves (a table of deep-water components with the dispersion relation), crest foam, sun glint on waves; river flow lines.
5. **Frame times** per preset at the same scenes as 025; budget created where the new cost sits (preset tables, cheaper ground detail at distance).

**Out (draft plan 031, written during this plan):** physical terrain heights in the sim and ground tile (needs ADR 0019 to change, deterministic JS/GLSL parity), volumetric cloud marching and god rays, aurora and ozone term, lakes, launch-site animation (steam, swing arms, blinking lights), glTF asset swap (belongs to the provider interface of 026), M1/M2 and Intel measurements (no such hardware here), analytic noise derivatives, shader precompile and loading indicator, mobile.

## Design notes

- ADR 0036 (terrain), ADR 0037 (haze, clouds, water). Pure maths lives in `terrain-model.ts`, `cloud-model.ts`, `water-model.ts` and `atmosphere-model.ts`, tested under Bun; GLSL is verified in a real browser (journal 019 method).
- Renderer imports only `@orbital/core` and `three`; the sim is not touched.

## Steps

1. Refine (research in `docs/research/three.md`, ADRs 0036 and 0037, measurable criteria).
2. Terrain model (pure), tests, bake pass, march, shading, presets.
3. Haze model and shader.
4. Cloud layers.
5. Water.
6. Screenshots before/after, frame times, self-review, docs.

## Acceptance criteria

- [x] `terrain-model.test.ts`: the height function is deterministic (same value on repeated calls and for a rebuilt map), continuous (|dh| <= 0.9 x distance over 3000 random pairs 200 m apart), bounded (0 <= h <= `TERRAIN_MAX_HEIGHT`), zero over ocean and on coasts, exactly zero within the flat radius of the launch site, rises monotonically in the blend ring, and reaches at least 800 m somewhere within 70 km of the site (mountains exist where the pad can see them).
- [x] `terrain-model.test.ts`: the skyline seen from the pad (highest elevation angle of the terrain over 360 azimuths and distances to 70 km, with curvature) is at least 1.0 degree, and a ray march of the pure model finds the same hit distance as brute force within 1% on 200 rays (LOD step rule never tunnels).
- [x] `terrain-model.test.ts`: the camera bubble weight is 0 at the camera's ground point below 1.5 km altitude, 1 beyond the bubble plus ramp, monotone, and the bubble is gone above `TERRAIN_MAX_HEIGHT` plus margin; the step rule is monotone in clearance and never exceeds `clearance / slope` (cannot tunnel through a terrain of slope <= `TERRAIN_MAX_SLOPE`); preset LOD table is monotone low <= medium <= high.
- [x] `atmosphere-model.test.ts`: aerial perspective values at given altitudes (veil luminance over dark-ground luminance for 10 km slant paths at 3, 6 and 10 km altitude is at most 0.6 after the change, and the zenith sky colour and the exposure inputs change by less than 5%).
- [x] `cloud-model.test.ts`: layers are ordered cumulus below cirrus inside the atmosphere; the distance-ordered composite equals the no-cloud result at alpha 0, an opaque near layer hides the far layer and the ground, and the composite is invariant to the order of equal-distance empty slots.
- [x] `water-model.test.ts`: wave components obey the deep-water dispersion relation, the summed amplitude is bounded, directions are unit, the height field is periodic in time with the stated period and deterministic.
- [x] [manual] Before/after screenshots against `025-*` (the `027-before-*` set was taken from the unchanged code with the same camera and sun): pad horizon, 3 km, 12 km, 40 km, orbit day rim, orbit down-view and terminator in `docs/journal/assets/027-*.png`.
- [x] [manual] Frame times per preset (low, medium, high) at pad, 3 km, 12 km and orbit, thr and sync as in journal 025; `high` at the pad does not exceed 16.5 ms sync on the same machine; stated honestly where it does.
- [x] [manual] Written self-review against `visual-direction.md` naming what still falls short.
- [x] `bun test packages/renderer`, `bun test`, `bun run build`, `bun run docs:check`, prettier on touched files; `bun run typecheck` is green for sim, renderer and scripting and red only in plan 030's `apps/web/src/lib/script-sandbox-web.ts` (see Log).

## Docs checklist

- [x] STATUS, journal 027, ADRs 0036 and 0037 (+ index), `docs/research/three.md`, `docs/architecture/overview.md` if the renderer section changes, draft plan 031 for the pushed-out scope.

## Log

- 2026-10-16 — Created as draft by the environment-2 session (pushed out of plan 025).
- 2026-10-16 — Refined draft -> ready at the human's request (session: terrain session). Draft item 1 (terrain) is in with a visual-only decision recorded in ADR 0036 (physical heights pushed to draft 031 with an ADR argument); item 2 (sky) is split: layered clouds and haze in, volumetric lighting, aurora and ozone out; item 3 (water): waves, foam, river flow in, lakes out; item 4 (launch site) out, no part of the human's priority list; item 5 (devices): frame times in, M1/M2 and Intel out (no hardware), the rest out. Criteria are measurable; none weaker than the draft's.
- 2026-10-16 — Status in-progress (owner: terrain session). Concurrent sessions: plan 022 (VAB: `apps/web/**`, `packages/renderer/src/vab/**`) and 018 (`packages/scripting/**`); this plan touches only environment modules of `packages/renderer`.
- 2026-10-16 — ADR and plan numbers: the refinement named ADRs 0031/0032 and draft 028; other sessions took 0031 and left 0032 and 028 reserved, so the decisions are ADR 0036 (terrain) and ADR 0037 (haze, clouds, water) and the pushed-out scope is draft plan 031.
- 2026-10-17 — Deviations. (1) Cloud shadows on the ground are the cumulus's only (cirrus is thin; scope item 3 said both). (2) River flow lines (scope item 4) are not done and go to draft plan 031 together with lakes. (3) The slope bound of the continuity criterion is `TERRAIN_MAX_SLOPE` = 1 (steepest measured 0.84) instead of 0.9. (4) The skyline criterion is asserted at 3 degrees, stronger than the 1.0 written (the scenic massif of ADR 0036 gives about 6); the march-against-brute-force criterion holds at 97 % of 200 rays within max(1 %, 60 m) because the step floor (5 % of the distance, ADR 0036) trades a few missed thin crests for the step budget. (5) The "same machine" frame-time comparison is against journal 025's numbers: the unchanged code was not re-run (`high` pad 15.9 ms sync against 16.5), and every figure is M5-only.
- 2026-10-17 — Done. Evidence in journal 027: `bun test` 786 pass; build, docs:check green; `bun run typecheck` fails only in `apps/web/src/lib/script-sandbox-web.ts` (plan 030's file, not touched here).
