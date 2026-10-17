# 10 — Celestial bodies and the world

The places the player flies to and the rules for how the world exists over time: the Kerbol system's bodies and their scale, biomes and points of interest, the calendar, asteroids and comets, anomalies, and how the game keeps a whole solar system alive in a save file (on-rails vessels, physics range, packed and unpacked vessels). It also covers what KSP2 changed (terrain and visuals, "discoverables") and the interstellar systems it announced but never shipped. Orbital today has a Kerbin-scale home planet (~600 km) with one moon, lake-bearing terrain, patched conics and a save format. Its UI concept makes the **star system a World choice**. This document is about which parts of KSP's world design are worth copying.

> **Status note.** KSP2 Early Access launched 24 Feb 2023. *For Science!* (19 Dec 2023) added science regions and discoverables. The last patch was v0.2.2.0 in June 2024, and Intercept Games was laid off on 28 Jun 2024 [S8]. All other star systems are **[KSP2 roadmap — never shipped]**.

> **Source caveat.** The official KSP wiki blocks automated fetches and the Fandom wikis ask for payment. Body data was read from search excerpts of wiki pages. Rows marked † are standard community values that I could not re-check in this pass. Treat them as likely but unverified.

---

## 1. How it works

### 1.1 Scale and the Kerbol system

**[KSP1]** The stock system is **Kerbol** (a star), **5 planets, 2 dwarf planets** and their moons [S1]. Radii were hand-picked at roughly **one tenth** of their real counterparts for Moho, Eve, Kerbin, Duna and Jool [S1]. Surface gravity, however, is kept near real values (Kerbin 9.81 m/s²). To make that work, bodies are implausibly dense: Kerbin has μ = 3.5316 × 10¹² m³/s² [S2]. The result: orbital speed at Kerbin is about 2.3 km/s instead of 7.8 km/s, low-orbit Δv is about 3.4 km/s, and a full career fits inside a few hundred hours.

| Body | Parent | Radius | Surface g | Atmosphere | Notes |
|---|---|---|---|---|---|
| Kerbol | — | 261,600 km [S3] | 17.1 m/s² [S3] | 600 km "corona" atmosphere [S3] | Star |
| Moho | Kerbol | 250 km [S4] | ~0.27 g [S4] | none | Mercury analogue, innermost, no moons |
| Eve | Kerbol | 700 km [S4] | ~1.7 g [S4] | thick (~90 km, ~5 atm †) | Venus analogue; hardest return trip in the game |
| Gilly | Eve | 13 km [S4] | ~0.005 g [S4] | none | Captured asteroid, eccentric and inclined orbit |
| **Kerbin** | Kerbol | **600 km** [S2] | **9.81 m/s²** [S2] | 70 km †, 1 atm, oxygen | Home. Sidereal day 21,549.425 s, year 9,203,545 s [S2] |
| Mun | Kerbin | 200 km † | 1.63 m/s² [S5] | none | SMA 12,000 km, period 138,984 s, μ 6.5138398 × 10¹⁰ [S2] |
| Minmus | Kerbin | 60 km † | ~0.49 m/s² † | none | Small icy moon, inclined orbit, flat "frozen lake" plains [S5] |
| Duna | Kerbol | 320 km [S4] | ~0.3 g [S4] | thin (~50 km †) | Mars analogue, polar caps |
| Ike | Duna | 130 km [S4] | 1.1 m/s² [S4] | none | Tidally locked to Duna [S5] |
| Dres | Kerbol | 138 km † | lowest of the planets [S5] | none | Ceres analogue, ring of debris, eccentric and inclined orbit [S5] |
| Jool | Kerbol | 6,000 km [S4] | ~0.8 g [S4] | deep, no surface | Gas giant, 5 moons [S4] |
| Laythe | Jool | 500 km † | ~0.8 g † | yes, oxygen | Ocean moon. The only body besides Kerbin with oceans and oxygen [S1][S4] |
| Vall | Jool | 300 km † | above the Mun's [S5] | none | Icy |
| Tylo | Jool | 600 km (same size as Kerbin) [S5] | ~0.8 g [S5] | none | Largest airless lander challenge in the game |
| Bop | Jool | 65 km † | about Minmus [S5] | none | Possibly captured |
| Pol | Jool | 44 km † | second-lowest [S5] | none | Tiny SOI |
| Eeloo | Kerbol | 210 km † | about 3.5 % above the Mun's [S5] | none | Pluto-like outer dwarf planet |

