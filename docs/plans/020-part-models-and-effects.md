---
id: 020
title: "Visual: part models, materials and effects"
status: done
owner: "parts session (Claude, 2026-10-16)"
depends: [019]
phase: 2
created: 2026-10-16
updated: 2026-10-16
---

# 020 — Visual: part models, materials and effects

## Goal

Vessels look like rockets: every stock part has a procedural mesh that reads as its function (capsule with a window and a heat shield, painted tanks with bands and seams, an engine with a bell, pump and plumbing, decoupler ring, reaction wheel, landing legs that unfold, ablative heat shield) with PBR materials and procedural textures, and the flight view shows engine plumes, liftoff smoke and dust, staging separation, re-entry glow and destruction effects driven by snapshot data. Everything is code (no external assets) behind a provider interface so assets can replace generators later. Bar: `product/visual-direction.md` and ADR 0025.

## Context

- Read: `docs/product/visual-direction.md`, ADR 0025 (visual bar), ADR 0027 (pipeline: one sun, tone mapping in the output pass, bloom threshold 3.0), ADR 0012 and 0014 (part shape), ADR 0023 (part temperature), ADR 0028 (this plan's decision), `mods/stock/src/parts.ts`, `packages/renderer/src/scene.ts`, journals 019 ("For plan 020"), 014, 012.
- Plan 025 (environment follow-ups) is not part of this plan.

## Scope

**In:** `PartDefinition.visual` (additive, API 0.1.6): a declarative visual descriptor (generator kind, palette, parameters, plume mount, deploy animation) that mods provide through the SDK; a renderer-side generator registry keyed by `visual.kind` (not by part id) and a `PartModelProvider` interface so asset-backed providers can replace generators (ADR 0028); procedural mesh generators (own revolve and extrude, merged with material groups) with detail (bands, seams, windows, bell, pump, struts); PBR materials with procedural textures (`DataTexture`); per-part placement and temperature glow; landing-leg deploy animation from module state; engine plume (throttle, ambient pressure, flameout), liftoff smoke and dust, separation puff, re-entry glow and plasma from temperature and airspeed, explosion or burn-up when a part disappears; effects respect presets.
**Out:** imported models/textures, audio, joint flex, radial boosters and fins as stock parts (the generators support fins; no stock part uses them), terrain interaction, 3D VAB (plan 022).

## Design notes

ADR 0028. Pure maths (tested in Bun): `packages/renderer/src/parts/*` (revolve, generators, bounds, budgets), `effects/plume.ts`, `effects/glow.ts`, `effects/reentry.ts`, `effects/particles.ts`, `effects/explosion.ts`, `effects/transitions.ts`. Three objects: `parts/factory.ts`, `parts/materials.ts`, effect meshes, wired in `scene.ts`.

## Steps

1. Refine (done: three.js docs checked in `research/three.md`, ADR 0028, measurable criteria).
2. Core/SDK/stock: `partVisualSchema`, `PartDefinition.visual`, API 0.1.6; stock parts get descriptors; `guides/writing-a-mod.md`, `plugin-system.md`.
3. Renderer: revolve and generators, material library and textures, `PartModelFactory` and providers, scene wiring (fallback to `shape` when a part has no `visual`).
4. Effects: plume, smoke/dust, separation puff, glow and plasma, explosion; presets; transitions detected from snapshots.
5. Screenshots, frame times, self-review, journal, docs, commits.

## Acceptance criteria

Numbers are chosen so a failure is a defect, not a taste call. Lengths in metres.

- [x] `bun test packages/renderer` passes, including `test/parts.test.ts`: for every stock part definition (built from the real stock descriptors), (a) the retracted model's bounding box height equals `shape.height` within 0.002 and its radial extent is within `shape.radius` x [0.9, 1.002] (nothing sticks out of the physics shape); (b) the model's `nodes` lie at the part's `attach` positions within 0.002; (c) triangle budget per part between 100 and 9 000 on `high` and at most 0.6 of the `high` count on `low`; a ten-part vessel stays below 60 000 triangles on `high`; (d) no NaN in positions or normals; (e) landing legs deployed: the four foot centres equal `landingLegColliders` of the module's default config within 0.002.
- [x] `bun test mods/stock` passes, including a test that each stock part has a `visual` whose kind is a known generator kind and whose leg parameters equal the `stock.landing-leg` module defaults.
- [x] Plume tests (`test/plume.test.ts`): zero throttle or flameout gives no plume; length and brightness are non-decreasing in throttle; the plume radius far from the nozzle is at least 2.5x the sea-level one in vacuum; width increases monotonically as ambient pressure falls from 101 kPa to 0; length in vacuum is between 0.45 and 0.8 of the sea-level length; shock diamonds only when the ambient pressure is within 0.3 to 1.2 of the exit pressure; non-finite inputs give a finite shape.
- [x] Glow tests (`test/glow.test.ts`): glow is exactly zero at or below 650 K and non-decreasing above; colour goes red (r > g > b) at 900 K to white-ish (min/max channel > 0.7) at 3 000 K; the brightest channel passes the bloom threshold (> 3.0) at 2 000 K and not at 1 000 K; plasma intensity is 0 for 300 m/s at sea level and for 7 800 m/s in vacuum, and above 0.5 for 7 000 m/s at 45 km (corrected during the plan, see Log); airspeed subtracts the body rotation (a vessel at rest on the equator has airspeed < 1 m/s).
- [x] Particle tests (`test/particles.test.ts`): the pool never exceeds the preset capacity (low < medium < high); same seed gives the same state after 200 steps; expired particles are freed; the ground-blast rate is positive at 1 m above the ground at full throttle and zero at 6 plume lengths; no dust is emitted in vacuum.
- [x] Transition and explosion tests (`test/transitions.test.ts`, `test/explosion.test.ts`): a part that vanishes while moving at 30 m/s relative to the ground yields one `impact` event at its last position; a part that vanishes at rest on the ground yields none; a hot (> 700 K) vanishing part yields `burn`; a vessel splitting in two yields exactly one `separated` event located between the pieces; fireball radius is non-decreasing over its life and the intensity is zero after the duration; shard positions follow a ballistic parabola within 1e-9.
- [x] Scene tests: a custom provider registered with the scene is used before the procedural one; a part without `visual` falls back to its `shape` mesh as before; disposing the scene frees every geometry and material it created.
- [x] Mutation checks: break the engine bounds rule, the plume vacuum-width rule and the ground-speed filter once each, show the test failing, restore (recorded in the journal).
- [x] `[manual]` screenshots in `docs/journal/assets/020-*.png`: two-stage vessel on the pad (close and medium), liftoff with plume and smoke, high-altitude/vacuum plume, staging separation, re-entry glow (synthetic snapshot with real parts and an invented speed, labelled as such), destruction/explosion, landing legs deployed. The journal says how each was made.
- [x] `[manual]` frame times at 1080p (device pixel ratio 1) for pad, liftoff and orbit scenes with vessel and effects, per preset, next to plan 019's numbers; `high` stays below 16.7 ms in the sync metric.
- [x] `[manual]` written self-review against `product/visual-direction.md` in the journal: what still looks like a debug view.
- [x] `bun test`, `bun run typecheck`, `bun run build`, `bun run docs:check`, prettier on touched files all pass.

## Docs checklist

- [x] `docs/STATUS.md`, journal `020-part-models-and-effects.md`, ADR 0028 and the decisions index, `docs/research/three.md`, `docs/guides/writing-a-mod.md` (how a mod gives parts a look), `docs/architecture/plugin-system.md` (API 0.1.6), `docs/architecture/overview.md` if the renderer description changes, glossary entries (visual descriptor, part model provider).
- [x] Draft plans for anything pushed out (radial parts and fins, asset providers).

## Log

- 2026-10-16 — Created as draft at the human's request (visual overhaul, code-only).
- 2026-10-16 — Refined draft → ready at the human's request (session: parts session): three.js docs checked, ADR 0028 (visual descriptor in the SDK, provider interface), measurable acceptance criteria.
- 2026-10-16 — In progress (parts session). Core/SDK/stock: `PartDefinition.visual`, API 0.1.6, stock descriptors. Renderer: generators, materials, provider chain, plume, smoke and dust, separation gas, explosions, glow and plasma, presets. Host wiring: two lines in `apps/web/src/lib/flight-loop.ts`.
- 2026-10-16 — Criterion corrected, not weakened: plasma "above 0.5 for 2 500 m/s at 40 km" was written before the numbers were computed; with the sim's own heating law that point is 1.1e5 W/m^2 (intensity about 0). The test uses 7 000 m/s at 45 km (1.5e6 W/m^2, intensity 0.84). Added beyond the plan: the camera holds a destroyed vessel's place for 5 s (otherwise the explosion was off screen), `@orbital/mod-stock` as a test-only devDependency of the renderer (boundaries.md updated), draft plan 026 for what was pushed out.
- 2026-10-16 — Done. All criteria verified (journal 020): renderer 118 tests, full suite 573, web 146, typecheck, build, docs:check, prettier; mutation checks and screenshots recorded; the explosion, vacuum and re-entry shots are synthetic snapshots built from the real parts (labelled in the journal).
