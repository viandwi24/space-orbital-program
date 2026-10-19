# Architecture overview

Orbital is a Bun workspace monorepo. The structure exists to enforce one idea: **the simulation is a pure, headless, environment-neutral library; rendering, UI, and physics engines are replaceable adapters around it.**

## Package graph

```
                 ┌────────────┐
                 │  apps/web  │  SvelteKit · UI chrome · Worker host · input
                 └─────┬──────┘
        ┌──────────────┼──────────────────┐
        ▼              ▼                  ▼
┌──────────────┐ ┌───────────┐     ┌─────────────┐
│   renderer   │ │    sim    │◄────│  mod-stock  │  (loaded via sdk)
│  Three.js    │ │ loop/modes│     └──────┬──────┘
└──────┬───────┘ └─────┬─────┘            ▼
       │          ┌────┴─────┐      ┌───────────┐
       │          ▼          ▼      │    sdk     │  public mod API
       │   ┌──────────┐ ┌────────┐  └─────┬─────┘
       │   │  physics │ │ kepler │        │
       │   │  Rapier  │ │  math  │        │
       │   └─────┬────┘ └────────┘        │
       │         ▼                        ▼
       └───────►┌──────────────────────────┐
                │           core           │  ids · units · world · registries · events · loader
                └──────────────────────────┘
```

Arrows point from importer to imported. The full rule set is in `boundaries.md`.

### Flight environment (plan 019, ADR 0027)

