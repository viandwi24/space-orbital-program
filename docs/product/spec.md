# Product specification

**Name:** Space Orbital Program (ADR 0105; the code and file formats keep the name "orbital")
**One line:** A browser-based space-flight game where players build vehicles from parts, fly them with real orbital mechanics, run a space programme in a world of their own, and extend the game through TypeScript mods.

## 1. Vision

Kerbal Space Program proved that realistic orbital mechanics can be fun when the feedback loop is tight: build, launch, fail, learn, iterate. Space Orbital Program brings that loop to the browser with no install, and treats **moddability as a first-class product feature**, not an afterthought. The stock game is itself a mod built on the public SDK.

After 1.0 the game grows from a flight simulator into a space programme (the foundation decisions of 2026-10-17, ADRs 0094 to 0108). A **world** is a save with its own rules, sites, crew, money, science and network. The player can take any of five roles, alone or mixed, and each must be worth playing for its own sake:

- **Scientist** — experiments on a matrix of bodies, situations and regions, data and samples, body dossiers, optionally discovery science (ADR 0099).
- **Engineer** — designs that are efficient, reusable and (by rule) reliable; capacity limits that are visible, never hidden walls (ADR 0098).
- **Investor** — a full resource economy with markets, production and strategies, where every number shows its cause (ADR 0098).
- **Operator** — the communications network, the Mission Center, crew and logistics (ADRs 0100, 0101, 0102).
- **Explorer** — sites chosen on the globe, bases on other bodies, a real solar system at 1:1 or rescaled, dates and seasons that match the sky (ADRs 0097, 0103).

## 2. Target users

1. **Players** who want a KSP-like experience that opens in a tab, in any of the five roles above.
2. **Modders** (TypeScript developers) who want to add parts, modules, resources, bodies, and gameplay systems with a typed, documented API and a fast iteration loop.
3. **Scripters** who want to automate flight (kOS-style) from inside the game.

## 3. Core loop (MVP)

0. **Choose or create a world** (plan 087, ADR 0143): the Worlds screen lists the player's worlds, the one played last first; Create World picks a mode (a preset), the star system, the start date, the gravity model (n-body "Coming soon") and every rule. Entering a world opens its newest save, or the hangar when it has none; every launch and save then belongs to that world. Continue on the main menu enters the world played last.
1. In the **Vehicle Assembly** view, attach stock parts (tank, engine, decoupler, command pod, …) into a vessel. Stages are assigned.
2. **Launch** from the surface of the home planet. Throttle, pitch/yaw/roll, stage.
3. Physics is simulated as one rigid vessel (a compound body, split when a decoupler fires, ADR 0018) while under thrust or in atmosphere; once coasting in vacuum the vessel goes **on rails** (Keplerian orbit) and **time warp** becomes available.
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

### v1 public release (ADR 0048)

Status (plan 023): the 1.0 release candidate is built; what the player can do is in the root `README.md`, what is left is in the release checklist of `journal/023-release-readiness.md` (the game's licence is the human's decision). The post-v1 roadmap is published in the game (`/roadmap`).

Phase 0–1 plus: scripting sandbox, terrain and landing, re-entry heating, boosters/fins/gimbal, a 3D VAB with a vessel library, SAS, save/load game, a moon with SOI transitions, maneuver nodes, runtime mod loading, menus/settings/onboarding. Everything else below is the post-v1 roadmap.

### Foundation roadmap (post-v1, announced; ADR 0108)

Phases and plans are in `STATUS.md` ("Next: foundation roadmap"). In order:

1. **Product and foundation contracts** — the name, Apache-2.0, the roadmap page; worlds as saves with presets over rules (ADR 0094), the gravity-model field and a trajectory provider (patched conics only; n-body shown as "Coming soon", ADR 0095), the calendar and epoch, the world tick (ADR 0096), data items, sites with a terrain per world (ADR 0097), body orientation as pole times spin, the refs UI tokens (ADR 0107), typed data patches (ADR 0104).
2. **Worlds and the Space Center** — Worlds screen and Create World (start date today by default, catch-up only as an offer), the refs flight HUD and menus, buildings as data, the Space Center in 3D with free grid placement, site choice with location templates, the refs Hangar, the Launch screen.
3. **Career foundation** — the full resource economy (ledger, costs, recovery, markets, production), building levels that gate capacity only, one objective evaluator for procedural contracts and authored missions, strategies, milestones and achievements, science and the tech tree, crew as a full simulation with every aspect a world rule, EVA.
4. **Network and control** — part actions and group control, dock panels by `definePanel`, the Mission Center, communications tiers 1 to 6 (signal delay off by default, ADR 0101).
5. **Time and the real sky** — the Sun as root with tilt and seasons for the stock system, body orbits from elements with secular rates and a lunar model, the real solar system pack at 1:1 and rescaled with per-scale balance; n-body as a future option (DE440).
6. **Living world and frontier** — AI agencies with real objects, range safety, off-world bases (base kits and parts left on the surface), discovery science, part reliability (a rule, off by default), replays and challenges as files.

Every new system ships its `define*` point and stock content uses it (ADR 0104). Everything stays client-side.

### Later (Phase 2–3)

- Scripting sandbox (player scripts in a Worker/QuickJS with a limited API).
- Loading external mods at runtime; mod dependency resolution; patching other mods' parts.
- Multiple bodies, SOI transitions, maneuver nodes.
- Terrain with LOD, biomes, landing.
- Re-entry heating, part failure propagation.
- Career/science/contracts — now in the foundation roadmap above.
- Multiplayer — not planned.

### Non-goals (for the foreseeable future)

- Photorealistic graphics.
- Native/desktop builds (the browser is the platform; a desktop wrapper may come later).
- Backend services for the core loop; the game must run fully client-side. Formats and storage stay generic (versioned JSON, stable ids, storage behind interfaces) so a backend could come later without rework (ADR 0094).
- **Universe mode** (a system editor, an n-body sandbox, a freeze tool): not pursued (ADR 0108). Mods still add bodies and star systems through the SDK.
- Online accounts and leaderboards; achievements, replays and challenges are local files (ADR 0098).
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

## 7. Browser support

Desktop Chrome and Edge, Firefox and Safari at the versions in [`browser-support.md`](browser-support.md); tablets in landscape (1024x768 and up) are supported with on-screen controls (ADR 0063), phones are not.

## 8. Open product questions

- Name: decided, Space Orbital Program (ADR 0105). Art direction for UI: the refs visual language (ADR 0107).
- Scale: the stock system stays small (home planet radius about 600 km, short ascent); the real solar system pack offers 1:1 and rescaled variants (ADR 0103).
- Licence: decided, Apache-2.0 (ADR 0106).
- Pricing and distribution: open (ADR 0108 records the research recommendation; the owner decides).
- npm package scope for publishing: open (ADR 0105 point 2).
