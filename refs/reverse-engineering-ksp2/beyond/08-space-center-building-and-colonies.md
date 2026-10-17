# 08 — Space center building, launch sites and colonies

> Design proposal, research only. Added at the human's request (2026-10-17): "build the space center on a chosen part of the map — a building system like Cities: Skylines but simple; telescopes, antenna transmitters, etc.; choose the hemisphere/place on the planet; later take it to other planets." Sources `[ID]` are in [`00-sources.md`](00-sources.md). Numbers marked *computed* use the stock bodies in `mods/stock/src/bodies.ts`.

## 0. Summary

The Space Center becomes **a place the player builds**, not a fixed menu of buildings. Three tiers, each playable alone:

1. **One space center with plots.** A fixed site with a grid of plots; the player places and upgrades buildings from a catalogue (pads, hangar, tracking dishes, telescopes, R&D, power, fuel plant). Simple: snap to plots, no roads, no zoning.
2. **Choose where on the planet.** At world creation (and later as expansion) the player picks the site on a globe. Latitude, coast, terrain and neighbouring sites have **real consequences in our sim**: rotation boost, reachable inclinations, where spent stages fall, booster recovery, ground-station coverage for the network (`01`), weather. Several sites per world.
3. **Off-world bases.** The same building system on the Moon or other bodies, with power, life support, in-situ resource production (ISRU), logistics routes, and eventually launching from them.

The pitch: **in KSP the launch site is scenery; in Orbital it is the player's first engineering decision.**

## 1. Prior art

### City and base builders

- **Cities: Skylines II**: 20 milestones earned by "expansion points". Points come passively from growth and actively from placing or upgrading service buildings. Milestones unlock services, policies and money, and each service has a **development tree** where you spend points on higher-tier buildings. The developers wanted small towns to be playable without a large population [B-CS2-PROG]. *Lesson:* building things should itself be progress, and tiers can be gated by a small points tree.
- **Cities: Skylines (1)**: districts are painted areas whose policies can override the city's, and service coverage is shown as an overlay [B-CS1-DISTRICTS][B-CS1-COVERAGE]. *Lesson:* a coverage overlay is intuitive. Road-network realism is optional, and for a space center it is unnecessary.
- **Islanders**: each building scores from what lies inside its own radius (some neighbours help, others hurt). The score is previewed live while you drag, and some buildings need a particular terrain such as the shore [B-ISLANDERS]. *The cleanest model of adjacency with instant feedback.*
- **Mars Horizon**: you choose your base location when creating an agency, and buildings buff or penalise their neighbours, so layout matters [B-MH-BASE].
- **Surviving Mars**: the first rocket brings drones and a drone hub. Power runs through cables with batteries as buffers, water is the early bottleneck, and a dome needs power, water and oxygen before colonists can move in [B-SM].
- **Factorio blueprints**: a building layout can be saved as a blueprint, exported as a text string (compressed JSON) and kept in a library that persists across saves [B-FAC-BP]. *Lesson:* let players save and share a site layout (or a base kit layout) as a string or file, as they share craft. (Satisfactory and Stationeers base building were not researched for this document.)

### Space games

- **KSP1 stock KSC**: every facility has 3 upgrade levels bought with funds. Each level lifts a clear number: assembly part count (30 → 255 → unlimited), pad and runway mass and size limits, active contracts (2 → 7 → unlimited), tracking features (patched conics, unowned objects), crew limit and EVA permissions, strategies and science limits [B-KSC]. The KSC's position is fixed. *Lesson:* three levels, each with a visible numeric effect, is a proven pattern.
- **Kerbal Konstructs** (KSP1 mod): an in-game editor for placing bases, instances and launch sites, plus facilities such as a hangar that stores vessels. Custom sites still inherit the KSC's upgrade limits [B-KK]. Scenery packs built on it add or amend launch sites [B-LSA], and one add-on charged funds to open and close sites in career [B-KOSMO]. *Lesson:* players want more sites, but in KSP1 those sites carry no gameplay of their own.
- **KSP2**: the roadmap promised orbital and surface colonies built from modules delivered to a body and then extended with local resources. The colony editor was meant to work like the vehicle editor [B-KSP2][B-KSP2-COL]. Development stopped after the studio's layoffs in mid-2024, with the last update in June 2024, so **colonies never shipped** [B-KSP2][B-KSP2-LAYOFF]. The design space is open.
- **Juno: New Origins**: offers custom launch locations at several places in its solar system [B-JUNO-LL].
- **Kerbin Side Remastered** (KSP1 mod, needs Kerbal Konstructs): stock-looking runways and structures, discoverable sites, animated ground-station dishes, and modular pieces that snap into custom site layouts [B-KSR]. (KSC++ was not researched.)

