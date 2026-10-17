---
id: 059
title: "Hills terrain on a body other than the first"
status: done
owner: "second-planet session (Claude, 2026-10-17)"
depends: [052]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 059 — Hills terrain on a body other than the first

## Goal

A mod's second planet with `terrain: { kind: 'hills' }` (with or without an `atmosphere`) is drawn with the hills the sim stands vessels on, not as a plain sphere: from orbit as a globe with continents, from its surface as the ground a lander rests on.

## Context

- Found, not done, in plan 052 (ADR 0067 point 4): the planet pass (`PlanetPass`, ADR 0027) is built for the first body only; a later body with `hills` is a plain lit sphere in the renderer while `createBodyTerrainField` gives the sim the hills, so a lander would stand on ground the picture does not show.
- Read: ADRs 0027, 0036, 0043, 0044, 0054, 0064, 0067, 0068; journals 031, 044, 049, 052; `packages/renderer/src/moon.ts`, `shaders/moon.glsl.ts`, `shaders/terrain.glsl.ts`, `scene.ts` (constructor, `updateMoons`), `packages/core/src/terrain.ts`, `body-terrain.ts`.
- Decision (Step 0, 2026-10-17): [ADR 0090](../decisions/0090-hills-on-a-second-body-in-the-ground-pass.md) — the moon pass gets a second ground kind (the planet pass is not duplicated); the cube and patches are baked for the body the camera is near; atmosphere is optional in the definition and not drawn (draft [071](071-atmosphere-and-sea-on-a-second-planet.md)).

## Scope

**In:**
1. `MoonPass` takes a ground kind; `hills` bakes the planet pass's own `heightAt` text (moved to `terrainHeightGLSL`, the planet's bake program unchanged), colours the ground from the biome map, switches shadows and stones off.
2. `SceneModel` gives a body after the first with `terrain.kind === 'hills'` that pass; ground height, camera clamp, effects and the vessel light follow it as for the moon.
3. The cube map is baked when the camera is within a kind-dependent distance and released beyond twice that (hills only).
4. Tests, measurements and screenshots of a test mod's second hills planet with and without an atmosphere.

**Out (draft [071](071-atmosphere-and-sea-on-a-second-planet.md)):** an atmosphere/sky on a later body, water shading, `seed`/`site` on the hills kind, terrain-cast shadows on hills bodies. Clouds, launch-site buildings on a later body.

## Design notes

- Core and sim need no change: `createBodyTerrainField` already gives a `hills` body the home planet's field at its own radius and the sim stands vessels on it (`createSim({ terrain: createBodyTerrainField })`). API version stays 0.1.23.
- The GPU height is the planet pass's `heightAt` GLSL on the canonical 1024 biome map with the site direction `(1, 0, 0)`; the ground pass wraps it as `moonHeight(n, radius)` so the cube and patch bakes, the patch meshes and the camera hooks of the moon pass are reused as they are.
- Parity is read back from the baked patch (`Renderer.debug.readMoonPatch`, as ADR 0054) and compared with the float64 `createBodyTerrainField` height at the same texels.

## Steps