The design pattern **[KSP1]** is that each body is a **distinct skill test**. Eve tests ascent from a thick atmosphere. Tylo tests powered landing in high gravity with no air. Gilly tests very low-g docking and landing. Laythe tests air-breathing on another world. Jool tests aerocapture and gravity assists. Minmus is the forgiving early target.

### 1.2 Time and calendar

**[KSP1]** By default, the clock uses a **6-hour day** (21,600 s, the *solar* day; the sidereal rotation is 21,549.425 s) and a **426-day year** (9,203,545 s ÷ 21,600 ≈ 426.08) [S2]. One wiki page lists the rotation as exactly 21,600 s, which conflates the solar and sidereal day [S2]. A settings toggle switches the display to Earth time (24 h days, 365 d years), but the physics do not change. **[KSP2]** uses the same Kerbin day and year.

### 1.3 Biomes, science regions and discoverables

- **[KSP1]** Each body has a **biome map** (a coloured texture lookup by lat/lon): Kerbin's grasslands, highlands, shores and so on, plus mini-biomes at KSC buildings. Science = base value × body/situation multiplier × biome, with diminishing returns per repeat (see `05-science-and-research.md`). This is what makes "landing somewhere new" worth doing.
- **[KSP2]** For Science! simplified this. Most science is tied to the whole body plus situation, and biome-level science applies mainly when **landed** or taking samples [S6]. Biomes became **science regions**, and named landmarks became **discoverables**: unique points of interest in three groups (geographical features, monuments tied to the story, and "specials"/Easter eggs). Each has **its own region and science multiplier**, and every terrestrial body has **at least two** [S6]. Examples on Moho: the "MoHeart" at the bottom of the Mohole and a temple-like "Lost Center". On the Mun: the arches carried over from KSP1, and Snowcone Glacier as a non-discoverable unique region [S6].

### 1.4 Anomalies and Easter eggs

**[KSP1]** Hand-placed **anomalies** (Mun arches and monoliths, the Duna "face" and pyramid, hidden objects on several bodies) are found with the naked eye or narrow-band scanners. They give no special mechanics, only discovery value, but they drive the exploration community. **[KSP2]** turned them into the discoverables system with science value and story hooks ("monuments") [S6].

### 1.5 Asteroids and comets

**[KSP1]** Asteroids (added in the 2014 Asteroid Redirect Mission tie-in) spawn on Kerbin-crossing trajectories. They come in size classes, are tracked from the Tracking Station, can be grappled with the "Klaw", mined for Ore, and towed. **Comets** (added in 1.10, 2020) have visible tails and their own science. Both are **procedurally spawned, transient objects**: they appear, have a discovery or tracking lifetime, and vanish if untracked. **[KSP2]** did not ship asteroids or comets by v0.2.2 *(not verified against every patch note)*.

### 1.6 Terrain: procedural versus handcrafted

**[KSP1]** **PQS (Procedural Quad Sphere)**: each body is a cube-sphere quadtree whose height is a **base heightmap texture plus stacked procedural noise modifiers**, with optional hand-placed "city" objects (KSC, anomalies, launch sites) and procedural scatter (rocks, trees). It is deterministic, cheap to store and mod-friendly. Kopernicus and other planet mods are a whole ecosystem built on it (see `12-modding.md`).
**[KSP2]** Rebuilt terrain and rendering for the **same Kerbol system**, with higher-detail terrain, new surface shaders and atmosphere and cloud visuals. Reviewers who disliked the game's performance still praised its graphics [S8]. Real weather was absent in both games: there is no wind, rain or dynamic cloud gameplay *(absence inferred; no source documents weather as a feature)*.

### 1.7 How the world persists

