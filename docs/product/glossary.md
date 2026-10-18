# Glossary

Use these terms consistently in code, docs, and UI.

| Term | Meaning |
|---|---|
| **Body** | A celestial body: planet, moon, star. Has mass, radius, optional atmosphere, and a sphere of influence. |
| **SOI** | Sphere of influence: region where a body's gravity dominates; patched-conics boundary. |
| **Target** | The body or other vessel a vessel has chosen to aim at (plan 035): the sim reports its position and velocity relative to the vessel, the closest approach of the two orbits, and SAS can point at or away from it. |
| **Target mode** | The speed reference that reads the vessel's velocity relative to its target (`V` cycles to it while there is a target); the navball's prograde and retrograde markers then show that velocity (square glyphs), next to the target and anti-target markers that always show (plan 057). |
| **Maneuver node** | A planned impulsive burn on a vessel's predicted path: a time and prograde/normal/radial delta-v (plan 045, ADR 0056). While the vessel burns, the node shows the burn that is left. |
| **Vessel** | A connected set of parts under one control authority. A vessel can split (staging, breakage) into several vessels. |
| **Part** | Smallest placeable unit in assembly. Pure data: mass, mesh, attach nodes, list of module configs. Defined with `definePart`. |
| **Gimbal** | An engine that tilts its thrust vector by a few degrees to steer the vessel (`stock.engine` `gimbal`, ADR 0045); a control surface does the same with air. |
| **Radial attachment** | A part hung on the side of a cylindrical part (booster, fin, radial decoupler) at an azimuth and height instead of end to end; design format 2, ADR 0034. |
| **Symmetry** | Editing aid: parts placed together (2, 3, 4 or 6 copies around the vessel) share a group number and are deleted, detached and staged together. |
| **Module** | Reusable behaviour attached to a part with a config: `Engine`, `FuelTank`, `Decoupler`, … Defined with `defineModule`. |
| **Resource** | A quantity that flows between parts: liquid fuel, oxidizer, electric charge. Defined with `defineResource`. |
| **Plugin** | Unit of distribution and loading. Registers parts, modules, resources, bodies, systems. Defined with `definePlugin`. Also called **mod** when third-party. |
| **Stock** | The plugin shipped with the game (`mods/stock`). Written with the public SDK. |
| **SDK** | `@orbital/sdk`: the only package a mod may import from. |
| **Core** | `@orbital/core`: environment-neutral runtime (world, registries, events, loader). |
| **Sim** | `@orbital/sim`: the fixed-timestep simulation loop that drives the world. |
| **Flight mode** | Vessel simulated as one compound rigid body (physics backend active); split into two bodies when a decoupler fires. |
| **On rails** | Vessel propagated analytically along a Keplerian orbit; no physics backend. Enables time warp. |
| **Orbital elements** | The classical set `{ a, e, i, raan, argp, m0, epoch }` describing a two-body orbit (`@orbital/kepler`). Conventions in `architecture/units-and-frames.md`. |
| **Surface rails** | On-rails state of a controlled vessel at rest on the ground: its pose is fixed in the body-fixed frame and turns with the planet; no orbit (ADR 0024). Snapshot flag `surface`. |
| **Debris** | A vessel without a control source (a discarded stage, a broken-off part). Ballistic debris goes on rails and is removed when it re-enters the atmosphere or lies still on the ground (ADR 0021). |
| **Time warp** | Simulation time runs faster than wall time. Only on rails (physics warp is out of scope for MVP). |
| **Floating origin** | Rendering trick: the render world's origin is re-centred near the camera so float32 GPU math stays precise. |
| **Graphics preset** | `low`, `medium` or `high` (`@orbital/renderer` `presets.ts`): shadow map size, post chain, ray-march samples, noise octaves, vegetation. Chosen from a capability probe, saved by the host, changed with `Renderer.setPreset`. |
| **Visual descriptor** | `PartDefinition.visual`: generator `kind`, palette, params, engine plume and deploy animation that tell the renderer what a part looks like (ADR 0028). |
| **Part model provider** | `PartModelProvider` (`@orbital/renderer`): turns a part definition into a Three model; procedural generators are the default provider, asset-backed ones can be put in front (ADR 0028). |
| **Planet pass** | The renderer's fullscreen shader that draws the home body, its atmosphere, clouds, stars and sun analytically (ADR 0027). |
| **Fixed timestep** | Sim advances in constant `dt` steps (default 1/50 s) regardless of render frame rate. |
| **Stage** | Ordered group of parts activated together (engines ignite, decouplers fire). |
| **Attach node** | Named point on a part where another part can connect (`top`, `bottom`, `surface`). |
| **System** | Logic that runs every sim step over the world (e.g. resource flow, aerodynamics). Registered by plugins. |
| **Component token** | Typed key for world data, made with `defineComponent<T>(name)` (ADR 0010). |
| **Snapshot / Command** | Read-only sim state sent to hosts / input messages sent to the sim; plain data (`core/src/protocol.ts`). |
| **PhysicsBackend** | Interface in core that `@orbital/physics` implements (ADR 0004). |
| **Plan** | A numbered unit of work in `docs/plans/` with executable acceptance criteria. |
| **ADR** | Architecture Decision Record in `docs/decisions/`. |
| **Contributes** | The typed API a plugin exposes to its dependents: declared with `contributes: {} as {...}`, implemented with `ctx.provide`, visible on a dependent's `ctx` (ADR 0013). |
| **Load report** | Result of `loadPlugins`: boot order, disabled plugins with reasons, and what each plugin registered (`{ id, by }` per kind). |
| **Module augmentation** | `declare module '@orbital/sdk' { interface EventMap {…} }`: how a mod adds typed events, resource ids and module config types to the open interfaces. |
| **Part shape** | Placeholder geometry of a part (`box` or `cylinder`, metres, axis = local Y) used by the renderer and physics body until art exists. `PartDefinition.shape`, ADR 0014. |
| **Vessel API** | `ModuleContext.vessel`: the capabilities a module hook has over its vessel (forces, control input, ambient, resources, detach); ADR 0015. |
| **Crossfeed** | Whether resources may flow through a part (`PartDefinition.crossfeed`, default true). Engines and decouplers block it, which makes a decoupler a stage barrier. |
| **Flight frame** | One physics backend with a local frame that moves at constant velocity; holds a cluster of flight vessels (ADR 0017). |
| **Pad hold** | Removed by plan 012 (ADR 0019): a stack now stands on the ground tile by friction. Was: the sim pinned a surface-loaded vessel to its pad pose until thrust exceeded weight (ADR 0017). |
| **Ground tile** | A kinematic slab under each flight vessel near the ground whose top face is the tangent plane of the reference sphere; real contact, friction and the rotating ground's velocity (ADR 0019). |
| **Impact tolerance** | `PartDefinition.impactTolerance`, m/s: ground impact speed above which a part breaks off (above twice: destroyed). |
| **Part temperature** | `PartState.temperature` / `PartSnapshot.temperature`, K: the part's skin, heated by the airflow (Sutton-Graves) and cooled by radiation (ADR 0023). |
| **Max temperature** | `PartDefinition.maxTemperature`, K: above it the part is destroyed (`part:damaged` cause `overheat`). |
| **Heat shield / ablator** | `stock.heat-shield` part and module: above 700 K it burns `stock.ablator` to absorb all airflow heat (`ModuleDefinition.absorbHeat`). |
| **Module colliders** | `ModuleDefinition.colliders`: extra collision boxes a module adds to its part for its current state (landing-leg feet). |
| **Vessel design** | The JSON a VAB saves: flat part list with parent links plus `stages` (`VesselDesign`, ADR 0016). |
| **Script** | Untrusted player JavaScript (an async function body) run by `@orbital/scripting` against the `ship` API; sees telemetry copies, issues validated commands (ADR 0020). |
| **Script budget** | Wall-clock ms of guest execution allowed per sim tick (default 10); exceeding it terminates the script. |
| **Script runner** | `createScriptRunner(source, options)`: one QuickJS runtime per script; `tick(snapshot)` returns the commands to dispatch. |
| **Loose assembly** | A subtree detached in the VAB: kept next to the design as a one-root `VesselDesign`, drawn on the hangar floor, never launched (ADR 0029). |
| **Attach target** | A place a part can go in the VAB: a free node of the design with a node of the new part facing the opposite way (`attachTargets`), shown as a ring. |
| **Ghost** | The translucent preview of the part being placed or moved, drawn at the active attach target. |
| **Auto-stage** | Editor mode in which engines and decouplers get their stages from decoupler depth; any manual stage edit turns it off until "Auto-stage" is pressed. |
| **Terrain field** | `TerrainField` in `@orbital/core`: `heightAt(body-fixed unit direction)` in metres above the reference sphere, `maxHeight`. The sim's ground and the renderer's drawn ground read the same one (ADR 0043). |
| **Terrain patch** | A camera-centred square window of 32-bit baked heights (4 km and 33 km wide on `high`) that the planet pass blends over the far-field cube map so the ground a vessel touches is drawn to centimetres (ADR 0044). |
| **Space Orbital Program** | The product name (ADR 0105). "Orbital" remains the code name in packages, file formats and storage keys. |
| **World** | A save container: preset, rules, star system and scale variant, seed, epoch, gravity model, sites, progress, crew, vessels and network (ADR 0094). Mods and the vessel library are global. |
| **Preset** | A named set of rule values (Sandbox, Science, Career, or a mod's); not a code path (ADR 0094). |
| **World rule** | A typed setting of a world (`defineRule`): economy, science depth, crew aspects, signal delay, range safety, reliability, agency type, and more. Identity rules (system, variant, gravity model, seed, primary site) cannot change after creation. |
| **Rule changelog** | The world's record of every rule change: game time, rule, old and new value. |
| **Gravity model** | Per-world choice of how vessels feel gravity: `patched` (patched conics, the only one available) or `n-body` (shown as "Coming soon", ADR 0095). |
| **Trajectory provider** | The one interface every orbit prediction goes through (sim rails, nodes, map, rendezvous, trip planner, scripts); the patched-conics provider wraps today's functions (ADR 0095). |
| **Epoch** | The instant of `t = 0` of a world, stored as a day count and a fraction on the system's time scale (ADR 0103). |
| **Calendar** | How a system shows dates: `gregorian-utc` for real systems, a fictional calendar from the home body's day and year otherwise. |
| **Catch up to now** | An offer (and a button) to warp a world forward to the real current date when every vessel is on rails; never backwards. |
| **World tick** | The sim phase that runs once per game day at the day boundary for world-level systems (economy, construction, contracts, crew, agencies) (ADR 0096). |
| **Background operation** | Work an unloaded vessel keeps doing, computed in closed form (rate × Δt) on world ticks and on demand. |
| **Site** | A place in a world with a body, latitude, longitude, flat zone, buildings and member vessels: the Space Center, a base or an outpost (ADR 0097). |
| **Space Center** | The first site of every world, shown in 3D and built by the player on a grid. |
| **Flat zone** | A circle of levelled ground around a site, applied on top of the world-seeded height function. |
| **Building** | A placed structure of a site defined with `defineBuilding`: size, levels, costs, upkeep, capacity effects and capabilities (`provides`). |
| **Location template** | A quick site choice (for example equatorial coast) resolved against the world seed to a concrete spot. |
| **Base kit / outpost** | The two ways to found an off-world base: a kit that deploys a site, or a landed vessel made a member of a site. |
| **Range safety** | A world rule (`cost` by default, `hard`, `off`) on launch azimuths and stage impact zones. |
| **Ledger** | The world's record of every change to funds, science, reputation and commodities, each with its cause (ADR 0098). |
| **Commodity** | A tradeable good or service with a market price that responds to supply and demand on the world tick. |
| **Capacity gate** | A limit raised by a building level or tech (part count, launch mass, pad size, crew, contract slots, network power, prediction quality). Flight tools are never gated. |
| **Objective** | A deterministic primitive (reach orbit, land in a region, return a sample, hold a link, by a date) evaluated on events and ticks; contracts and missions are built from objectives. |
| **Contract** | A job with an advance, a reward, a penalty and a deadline. Authored ones are `defineContract`; procedural ones come from a `defineContractTemplate` as **offers** (plan 099). |
| **Contract slot / expected value** | Slots: how many contracts may be active at once (the Mission Center's `mission-control` capacity). Expected value: an offer's advance plus reward funds, less its estimated launch cost; labelled an estimate (ADR 0186). |
| **Mission** | A written job in the story line or a mission pack (`defineMission`), on the same evaluator as contracts. |
| **Strategy** | A policy that changes economy multipliers within stated bounds, with a projection and upkeep (`defineStrategy`). |
| **Milestone** | A world first recorded automatically (first orbit, landing, return, ...), written to the world's history book. |
| **Achievement** | A local, cross-world player award defined as data (`defineAchievement`), kept in an exportable profile. |
| **Agency** | A rival space programme simulated as a state machine on the world tick whose successes place real objects in the world (ADR 0096); also the player's own type: government, company or hybrid. |
| **Experiment / subject** | An experiment run in a situation over a region of a body makes a science subject with a cap and diminishing returns (ADR 0099). |
| **Situation** | Where a vessel is for science: landed, splashed, flying low or high, space low or high (extensible). |
| **Region** | A named area of a body's surface (biome) used by science; data on the body. |
| **Data item / sample** | Science results: a data item has a size and can be transmitted or recovered; a sample has mass and must be recovered. |
| **Dossier** | What the world knows about a body, filled by science results. |
| **Science depth** | World rule: `classic` points (default) or the optional `discovery` layer. |
| **Tech node** | A node of the tech tree (`defineTechNode`) that unlocks parts; tiers are gated by milestones as well as points. |
| **Crew member** | A person of a world's roster with a profession, traits, XP and state; the crew simulation's aspects (life support, morale, rest, g-load, death) are world rules (ADR 0100). |
| **EVA** | A crew member outside a vessel, simulated as a small vessel of their own. |
| **Antenna / ground station / link** | Comms building blocks: antenna modules on vessels, stations at sites, links between them with line of sight, rate and latency (ADR 0101). |
| **Band / link budget / margin** | Comms tier 2 (ADR 0185): a band is a radio frequency with its receivers' noise temperature; the link budget adds up a link's power, gains and free-space loss (Friis); the margin is how far it clears 1 kbit/s, in dB, and every 10 dB of it is one decade of data rate. |
| **Control state** | `full`, `partial` or `none`: what a vessel without a link may still do, per the `controlWithoutSignal` rule. |
| **Signal delay** | Light time plus queueing on a route; by default shown, not enforced (`display`); `enforced` and `flight-computer` are rules. |
| **Part action** | An action a module describes (toggle, value, trigger, mode) that the vessel panel turns into a control (ADR 0102). |
| **Action group / group control** | All parts whose actions share a group (engines, lights, ...) switched together; mixed when some are on. Custom groups are saved with the design. |
| **Dock / Panel library** | The left rail of HUD panels and the dialog to add or remove them; mods add panels with `definePanel`. |
| **Mission Center** | The one screen with the whole system, tracking, upcoming events, contracts and crew; replaces KSP's Tracking Station and Mission Control. |
| **Patch** | A typed change of registered data by another mod (`definePatch`), applied at load with provenance (ADR 0104). |
| **Provenance** | Per patched field, the plugins that set it: the registering one first, then each patching plugin in apply order (`LoadReport.provenance`, shown on `/mods`; ADR 0170). |
| **Scale variant** | A version of a star system at a size and distance scale (the Sol pack's `1:1` and `rescaled`) with its own balance patches (ADR 0103). |
| **Sol pack** | The real solar system as an in-repo mod package with orbits from JPL elements with secular rates and a lunar model. |