Since plan 122 (ADR 0119) the renderer is told the home body (`SceneConfig.home`, from the sim's catalog): it gets the planet pass, the environment and the site; a `star` body is an emissive sphere and the sun direction is the star's position minus the home's at each snapshot (the fixed direction stays without a star). A later hills body (plan 071, ADR 0121) shares one terrain spec with the sim (`hillsSeedOf`, the site zones; `Catalog.bodyTerrain`, `SceneConfig.bodyTerrain`), gets aerial perspective and a sky shell when it has air (`moon-air.ts`), sea shading and terrain shadows with the hills march. `packages/renderer` draws every other body whose `terrain.kind` is `craters` (the stock moon; a mod's body names it in its definition, ADR 0067) or `hills` (a second planet with the home planet's terrain and biome colours, atmosphere or not and drawn without one, plan 059, ADR 0090: the same pass with the planet pass's `heightAt` text as its height function, a 1024 cube map baked within 8 radii of the camera and released beyond 16, no shadows and stones) with the moon pass (`moon.ts`, ADR 0054: a displaced icosphere from a baked cube map plus two camera-centred height patches, lit like any scene object, heights from `@orbital/core` `moonHeight`; with the vessel in a moon's sphere the light is the airless one of `airless-light.ts`: white sun, regolith bounce and a sky floor in the light cube, exposure stopped down, ADR 0058; a plume near an airless ground throws ballistic dust and no smoke, `effects/system.ts`; the sun's shadow of crater rims and ridges is a short march through the baked patch in the ground's shader (`terrain-shadow.ts`, `shaders/moon.glsl.ts`) with the same maths on the CPU for the active vessel, and stones are instanced rocks from a world-fixed lattice (`stones-model.ts`, `moon-stones.ts`), ADR 0068), a moon's orbit and sphere of influence and the predicted path across spheres in map view (`Renderer.setMapPath`, `setMapFocus`), and draws the home body as one analytic fullscreen pass (`planet.ts` + `shaders/`): exact planet sphere, single-scattering Rayleigh + Mie atmosphere seen from the ground or from orbit, biome ground and ocean from a generated map (`planet-map.ts`) plus distance-limited noise, a cloud shell with ground shadows, stars and the sun disc, writing a logarithmic `gl_FragDepth` so meshes and lines sort against it. `environment.ts` owns that pass, the sun `DirectionalLight` (colour from the atmosphere transmittance), the sky ambient, the fog, the exposure and the shadow camera that follows the vessel (`shadow-fit.ts`; the map is allocated once and only grows, and the planet copies the shadow matrix computed for the same frame, plan 201); `site-meshes.ts` builds the launch site from the pure layout in `site.ts` and `scene.ts` places it on the rotating body. The facade (`renderer.ts`) adds the post chain (`post.ts`: bloom, ACES tone mapping, sRGB), image-based light from a procedural sky (`environment-light.ts`), presets (`presets.ts`, `Renderer.setPreset`), the quality governor (`quality-governor.ts`: a pure state machine the web host feeds with frame intervals; it lowers `Renderer.setRenderScale`, then the preset, when the view runs under 55 fps and tries back up by trial; the player's preset is the ceiling, preset changes are at least 30 s apart and a trial into the next preset up waits 60 s of calm, `orbital.graphics.auto` and the pause menu turn it off; ADR 0053, plan 201), `Renderer.precompile` (shader programs of the other presets through `compileAsync`, their biome maps in idle time) and a dev-only `Renderer.debug`. Pure maths (sun, atmosphere, exposure, planet map, site layout, presets, shadow fit, precision frame) is tested in Bun; the GLSL is verified in the browser (journal 019). The renderer takes the world's home terrain (seed and the flat zones of its sites) and its primary site from the sim's `ready` message (`RendererConfig.terrain`, `launchSite`; plan 084, ADR 0142): the site meshes stand at the site's coordinates, and the bakes and the planet pass read the zones as a uniform array of at most 8 (`terrain-zones.ts`, `terrainZonesGLSL`) plus the seed's lattice shift `uTerrainShift`.

Since plan 027 the same pass also draws terrain heights (ADR 0036): `terrain-model.ts` is the reference height function, `shaders/terrain.glsl.ts` bakes it once into a cube map, and the planet shader sphere-traces it per pixel under a flat zone around the launch site and a bubble around a low camera. The heights are visual only; the sim's ground is still the flat tile on the reference sphere. Clouds are two shells in one atmosphere march (`cloud-model.ts`) and the sea is a sum of dispersive waves (`water-model.ts`, ADR 0037).


**Silhouettes of the planet pass** (plan 133, ADR 0195) have three parts:

- `shadeRay` holds the pass's shading of one ray: ground or sky, then the atmosphere, clouds and aurora in front.
- `marchTerrain` reports a miss's closest approach in pixel footprints. A parabola through the closest sample and its neighbours refines it, with one real height read. A ray whose closest approach is within half a footprint is shaded a second time as ground there, and the two are blended by coverage. A negative clearance is a crest the samples stepped over, and it counts as a hit.
- At grazing incidence the ground's normal leans to level and its self-shadow fades. Without that, every ridge is a dark dashed line.

The CPU twin is `terrain-model.ts` (`marchTerrain(...).closest`, `silhouetteCoverage`, `parabolaMin`).

Lakes, rivers and shores (plan 038, ADR 0072): `core/terrain.ts` carves lake basins out of the one height function (a flat floor at sea level, relief capped by a cone, so lakes are as solid as the sea), the planet pass draws them as water, moves the ripples of a river along its course by a two-phase flow map (`water-flow.ts`) and runs the swell up the beach with a shoaling phase and a breaker line (`shore-wave.ts`). The launch site's arms, steam, beacons and lit windows are driven by the vessel's height and the clock (`site-animation.ts`, ADR 0073), and `Renderer.precompile(onProgress)` reports its progress to the flight page's badge (ADR 0074).

### Space Center (plan 091, ADR 0117)

`/space-center` shows the world's one sim (no vessel of its own) with the renderer in site mode: `createRenderer({ siteBuildings: true })` draws the site's buildings from a list (`setSiteBuildings`, one generator per `visual.generator`, merged per material) instead of the hard-coded layout, and `setSiteView(true)` puts a virtual vessel at the site centre so the floating origin, camera target and ground clamp work as on the pad. `pickSite` and `projectSite` convert between CSS pixels and site metres (east, north) for build mode and the labels. The page checks a ghost with core's `canPlace` (the sim's rule for `place-building`) and writes the sites into the world record (`Worlds.setSites`) so new flights start from them. Entering a world opens this screen; the Hangar's label opens the VAB.

### Mission Center (plan 113, ADR 0118)

`/mission-center` shows the world's one sim with the renderer in map view and `setMapScope('system')`: the root body in the middle, framed by the moons' orbits. `setMapHighlight` marks the selected vessel or body, `setMapLayers` hides the orbit lines; labels, clusters of close vessels and the comms links are HTML and SVG placed with `Renderer.project`. Upcoming comes from the vessels' maneuver nodes and the trajectory provider's next sphere change; warp-to acts on the world's sim. Fly opens `/flight` on the same sim; the flight's map view has the `Map | Mission Center` switch that does the reverse.

### One sim per world (plan 204, ADR 0201)

Every in-world page sits in the SvelteKit route group `apps/web/src/routes/(world)/` (URLs unchanged; `resolve()` takes the route id, `'/(world)/flight'`). Its `+layout.svelte` owns:
- **the world session** (`lib/world-session.ts`): the one `SimClient` of the active world, booted by `lib/world-boot.ts` from the newest save that loads, else the world's start info (and DE440 for an n-body Sol world); it keeps the boot save (`base`) and the vessel in focus (`focus`). Pages call `bootWorld(worldSession, id)` and get the running client; a page never starts a Worker. A load (`/flight?load=`, the Load dialog, F9) is `restart`: the whole world rolls back to the save. Leaving the group (Home, Worlds) saves and ends the session;
- **the two-tab lock** (`lib/world-lock.ts`): a `BroadcastChannel` per world; a second tab shows "This world is open in another tab" with Take over, and the pages render only in the tab that holds it;
- **autosave**: every 60 s, after events (`worldSession.requestSave('stage' | 'landed' | 'change')`), on hide, `pagehide` and before leaving the world; Flight supplies the save (`worldSession.collect`), other pages save the running sim with the focus or the boot save's design;
- **the bars** (`lib/layout/WorldShell.svelte`): the time bar (world date, warp), the menu bar (the page's actions slot, Flight, Mission Center, Space Center, Home, the menu) and the status bar (world, mode, place, Funds · Science · Rep · Contracts from the snapshot, "Saved … ago", mods, the bell of `createBellFeed`). The page fills the box between them (`contain: layout`, so a page's own `position: fixed` root stays inside).

**The flight HUD's regions and framing** (plan 215, ADR 0205 points 5 to 7): `lib/layout/regions.ts` holds the region table (dock 260–280–400, vessel panel 300–340–440, navball 390 × 262, staging 200–220–280, crew 3 rows, 4 toasts) and `layoutFor(width, uiScale, open, last)`, which reads the breakpoints at the width over the UI scale: two side panels from 1280, one below (the one opened last stays), drawers with 44 px targets at 1024 and below. The flight page applies it as the `narrow` and `drawer` classes. Staging, crew, the maneuver editor and the side column scroll inside capped heights; the capsule row wraps before the toolbar; type tokens never fall under 10 px (`max(10px, …rem)`), the navball canvas follows the UI scale. Side panels float over the 3D view: the view insets are the fixed bars only (top from the situation bar, bottom from the instrument deck), so opening a panel does not move the vessel; Settings → "Centre the vessel in the free area" (default off) brings the side insets back, and a change eases over 250 ms (`Renderer.setViewInsets(insets, { animate })`, off for reduced motion). `window.__orbitalDebug.toast` and `vesselOnScreen` serve the layout e2e.

**Vessel switching** (plan 221, ADRs 0208 and 0215): the flight asks the worker for a vessel's design record (`designOf`, message `design`) and rebuilds its HUD for it without a reload: `[`/`]` take the nearest or the farthest other vessel of the player within 2.5 km (trim moved to Home/End until plan 216's key profiles), the Target card has "Switch to", the Mission Center's Fly works for every vessel of the player (it sets the world session's focus and opens Flight), and the vessel panel's command parts have "Control from here". The navball follows the control part. Game saves are envelope version 3; a version 2 save seeds its focus vessel's design on load.