- **[KSP1]** The whole universe lives in **`persistent.sfs`** (plus `quicksave.sfs`) inside the save folder. It is a text "ConfigNode" tree with every vessel, its orbit or landed position, crew, resources, contracts and science [S9]. A vessel that is not near the active one is **on rails**: just an orbit (Keplerian elements) or a surface position. Nothing is simulated except propagation along that orbit. **Background processing does not exist in stock** (for example, solar charging of unloaded probes is not simulated), except for special cases such as ISRU converters catching up when a vessel is loaded again (`11-colonies-resources-interstellar.md`).
- **[KSP1] Physics range.** Around the active vessel, other vessels go through four distance-gated states per situation (landed, flying, orbit, and so on): **load** (parts exist) → **unpack** (physics on), and back **pack** → **unload**. The kOS docs list the four thresholds per situation [S10]. Players commonly quote **~2.5 km** as the range where nearby vessels are fully simulated [S11]. The often-cited "2.3 km" is an older or rounded figure *(exact defaults not verified)*. Packed vessels are visible but frozen. Script mods can tell the two apart [S10].
- **[KSP1] Consequences.** Atmospheric debris outside physics range is deleted. Stages cannot be recovered after separation unless a mod (StageRecovery and others) simulates them. Time warp above 4× (physics warp) puts everything on rails, so **no thrust under warp**.
- **[KSP2]** Saves are **JSON**, one folder per campaign with multiple save files, and craft are stored as separate JSON files with metadata [S9][S12]. Bloat was a known issue: a mod exists to prune event logs that grew saves to hundreds of MB [S12]. KSP2 allowed **time warp under thrust** (see `11-colonies-resources-interstellar.md`), so on-rails propagation had to handle constant-thrust arcs [S13].

### 1.8 KSP2's interstellar systems (announced only)

**[KSP2 roadmap — never shipped]**
- **Debdeb**: the first system planned for the Interstellar milestone. The fan continuation KSP2 Redux still plans to start interstellar with Debdeb [S14].
- **Ovin**: a ringed super-Earth with crushing gravity, shown in trailers [S7].
- **Rask & Rusk**: a tight **binary planet pair** so close that tides pull them apart, shown in pre-alpha imagery and trailers [S7].
- **Glumo, Qeg, Tuun** and others: names found in game files or on fan wikis, not officially presented. Treat them as speculation [S7].
- Interstellar travel was pitched as "fusion-powered megaships" [S13]. No other star was ever reachable in a shipped build.

---

## 2. Player experience

- **The system is a curriculum [KSP1].** The Mun, then Minmus, then Duna/Ike, then Eve/Gilly or Jool's moons. Each new body teaches one new skill, and players remember them as characters (the "Mun arches", the "Eve trap", the "Tylo landing"). This difficulty ladder is KSP's best world design.
- **Scale makes it a game.** 600 km Kerbin makes orbit a ~10-minute flight and makes interplanetary trips weeks of game time compressed by warp. Real-scale mods (RSS) exist for the minority that wants pain.
- **Discovery is underpowered [KSP1].** Anomalies are fun to find but give nothing. KSP2's discoverables fixed this with science value, and players responded well to "places to go" [S6].
- **The world is static.** No weather, no seasons that matter, no events except asteroids and comets. Once mapped, a body is "done".
- **On-rails is invisible until it bites:** stages vanish, probes don't charge in the background, and landed vessels jitter or explode when loaded ("Kraken" bugs).

---

## 3. Interactions with other systems

- **Game structure** (`01-game-structure-and-modes.md`): the star system is fixed per save in KSP. Orbital makes it a World choice.
- **Flight** (`04-flight-and-controls.md`): physics range, packing, time warp, SOI changes, atmosphere, re-entry.
- **Science** (`05-science-and-research.md`): body and situation multipliers, biomes, discoverables.
- **Missions and contracts** (`06-missions-contracts-achievements.md`): "plant a flag on X", survey contracts at waypoints, asteroid redirect.
- **Comms** (`09-communications-network.md`): bodies occlude links. SOI geometry drives relay placement.
- **Colonies and resources** (`11-colonies-resources-interstellar.md`): resource maps per body, colony sites, other star systems.
- **Modding** (`12-modding.md`): Kopernicus planet packs (OPM, RSS, JNSQ) are among the most popular KSP mods.
- **UI** (`13-ui-ux-patterns.md`): Tracking Station, map view, KSP2 "Kerbolar system" encyclopedia.

---

## 4. Known problems / criticism