1. Refine (this file, ADR 0090, draft 071). Set `in-progress`.
2. `terrain.glsl.ts`: split `heightAt` and its helpers out of `terrainBakeCommon` into `terrainHeightGLSL`; test that the planet's bake text is unchanged (hash recorded from HEAD).
3. `moon.glsl.ts`: bake fragments built by a function of the height GLSL (`uRadius` declared before it); the craters ones are the same program as before; `hillsHeightGLSL`; hills fragment pieces (colour from the biome map, bump, slope and height varyings).
4. `moon.ts`: ground kind option, hills `groundHeight`, biome-map texture and uniforms, per-kind cube size, skirt drop, bake distance and cube release; shadows and stones off for hills; program keys by kind.
5. `scene.ts`: create the pass for `hills` bodies after the first; update the test of ADR 0067.
6. Tests (Bun): scene with two hills bodies (with and without atmosphere) gets two passes; ground height = the sim's field; the GLSL carries the constants; the planet bake text is pinned; release/bake distances; the sim: a lander rests on a hills body with and without an atmosphere (`terrain-kind.test.ts`).
7. Browser (built-in pane, clean copy of HEAD plus this plan's files, a scratch stock mod with the moon as hills): GPU readback parity, lander resting, screenshots, frame times against HEAD of the same hour.
8. Docs: ADR 0090 consequences with the numbers, `writing-a-mod.md`, `docs/architecture` renderer description if it names the moon pass, STATUS, journal 059.

## Acceptance criteria

- [x] `bun test packages/renderer/test/hills-ground.test.ts` (11 tests): in a scene with the home planet and two further hills bodies, one with and one without an `atmosphere`, both have a ground pass (`moon:<id>`) and a body with no `terrain` stays a plain sphere; each pass's `groundHeight` equals `createBodyTerrainField(body).heightAt` (the sim's field) at 200 directions exactly, raised (above zero) on more than a third of them, for two radii that are not the home radius (420 km, 250 km).
- [x] The same file: the GLSL the hills bake runs contains every constant of `TERRAIN_SHAPE`, `MAP_WARP`, `LAKE_SHAPE` and the site radii of core (the twin test of the moon's), the biome elevation is read by hand-made bilinear (see Log), and the planet pass's bake fragments are byte-identical to HEAD's (pinned sha256; the test fails on a one-space change, shown in the journal).
- [x] `bun test packages/sim/test/terrain-kind.test.ts`: on a mod's hills body with and without an atmosphere a lander placed 42 km from the site (130 m high, 0.6 percent slope) settles with `terrainHeight` within 0.05 m of the field and an altitude between that height and +15 m; on a 30 degree hillside (451 m high) it stays within 0.5 m, above the ground and below +15 m.
- [x] GPU against float64 (built-in browser, `Renderer.debug.readMoonPatch`), a hills body without and with an atmosphere, at three places each (flat zone, a hillside, the massif ring), 600 texels per patch: fine patch worst error 0.022 m, mid patch worst 0.134 m (bounds 0.25 m and 1.0 m, ADR 0044's are 0.2 and 0.81), numbers in the journal.
- [x] A lander on the second hills body (browser, real sim with a test mod: `load-vessel` surface placement on a 528 m hill, 9 s of sim): the vessel is `on-rails` at rest, its `terrainHeight` 528.22 m is the field's, its altitude is 7.5 m above it (the root part is 7 m up the stack), and `docs/journal/assets/059-second-planet-lander-on-hills.jpg` shows it standing on the ground with its shadow on it.
- [x] Screenshots (JPG, 0.85) `docs/journal/assets/059-*.jpg`: the body from orbit (continents), its surface with a lander, a hillside, a massif, and the atmosphere-bearing variant from orbit.
- [x] Home planet and moon unchanged (changed from the draft's pixel diff, see Log): the planet pass's bake text is byte-identical; the moon pass's craters code is only gated (`git diff`); two interleaved rounds of sync frame times, HEAD against this change, pad `high` 19.4 / 18.7 / 18.5 (HEAD / this twice), moon plain 6.2 / 5.7 / 6.9, crater site 11.2 / 11.2 / 11.2 ms, `medium` and `low` the same within 0.6 ms; screenshots side by side.
- [x] Frame budget (M5, 1920 x 1080, sync ms, warm machine): on the second body's surface at the flat zone, a hillside and the massif ring, in orbit with the body filling the view, `high` 5.2 to 7.5 ms and `medium` 5.9 to 7.4 ms, against 14.4 and 13.3 (ADR 0053); `low` 4.1 to 5.3 ms. The bake of the cube costs one 13.5 ms frame then 8 ms ones.
- [x] `bun test packages/renderer` (558), `bun run test` (1 269), web vitest (819), `bun run typecheck`, `bun run build`, `bun run docs:check`, prettier on the files of this plan: pass.

## Docs checklist

- [x] STATUS, journal 059, ADR 0090, `docs/guides/writing-a-mod.md` (the `hills` kind on a later body), plans README row untouched (board in STATUS), roadmap checked (no entry for 059).

## Log

- 2026-10-17 — Created as draft by plan 052 (found, not done).
- 2026-10-17 — Refined draft → ready at the human's request (session: second-planet session). ADR 0090; follow-ups drafted as 071.
- 2026-10-17 — Step 0 detail: the draft's `site` parameter and seed are not in this plan (draft 071). Criteria edited while refining the numbers: the lander test uses two places (a gentle one at 0.05 m and a 30 degree one, where a vessel slides a few decimetres while settling), the fine/mid bounds are measured not assumed.
- 2026-10-17 — Found by the readback, fixed: the hardware filter of the biome map weighs texels with 8 bits, and where the land mask rises over a few map texels (coasts on a small body) a ridge was off by up to 13 m in the mid patch (mean 1.2 m on a 250 km body). The ground pass reads the elevation by hand-made bilinear in float (twin of `sampleMap`); worst mid error went from 13.1 m to 0.056 m. The planet pass keeps its filtered fetch (unchanged by this plan; its measured bound is ADR 0044's 0.81 m on the 600 km body).
- 2026-10-17 — The draft's "pixel diff under 0.5" for the pad and the moon was not met as written: two boots of the same build differ by 5 to 10 (pad) and 0.1 to 0.3 (moon) of 255 within a page and the camera heading differed between boots for a reason I could not isolate, so a cross-build pixel diff measures the harness, not the change. Replaced by the byte-identical bake text, the gated diff and interleaved frame times; recorded in journal 059.
- 2026-10-17 — Done.