### Real launch sites

- **Kourou** (about 5°N): ESA cites about 460 m/s from Earth's rotation and few trajectory changes for geostationary transfer. Launches go over open sea to the east and north [B-KOUROU][B-GSC].
- **Minimum inclination** of a direct launch is the site latitude. The Cape (28.5°N) cannot go below 28.5° without a plane change, while Kourou goes down to about 6° [B-GSC][B-AZIMUTH].
- **Azimuth windows** come from range safety. Rockets must overfly sea or empty land, which gives Cape Canaveral roughly 35°–120°. Vandenberg launches south over the Pacific (roughly 170°–240°) and reaches polar orbit without crossing land before Antarctica [B-AZIMUTH][B-VANDENBERG].
- **Baikonur** (about 46°N, inland on the Kazakh steppe): spent stages fall on land downrange and are salvaged there, with fuel-contamination problems. The ISS's 51.6° inclination is the lowest that Soyuz from Baikonur reaches without overflying China [B-BAIKONUR]. *An inland site's drop zones and its neighbours' borders set its reachable orbits*, which is exactly the consequence tier 2 proposes.
- **Weather**: launch commit criteria limit surface wind, upper-level wind shear, lightning (field-mill readings, wait times) and certain clouds. Crewed launches also need acceptable weather at the abort sites [B-WX-NASA][B-WX-NSF].
- **Off-world**: NASA's Artemis Base Camp concept sits at the lunar south pole, for possible water ice and long sunlit periods. Its power must last through dark periods of up to about eight days, and a 10 kW fission unit was planned for longer stays [B-ARTEMIS]. MOXIE on Perseverance made oxygen from Mars's atmosphere (122 g over 16 runs) [B-MOXIE], and the Kilopower ground test demonstrated a small fission reactor in 2018 [B-KILOPOWER]. These give real anchors for ISRU and base-power parts.

## 2. Design goals

1. **Simple like a board game, not a city sim.** Plots and adjacency instead of roads, zoning and traffic. A full center fits on one screen.
2. **Every building does something you feel in flight** (bigger rockets, more data, better maps, cheaper fuel), never only a stat bump.
3. **Location matters through physics we already simulate**, not invented modifiers: the rotation boost, inclination, terrain and line of sight are already in the sim.
4. **Same system everywhere**: home planet, Moon, Mars-like planets, Universe-mode worlds (`05`), mods.
5. **Fits the UI concept**: the isometric Space Center screen with clickable building labels, a detail panel and a "needs attention" list (`refs/space-orbital-program-ui/docs/SCREENS.md`, screen W).

## 3. Tier 1 — one space center with plots

### 3.1 Layout

- A site is a **flat zone** (the terrain function already guarantees one around the launch site: height exactly zero within 5 km, ADR 0043) divided into **plots**: a few large plots (launch pads, runway), medium plots (VAB/hangar, mission center, R&D), small plots (dishes, telescopes, tanks, solar fields).
- Placing = pick a building, pick a free plot of the right size; rotate in 90° steps. No roads; paths and fences are drawn automatically between neighbours (automatic detail keeps it pretty with no effort).
- **Adjacency** (Islanders and Mars Horizon style, kept light [B-ISLANDERS][B-MH-BASE]): a fuel plant next to pads cuts pad turnaround; a telescope far from pads and floodlights gets less noise; a dish next to the mission center is cheaper to run. Shown as small +/− icons while placing.
- **Hazard zones**: pads have a blast radius; buildings inside it take damage on a pad explosion (a reason for layout to matter, and a nice consequence for failures from `02`).

### 3.2 Building catalogue (stock ideas)