1. **Unrealistic density** is invisible to most players, but real-scale fans need mods, and science-minded players notice that orbital periods do not match physics intuition.
2. **Static world**: no weather, no surface hazards beyond terrain, no events. Bodies are "solved".
3. **Physics range and on-rails seams [KSP1]**: debris deletion, no background resources, packing glitches and loading explosions. KSP2 kept the seams and added new ones (orbit decay bugs under warp in Early Access) [S13].
4. **Save bloat [KSP2]**: JSON saves growing to hundreds of MB [S12].
5. **Empty promises [KSP2]**: new star systems were the game's headline pitch, and none shipped [S7][S8].
6. **Biomes were opaque [KSP1]**: biome borders were invisible without mods, and KSP2 simplified per-biome science away for orbiters [S6].

---

## 5. Implications for Orbital

Orbital has: float64 SI, fixed-timestep deterministic sim, Kepler on rails with patched conics, body hierarchy and SOI frames (ADR 0051), surface-fixed rails (ADR 0024), debris lifecycle under warp (ADR 0021), one height function in core with lakes (ADR 0043, plan 038), terrain kind per body (ADR 0067), save format and resume (ADR 0050), and stock as a mod using `defineBody`.

1. **Adopt** the ~1/10 scale with real-ish surface gravity. It already matches Orbital's home planet, and it is what makes the game playable in a browser session.
2. **Adopt** "each body is a skill test" as the authoring rule for stock bodies. Document in `defineBody` metadata which skill a body teaches (thick-air ascent, high-g airless landing, micro-g), and use it for tutorials and mission generation.
3. **Improve** with the **star system as World data**: a `defineSystem({ star, bodies, groundStations, sites, calendar })` package selectable at world creation, which the CONCEPT's World card already implies. Stock ships one small system, and mods ship more. This makes "new star systems" a modding feature rather than a promise.
4. **Adopt** the KSP calendar as a *system property* (`calendar: { dayLength: solar day of home, yearLength }`), displayed from the home body's actual rotation and orbit, with an Earth-time display option.
5. **Improve** on biomes: define **regions as data** (polygon or texture per body via `defineBody`) and draw them in the map on demand. Every region has a science multiplier and resource hints, which avoids KSP1's invisible borders.
6. **Adopt** KSP2's discoverables as **points of interest** with coordinates, a region, a science multiplier and an optional lore or mission hook. They are cheap to author, mod-friendly and drive "places to go".
7. **Improve** with dynamic world events: **asteroids and comets as deterministic seeded spawns** (seed = world seed + epoch), so two players with the same World see the same comet. They are trackable in the Mission Center and become science, resource and investor targets (mining rights).
8. **Adopt** the KSP1 split between "loaded" and "packed" only where needed. Orbital's single sim worker can simulate every vessel at a coarse rate. **Improve** with **background simulation for resources and power** on rails (solar flux × time, consumption × time). Kerbalism shows players want it, and deterministic closed-form updates make it cheap.
9. **Avoid** deleting atmospheric debris silently. Orbital's debris lifecycle (ADR 0021) should keep making debris fate explicit (burn-up, crash or impact report), which also feeds an insurance or "investor" angle.
10. **Avoid** KSP2's save bloat. Keep saves as compact state (orbits, part graphs, resources), never event logs. Version and migrate them per ADR 0050.
11. **Improve** with light, deterministic **weather and environment** later: seasonal ice coverage of lakes, dust storms on a Duna-like world, or wind bands as a function of time and position. Pure functions of sim time keep determinism. This is where Orbital can be "more dynamic than KSP2".
12. **Adopt** procedural-plus-handcrafted terrain (already the direction with one core height function): procedural noise for scale, with authored landmarks or "cities" (launch sites, anomalies) as data in the body definition.
13. **Avoid** headline promises like named interstellar systems before the tech supports them. If Orbital teases them, ship one other system as a mod first, to prove multi-system Worlds.
14. **Improve for scientists** with a body encyclopedia that shows *measured* data. Values (gravity, atmosphere profile, rotation) start as unknown or estimated and are filled in by experiments and observations, so the player "discovers" the table above rather than reading it.

---

## Sources