**The clock** (plan 205, ADR 0201 points 4 to 10): `lib/clock-state.ts` turns the player's pause (P, the time bar's button; Space on pages without a Space key), the place's pause (Settings → Time, defaults in `PLACE_PAUSE_DEFAULTS`: Hangar, menus and Launch pause), a hidden tab (paused, or with "keep running in a hidden tab" running and caught up from the wall clock through the `catch-up` message) and the world rule `stock.pause-allowed` into one state, the chip (`PAUSED`, `PAUSED · HANGAR`, `LOCKED`, `BACKGROUND`) and whether the sim ticks. The layout sends the result as the `pause` message; the sim host turns it into the sim's `pause` command, which a Hardcore world refuses. A dialog that pauses the flight holds a "Menu" pause through `worldSession.hold`. Leaving an active flight (in physics and not landed, or under thrust) asks first ("Stay here" / "Leave anyway", "Don't ask again" restorable in Settings → Time). Warp the sim ends by itself (`warp:stopped`), construction done, losses and SOI changes go to the bell. `window.__orbitalDebug` is the layout's, on every in-world page.

Flight takes the session's client (`FlightOptions.client`): a launch adds the design to the running world, coming back without a launch takes up the focus vessel (`attach`), and leaving the page leaves the vessel flying.

