# 11 — Colonies, resources and interstellar

The "late game" that KSP2 was sold on: permanent off-world **colonies**, a multi-resource economy with **ISRU** (in-situ resource use), automated **delivery routes**, and **interstellar** ships with exotic propulsion and thrust under time warp. KSP1 had only a single-resource ISRU loop in stock, and mods filled the rest. KSP2 announced all of it but shipped almost none of it before development stopped. This document separates what existed, what was shown, and what the mods proved, as input for Orbital's ambition to make players feel like scientists, engineers *and* investors.

> **Status note.** KSP2 Early Access launched 24 Feb 2023. *For Science!* shipped 19 Dec 2023. The last patch (v0.2.2.0) shipped June 2024. Take-Two moved to close Intercept Games (reported May 2024, layoffs 28 Jun 2024), sold Private Division to an unnamed buyer in Nov 2024, and in Jan 2025 the label's games were reportedly taken over by former Annapurna staff. The game's development status is unknown [S1]. A volunteer continuation patch, **KSP2 Redux**, publishes its own roadmap without dates [S2]. Everything tagged **[KSP2 roadmap — never shipped]** below was announced only.

---

## 1. How it works

### 1.1 The KSP2 Early Access roadmap

**[KSP2 roadmap]** The public EA roadmap listed milestones in order: **For Science!** (shipped), then **Colonies**, **Interstellar**, **Resources** and **Multiplayer**, as staged rollouts after launch [S3][S4]. The creative director explained that colonies come before interstellar because colonies are where the **massive interstellar vessels get built** [S4]. Resources, not money, were meant to drive the Exploration campaign: you find and extract materials and move them between colonies to build new ships [S3][S4]. Multiplayer would come last, framed as building colonies with friends, with no combat [S3].

| Milestone | Status |
|---|---|
| Early Access base (sandbox, parts, time warp under thrust) | **[KSP2]** shipped Feb 2023 |
| For Science! (Exploration mode, tech tree, missions, science parts, heat) | **[KSP2]** shipped Dec 2023 |
| Colonies | **[KSP2 roadmap — never shipped]** |
| Interstellar | **[KSP2 roadmap — never shipped]** |
| Resources | **[KSP2 roadmap — never shipped]** |
| Multiplayer | **[KSP2 roadmap — never shipped]** |

In a March 2024 interview, the creative director reportedly said there would be "multiple updates before colonies", and declined to give a date. This is secondhand, from commenters summarising the video [S5].

### 1.2 Colonies (KSP2, announced)

**[KSP2 roadmap — never shipped]** What was publicly described across dev diaries, interviews and wiki compilations [S3][S4][S6][S7]:

- **Colony parts.** A separate class of building parts: roads, glass domes, power generators, resource factories, habitation, and **vehicle assembly buildings**, so a colony can build and launch ships locally [S7].
- **Placement.** Colonies on planetary surfaces *and in orbit* ("orbital and planetary colonies") [S1].
- **Bootstrapping.** Colonies were described as bootstrapping themselves: they extract resources, build their own vehicles, and launch them, including the interstellar ships [S4][S6].
- **Heat and power.** The Colonies milestone was planned to introduce basic part heat management and radiators, with fuller thermal management later [S6].
- **Population and habitation.** "Habitation modules" were in the planned feature set [S1]. Kerbal population growth in colonies was discussed in press previews, but the public mechanics were never specified *(not verified in this pass)*.

### 1.3 Delivery routes

**[KSP2 roadmap — never shipped]** The automation layer: after you fly a cargo mission once, the game can **repeat it as a route**, crediting and debiting resources between origin and destination based on the trip's duration. Launch windows were "maybe later" [S6]. Rovers could also run local routes [S7]. The point was to remove repetitive resupply flights once the player had proven the route.

**[KSP2 Redux plan]** Redux's own roadmap keeps the idea: Stage 1.1 Orbital Colonies, 1.2 Planetary Colonies (with a resource-production-focused "Frontier" mode and a colony UI for resources, power and heat), 1.3 **Supply Routes** and environmental heat, then Stage 2 Interstellar starting with the Debdeb system, then Stage 3 multiplayer with a shared agency. It has no dates and its current phase is bug fixing [S2].

### 1.4 Resources and ISRU

**[KSP1]** (stock since 1.0, 2015) is a **single-resource** loop [S8][S9]:

| Element | Mechanic |
|---|---|
| **Ore** | One generic resource with a **concentration** that varies by location (body, biome, spot). Asteroids contain Ore too. |
| **Surveying** | Orbital survey scanner (polar orbit; reveals a body-wide concentration overlay), narrow-band scanner (local precision), and a surface scanning module on landers. |
| **Drills** | Small and large drills extract Ore at a rate scaled by concentration. Drills produce **core heat** that must be removed by radiators. A large drill makes about 100 kW of core heat according to a bug report [S9]. |
| **Converters** | Convert-O-Tron **125** (small, inefficient: about 10 Ore → 2 fuel) and **250** (large: about 1 Ore → 2 fuel) turn Ore + EC into LiquidFuel, Oxidizer, Monoprop or XenonGas [S8]. |
| **Crew skill** | An **Engineer** raises drill and converter efficiency by star level. One guide estimates converting a full ore tank takes about 3.5 h with a 0-star engineer against about 40 min with a 5-star [S8]. |
| **Off-screen** | Converters on unloaded vessels "catch up" when loaded, without EC or cooling checks [S8]. |

The loop is: survey from orbit → land at a high-concentration spot → drill, convert and refuel → fly on. It is a refuelling mechanic, not an economy.

**[KSP2]** Shipped resources were only the propellants, EC and (from For Science!) science data and samples. **No ISRU, mining or Ore shipped** [S10].
**[KSP2 roadmap — never shipped]** A multi-resource system, with the game's resource definitions built for it (Developer Insights #13 described the data-driven resource architecture) [S11]. Planned late-game propellants included **metallic hydrogen** (fan-reported) and **uranium and other ores** for nuclear engines (fan-compiled lists) [S11]. No official full list was ever published.

### 1.5 Interstellar

- **[KSP2] Time warp under thrust ("persistent thrust") shipped at EA launch.** The press release promised "time warp under acceleration" for long burns (for example ion engines) [S12]. EA players reported bugs where fuel drained under warp but the orbit did not change, and later low-thrust probes not accelerating while a maneuver node existed [S12]. This was the one interstellar-enabling system that actually shipped.
- **[KSP2]** A new, larger part-size class shipped at launch, described as making room for future interstellar-class parts [S13].
- **[KSP2 roadmap — never shipped]** Propulsion: wiki lists of "confirmed planned parts" include **metallic hydrogen engines, nuclear pulse (Orion-style), nuclear saltwater, fusion and antimatter** engines [S13]. Marketing described "fusion-powered megaships" crossing to other stars [S12]. Target systems included Debdeb, Ovin and Rask/Rusk (see `10-celestial-bodies-and-world.md`).
- **The intended chain:** colony mines exotic resources → colony VAB builds a megaship → persistent thrust over years of game time → new system → new colony.

### 1.6 KSP1 mod prior art