- [S1] KSP Wiki — "Kerbol System". https://wiki.kerbalspaceprogram.com/wiki/Kerbol_System — checked 2026-10-17 — official community wiki, via search excerpts (direct fetch blocked).
- [S2] KSP Wiki — "Kerbin" and "Mün" pages (μ, rotation, orbital period, Mun SMA and period), plus the Fandom "Kerbin" page (21,600 s rotation discrepancy). https://wiki.kerbalspaceprogram.com/wiki/Kerbin ; https://wiki.kerbalspaceprogram.com/wiki/Mün ; https://kerbalspaceprogram.fandom.com/wiki/Kerbin — checked 2026-10-17 — community wikis, via search excerpts.
- [S3] KSP Wiki — "Kerbol" (radius, gravity, atmosphere height). https://wiki.kerbalspaceprogram.com/wiki/Sun — checked 2026-10-17 — official community wiki, via search excerpts.
- [S4] Search-excerpt compilation from KSP wiki "Planets and Moons" and "Solar systems" pages and avans.github.io KSP showcase pages. https://kerbalspaceprogram.fandom.com/wiki/Planets_and_Moons ; https://avans.github.io/Webdictaat/showcase/ksp/planets/jool.html — checked 2026-10-17 — community wikis and a fan page (medium; one table had a wrong Duna radius, which I excluded).
- [S5] GamePretty — "Kerbal Space Program: All Planets & Moons Guide". https://gamepretty.com/kerbal-space-program-all-planets-moons-guide/ — checked 2026-10-17 — community guide (Steam-guide mirror; qualitative facts only, low–medium).
- [S6] KSP Wiki — "KSP 2 Discoverables", and KSP Forum / Steam threads on KSP2 science regions. https://wiki.kerbalspaceprogram.com/wiki/KSP_2_Discoverables ; https://kerbal.wiki/Discoverables — checked 2026-10-17 — community wikis, via search excerpts (medium).
- [S7] KSP Wiki — "Rask", "Qeg System", "Tuun System", "KSP2"; PowerUp! Gaming "KSP2 ... Interstellar Travel" (2020). https://wiki.kerbalspaceprogram.com/wiki/Rask ; https://wiki.kerbalspaceprogram.com/wiki/Qeg_System ; https://powerup-gaming.com/2020/01/17/kerbal-space-program-2-is-going-to-take-you-to-new-places-with-interstellar-travel/ — checked 2026-10-17 — wikis (file-mined names are speculative) and games press.
- [S8] Wikipedia — "Kerbal Space Program 2". https://en.wikipedia.org/wiki/Kerbal_Space_Program_2 — checked 2026-10-17 — encyclopedia (secondary, well-cited).
- [S9] Reddit r/KerbalSpaceProgram "KSP 1 vs KSP 2" comments (save formats), via redlib mirror. https://redlib.hackliberty.org/r/KerbalSpaceProgram/comments/11g7wgz/ksp_1_vs_ksp_2/janqvlj/ — checked 2026-10-17 — player comments (low; used only for "KSP2 saves are JSON", which matches S12).
- [S10] kOS documentation — "Vessel Load Distance". https://ksp-kos.readthedocs.io/en/latest/structures/misc/loaddistance.html — checked 2026-10-17 — mod documentation (high for mechanism; gives no default numbers).
- [S11] KSP Forum — "KSP vessel lifecycle and related stuff". https://forum.kerbalspaceprogram.com/topic/88026-ksp-vessel-lifecycle-and-related-stuff — checked 2026-10-17 — player forum (author unsure of details; low–medium). Via search excerpt.
- [S12] SpaceDock — "Savefile Pruner" (KSP2), and GamePretty "KSP2: How to Move Your Blueprints Between Campaign Save File". https://spacedock.info/mod/3348 ; https://gamepretty.com/kerbal-space-program-2-how-to-move-your-blueprints-between-campaign-save-file/ — checked 2026-10-17 — mod page and community guide.
- [S13] Business Wire — "Kerbal Space Program 2 to Launch in Early Access on February 24 2023" (time warp under acceleration, fusion megaships), and KSP Forum "Orbit does not change with engine running in time warp". https://businesswire.com/news/home/20221021005039/en/Kerbal-Space-Program-2-to-Launch-in-Early-Access-on-February-24-2023/ ; https://forum.kerbalspaceprogram.com/topic/213724-orbit-does-not-change-with-engine-running-in-time-warp — checked 2026-10-17 — official press release (high) and bug report (medium).
- [S14] KSP2 Redux — Roadmap. https://ksp2redux.org/roadmap/ — checked 2026-10-17 — fan continuation project (describes its own plans).