## Layers

| Layer | Packages | Environment | Knows about |
|---|---|---|---|
| **Math** | `kepler` | any | nothing else |
| **Core** | `core` | any | `kepler` only for types if needed |
| **Adapters** | `physics` (Rapier), `renderer` (Three) | `physics`: any (WASM); `renderer`: browser | `core` |
| **Simulation** | `sim` | any (Bun, Worker) | `core`, `kepler`, `physics` |
| **Scripting** | `scripting` | any (QuickJS-WASM) | `core` only; reads snapshots, returns commands (`scripting.md`) |
| **Public API** | `sdk` | any | `core` (re-exports a curated subset) |
| **Content** | `mods/*` | any | `sdk` only |
| **Client** | `apps/web` | browser | everything |

## Runtime topology (browser)

```
Main thread                              Worker
┌─────────────────────────┐   messages   ┌────────────────────────────┐
│ Svelte UI (HUD, VAB,    │ ───────────► │ sim: fixed-timestep loop   │
│ map) · input · renderer │ ◄─────────── │ core world · physics       │
│ (Three.js, floating     │  state       │ plugins (stock + mods)     │
│  origin)                │  snapshots   │                            │
└─────────────────────────┘              └────────────────────────────┘
```

Since plan 009 `sim` runs in a Worker: `apps/web/src/lib/sim.worker.ts` boots `createSim` (Stock plugin, Rapier backend), `sim-host.ts` owns the clock (`setInterval` about 60 Hz, wall delta clamped to 0.1 s, `sim.step`) and posts a snapshot per tick; `sim-client.ts` is the main-thread side (`dispatch` returns a promise, `onSnapshot` fans out). Messages are plain data (`messages.ts`): `command`/`dispose` to the worker; `ready` (plugin ids, parts, bodies, resources), `snapshot`, `result`, `error` back. Since plan 015 the script runner lives in the same Worker (ADR 0022): `script-start`/`script-stop` in, `script-status`/`script-log` out; `sim-host.ts` ticks the runner with each post-step snapshot and dispatches its commands directly. The render loop (`flight-loop.ts`) is plain TypeScript outside Svelte reactivity; Svelte gets a 10 Hz HUD copy.

### Web client UI (plan 021, ADR 0026)