| Mod | What it proved |
|---|---|
| **[Mod: USI MKS / USI-LS]** Modular Kolonization System | Full colony economy: life support (supplies, mulch, habitation time), many-tier resource chains (ore → metals → MaterialKits / SpecializedParts), "kolonization" bonuses for staying, and a **planetary logistics warehouse** that shares resources between bases on the same body without flying them. It also redirects Extraplanetary Launchpads construction to use MaterialKits [S14]. Players report that logistics only refresh when vessels are visited, and that converters further than about 2 km away do not run live [S14]. |
| **[Mod: Extraplanetary Launchpads (EL)]** | Build vessels **off Kerbin**: mine Ore → smelt Metal → make RocketParts → build a craft at an off-world launchpad or orbital dock. This is the mechanic KSP2's colony VAB was meant to be [S14]. |
| **[Mod: Kerbal Planetary Base Systems (KPBS)]** | A coherent kit of modular base parts (habs, labs, greenhouses, connectors). It proved that *base-specific part design* matters for the colony feel and pairs with MKS [S14]. |
| **[Mod: Pathfinder (WildBlue Industries)]** | Inflatable, **reconfigurable** base modules (swap a module's role by "template") plus prospecting and geoscience. It showed how to give colony parts flexibility without a huge part count *(features from general knowledge; mod page not fetched)*. |
| **[Mod: Kerbalism]** | Background simulation of **all** vessels: life support (food, water, oxygen), radiation and shielding, stress and comfort, component reliability, and science data produced and transmitted over time. It is **incompatible with MKS** [S14][S15]. |
| **[Mod: TAC Life Support]** | Simple food, water, oxygen and EC consumption with death timers. Forum-reported defaults: 360 h without food, 36 h without water, 2 h without oxygen or EC [S16]. |
| **[Mod: KSP Interstellar Extended (KSPIE)]** | Fusion and antimatter reactors, thermal and plasma engines, **beamed power**, and difficult antimatter production and storage. It shows that interstellar tech is mostly a *power and heat economy* problem [S17]. |

---

## 2. Player experience

- **KSP1 stock ISRU** feels good once: the first refuel on Minmus is a milestone. After that it becomes a chore of drills, heat and waiting.
- **KSP1 colony mods** create the most devoted long-term saves (MKS bases on Duna running for hundreds of in-game years), but they are learned through wiki pages, spreadsheets and compatibility tables. Their depth has a steep entry cost.
- **KSP2 players** bought the game for colonies and interstellar travel, and those never arrived. The reception of the shutdown (review-bombing in 2024) is largely about that gap [S1].
- **Persistent thrust** in KSP2 was a real quality-of-life win for ion probes when it worked, and a source of frustration when it silently didn't [S12].

---

## 3. Interactions with other systems

- **Game structure** (`01-game-structure-and-modes.md`): a colonies or "Frontier"-style mode is a different progression from science or career.
- **Space center** (`02-space-center-and-buildings.md`): colonies are additional sites with their own buildings, and a colony VAB.
- **Vehicle assembly** (`03-vehicle-assembly.md`): build at a site from local resources. The parts catalogue depends on what the site can produce.
- **Flight** (`04-flight-and-controls.md`): thrust under warp, landing at colony pads, rovers.
- **Science** (`05-science-and-research.md`): resource surveys as science, and discoverables as colony sites.
- **Economy** (`07-economy-and-career.md`): resources versus money, supply-route profitability, investments.
- **Crew** (`08-crew.md`): habitation, life support, engineer bonuses, colonists.
- **Comms** (`09-communications-network.md`): colonies as ground stations or control points. Interstellar latency.
- **World** (`10-celestial-bodies-and-world.md`): resource maps per body, other star systems, background simulation.
- **Modding** (`12-modding.md`): the community resource packs (CRP) that let MKS, Kerbalism and others share resource names.

---

## 4. Known problems / criticism

1. **Overpromise [KSP2]:** colonies, resources, interstellar and multiplayer were the pitch, and none shipped [S1][S3].
2. **Wrong order? [KSP2]** Building colonies first and interstellar second made sense on paper, but EA spent a year on stability and science first. The late-game loop was never testable [S5].
3. **Stock ISRU is a refuel button [KSP1]:** one resource, no economy, no reason to come back.
4. **Mod depth versus legibility [KSP1 mods]:** MKS-level chains are rich but opaque. Logistics that only update when vessels are visited break the illusion of a living colony [S14].
5. **Mod incompatibility [KSP1]:** Kerbalism versus MKS, TAC versus USI-LS, and so on. Every mod invented its own life support and resources, which fragmented the ecosystem [S14][S15].
6. **Persistent-thrust bugs [KSP2]** undermined confidence in the core interstellar mechanic [S12].
7. **No background simulation in stock [KSP1]:** converters "catch up" without EC or cooling [S8], so off-screen bases are either free or frozen.

---

## 5. Implications for Orbital

Orbital's foundations: a deterministic fixed-timestep sim with float64 SI, on-rails Kepler propagation, a sandboxed kOS-like scripting runtime, runtime mods with `defineResource` / `defineModule` / `defineBody`, and a CONCEPT that already plans extra **sites/colonies** per World. Not built yet: crew, science, economy, contracts, comms.

1. **Adopt** KSP1's survey → drill → convert loop as the *first* ISRU slice: `defineResource('ore')`, a concentration field per body (a pure function of lat/lon and seed), a scanner module, a drill module and a converter module. It is small, testable and immediately playable at the home moon.
2. **Improve** to **several resources from day one of ISRU** (for example water ice, regolith metals, volatiles) defined by the stock mod through `defineResource`, with **recipes as data** (`defineRecipe({ in, out, power, heat, rate })`). The stock content stays small, but the engine is multi-resource. That is the step KSP2 never shipped.
3. **Adopt** a **shared resource vocabulary** in the SDK (stock-defined base resources that mods extend), to avoid KSP1's fragmentation into competing life-support and resource packs.
4. **Improve** with **background simulation in closed form**: each site or vessel's production is `rates × Δt`, capped by storage and power (solar flux from the orbit or lat/lon). Applied on load *and* during warp, deterministically. No KSP1 "catch-up without power" exploit, and no MKS-style "only updates when visited".
5. **Adopt** delivery routes, but **from recorded, scripted flights**. A route is a flown mission plus its script, and once completed it is repeated abstractly (duration from the flight, cost from the propellant used, risk from margins). Orbital's scripting sandbox makes this natural: "an automated freighter is a script you proved once".
6. **Improve** with routes that respect **launch windows and transfer geometry** from the patched-conic solver (KSP2 deferred this [S6]). This is where Orbital can be more dynamic: supply rhythm follows planetary alignments.
7. **Adopt** colonies as **sites** (the CONCEPT's "Site: Space Center, later other bases/colonies"): a site has buildings, storage, power and a ground station, and can host a VAB once it can produce parts. Model it in the SDK as `defineSite` plus building modules, so the stock space center is just the first site.
8. **Improve** with orbital stations that can be promoted to sites (dock enough modules and it becomes an assembly yard), which matches KSP2's orbital colonies and Extraplanetary Launchpads' orbital docks.
9. **Avoid** opaque mod-style production chains. Show each site's flows in one Sankey-like panel (inputs, outputs, bottleneck, days of reserves). Legibility is the difference between MKS fans and everyone else.
10. **Improve for investors**: sites and routes are **assets** with capex, opex, throughput and value. Players can fund a mining site, sell or lease its output, and see ROI over game years. Resource prices can come from demand at sites. This makes "investor" a real role, not a currency counter.
11. **Adopt** life support only as an optional world rule (Off / Simple TAC-like / Full Kerbalism-like), with crew in mind (`08-crew.md`). Keep it deterministic and visible in the crew chips.
12. **Adopt** **thrust under warp** for low-thrust engines in Orbital's propagator: integrate constant-thrust arcs in the sim worker (fixed-step with larger steps at high warp, or analytic approximations), with an explicit, tested rule for when warp is allowed. **Avoid** KSP2's failure mode: show predicted versus actual orbit change, and never drain fuel without applying Δv.
13. **Avoid** promising interstellar travel early. Make it a **mod-level capability** first: a second star system loaded as a World package (see `10-celestial-bodies-and-world.md`), fusion and antimatter engines as mod parts, and persistent thrust as core. Then the stock game can claim it once the pieces exist.
14. **Improve** with interstellar as a *power, heat and economy* problem, not just a big engine (the KSPIE lesson). Exotic fuels are produced at colonies over game years. This ties the end-game back to resources and investment and gives colonies a reason to exist.
15. **Avoid** KSP2's roadmap ordering trap: ship each late-game layer as a thin vertical slice (one resource, one site, one route) before widening, so the full loop is playable and testable early.

---

## Sources

- [S1] Wikipedia — "Kerbal Space Program 2". https://en.wikipedia.org/wiki/Kerbal_Space_Program_2 — checked 2026-10-17 — encyclopedia (well-cited secondary). Dates, planned features, Private Division sale, reception.
- [S2] KSP2 Redux — Roadmap. https://ksp2redux.org/roadmap/ — checked 2026-10-17 — independent fan continuation (describes its own plans; not official).
- [S3] Search compilation of EA-launch coverage: PC Gamer "Kerbal Space Program 2: Everything we know", GameSpot "KSP2's multiplayer will let you have full-on space races", Epic Games Store "KSP2 Early Access FAQ". https://www.pcgamer.com/kerbal-space-program-2-release-date-multiplayer-everything-we-know/ ; https://www.gamespot.com/articles/kerbal-space-program-2s-multiplayer-will-let-you-have-full-on-space-races/1100-6511655/ ; https://store.epicgames.com/en-US/p/kerbal-space-program-2--early-access-faq — checked 2026-10-17 — games press and official store FAQ, via search excerpts.
- [S4] PC Gamer — "Kerbal Space Program director explains why 'colonies are going to change everything,' lays out early access plans" (2023). https://www.pcgamer.com/kerbal-space-program-director-explains-why-colonies-are-going-to-change-everything-lays-out-early-access-plans/ — checked 2026-10-17 — games press interview (body not fetchable; via search excerpts).
- [S5] Steam Community — "KSP 2's Creative Director talks Colonies - Interview with Nate Simpson" (13 Mar 2024). https://steamcommunity.com/app/954850/discussions/0/4297069185835056858/ — checked 2026-10-17 — topic list plus player summaries (secondhand; low–medium).
- [S6] KSP Forum — "The Comprehensive Colony Communications Archive" and "Delivery Routes and Physics". https://forum.kerbalspaceprogram.com/topic/224423-the-comprehensive-colony-communications-archive/ ; https://forum.kerbalspaceprogram.com/topic/210678-delivery-routes-and-physics/ — checked 2026-10-17 — community archive quoting dev diaries and streams (medium–high), via search excerpts (direct fetch 403).
- [S7] KSP2 Fandom wiki — "Colonies", and KSP Wiki "KSP2" planned-parts list. https://kerbal-space-program-2.fandom.com/wiki/Colonies ; https://wiki.kerbalspaceprogram.com/wiki/KSP2 — checked 2026-10-17 — community wikis (secondhand), via search excerpts.
- [S8] KSP Wiki — "Convert-O-Tron 250" and "ISRU". https://wiki.kerbalspaceprogram.com/wiki/Convert-O-Tron_250 ; https://wiki.kerbalspaceprogram.com/wiki/ISRU — checked 2026-10-17 — official community wiki, via search excerpts. Engineer timing comes from a community guide quoted there (medium).
- [S9] KSP bug tracker — Bug #10099 (Convert-O-Tron 250 and radiator heat), plus KSP Forum "How does the Convert-O-Tron 250 work". https://bugs.kerbalspaceprogram.com/issues/10099 ; https://forum.kerbalspaceprogram.com/topic/158947-how-does-the-convert-o-tron-250-work — checked 2026-10-17 — bug report and forum (medium).
- [S10] kerbal.wiki — "0.2.0.0" (For Science! release notes summary). https://kerbal.wiki/0.2.0.0 — checked 2026-10-17 — community KSP2 wiki mirroring official notes (no ISRU, resource or colony items).
- [S11] Kerbal Space Program — "Dev Diaries: Developer Insights #13 – KSP2 Resource System" (URL now 404), plus KSP Forum threads "Questions/thoughts about late-game resources in KSP 2" and "KSP2 Resources open workshop". https://kerbalspaceprogram.com/news/dev-diaries-developer-insights-13-ksp2-resource-system ; https://forum.kerbalspaceprogram.com/topic/202817-questions-thoughts-about-late-game-resources-in-ksp-2 — checked 2026-10-17 — official dev diary (known only via search excerpt) and fan threads (low).
- [S12] Business Wire — "Kerbal Space Program 2 to Launch in Early Access on February 24 2023", plus KSP Forum "Orbit does not change with engine running in time warp" and "My low thrust probe in Jool orbit is cursed". https://businesswire.com/news/home/20221021005039/en/Kerbal-Space-Program-2-to-Launch-in-Early-Access-on-February-24-2023/ ; https://forum.kerbalspaceprogram.com/topic/213724-orbit-does-not-change-with-engine-running-in-time-warp ; https://forum.kerbalspaceprogram.com/topic/223661-my-low-thrust-probe-in-jool-orbit-is-cursed — checked 2026-10-17 — official press release (high) and player bug reports (medium).
- [S13] KSP Wiki — "KSP 2 parts" (planned engine classes), and Take-Two investor PDF (new part size class for interstellar). https://wiki.kerbalspaceprogram.com/wiki/KSP_2_parts ; https://ir.take2games.com/node/29461/pdf — checked 2026-10-17 — community wiki (planning list, partly file-mined) and official investor release, via search excerpts.
- [S14] KSP Forum — "[1.12.x] Modular Kolonization System (MKS)" thread pages, "MKS guide", and SpaceDock "RocketParts Logistics". https://forum.kerbalspaceprogram.com/topic/154587-112x-modular-kolonization-system-mks ; https://forum.kerbalspaceprogram.com/topic/196934-mks-guide ; https://spacedock.info/mod/4334/RocketParts%20Logistics — checked 2026-10-17 — mod threads and mod page (medium), via search excerpts.
- [S15] GitHub — Kerbalism/Kerbalism. https://github.com/Kerbalism/Kerbalism — checked 2026-10-17 — mod README (v3.43, KSP 1.12; high for the mod).
- [S16] KSP Forum — "[1.0.5] TAC Life Support" thread. https://forum.kerbalspaceprogram.com/topic/37449-105-tac-life-support-v01121-12dec — checked 2026-10-17 — mod thread (medium; old version), via search excerpt.
- [S17] GitHub — FractalUK/KSPInterstellar wiki, plus KSPIE development threads. https://github.com/FractalUK/KSPInterstellar/wiki ; https://forum.kerbalspaceprogram.com/topic/161531-ksp-interstellar-extended-continued-development-thread — checked 2026-10-17 — mod wiki and forum (medium), via search excerpts.
