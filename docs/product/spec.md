# Product specification

**Working title:** Orbital
**One line:** A browser-based space-flight game where players build vehicles from parts, fly them with real orbital mechanics, and extend the game through TypeScript mods.

## 1. Vision

Kerbal Space Program proved that realistic orbital mechanics can be fun when the feedback loop is tight: build, launch, fail, learn, iterate. Orbital brings that loop to the browser with no install, and treats **moddability as a first-class product feature**, not an afterthought. The stock game is itself a mod built on the public SDK.

## 2. Target users

1. **Players** who want a KSP-like experience that opens in a tab.
2. **Modders** (TypeScript developers) who want to add parts, modules, resources, bodies, and gameplay systems with a typed, documented API and a fast iteration loop.
3. **Scripters** who want to automate flight (kOS-style) from inside the game.

## 3. Core loop (MVP)

1. In the **Vehicle Assembly** view, attach stock parts (tank, engine, decoupler, command pod, …) into a vessel. Stages are assigned.
2. **Launch** from the surface of the home planet. Throttle, pitch/yaw/roll, stage.
3. Physics is simulated per part with joints while under thrust or in atmosphere; once coasting in vacuum the vessel goes **on rails** (Keplerian orbit) and **time warp** becomes available.
4. The **map view** shows the vessel's orbit, apoapsis/periapsis, and the body's sphere of influence.
5. Reach a stable orbit. That is the MVP victory condition.

## 4. Scope

### In scope (Phase 0–1)

- One home planet: spherical, uniform gravity field (point mass), simple exponential atmosphere, no terrain.
- Stock parts: command pod, fuel tank (liquid fuel + oxidizer), liquid engine, decoupler, reaction wheel, fairing-less. Enough to reach orbit.
- Resources: liquid fuel, oxidizer, electric charge. Generic resource graph.
- Vessel assembly with surface/node attachment, staging.
- Flight: throttle, attitude control, staging, SAS-like stability assist.
- On-rails orbit propagation, patched conics within one SOI, time warp.
- Map view with orbit line and apsis markers.
- Save/load of a vessel design (JSON).
- The mod SDK (`definePlugin`, `defineModule`, `definePart`, `defineResource`, `defineBody`) and a loader that boots stock content through it.

### Later (Phase 2–3)

- Scripting sandbox (player scripts in a Worker/QuickJS with a limited API).
- Loading external mods at runtime; mod dependency resolution; patching other mods' parts.
- Multiple bodies, SOI transitions, maneuver nodes.
- Terrain with LOD, biomes, landing.
- Re-entry heating, part failure propagation.
- Career/science/contracts.
- Multiplayer.

### Non-goals (for the foreseeable future)

- Photorealistic graphics.
- Native/desktop builds (the browser is the platform; a desktop wrapper may come later).
- Backend services for the core loop; the game must run fully client-side.
- Supporting non-TypeScript mod authoring beyond JSON data files.

## 5. Quality bars

- **Determinism:** the same inputs produce the same simulation on every run (fixed timestep, no wall-clock dependence inside `sim`).
- **Headless:** the full core loop is testable in Bun with no browser.
- **Precision:** positions are float64 in SI units; rendering uses a floating origin so a vessel 100 000 km from the home planet is still jitter-free.
- **Performance target (MVP):** 60 fps render with a 30-part vessel on a mid-range laptop; sim step ≤ 4 ms at 50 Hz.
- **Moddability:** a third party can add a working engine part with a single TypeScript file and no changes to core.

## 6. Success criteria per phase

Each phase is complete when its plans are `done` and the phase's end-to-end check passes:

- **Phase 0:** `bun test` includes a headless scenario: a two-stage stock vessel, controlled by a scripted ascent, reaches a stable orbit (periapsis above atmosphere) within a time budget.
- **Phase 1:** the same scenario can be done interactively in `apps/web`, and the orbit is visible in map view.
- **Phase 2:** a mod living outside the repo (an npm package or a folder) adds a part and a script that are usable in the web client.

## 7. Open product questions

- Art direction and name (placeholder "Orbital").
- Whether the home planet is Earth-scale or a smaller Kerbin-scale world (gameplay pacing). Default for MVP: Kerbin-scale (radius ~600 km) so ascent is short. ADR pending when it matters.
- License.