Worlds (plan 087, ADR 0143): `apps/web/src/lib/worlds/` holds the world model (Create World generated from the rule and preset registries, Duplicate, the catch-up offer, all pure), the storage over the world and save stores (`worlds.ts`: create, rename, duplicate, delete with saves, `touch` on every save, the active world in `localStorage` `orbital.world`) and the `/worlds` screen's Create World dialog; a world without saves keeps its `WorldInfo` in its record and the flight passes it to the worker's `init` (`createSim({ world })`); quick and autosave slots are per world (`<world>:quick`, the Legacy world keeps `quick`). `apps/web/src/lib/ui/` is the design system: `tokens.css` (the refs tokens of ADR 0107 with the ADR 0026 names as aliases, ADR 0140; sizes in rem so the UI scale setting, the root font size, scales them; `data-contrast` and `data-glass` on the root switch high contrast and the solid glass fallback; text colours are contrast-tested over a white backdrop), `base.css`, `root-theme.ts`, own SVG icons (`icons.ts`) and Svelte 5 components (`Panel`, `Button`, `Segmented`, `IconButton`, `Meter`, `Kbd`, `Toasts`, `Dialog` on the native `<dialog>`, and the refs components `Capsule`, `Switch`, `Chip`, `StatCell`, `ListRow`, `SignalBars`, `BackButton`). Fonts are self-hosted OFL packages (Manrope for the interface, IBM Plex Mono for code and version numbers). `lib/hud/` holds the flight widgets (instrument deck with the navball, warp control, stage stack, resources, orbit strip, app bar, pause menu, help overlay, script panel, map markers). `lib/hud-controller.ts` is the HUD's plain-TypeScript brain: `flight-loop.ts` feeds it snapshots, stage and sim events; it answers each frame with `frame()` (navball attitude and marker screen positions, painted on canvas/DOM directly) and at 10 Hz with `model()` (what Svelte renders). Pure maths, all unit-tested: `speed.ts` (surface vs orbit speed, auto mode), `navball-math.ts` (attitude, ball geometry, markers), `orbit-info.ts`, `delta-v.ts` (stage-by-stage delta-v, TWR and propellant from part data; shared with the VAB; it reads module `describe` descriptors and `store`s and names no module id, ADR 0033), `stage-stack.ts`, `toasts.ts`, `hud-model.ts`. Map markers (Ap, Pe, vessel) take their pixel position from `Renderer.project(world)` (`packages/renderer/src/project.ts` for the pure maths, `SceneModel.project` for the real camera and floating origin; ADR 0033), so the page keeps no copy of the map camera. The sim Worker gained a `pause` message and forwards flameout, part damage, mode-change and loss events as `sim-event` messages.

### Vehicle assembly building (plan 022, ADR 0029)

The VAB is a 3D editor. State is an immutable value (`apps/web/src/lib/editor/state.ts`: design, loose assemblies, auto-staging flag, undo and redo snapshots) changed by pure operations (attach, detach, move a subtree, delete, stage edits); `attachTargets` lists every place a part can go under the stack rule of ADR 0016, `checkDesign` returns the launch errors and warnings, `designStats` arranges `lib/delta-v.ts` for the stage editor (the flight HUD uses the same function) and `scene.ts` turns state into the declarative `VabScene` the view draws. `packages/renderer/src/vab/` holds the view: `VabView` owns the WebGL renderer, the procedural hangar (`hangar.ts`: steel hall, assembly platform, service towers, crane, high windows with light shafts, dust), the part models from `PartModelFactory`, an orbit camera (`orbit-camera.ts`, pure), picking (`picking.ts` for attach-node spheres, a `Raycaster` for parts), node markers and highlights (`highlight.ts`), and the catalogue icon renderer (`icons.ts` frames an orthographic camera, the view draws into the canvas and copies the pixels). The hangar is baked into the environment map with `PMREMGenerator.fromScene`, so paint and metal reflect its lamps. The Svelte side is `routes/vab/+page.svelte` (layout only) plus `lib/vab/`: `controller.svelte.ts` is the page's brain (editor state, pointer and keyboard handling, the vessel library, derived read-outs) and the components are `TopBar`, `SelectionCard`, `Catalogue`, `StageEditor`, `ChecksList`, `StatsStrip` and `LibraryDialog`; it never touches Three.js objects. Plan 029 added: the **vessel library** (`lib/vab/library.ts`, pure logic over a `LibraryStore`; `library-idb.ts` is the IndexedDB adapter, ADR 0041) with **sub-assemblies** as records of kind `assembly` (`editor/assembly.ts`, placed through `planAttachAssembly`), **group move and turn** for radial symmetry groups (`moveGroup`, `setRadial`, `planCarry` in `editor/state.ts`), the **stability read-out** (`editor/stability.ts`, ADR 0042: centre of mass against centre of pressure, markers in the view and a launch warning for an unstable finned design) and `editor/describe.ts` (a spoken description of the stack). Narrow windows (under 900 px) turn the side panels into drawers.