| Building | Levels | What it changes in play | Ties |
|---|---|---|---|
| **Launch pad** (S/M/L) | 3 sizes | max vessel mass and height; turnaround time; L pad gets a tower with swing arms (already rendered, ADR 0073) | engineer, economy (launch market capacity) |
| **Runway** | 2 | spaceplanes, length limits take-off mass (draft plan 063) | |
| **Vehicle Assembly / Hangar** | 3 | part count, size, parallel builds (two rockets in assembly) | engineer |
| **Mission / Tracking Center** | 3 | number of active flights tracked, maneuver tools, event timeline, comms routing tools unlocked by level | operator, `01` |
| **Ground station dish** (10 m / 34 m / 70 m) | per dish | a network node: gain, bands, channels; placed per site, so geography matters | `01` (tier 1 and 2) |
| **Optical/laser ground terminal** | 1 | optical links; blocked by cloud cover | `01` |
| **Telescope** (optical, radio, solar monitor) | 3 | discovers bodies/asteroids/comets, maps far bodies at low resolution before a probe arrives, warns of solar storms | scientist, explorer, `04` |
| **R&D / Laboratory** | 3 | analysis speed and data levels (raw → calibrated → derived), sample analysis | scientist, `04` |
| **Test stand** | 2 | static fires and stage tests (reliability data) | engineer, `02` |
| **Astronaut Complex** | 3 | roster size, training (skills), EVA permissions | crew |
| **Administration** | 3 | contracts and strategies limits, board meetings | director, `03` |
| **Power** (grid, solar field, generator) | per building | buildings draw power; under-powered buildings run slower | |
| **Propellant plant / tank farm** | 2 | cheaper propellant per launch, faster pad turnaround | economy |
| **Recovery facility** (coast: boat dock; inland: landing zone) | 1 | booster/capsule recovery and refurbishment | economy, engineer |
| **Visitor center / media** | 2 | public interest from launches and live broadcasts | director, `01` tier 6 |
| **Weather station** | 1 | launch-weather forecast (if weather exists) | operator |

Each has **cost, build time, upkeep, power draw** and level upgrades. Build time runs on the world clock (`03` world tick), so a 34 m dish ordered now is ready in 60 days; time warp is how you wait.

### 3.3 Progression by mode

