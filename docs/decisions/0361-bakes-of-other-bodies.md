# 0361 — Bakes of the other bodies, the bake and evict manager, the cache, the far cloud shell

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/403-planets-from-orbit.md
**Builds on:** ADR 0344 (night lights, stage 1), ADR 0306 (the scaled-space bake), ADR 0318 (body appearance), ADR 0342 (the weather map)

## Context

ADR 0344 did the night lights and left the rest of plan 403 open: bakes for the Moon and the other bodies from their own surface functions, the manager that bakes on approach and evicts when far, 2048 faces on High, a cache of finished bakes, and the cloud cube at orbit distance.

## Decision

1. **A cratered body's colour map is baked from its ground.** `bakeRows` (renderer, `body-bake.ts`) takes the palette's pattern (`patternColour`) and shades each texel by what the body's height field does under it: the texel's height against the mean of its four neighbours (a rim stands above them and is lit, a floor sits below and is darkened) and the height against the field's maximum. The craters, rims and plains of Cinder seen from 300 km are Cinder's. It is pure (data in, bytes out), so a worker, the page and a test produce the same bytes. Hills bodies need no bake (ADR 0363).
2. **Sizes and budgets by preset** (`BODY_BAKE`): Low keeps the 512 x 256 palette map and bakes nothing; Medium bakes 1024 x 512 within 24 MiB; High 2048 x 1024 within 96 MiB (a map and its mips is 4/3 of 8 MiB at 2048 x 1024). The integrated GPUs share system memory, so Low and Medium are small. **Home's faces go to 2048 on High** (from 1536): 268 MB for both maps on the WebGPU atlas, with the gutters and mips (`scaledSpaceBytes`).
3. **The manager** (`BodyBakeManager`, pure): a body is *wanted* from 60 px of radius and stays wanted until it is under 20 px (the gap is the hysteresis that stops a body at the edge being dropped and baked again); the nearest wanted body is baked first and one job runs at a time; a ready bake that is still wanted is never baked again; to fit the budget only *unwanted* ready bakes are dropped, farthest first, so a nearer body never evicts one the camera is also near. A job that does not fit is not started. A preset change drops everything resident and rebuilds the wanted ones at the new size.
4. **The bake runs in a worker** (`body-bake.worker.ts`, 8 rows a slice, listening between slices so a body that is far again is cancelled), or in slices on the page's thread where there is no worker (`inlineBaker`). The finished map becomes a mipmapped `DataTexture` the body's dress and its moon pass take (`BodyDress.setBaked`); an evicted one is disposed and the palette map returns.
5. **The cache** (`body-bake-cache.ts`): a finished map is stored gzipped in IndexedDB under a key naming everything it is made from (the body's id, radius, terrain and look, the size, `BAKE_VERSION`), and a revisit unpacks it instead of baking. **Not KTX2**: the Basis encoder is not shipped, only the transcoder (ADR 0160), and an encoder would be a new WASM payload for a map the worker bakes in the background, so the cache keeps raw RGBA8 gzipped (`CompressionStream`).
6. **The far cloud shell** (`cloud-far.ts`, in the GLSL and TSL planet passes): the cumulus march fades out between 45 and 120 km from the slab (`maskAll`), and over the same distances a thin shell takes over whose coverage is read from the baked cloud map (the one the shafts and the ground shadows read, so plan 397's weather shows from orbit), lit by the sun's height and the sky's ambient, at most 0.92 opaque. The two sum to a steady cover; there is no new texture.
7. **No new API**.

## Consequences

- The Moon and every cratered stock body seen from orbit have their own relief on High and Medium; Low is unchanged.
- Memory the bakes may hold is stated (24 MiB, 96 MiB) and tested (`body-bake-model.test.ts`); the manager never exceeds it.
- Plan 406's mod planets reuse the dress path for their images (ADR 0363).