### Part models and effects (plan 020, ADR 0028)

A part definition may carry a `visual` descriptor (core `partVisualSchema`, API 0.1.6). `packages/renderer/src/parts/` turns it into a model: `PartModelFactory` asks its `PartModelProvider`s in order (host-supplied asset providers first, then the procedural provider keyed by `visual.kind`, then the plain `shape` mesh). Generators (`generators/`) build geometry with `revolve` (hard edges where the profile says so) and a `GeometryBuilder` that merges per material slot into one mesh with material groups; `MaterialLibrary` gives each slot a PBR material with procedural `DataTexture`s (`textures.ts`). A `PartModel` also owns the engine plume (`effects/plume-mesh.ts`, shape from `effects/plume.ts`), the deploy animation and the temperature glow (`effects/glow.ts`). `effects/system.ts` is the scene-level driver: ground smoke and dust and the exhaust trail (a seeded `ParticlePool` in body-fixed coordinates), separation gas, explosions with debris, and the re-entry plasma (`effects/reentry.ts`, the same Sutton-Graves law as the sim). Explosions and separations are inferred from two consecutive snapshots (`effects/transitions.ts`) because the renderer reads snapshots only; the camera holds the wreck's place for 5 s after the active vessel is destroyed. Effect budgets (particles, debris, part detail, texture size) come from the graphics preset. Pure maths is unit-tested in Bun; the shaders are verified in the browser (journal 020).

## Key mechanisms (each has its own doc)

- World container (plan 077, ADRs 0094, 0110): a run belongs to a world; the sim carries its `WorldInfo` (identity, epoch, rules, sites) in `SimSave.worldInfo` (format 5), the web client keeps an `orbital-world` record per world (`WorldStore`, IndexedDB `orbital-saves` store `worlds`) that owns the saves whose envelope names its id; old saves migrate into the Legacy world → `simulation.md` (save section), ADR 0110

- Plugin system, registries, define-API → `plugin-system.md`
- Fixed timestep, flight vs on-rails, time warp, snapshots → `simulation.md`
- Units, frames, precision, floating origin → `units-and-frames.md`
- Import rules and environment constraints → `boundaries.md`
- Keys (plans 053, 216; ADRs 0061, 0206): one binding table in `apps/web/src/lib/keybindings.ts` with two key profiles, `ksp` (default) and `classic`, under the player's overrides. Key ids are chords when Ctrl, Alt or Cmd is held (`Alt+Digit2`). Clash scopes are flight, map and VAB; map keys act first in the map view and only on a selected node. Actions marked `pending` wait for the plan that wires them. Settings format 4 stores `keyProfile` → `docs/journal/216-key-profiles.md`

## What is deliberately *not* decided yet

- Terrain representation (Phase 3).
- A script editor beyond the plain textarea of plan 015 and a separate Worker for the runner (the runtime is decided: QuickJS-WASM, ADR 0020; the runner runs in the sim Worker, ADR 0022; `scripting.md`).
- Save format for flights (vessel designs are JSON; in-flight saves come with Phase 2).