- **Sandbox**: everything available instantly, free.
- **Science**: buildings unlocked by the tech tree, free to build, build time on.
- **Career**: tech unlocks, money, build time, upkeep. A starter site comes with one small pad, a hangar, a mission center and one small dish (matches the UI concept's starting set).

## 4. Tier 2 — choosing where on the planet

### 4.1 What the location changes (all from our existing sim)

**Rotation boost.** The ground moves east at v = 2πR cos(latitude) / T. *Computed* for the stock home planet (R = 600 km, T = 21 600 s): about **175 m/s at the equator**, 151 m/s at 30°, 123 m/s at 45°, 87 m/s at 60°, 0 at the poles. Low orbit speed at 80 km is about 2 280 m/s, so an equatorial site saves about 8% of orbital speed against a polar one; the Δv saving is real but modest, as on Earth.

**Reachable inclinations.** A direct launch reaches inclinations from the site's latitude up to 180° minus it; anything lower needs a plane change. The stock Moon orbits in the equatorial plane (ADR 0052), so:

- An **equatorial** site reaches it with a plain Hohmann transfer.
- A **45°** site starts in a 45° orbit. Changing that plane in low orbit costs 2 v sin(Δi/2) ≈ **1 740 m/s** (*computed*), more than half the cost of reaching orbit. Cheaper strategies exist (plane change at the far end of the transfer, or a transfer timed to the Moon's node crossing), which is exactly the kind of planning an engineer/operator enjoys.
- A **high-latitude** site makes **polar and sun-synchronous-like orbits** cheap (mapping, relays over the poles, `01` and `04`).

So the choice is a trade: equatorial = cheap Moon and equatorial relays; high latitude = cheap polar science and coverage of your own hemisphere.

**Downrange safety and where stages fall.** Spent stages are real debris on ballistic arcs (ADR 0021). A **coastal** site with sea to the east lets stages fall into the ocean; launching over land (or over another agency's site, a city, your own buildings) is refused or penalised by a **range-safety rule**: the editor projects the impact ellipse of each stage for the chosen launch azimuth. Allowed azimuths per site are drawn as a fan on the site map, as real ranges restrict launch directions (Cape Canaveral roughly 35°–120°, Vandenberg south over the Pacific roughly 170°–240°) [B-AZIMUTH][B-VANDENBERG]. A "dog-leg" turn during ascent reaches other headings at a performance cost. The inclination a heading gives follows cos i = cos(latitude) · sin(azimuth) [B-AZIMUTH], so the site map can show the azimuth fan and the inclinations it reaches together.

**Recovery.** Coastal sites: sea recovery and drone-ship-style landings; inland sites: return-to-site landings and parachute recovery over land (cheaper refurbishment, more range-safety constraints).

**Terrain and biome.** The site must be flat enough for its plots: the placement tool samples the height function and shows a flatness/area score; building on slopes costs earthworks. Biome affects build cost (desert cheap, jungle and mountains expensive), weather and ground-station noise (high, dry sites suit telescopes and Ka-band dishes, as real observatories do).

**Comms coverage.** Every ground dish is placed at a real latitude/longitude, so the **network** changes with geography: three sites spaced around the planet give continuous coverage (the DSN uses three complexes about 120° apart [C-DSN-NASA]); a polar site sees polar orbiters every pass. The site picker shows the coverage your existing stations would gain.

**Weather (optional, later).** A seeded weather field per region (cloud cover, wind, storms) that the renderer already half-has (clouds), turned into **launch commit criteria** like the real ones [B-WX-NASA]: surface and high-altitude wind and lightning risk delay launches; cloud blocks optical links and optical telescopes.

**Politics and economy (Career).** Land price per region, local government incentives (tax breaks for equatorial sites, a customer base near a coast), and **neighbours**: AI agencies own sites too (`03`); building near a rival shares their airspace restrictions.

### 4.2 Several sites

- A world can hold several sites (the UI concept's world hierarchy already says "Site: Space Center (main) — later other bases/colonies").
- Each site has its own plots, buildings and pads; vessels are assembled where a hangar exists and **rolled out or transported** to a pad (a transport cost/time between sites).
- A second site is usually a **specialised** one: a polar launch site, a tracking-only site (dishes and telescopes, no pads), a coastal recovery base, a high-desert observatory.
- **Site list** in Mission Center; the launch screen (`SCREENS.md` W2) gains a site picker.

### 4.3 Picking a site (UI)

A globe with layers the player toggles: biome, terrain roughness, land price, rotation boost (colour by latitude), reachable inclinations, comms coverage gain, weather risk, range-safety fans for the chosen point, existing sites (own and rivals). Click a point → a card with the trade-offs in plain numbers ("+151 m/s rotation", "Moon: +~1 700 m/s plane change unless timed", "east: ocean 1 200 km", "coverage +31%"). Confirm → the isometric site screen for that place.

## 5. Tier 3 — bases on other bodies (colonies)

### 5.1 Building off-world

- A base is a **site** on another body, founded by landing a **base kit** (a part that "deploys" into a site with a few plots), or by building from parts delivered there.
- The same catalogue, filtered and extended: habitat, greenhouse, solar field, fission power, radiator, battery bank, ISRU plant (ice → water → propellant and oxygen), regolith processing, landing pad, rover garage, relay mast, telescope (far side of a moon = radio-quiet), local mission control (removes signal delay for nearby probes, like RemoteTech's command stations).
- **Placement constraints from the body**: sunlight (polar crater rims vs dark craters with ice), slope, local resources found by prospecting (`04` hidden facts: an ice deposit discovered by a polar orbiter), line of sight to relays and home.

### 5.2 Running a base

- **Power** balance with day/night (the sun angle is known from the body's rotation and orbit), batteries sized for the longest dark period (NASA planned for up to about eight days at the lunar south pole [B-ARTEMIS]), and fission as late tech [B-KILOPOWER].
- **Life support** (oxygen, water, food, CO₂) only when crewed; background-simulated like Kerbalism's recipes (`02`, `03`).
- **ISRU**: production chains that turn found resources into propellant, so a base becomes a **depot**.
- **Logistics routes**: once a delivery flight has succeeded, repeat it automatically for cost and time (`03`); routes need comms coverage for automated docking/landing.
- **Launching from a base**: needs a pad, propellant and a hangar level; low gravity and no atmosphere make it cheap, which changes the whole economy of the system (a Moon base supplying propellant to orbital depots).

### 5.3 Base progression

Outpost (crewed short stays, kit-deployed) → station (permanent, local power and ISRU) → spaceport (local assembly and launch) → colony (population and self-sufficiency targets, an endgame for the director).

## 6. Ties to the other documents

- **Economy (`03`)**: buildings are assets with upkeep and value; propellant plants and recovery change launch costs; leasing ground stations and pads to AI agencies; land prices and incentives.
- **Science (`04`)**: telescopes discover and pre-map; labs raise data levels; off-world labs and far-side radio telescopes.
- **Comms (`01`)**: ground dishes are network nodes placed by geography; base relay masts; local mission control removes delay.
- **Roles (`02`)**: the director chooses sites and budgets; the engineer designs pads and bases; the operator schedules launches around weather and range; the explorer founds the first outpost.
- **Missions and contracts**: "build a tracking station south of 30°S", "establish a polar launch site", "found an outpost at a confirmed ice deposit", "supply 10 t of propellant from the Moon".
- **Universe mode (`05`)**: in a custom system the same site picker works on any body.

## 7. Technical notes for Orbital

- **Terrain and flat zones.** Today the height function is built **around one launch site**: the biome map and the 5 km flat zone are generated relative to it, and `createTerrainField({ radius, latitude, longitude })` caches the map per site (about 0.3 s) (ADR 0043). Multiple or player-chosen sites need: (a) the global map generated independently of the site (seeded per world), and (b) a **list of flattening zones** (site centre, radius, blend) applied on top. The flat zone becomes data in the world save. Choosing a site on rough terrain = a larger blend (earthworks) at a cost.
- **Placement in the sim.** `placeOnSurface` already takes body-fixed latitude/longitude (ADR 0030), so launching from any site is a parameter. Pads are placement points with a footprint; their positions are world data.
- **Renderer.** The site is procedural modules merged into meshes (ADR 0030 point 5) and animated from the snapshot (ADR 0073). A building system means the site renderer is generated **from a list of placed buildings** (each a procedural generator kind, like part visuals, with an optional `.glb` asset as for mod parts, ADR 0076), rebuilt when the list changes. Instancing for repeated buildings; LOD by distance.
- **Buildings are not physics** (no colliders) at first, except pad blast-damage checks (distance test against debris impacts) and vessels standing on pads (already the ground tile).
- **Simulation.** Building construction, upkeep and production run on the world tick (`03`), deterministic and saved. Ground stations become comms nodes (`01`) with body-fixed positions, like surface rails.
- **Save format.** `World.sites[]`: `{ id, body, latitude, longitude, flatRadius, buildings: [{ id, kind, plot, level, rotation, builtAt, state }] }`, plus per-site resources. A version bump and migration, as the save rules require.
- **Mods.** A `defineBuilding({ id, size, levels: [{ cost, buildTime, upkeep, power, effects }], visual, provides })` registry, like parts: data-first, validated with zod; `provides` maps to typed capabilities (`launch-pad`, `comms-node`, `telescope`, `lab`, `storage`, `production`). A body definition can declare which building kinds are allowed (no greenhouse on a gas giant), and a mod can add new site layouts.
- **Pre-placed sites for content.** Stock and mod systems ship default sites (like KSP mods that add launch sites), so a player who does not want to build still gets a full center.

## 8. Open decisions for the human

1. Plots (simple, recommended) or free placement on a grid?
2. Site choice at world creation only, or expandable later in Career?
3. Range safety and booster drop zones as a hard rule, a cost, or off by default?
4. Weather: in or out of the first version?
5. Off-world bases: same building system (recommended) or a separate part-based approach (bases built from vessel parts, as KSP players do today)?
6. Does terrain generation move to a per-world seed independent of the site (needed for free site choice)?
