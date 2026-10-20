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
| 0051 | [Body hierarchy, frames and SOI transitions](0051-body-hierarchy-frames-and-soi-transitions.md) | accepted | 2026-10-17 |
| 0052 | [The stock moon: data and Δv budget](0052-the-stock-moon.md) | accepted | 2026-10-17 |
| 0053 | [Frame budget: a quality governor, a march prepass, a thinner terrain veil](0053-frame-budget-governor-march-prepass-and-terrain-veil.md) | accepted | 2026-10-17 |
| 0054 | [The moon in the renderer: its own light pass, one height function](0054-the-moon-in-the-renderer.md) | accepted | 2026-10-17 |
| 0055 | [Cheaper preset switches: vegetation kept per preset, terrain baked over frames](0055-cheaper-preset-switches.md) | accepted | 2026-10-17 |
| 0056 | [Maneuver nodes: sim-owned, remaining-burn model, shared prediction](0056-maneuver-nodes.md) | accepted | 2026-10-17 |
| 0057 | [Mod package format, trust model and runtime loading](0057-mod-package-and-runtime-loading.md) | accepted | 2026-10-17 |
| 0058 | [Light and dust on an airless body](0058-light-and-dust-on-an-airless-body.md) | accepted | 2026-10-17 |
| 0059 | [The cumulus as a short ray-marched slab, inside the old budget](0059-cumulus-slab-march.md) | accepted | 2026-10-17 |
| 0060 | [Release: settings, onboarding, public pages and the descriptor hooks](0060-release-settings-onboarding-and-descriptor-hooks.md) | accepted | 2026-10-17 |
| 0061 | [Remappable keys: one binding table, settings format 2](0061-remappable-keys-binding-table-and-settings-format-2.md) | accepted | 2026-10-17 |
| 0062 | [Audio is synthesised in code with Web Audio nodes; no audio files](0062-procedural-audio-web-audio-no-assets.md) | accepted | 2026-10-17 |
| 0063 | [Small screens: tablets in landscape yes, phones no](0063-tablets-supported-phones-not.md) | accepted | 2026-10-17 |
| 0064 | [The planet pass at half resolution as governor rungs, with a depth-aware upsample](0064-half-resolution-planet-pass.md) | accepted | 2026-10-17 |
| 0065 | [Targets: sim-owned, one relative state, closest approach from conics, scripts read and set them](0065-targets-in-the-sim-and-script-access.md) | accepted | 2026-10-17 |
| 0066 | [The script editor stays a textarea; its keyboard behaviour is our own code](0066-script-editor-without-a-library.md) | accepted | 2026-10-17 |
| 0067 | [The ground of a body is data on the body: a terrain kind and a seed](0067-terrain-kind-per-body.md) | accepted | 2026-10-17 |
| 0068 | [Terrain-cast shadows and stones as instanced geometry on an airless body](0068-terrain-shadows-and-stones-on-the-moon.md) | accepted | 2026-10-17 |
| 0069 | [An ozone absorption layer in the atmosphere model, the sun-depth table and the shaders](0069-ozone-layer-in-the-atmosphere-model.md) | accepted | 2026-10-17 |
| 0070 | [Light shafts: a second march that reads a baked cloud-coverage map](0070-light-shafts-from-baked-cloud-coverage.md) | accepted | 2026-10-17 |
| 0072 | [Lakes in the height function, rivers that flow, shore waves that shoal](0072-lakes-in-the-height-function-flowing-rivers-and-shore-waves.md) | accepted | 2026-10-17 |
| 0073 | [A launch site that moves: arms by the vessel's height, steam as a function of time](0073-launch-site-animation-from-the-snapshot.md) | accepted | 2026-10-17 |
| 0074 | [A precompile with progress, ordered by need, and a loading badge](0074-precompile-with-progress-and-a-loading-badge.md) | accepted | 2026-10-17 |
| 0071 | [Design format 3: connector parts (struts, fuel lines), tilted parts, radial attachment to boxes](0071-format-3-connector-parts-tilt-and-box-radial.md) | accepted | 2026-10-17 |
| 0076 | [Mod packages carry glTF models; asset parts get plume and gimbal; fit checks warn](0076-mod-packages-carry-glb-models.md) | accepted | 2026-10-17 |
| 0075 | [Wing lift: finite-wing slope, stall and induced drag in `stock.wing`](0075-wing-lift-and-drag-polar.md) | accepted | 2026-10-17 |
| 0082 | [A part states its own catalogue placement: `catalog.category` and `catalog.order`](0082-part-catalogue-placement.md) | accepted | 2026-10-17 |
| 0083 | [The trip planner: a delta-v map from body data, laid over the stages](0083-the-trip-planner-delta-v-map.md) | accepted | 2026-10-17 |
| 0077 | [Wreckage and stages that came to rest are kept by the renderer, not the sim](0077-wreckage-and-stages-are-kept-by-the-renderer.md) | accepted | 2026-10-17 |
| 0078 | [The re-entry plasma shell follows the vessel's silhouette; the thresholds follow the home body's speeds](0078-plasma-shell-from-the-vessel-silhouette.md) | accepted | 2026-10-17 |
| 0079 | [Plasma blackout is a display of the heating flux; there is still no communications system](0079-plasma-blackout-is-a-display-of-the-heating-flux.md) | accepted | 2026-10-17 |
| 0080 | [The persistent exhaust trail is a ribbon of sampled points](0080-exhaust-trail-as-a-ribbon.md) | accepted | 2026-10-17 |
| 0081 | [Engines with several nozzles: `plume.nozzles`, a cluster generator, a stock cluster engine](0081-multi-nozzle-engines-in-the-part-descriptor.md) | accepted | 2026-10-17 |
| 0084 | [Target markers and rendezvous aids: page-side, genre conventions, no new command](0084-target-markers-and-rendezvous-aids.md) | accepted | 2026-10-17 |
| 0085 | [The syntax check before Run compiles in a second sandbox of the same kind](0085-syntax-check-in-a-second-sandbox.md) | accepted | 2026-10-17 |
| 0086 | [The baked cloud map serves the ground's cloud shadows as well as the light shafts](0086-baked-cloud-map-shared-by-shafts-and-ground-shadows.md) | accepted | 2026-10-17 |
| 0087 | [The half-resolution rung redraws its edge pixels at full resolution](0087-edge-pass-at-the-half-resolution-rung.md) | accepted | 2026-10-17 |
| 0088 | [Smoke puffs read their noise from a texture](0088-smoke-noise-in-a-texture.md) | accepted | 2026-10-17 |
| 0089 | [Terrain casts light shafts: per-sample reads of the baked heights along the sun ray](0089-terrain-cast-light-shafts.md) | accepted | 2026-10-17 |
| 0090 | [Hills on a body other than the first are drawn by the ground pass (the moon pass with a second ground kind)](0090-hills-on-a-second-body-in-the-ground-pass.md) | accepted | 2026-10-17 |
| 0091 | [Phones stay unsupported in v1.x; the tablet layout is fixed and the notice says what to do](0091-phones-stay-unsupported-tablet-layout-fixed.md) | accepted | 2026-10-17 |
| 0092 | [Stones are colliders: one lattice in core, spheres in a second kinematic body](0092-stones-are-colliders-from-one-core-lattice.md) | accepted | 2026-10-17 |
| 0093 | [Aurora curtains: a few steps through an emission shell, a compile-time variant of the planet pass](0093-aurora-curtains-as-a-compile-time-march-variant.md) | accepted | 2026-10-17 |
| 0094 | [Worlds are saves; modes are presets over per-world rules; offline-first and generic](0094-worlds-are-saves-modes-are-presets-over-rules.md) | accepted | 2026-10-17 |
| 0095 | [Gravity model per world: patched conics now, n-body "Coming soon", one trajectory provider](0095-gravity-model-per-world-and-a-trajectory-provider.md) | accepted | 2026-10-17 |
| 0096 | [A world tick, background operations, and a living world of AI agencies](0096-world-tick-background-operations-and-a-living-world.md) | accepted | 2026-10-17 |
| 0097 | [Sites: the Space Center is the first site, built in 3D on a free grid; site choice, bases and range safety](0097-sites-space-center-in-3d-free-grid-bases-and-range-safety.md) | accepted | 2026-10-17 |
| 0098 | [Progression: a full resource economy, capacity-only gates, contracts and missions on one evaluator, strategies, milestones and achievements](0098-progression-economy-career-and-milestones.md) | accepted | 2026-10-17 |
| 0099 | [Science: an experiment matrix, data and samples, body dossiers, a tech tree; classic points by default, discovery optional](0099-science-matrix-data-samples-dossiers-and-tech-tree.md) | accepted | 2026-10-17 |
| 0100 | [Crew: a full simulation, every aspect a world rule, Sandbox as free as possible](0100-crew-a-full-simulation-every-aspect-a-world-rule.md) | accepted | 2026-10-17 |
| 0101 | [Communications: one physical model in six tiers, signal delay off by default](0101-communications-one-model-six-tiers-delay-off-by-default.md) | accepted | 2026-10-17 |
| 0102 | [Vessel control and HUD: part actions and group control, dock panels by `definePanel`, one Mission Center](0102-vessel-panel-part-actions-dock-panels-and-the-mission-center.md) | accepted | 2026-10-17 |
| 0103 | [Time and the sky: a world epoch and calendar, the Sun as root with tilt and seasons, a real solar system pack at 1:1 and rescaled](0103-time-calendar-sun-and-the-real-solar-system.md) | accepted | 2026-10-17 |
| 0104 | [Every new system ships its `define*` point and stock uses it; typed data patches with `definePatch`](0104-every-system-ships-a-define-point-and-typed-patches.md) | accepted | 2026-10-17 |
| 0105 | [Product name: Space Orbital Program](0105-product-name-space-orbital-program.md) | accepted | 2026-10-17 |
| 0106 | [Licence: Apache-2.0](0106-licence-apache-2-0.md) | accepted | 2026-10-17 |
| 0107 | [The interface adopts the refs visual language in full, screen by screen](0107-ui-adopts-the-refs-visual-language-in-stages.md) | accepted | 2026-10-17 |
| 0108 | [After v1: announce the big roadmap, with guardrails; no Universe mode](0108-release-scope-announce-the-big-roadmap-no-universe-mode.md) | accepted | 2026-10-17 |
| 0109 | [Control needs a command source (KSP-like), the Career crew preset, and 10 px text](0109-control-needs-a-command-source-like-ksp-career-crew-preset-and-10px-text.md) | accepted | 2026-10-17 |
| 0110 | [Save format 5: the world info travels beside the ECS world; world records own saves](0110-save-format-5-world-info-and-world-records.md) | accepted | 2026-10-17 |
| 0111 | [World rules: typed definitions, values in the world info, `set-rule` and the changelog](0111-world-rules-values-in-world-info-set-rule-and-changelog.md) | accepted | 2026-10-17 |
| 0112 | [Roadmap state lives in docs, one file per agent](0112-roadmap-state-per-agent-in-docs.md) | accepted | 2026-10-17 |
| 0113 | [Economy core: the ledger in the save, part costs, scheduled charges and recovery](0113-economy-core-ledger-costs-charges-recovery.md) | accepted | 2026-10-17 |
| 0114 | [The world tick reads the epoch in SI days and takes its day from the calendar](0114-world-tick-reads-the-epoch-in-si-days-and-the-calendar-day.md) | accepted | 2026-10-17 |
| 0115 | [Buildings: a 10 m grid centred on the site, placement rules, and the Legacy layout](0115-building-grid-placement-rules-and-the-legacy-layout.md) | accepted | 2026-10-17 |
| 0116 | [The terrain bake's gradient is analytic, in forward mode](0116-analytic-terrain-gradient-in-forward-mode.md) | accepted | 2026-10-17 |
| 0117 | [The Space Center view: the renderer's site mode, picking on the site plane, and where buildings persist](0117-space-center-view-site-mode-picking-and-where-buildings-persist.md) | accepted | 2026-10-17 |
| 0118 | [The Mission Center: the map's system scope, its own sim from the world's save, and what Fly can fly](0118-mission-center-system-scope-own-sim-and-fly.md) | superseded by 0201 | 2026-10-18 |
| 0119 | [The Sun at the root: the home body is named, the tilt is the home orbit's inclination, and saves carry their home](0119-sun-at-the-root-home-body-tilt-as-orbit-inclination.md) | accepted | 2026-10-18 |
| 0120 | [EVA: the suit is a vessel, crew commands for stepping out, walking and the flag, the jetpack as an engine](0120-eva-the-suit-is-a-vessel-commands-walking-jetpack-flag.md) | accepted | 2026-10-18 |
| 0121 | [A second hills planet: one terrain spec for sim and GPU, air through the moon pass, sea shading and shadows](0121-second-hills-planet-terrain-spec-air-sea-shadows.md) | accepted | 2026-10-18 |
| 0122 | [N-body worlds: vessels integrated in the dominant body's frame, bodies on their paths, warp held to a budget](0122-n-body-restricted-vessels-integrated-bodies-on-paths.md) | proposed | 2026-10-18 |
| 0123 | [Construction on the world tick, typed capacity keys, upkeep every 30 days](0123-construction-on-the-tick-capacity-keys-upkeep.md) | accepted | 2026-10-18 |
| 0124 | [Markets: one propellant chain, site storage, launch fuel from storage then market](0124-markets-one-propellant-chain-site-storage-launch-fuel.md) | accepted | 2026-10-18 |
| 0125 | [Off-world bases: a kit that founds a site, outposts as members, one ISRU step, supply routes on transfer windows](0125-off-world-bases-kits-outposts-isru-supply-routes.md) | accepted | 2026-10-18 |
| 0126 | [Full checks run in CI; laptops run the checks for what changed](0126-full-checks-in-ci-affected-checks-on-laptops.md) | accepted | 2026-10-18 |
| 0140 | [Refs tokens: glass that keeps text readable, UI scale through rem, legacy names as aliases](0140-refs-tokens-glass-contrast-ui-scale-and-legacy-names.md) | accepted | 2026-10-17 |
| 0141 | [The calendar lives on the root body, the epoch counts SI days from J2000, a fictional year needs an orbit](0141-calendar-on-the-root-body-epoch-from-j2000-and-a-year-only-with-an-orbit.md) | accepted | 2026-10-17 |
| 0142 | [Sites: the terrain seed, flat zones from sites, and placement at a pad](0142-sites-terrain-seed-zones-and-placement.md) | accepted | 2026-10-17 |
| 0143 | [Worlds in the web client: the record carries a new world's info, one active world, slots per world, catch-up only on a real calendar](0143-worlds-screen-active-world-record-world-info-and-catch-up.md) | accepted | 2026-10-17 |
| 0147 | [Milestones in the sim, history from them, achievements as data in a page profile](0147-milestones-in-the-sim-achievements-in-the-page.md) | accepted | 2026-10-18 |
| 0148 | [Hangar: pre-flight verdict levels, a tool pill without fake tools, and a centre-of-thrust marker](0148-hangar-verdict-levels-tool-pill-and-centre-of-thrust.md) | accepted | 2026-10-18 |
| 0149 | [`definePanel`: view nodes over a panel input, a small canvas, and the dock](0149-define-panel-view-nodes-panel-input-canvas-and-the-dock.md) | accepted | 2026-10-18 |
| 0150 | [Launch facilities are the site's pad and runway buildings, placed by surface position; the choice travels to the flight](0150-launch-facilities-from-buildings-surface-placement-and-the-launch-choice.md) | accepted | 2026-10-18 |
| 0151 | [Missions: briefings and next missions, a stock main line, scenarios as mission packs, the tracker panel](0151-missions-briefings-next-missions-scenarios-and-the-tracker.md) | accepted | 2026-10-18 |
| 0152 | [Astronaut Complex: applicants by profession, crew kept by launching into the world's newest save](0152-astronaut-complex-applicants-by-profession-and-launching-into-the-world.md) | superseded by 0201 | 2026-10-18 |
| 0153 | [Vessel panel: controls from descriptors in a stable order, what a group click does, the part highlight](0153-vessel-panel-controls-from-descriptors-group-clicks-and-part-highlight.md) | accepted | 2026-10-18 |
| 0154 | [Tech tree: nodes, research, locks at the Hangar and at launch, pacing by science yield](0154-tech-tree-nodes-research-locks-and-pacing-by-science-yield.md) | accepted | 2026-10-18 |
| 0155 | [Range safety: the safe fan from the water map, the drop predicted at staging, penalties once](0155-range-safety-fans-impacts-at-staging-and-penalties.md) | accepted | 2026-10-18 |
| 0156 | [Part reliability: failure modes as data, experience per part model, grades, the test stand, repair](0156-part-reliability-failure-modes-experience-grades-test-stand.md) | accepted | 2026-10-18 |
| 0157 | [The base M1 and M2 start on `low`; the renderer misses ADR 0025's budget on its budget machine](0157-the-base-m1-and-m2-start-on-low.md) | accepted | 2026-10-18 |
| 0158 | [Comms in the interface: the link badge with its reason, the Comms tab, the Network layer as a page overlay](0158-comms-interface-link-badge-comms-tab-network-overlay.md) | accepted | 2026-10-18 |
| 0159 | [Replays and challenges as files: a start save, timed commands and checkpoints; challenges scored locally](0159-replays-and-challenges-as-files.md) | accepted | 2026-10-18 |
| 0160 | [Richer mod models: a deploy clip, a typed LOD list, palette slots on named materials, KTX2 textures](0160-richer-mod-models-deploy-clips-lods-material-palette-ktx2.md) | accepted | 2026-10-18 |
| 0144 | [The flight HUD in the refs layout: where our extra controls go and what shows before its data exists](0144-flight-hud-refs-layout-what-has-no-data-yet.md) | accepted | 2026-10-17 |
| 0145 | [Body rotation: one function, the pole in the system frame, the prime meridian by the shortest turn](0145-body-rotation-pole-convention-and-one-function.md) | accepted | 2026-10-17 |
| 0146 | [Catalogue categories are a registry: `defineCategory`, stock re-registers its nine, short names stay aliases](0146-catalogue-categories-are-a-registry.md) | accepted | 2026-10-18 |
| 0170 | [`definePatch`: targets, paths, operations, order and failure](0170-patch-paths-ops-and-order.md) | accepted | 2026-10-17 |
| 0171 | [World tick: day length, timing in flight and on rails, order, streams, background and save fields](0171-world-tick-day-length-timing-and-save-fields.md) | accepted | 2026-10-17 |
| 0172 | [Data items: shape, ids, value curve, and where storage lives](0172-data-items-shape-ids-value-curve-and-storage.md) | accepted | 2026-10-17 |
| 0173 | [The trajectory provider: its interface and how consumers reach it](0173-trajectory-provider-interface-and-how-consumers-reach-it.md) | accepted | 2026-10-17 |
| 0174 | [Part action descriptors: how they call actions, the compact snapshot, and custom groups](0174-part-action-descriptors-calls-compact-snapshot-and-custom-groups.md) | accepted | 2026-10-17 |,
| 0175 | [Objectives: trees, primitives, scheduling, vessel binding and the save](0175-objective-trees-scheduling-vessel-binding-and-save.md) | accepted | 2026-10-17 |
| 0174 | [Part action descriptors: how they call actions, the compact snapshot, and custom groups](0174-part-action-descriptors-calls-compact-snapshot-and-custom-groups.md) | accepted | 2026-10-17 |
| 0176 | [Crew core: roster, places and XP, seats, death and salaries](0176-crew-roster-places-xp-seats-death-salaries.md) | accepted | 2026-10-17 |
| 0177 | [Site templates: criteria, the resolver, consequences and founding a site](0177-site-templates-resolver-consequences-and-founding.md) | accepted | 2026-10-17 |
| 0178 | [Science core: situations, subjects, the value curve, experiment states and credit](0178-science-situations-subjects-value-curve-states-credit.md) | accepted | 2026-10-17 |
| 0179 | [Comms tier 1: antennas, stations, the link rule, cadence, probe control and blackout](0179-comms-tier-1-links-stations-control-blackout.md) | accepted | 2026-10-17 |
| 0180 | [Regions on bodies, regional situations and dossiers](0180-regions-on-bodies-regional-situations-and-dossiers.md) | accepted | 2026-10-18 |
| 0181 | [Crew simulation: life support, morale, fatigue, g-load and radiation](0181-crew-life-support-morale-fatigue-exposure.md) | accepted | 2026-10-18 |
| 0182 | [Buoyancy: where the water is, the seabed, sliced volumes, water drag and impacts](0182-buoyancy-water-seabed-slices-wet-landed.md) | accepted | 2026-10-18 |
| 0183 | [Body path models: fixed conic, elements with rates, periodic series; osculating elements for conic consumers](0183-body-path-models-kepler-rates-series-osculating.md) | accepted | 2026-10-18 |
| 0184 | [Systems and scale variants: selection in the loader, variant patches, J2000 rotation, the Sol pack](0184-systems-variants-loader-selection-sol-pack.md) | accepted | 2026-10-18 |
| 0185 | [Comms tier 2: bands, the link budget, the rate ladder, the comms scale and the inspector](0185-comms-link-budget-bands-rate-ladder-inspector.md) | accepted | 2026-10-18 |
| 0186 | [Procedural contracts: templates, the offer generator, slots, expected value and the save](0186-procedural-contracts-templates-offers-slots-value.md) | accepted | 2026-10-18 |
| 0187 | [Strategies: declared multiplier keys with bounds, upkeep as a charge, slots, cooldown and the projection](0187-strategies-bounded-multipliers-upkeep-slots-projection.md) | accepted | 2026-10-18 |
| 0161 | [Aeroplanes: wheels as frictionless colliders with sim-side tyre forces, a level runway start, trim, flaps, level-wings, flight read-outs](0161-aeroplanes-wheels-level-runway-trim-flaps-readouts.md) | accepted | 2026-10-18 |
| 0188 | [Comms tier 3: relays and the routing graph, dish pointing, route modes, shared capacity, latency and the signal-delay rule](0188-comms-routing-pointing-capacity-latency-signal-delay.md) | accepted | 2026-10-18 |
| 0162 | [Script editor: Ctrl/Cmd+I as the second "suggest" key; the human pass stays with the owner](0162-script-editor-second-suggest-key-and-human-pass.md) | accepted | 2026-10-18 |
| 0189 | [Comms tier 4: transmission queues, store-and-forward custody, delivery and contact windows](0189-comms-transmission-queues-store-and-forward-contact-windows.md) | accepted | 2026-10-18 |
| 0163 | [Comms planning: a planning Worker on snapshots, the sim's link rule on conics, a coverage grid, resonant deployment](0163-comms-planning-worker-timeline-coverage-constellation.md) | accepted | 2026-10-18 |
| 0190 | [AI agencies: state machines on the world tick, owned objects, relay rental, reactive contracts and news](0190-ai-agencies-state-machines-owned-objects-rental-news.md) | accepted | 2026-10-18 |
| 0191 | [Comms tier 5: channels, frequency licences, interference and encryption](0191-comms-channels-licences-interference-encryption.md) | accepted | 2026-10-18 |
| 0192 | [Discovery science: seeded facts, noisy measurements, data levels in the lab, claims judged by a proper scoring rule](0192-discovery-science-facts-measurements-levels-claims-review.md) | accepted | 2026-10-18 |
| 0193 | [Comms tier 6: suit radios relayed by crewed vessels, the radio ability, fine terrain sampling, live broadcasts of firsts](0193-comms-tier-6-suit-radios-broadcasts.md) | accepted | 2026-10-18 |
| 0194 | [The science dock panel: stored results in the snapshot, Run and Transmit over a fixed view](0194-science-dock-panel-stored-results.md) | accepted | 2026-10-18 |
| 0195 | [Silhouettes of the planet pass: coverage at a miss's closest approach, one shading function, grazing normals](0195-planet-pass-silhouette-coverage.md) | accepted | 2026-10-18 |
| 0200 | [Debug panel, cheats, set-state tools and the debug API](0200-debug-panel-cheats-set-state-debug-api.md) | accepted | 2026-10-18 |
| 0201 | [One simulation per world: Base layout shell, clock states and pause rules](0201-one-sim-per-world-base-layout-clock-states-pause.md) | accepted | 2026-10-18 |
| 0202 | [Flexible time warp](0202-flexible-time-warp.md) | accepted | 2026-10-18 |
| 0203 | [KSP-grade parts pack](0203-ksp-grade-parts-pack.md) | accepted | 2026-10-18 |
| 0204 | [Flight model additions](0204-flight-model-additions.md) | accepted | 2026-10-18 |
| 0205 | [Vessel panel v2, part inspector and HUD layout spec](0205-vessel-panel-v2-part-inspector-hud-layout.md) | accepted | 2026-10-18 |
| 0206 | [Key profile: KSP-compatible default plus an "Orbital classic" profile](0206-key-profiles-ksp-default-orbital-classic.md) | accepted | 2026-10-18 |
| 0207 | [Hangar interaction model](0207-hangar-interaction-model.md) | accepted | 2026-10-18 |
| 0208 | [Vessel switching, per-vessel designs, docking and fleet management](0208-vessel-switching-per-vessel-designs-docking-fleet.md) | accepted | 2026-10-18 |
| 0209 | [EVA v2](0209-eva-v2.md) | accepted | 2026-10-18 |
| 0210 | [Audio additions and music](0210-audio-additions-and-music.md) | proposed | 2026-10-18 |
| 0211 | [The silhouette coverage blend is deferred to a resolve pass; the planet pass keeps one shading](0211-silhouette-coverage-blend-deferred-to-a-resolve-pass.md) | accepted | 2026-10-19 |
| 0212 | [Attach-node size is a joint diameter; the seam rule and its band](0212-attach-node-size-and-seam-rule.md) | accepted | 2026-10-19 |
| 0213 | [Debug access is a world rule; debug state lives in the world info](0213-debug-access-rule-and-debug-state-in-world-info.md) | accepted | 2026-10-19 |
| 0214 | [Sunlight on parts, solar panel modes and the power rules in the sim](0214-sunlight-model-and-power-rules.md) | accepted | 2026-10-19 |
| 0215 | [Design records live on the sim's vessels; save envelope 3 seeds the focus](0215-design-records-in-the-sim-envelope-3.md) | accepted | 2026-10-19 |
| 0216 | [A pod controls only with crew in it; launches seat crew; the pad state](0216-crew-in-seats-auto-crew-and-the-pad-state.md) | accepted | 2026-10-19 |
| 0217 | [RCS: per-nozzle allocation, translation in the attitude command, and SAS authority](0217-rcs-allocation-translation-and-sas-authority.md) | accepted | 2026-10-19 |
| 0218 | [Docking: capture numbers, merge into one vessel, undock restore](0218-docking-capture-merge-and-undock.md) | accepted | 2026-10-19 |
| 0219 | [Solid motors, launch clamps and held experiments](0219-solid-motors-launch-clamps-held-experiments.md) | accepted | 2026-10-19 |
| 0220 | [Flow locks, transfers as vessel jobs, measured rates, and keyed action ids](0220-flow-locks-transfers-measured-rates.md) | accepted | 2026-10-19 |
| 0221 | [Hangar carry details: drag to carry, empty hand after a place, mirror plane, carry keys](0221-hangar-carry-details.md) | accepted | 2026-10-19 |
| 0222 | [UI v2 fidelity, a categorised build menu, branch space centers and a deep-space dish](0222-ui-fidelity-build-menu-branch-centers-deep-space-dish.md) | accepted | 2026-10-19 |
| 0223 | [User alarms in the sim, the node panel and the navigation markers](0223-user-alarms-and-navigation-tools.md) | accepted | 2026-10-19 |
| 0224 | [Per-part design settings, module mass and shells, thrown-off debris, per-instance visuals](0224-per-part-settings-fairings-debris.md) | accepted | 2026-10-19 |
| 0225 | [Build-time controls, Hangar action groups, crew seats and the pre-flight report](0225-hangar-build-controls-groups-crew-report.md) | accepted | 2026-10-19 |
| 0226 | [Flight camera modes, part focus, hide UI and screenshots](0226-flight-camera-modes-hide-ui-screenshots.md) | accepted | 2026-10-19 |
| 0227 | [Building categories in the category registry, and the build menu's cards](0227-building-categories-and-build-menu.md) | accepted | 2026-10-20 |
| 0228 | [The deep-space dish: model, tracking and station tiers 4–6](0228-deep-space-dish-model-tracking-station-tiers.md) | accepted | 2026-10-20 |
| 0229 | [Branch space centers on the home planet](0229-branch-space-centers.md) | accepted | 2026-10-20 |
| 0230 | [Rules only easier during play; revert and quickload rules; save safety](0230-rule-direction-revert-quickload-save-safety.md) | accepted | 2026-10-20 |
| 0231 | [Career content: a tiered tech tree with every part placed, contracts that see milestones and spawn a rescue, a richer objective view, per-item panel actions](0231-career-content-tech-tiers-rescue-spawn-objective-view.md) | accepted | 2026-10-19 |
| 0232 | [The script sandbox lives with the world, not with Flight](0232-script-sandbox-lives-with-the-world.md) | accepted | 2026-10-20 |
| 0233 | [The Abort group is the design's custom slot 0; trim on three axes; keys that were pending](0233-abort-group-trim-axes-held-brakes.md) | accepted | 2026-10-20 |
| 0234 | [A pixel budget for the planet pass, and the other Retina quick wins](0234-planet-pixel-budget-retina-quick-wins.md) | accepted | 2026-10-20 |
| 0233 | [The quality governor: a locked 60 or 30, fast down, up only on evidence](0233-governor-paced-fast-down-measured-up.md) | accepted | 2026-10-20 |
| 0235 | [Surface links: a part attached at a point and normal of its parent's surface](0235-surface-links.md) | accepted | 2026-10-20 |
| 0236 | [The snapshot says splashed; heat bars, touchdown dust and reduced motion in the flight view](0236-splashed-flag-heat-bars-dust-reduced-motion.md) | accepted | 2026-10-20 |
| 0237 | [The EVA helmet and the personal parachute](0237-eva-helmet-and-personal-parachute.md) | accepted | 2026-10-20 |
| 0238 | [Interstage fairings: a node at the shell top, shielding while open, handles and a cost](0238-interstage-fairings-shell-top-node.md) | accepted | 2026-10-20 |
| 0239 | [Vessel lights: a module, a lamp visual and a small light budget](0239-vessel-lights.md) | accepted | 2026-10-20 |
| 0240 | [The Hangar after the owner's test: a clear bay, a folding right panel, Flight's bars](0240-hangar-owner-fixes-panel-and-bars.md) | accepted | 2026-10-20 |
| 0241 | [Flight UI after the owner's test: a collapsed vessel panel, a dock rail of its own height, one pause badge, clearances that follow what is shown](0241-flight-ui-owner-fixes.md) | accepted | 2026-10-20 |
| 0242 | [The map like KSP's: orbit styles, vessel icons by type, link colours and remembered filters](0242-map-styles-icons-filters.md) | accepted | 2026-10-21 |
| 0243 | [Wheel motors, a SAS level on control parts, and taking a sample on EVA](0243-wheel-motors-sas-level-and-taking-samples.md) | accepted | 2026-10-21 |
