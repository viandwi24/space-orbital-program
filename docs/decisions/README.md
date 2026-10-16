# Architecture Decision Records

An ADR records one decision, its context, and its consequences. ADRs are **append-only**: to change a decision, write a new ADR that supersedes the old one and update the old one's status line only.

## When to write one

- Any choice that is expensive to reverse (stack, package boundaries, data formats, public API shape).
- Any time a plan deviates from the architecture docs.
- Any time two reasonable options exist and a future agent would otherwise re-ask the question.

## Process

1. Copy `0000-template.md` to `NNNN-short-slug.md` (next number).
2. Status `proposed` while discussing; `accepted` once the human or the plan owner accepts it; `superseded by NNNN` or `deprecated` later.
3. Link the ADR from the plan that triggered it and, if it changes the design, from the relevant `architecture/` doc.
4. Add a row to the index below.

## Index

| # | Title | Status | Date |
|---|---|---|---|
| 0001 | [TypeScript first, WASM per hotspot later](0001-typescript-first-wasm-later.md) | accepted | 2026-10-16 |
| 0002 | [Bun workspace monorepo with per-package boundaries](0002-bun-monorepo-workspaces.md) | accepted | 2026-10-16 |
| 0003 | [Simulation is headless and separate from rendering](0003-sim-render-separation.md) | accepted | 2026-10-16 |
| 0004 | [Physics behind an adapter; Rapier (compat build) first](0004-physics-behind-adapter-rapier.md) | accepted | 2026-10-16 |
| 0005 | [Stock content is a mod built on the public SDK](0005-stock-content-as-mod.md) | accepted | 2026-10-16 |
| 0006 | [SvelteKit static client, Svelte 5, no SSR for the game](0006-sveltekit-static-client.md) | accepted | 2026-10-16 |
| 0007 | [SI units, float64 state, floating origin, +Y up](0007-units-si-float64-floating-origin.md) | accepted | 2026-10-16 |
| 0008 | [Official scaffold commands only; verify tools against the internet](0008-official-scaffold-commands.md) | accepted | 2026-10-16 |
| 0009 | [Plan-driven development with executable acceptance criteria](0009-plan-driven-development.md) | accepted | 2026-10-16 |
| 0010 | [World components are keyed by typed tokens](0010-world-typed-component-tokens.md) | accepted | 2026-10-16 |
| 0011 | [Core depends on `@orbital/kepler` for types only](0011-core-reuses-kepler-types.md) | accepted | 2026-10-16 |
| 0012 | [The renderer gets part shapes from the host, not from definitions](0012-renderer-part-shapes-host-supplied.md) | accepted | 2026-10-16 |
| 0013 | [The define-API and plugin loader shape](0013-define-api-and-plugin-loader.md) | accepted | 2026-10-16 |
| 0014 | [Part shape, `state(config)` and test-support exports](0014-part-shape-and-module-state-from-config.md) | accepted | 2026-10-16 |
| 0015 | [Module capability API: `ModuleContext.vessel`, `store`, `controlSource`, `crossfeed`](0015-module-capability-api.md) | accepted | 2026-10-16 |
| 0016 | [Vessel design format and protocol additions](0016-vessel-design-format-and-protocol.md) | accepted | 2026-10-16 |
| 0017 | [Flight model: frames, ground, atmosphere, rotation, modes](0017-flight-model.md) | accepted | 2026-10-16 |
| 0018 | [Rigid grouping: one compound body per vessel](0018-rigid-grouping-compound-bodies.md) | accepted | 2026-10-16 |
| 0019 | [Ground tile, contact readback and impact damage](0019-ground-tile-and-impact-damage.md) | accepted | 2026-10-16 |
| 0020 | [Scripting runtime: QuickJS in WASM with a per-tick interrupt budget](0020-scripting-runtime-quickjs-wasm.md) | accepted | 2026-10-16 |
| 0021 | [Debris lifecycle: ballistic debris on rails, removed at re-entry or at rest](0021-debris-lifecycle-and-time-warp.md) | accepted | 2026-10-16 |
| 0022 | [The script runner lives in the sim Worker](0022-script-runner-in-the-sim-worker.md) | accepted | 2026-10-16 |
| 0023 | [Re-entry heating and part temperature](0023-reentry-heating-and-part-temperature.md) | accepted | 2026-10-16 |
| 0024 | [Surface-fixed rails for controlled vessels at rest on the ground](0024-surface-fixed-rails.md) | accepted | 2026-10-16 |
| 0025 | [Release-quality visual bar, procedural first](0025-release-quality-visual-bar.md) | accepted | 2026-10-16 |
| 0026 | [Design system and flight HUD architecture](0026-design-system-and-hud-architecture.md) | accepted | 2026-10-16 |
| 0027 | [Environment rendering pipeline: analytic planet and sky, one sun, post chain, presets](0027-environment-rendering-pipeline.md) | accepted | 2026-10-16 |
| 0028 | [Part visuals: a mod-supplied descriptor and a model provider interface](0028-part-visuals-and-model-providers.md) | accepted | 2026-10-16 |
| 0029 | [VAB editor state model and hangar view](0029-vab-editor-state-and-hangar-view.md) | accepted | 2026-10-16 |
| 0030 | [Launch-site coordinates are body-fixed; ground detail without terrain geometry](0030-launch-site-coordinates-and-ground-detail.md) | accepted | 2026-10-16 |
| 0031 | [The script runner moves to its own Worker; ship API gains engine and wheel constants](0031-script-runner-in-its-own-worker.md) | accepted | 2026-10-16 |
| 0033 | [Module descriptors for tools, and `Renderer.project`](0033-module-descriptors-and-renderer-project.md) | accepted | 2026-10-16 |
| 0034 | [Radial attachment, part yaw, symmetry and design format 2](0034-radial-attachment-symmetry-and-design-format-2.md) | accepted | 2026-10-16 |
| 0035 | [Lifting surfaces: `VesselApi.airVelocity` and the stock fin](0035-lifting-surfaces-air-velocity-capability.md) | accepted | 2026-10-16 |
| 0036 | [Terrain heights are visual: baked on the GPU, ray-marched by the planet pass](0036-visual-terrain-heights-baked-and-ray-marched.md) | accepted | 2026-10-16 |
| 0037 | [Haze by thicker air, two cloud layers in one march, moving waves](0037-haze-and-cloud-layers.md) | accepted | 2026-10-16 |
| 0038 | [The script Worker runs in a sandboxed iframe with a no-network CSP](0038-script-sandbox-in-an-opaque-origin-iframe.md) | accepted | 2026-10-16 |
| 0039 | [Time warp while a script runs: the host holds the script's controls](0039-time-warp-while-a-script-runs.md) | accepted | 2026-10-17 |
| 0040 | [Browser support policy and the cross-browser end-to-end suite](0040-browser-support-policy-and-e2e-matrix.md) | accepted | 2026-10-17 |
| 0041 | [Vessel library and sub-assemblies: IndexedDB records of format-2 designs](0041-vessel-library-and-sub-assemblies.md) | accepted | 2026-10-17 |
| 0042 | [Stability read-out: centre of mass against centre of pressure, from part data](0042-stability-read-out-centre-of-mass-and-pressure.md) | accepted | 2026-10-17 |
| 0043 | [Physical terrain: one height function in core, read by the sim and the renderer](0043-physical-terrain-one-height-function-in-core.md) | accepted | 2026-10-17 |
| 0044 | [The visual terrain follows the physical one: a precise bake and camera-centred patches](0044-terrain-patches-camera-centred-and-hi-lo-bake.md) | accepted | 2026-10-17 |
| 0045 | [Engine gimbal, control surfaces and the attitude mixer](0045-engine-gimbal-and-control-mixing.md) | accepted | 2026-10-17 |
| 0046 | [Aerodynamic damping of fins](0046-fin-damping.md) | accepted | 2026-10-17 |
| 0047 | [glTF asset provider, shard debris, lit smoke, plume ground light, plasma colour](0047-asset-provider-and-effect-techniques.md) | accepted | 2026-10-17 |
| 0048 | [v1 public release scope](0048-v1-public-release-scope.md) | accepted | 2026-10-17 |
| 0049 | [SAS lives in the sim; modules report their control authority](0049-sas-in-the-sim-with-module-authority.md) | accepted | 2026-10-17 |
| 0050 | [Save format: plain versioned JSON, bodies rebuilt on resume](0050-save-format-and-resume.md) | accepted | 2026-10-17 |
