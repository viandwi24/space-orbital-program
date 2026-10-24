# 403 — Planets from orbit

**Plan:** [plans/403-planets-from-orbit.md](../plans/403-planets-from-orbit.md) · **Session:** Worker B, 2026-10-24 · **ADRs:** 0344 (night lights), 0361 (bakes, manager, cache, far cloud shell) · **Note:** [refs/graphics-v2/01-ksp-and-mods.md](../../refs/graphics-v2/01-ksp-and-mods.md) §7

## What was done

| Where | What |
|---|---|
| `renderer/night-lights.ts` and the passes (stage 1) | city lights in the bake's normal alpha, both renderers, `nightLights` preset field |
| `renderer/body-bake.ts`, `body-bake.worker.ts`, `body-baker.ts` | a cratered body's colour map baked from its own height field (relief and height shading of the palette), in a worker or in slices |
| `renderer/body-bake-model.ts`, `body-bakes.ts` | `BODY_BAKE` (Low none, Medium 1024 x 512 / 24 MiB, High 2048 x 1024 / 96 MiB); `BodyBakeManager`: nearest first, one job, hysteresis 60 / 20 px, only unwanted bakes evicted, never a rebake of a resident one |
| `renderer/body-bake-cache.ts` | finished maps gzipped in IndexedDB under a key of everything they depend on |
| `renderer/cloud-far.ts`, `shaders/planet.glsl.ts`, `tsl/planet-pass.ts` | the far cloud shell: coverage from the baked weather map beyond the cumulus march (45 to 120 km), cross-faded with it |
| `renderer/scaled-space-model.ts` | Home's faces 2048 on High (268 MB for both maps with gutters and mips) |
| `renderer/scene.ts`, `body-dress.ts`, `renderer-facade.ts` | bake sources for cratered bodies, `bakedBodies()` |
| tests | `body-bake`, `body-bake-stream` (order, budget, eviction, no rebake), `body-bakes`, `cloud-far`, `scaled-space-model` |

## Findings

- Screens (WebGPU, High): `403-webgpu-cinder.jpg` (Cinder from 300 km, craters and rims from its own field), `403-webgpu-forge.jpg`, `403-webgpu-kiln.jpg`. `403low-webgpu-cinder.jpg` is Low; at this framing the two look alike because the moon pass's own ground shows through on a body this near, and the bake's gain is at the 60 to 300 px sizes.
- KTX2 was not done: only the Basis *transcoder* is shipped. The cache keeps gzipped RGBA8 (ADR 0361).
- The manager first evicted farther bakes that were still wanted and thrashed in the unit test; it now drops only unwanted ones and uses a hysteresis band.
- Frame time (M5, this machine, load average 8 to 9 from other jobs, so noisy; `measure-120hz.ts`, WebGPU High, governor off, a development build): orbit p95 10.4 ms with the work, 15.0 and 10.4 ms for `origin/main`; 12 km p95 50 and 58 ms with it, 42 and 50 ms for main, 66 and 50 ms with the 2048 faces turned back to 1536: the runs differ from one another by more than the branches do, so no regression is *shown*, and none is *excluded* below about 10 ms at 12 km. GPU time per frame read 2 to 4 ms in every build. Plan 392's tooling, one `/tmp/orbital-measuring` flag held while it ran.

## Not done

- A locked 60 on Low and Medium measured with throttling or on the Windows integrated GPUs, and the memory budget measured in the browser (the test checks the manager's arithmetic): [manual] for the real machine.
- No warm-list test for the bake variants: the bake is a texture upload and a worker, it builds no pipeline.
- The owner's look at Home by day and night, the Moon and two other bodies against reference image 07 ([manual]).
