# 12 — Modding

This document looks at how modding kept KSP1 alive for more than a decade, at what KSP2 promised and what its community built anyway, and at which game systems mods most often extend or replace. That last list is evidence of what stock players found missing. It ends with concrete extension points for Orbital. Orbital already has a first-class TypeScript SDK (`definePlugin`, `defineModule`, `definePart`, `defineResource`, `defineBody`, with `defineSystem` in the sim), runtime `.orbital-mod.json` packages with SHA-256 fingerprints and a trust prompt, glTF models in packages, and kOS-like QuickJS scripting (`docs/guides/writing-a-mod.md`, `docs/guides/scripting.md`). Facts are tagged **[KSP1]**, **[KSP2]**, **[KSP2 roadmap — never shipped]** or **[Mod: name]**.

---

## 1. How it works

### 1.1 KSP1: three layers of modding

| Layer | What it is | Who uses it |
|---|---|---|
| **Config data** | Parts, resources, engines and so on are plain-text `.cfg` "ConfigNode" files under `GameData/`. Adding a part means adding a folder with a cfg file and a model. | Part makers, people who rebalance the game |
| **ModuleManager patches** | **[Mod: ModuleManager]** (by sarbian, maintained by the community) applies patch files to every config at load time, before the game reads them [S1]. | Nearly every large mod; it is the de facto standard |
| **C# plugins** | DLLs that subclass `PartModule` (per-part behaviour), `VesselModule`, `ScenarioModule` (save-game state) or `MonoBehaviour` add-ons, and use the KSP API and Unity. Without any official sandbox, they can do anything. | Gameplay overhauls, UI mods, autopilots |

**ModuleManager syntax** (summarised from the official wiki [S1]). A patch selects nodes, for example `@PART[name*]` with `*` and `?` wildcards, and then changes them:
- `@` edits a node or value.
- `+` or `$` copies one.
- `-` or `!` deletes one.
- `%` edits it, or creates it if it is missing.
- `&` creates a value only if none exists, `|` renames a node, and `#` copies from another location.
- Values can be changed with math, as in `@mass *= 0.9`.

Conditions narrow which patches apply:
- `:HAS[...]` filters nodes by what they contain.
- `:NEEDS[ModA&!ModB]` applies a patch only when other mods are present or absent.
- `:FOR`, `:BEFORE`, `:AFTER` and `:FINAL` control the order patches run in [S1].

The key property is that **any mod can modify any other mod's data, and stock data, without touching their files**. That is how big compatibility layers and "rebalance everything" packs work.

**Distribution and tooling [KSP1]:**
- **CKAN** (Comprehensive Kerbal Archive Network) is a community metadata repository and client. It resolves dependencies and conflicts, and installs, updates and removes mods [S2].
- **SpaceDock** is a community mod host with download counts per mod [S3], alongside CurseForge and the official forum's add-on section. The forum is where most major mods live, as their release threads [S3].
- **Version checking:** KSP-AVC / MiniAVC (from general community knowledge, not verified this session).

**Stock adopting mods [KSP1].** Squad folded several mod ideas into stock:
- **resource mining** (inspired by a popular mod) [S4];
- the **Asteroid Day** mod made with the B612 Foundation (parts in 1.1, fully merged in 1.3) [S4];
- a stock **Δv readout** in 1.6, years after KER and MechJeb [S5];
- **Maneuver Mode** precise node editing in 1.7, after Precise Maneuver;
- the **Alarm Clock** and **Maneuver Creator** in 1.12, after Kerbal Alarm Clock and Transfer Window Planner [S6].

Squad also hired well-known modders. That is widely reported in the community, but I did not verify it this session.

### 1.2 KSP1: the mods that defined the game

| Category | Representative mods | What they add or replace |
|---|---|---|
| Information | **[Mod: Kerbal Engineer Redux]**, **[Mod: MechJeb]** readouts | Δv/TWR, landing and suicide-burn readouts, orbital data [S7] |
| Autopilot and scripting | **[Mod: MechJeb]**, **[Mod: kOS]** | Ascent, landing and rendezvous autopilots. kOS gives a scripting language for player-written autopilots [S7]. |
| Planning | **[Mod: Kerbal Alarm Clock]**, **[Mod: Transfer Window Planner]**, **[Mod: Precise Maneuver]** | Alarms, porkchop plots, numeric node editing [S6] |
| Visuals | **[Mod: EVE]** (clouds), **[Mod: Scatterer]** (atmospheric scattering and ocean), **[Mod: Parallax]** (terrain tessellation and scatter), **[Mod: TUFX]** (post-processing) | Replaces stock planet rendering almost entirely (descriptions from general community knowledge, not verified this session) |
| Realism | **[Mod: Realism Overhaul]** plus **[Mod: RP-1]** (real solar system, a historical career), **[Mod: Principia]** (n-body gravity, which replaces patched conics and allows Lagrange points and perturbations) [S7], **[Mod: FAR]** aerodynamics | Replaces the physics and the career |
| Gameplay depth | **[Mod: Kerbalism]** (life support, radiation, reliability, background science) [S7], **[Mod: RemoteTech]** (signal delay, link limits for probes) [S7], **[Mod: Kerbal Construction Time]**, **[Mod: Contract Configurator]**, **[Mod: Waypoint Manager]** | Turns a sandbox into a simulation with logistics, time and risk |
| Worlds | **[Mod: Kopernicus]** and planet packs (Outer Planets Mod, JNSQ, Galileo's Planet Pack and so on) | New or replaced star systems |
| Parts | Near Future, BDB (historical rockets), Procedural Parts, Procedural Fairings | More engines, tanks, procedural shapes |
| Building | Editor Extensions, B9 Procedural Wings | Numeric gizmos, procedural wings (KSP2 later made procedural wings stock) |
| Multiplayer | Dark Multiplayer, Luna Multiplayer [S8] | Something stock never had |

Several of these are not single mods but **frameworks**: Kopernicus, Contract Configurator, Community Resource Pack, ModuleManager. Other mods build on them. A healthy ecosystem needs *library mods* and dependency resolution, which CKAN provides [S2].

### 1.3 KSP2: what was promised and what shipped

- **[KSP2 roadmap — never shipped] official modding.** Before launch, Private Division and Intercept spoke of expecting modders on day one, and of eventual official modding tools [S9]. Forum summaries of developer comments say compiled C# plugins would stay viable. **Lua** is said to have been used internally, at least for mission scripting, but Lua for mods was never confirmed [S10]. An **official mod loader** was referred to as "unreleased" throughout [S11][S12]. **No official modding API, loader, documentation or Lua support shipped** before development ended in 2024 [S13].
- **[KSP2] what the community built anyway:**
  - **BepInEx**, a general-purpose Unity and C# mod loader, was the only way to load add-ons at Early Access launch [S9][S14].
  - **[Mod: SpaceWarp]** is a modding API that runs on BepInEx and was designed to work with the future official loader. Each mod has a `swinfo.json` manifest, and the API covers asset bundles, Addressables, images, soundbanks and CSV localisation. It needs the **UITK for KSP2** UI library [S12]. The SpaceWarp 1.x feature list included **Lua scripting** for simple mods, so the community delivered what Intercept had only hinted at [S11]. The repository was archived on 2026-10-12 and development moved to KSP2 Redux [S12].
  - **[Mod: Patch Manager]** is the KSP2 successor to ModuleManager. It uses an SCSS-like syntax, not MM syntax, and version 0.7 replaced prefix expressions with "mutating definitions" [S15]. It too was archived in Oct 2026 and moved into Redux's mod API [S15].
  - **CKAN** added KSP2 support, and mods were published on SpaceDock [S16][S14].
  - **Popular KSP2 mods** filled flight UI gaps: Maneuver Node Controller, Flight Plan, Lazy Orbit (a cheat menu for setting orbits), Node Manager, K2-D2 autopilot [S14][S16][S17].
- **[Mod: KSP2 Redux]** (2025–2026) is a volunteer fan project, not affiliated with the original developers. Its goals are fixing bugs, improving performance, delivering promised features (colonies, interstellar, multiplayer), making the game easier to mod, and shipping it as an installer that patches an existing KSP2 install, possibly through CKAN [S18]. It has its own mod APIs (ReduxLib/Redux namespaces) and a SpaceWarp migration guide [S17]. Its feature list includes ISRU, better painting tools, an expanded flight stats box and a "viable vessel" icon in the Engineer's Report [S19].

### 1.4 What mods extend most often, and what that says about stock

Ranked by how often mod categories appear in the sources above. This is a qualitative ranking; I found no reliable download statistics [S3].

1. **Information and readouts** (Δv, TWR, landing data). Stock showed too little, too late. KSP1 needed 1.6 to add Δv [S5].
2. **Planning tools** (alarms, transfer windows, precise nodes). Stock lacked mission-planning depth in both games [S6][S14].
3. **Automation** (MechJeb, kOS, K2-D2). Players want to delegate repetitive piloting once they have mastered it.
4. **Visuals** (EVE, Scatterer, Parallax). KSP1's planets looked dated. KSP2 improved them, which reduced that need.
5. **Simulation depth** (life support, comms delay, reliability, n-body, real aerodynamics). Experienced players want more consequence and realism than stock gives.
6. **Content** (parts, planet packs, contracts). The amount of content runs out.
7. **Career structure** (build time, contract packs, strategies). Stock career loops felt thin. See 07-economy-and-career.md.
8. **Multiplayer**: never in stock KSP1, and promised but never shipped in KSP2 [S13].

---

## 2. Player experience

- **KSP1.** A modded install is how many long-term players play. Players curate "mod lists", follow YouTubers' packs and use CKAN to stay sane. The costs:
  - Version breakage after every KSP update.
  - Load times measured in minutes with big packs.
  - Mod conflicts.
  - Abandoned mods that get "adopted" by new maintainers.

  Patch-based data modding (ModuleManager) lets a balance mod and a parts mod coexist without either one knowing about the other.
- **KSP2.** Modders arrived on day one with BepInEx, but every patch broke mods. With no official API, every mod reached into game internals. Install instructions confused players: which folder, BepInEx or SpaceWarp, Proton and Wine issues [S14]. After development ended, modding became the community's only way forward, through SpaceWarp, then Redux [S12][S18].

---

## 3. Interactions with other systems

Every system is a modding target. The main links:
- **03-vehicle-assembly.md:** parts, categories, procedural parts and editor tools.
- **04-flight-and-controls.md:** HUD readouts, autopilots, planners and alarms.
- **05-science-and-research.md:** experiments and tech-tree nodes (in KSP1, by config).
- **06-missions-contracts-achievements.md:** Contract Configurator and Waypoint Manager.
- **07-economy-and-career.md:** strategies, construction time (KCT), RP-1 career.
- **08-crew.md:** traits, life support (Kerbalism, TAC-LS).
- **09-communications-network.md:** RemoteTech compared with stock CommNet.
- **10-celestial-bodies-and-world.md:** Kopernicus planet packs, Principia.
- **11-colonies-resources-interstellar.md:** Redux plans colony ISRU, leaving elaborate parts to modders [S18].
- **13-ui-ux-patterns.md:** the app launcher and toolbar, and UI toolkits (UITK for KSP2).
- **14-strengths-weaknesses-and-player-feedback.md:** modding as KSP1's main strength, and the absence of official modding as a KSP2 failure.

---

## 4. Known problems and criticism

1. **There is no stable API in either game.** KSP1 plugins break on game updates, so mods cluster on "last good" versions (1.12.x). KSP2 had no API at all.
2. **Unsandboxed native code.** C# DLLs have full machine access. Trust rests on the forum's reputation and on open source.
3. **ModuleManager load-order and patch conflicts** are hard to debug. Large installs are slow to load.
4. **Fragmented hosting** across the forum, SpaceDock, CurseForge and GitHub. CKAN metadata is maintained by volunteers [S2][S3].
5. **Promises with no delivery (KSP2).** Official modding and Lua were spoken of but never shipped. The community spent its effort on loaders instead of content [S10][S11][S13].
6. **Two patch syntaxes:** Patch Manager is not MM-compatible [S15], so KSP1 knowledge did not carry over.

---

## 5. Implications for Orbital

Orbital's stance is that "the stock game is itself a mod built on the public SDK". That is already more than KSP2 shipped. The options below focus on the systems that come next and on avoiding KSP1's problems.

1. **Adopt: keep stock-as-a-mod as an invariant.** Every new system (science, contracts, tech, comms, crew, buildings, strategies) ships *as stock plugins on public `define*` APIs*. If stock needs a private hook, the SDK is incomplete. This is the strongest guard against KSP2's "official modding later".
2. **Adopt: a data-patching layer like ModuleManager, as typed functions.** Add `definePatch({ target: 'part', match: { id: 'stock.engine-*', has: { module: 'stock.engine' } }, needs: ['acme.balance', '!other.mod'], order: { after: ['stock'] }, apply(def) { ... } })`. Patches run over the registered definitions after `setup()` and before validation, and the load report lists which patch touched which id. This keeps MM's power to modify any definition from any other mod [S1], with type safety and readable diffs. Avoid inventing a new text syntax (the Patch Manager split [S15]).
3. **Adopt: a patch-provenance view.** In the Mods screen, show each definition's final value and the chain of patches behind it. That debugging tool is what ModuleManager users lacked.
4. **Adopt: new `define*` extension points for upcoming systems:**
   - `defineExperiment`: situations, biome mask, data or sample, transmit factor, and a module hook for collecting. See 05-science-and-research.md.
   - `defineTechNode`: tier, cost, prerequisites, unlocked part ids. Patchable so mods can insert nodes.
   - `defineContract`: parameters, generators, rewards. This is a typed Contract Configurator. See 06-missions-contracts-achievements.md.
   - `defineAntenna` and `defineCommRule`: link range and delay or blackout policy, so RemoteTech-style rules become a plugin choice. See 09-communications-network.md.
   - `defineCrewTrait`: effects on SAS level, repair, science bonus.
   - `defineBuilding`: levels, upgrade costs, the limits they impose (part count, mass), and the Space Center label.
   - `defineStrategy`: modifiers on the economy, matching Admin "Strategies" in SCREENS.md.
   - `defineEvent` and `defineAchievement`.
5. **Adopt: HUD and panel plugins as a formal API.** The dock-plugin system needs a `definePanel({ id, title, icon, placement: 'dock-left' | 'vessel-tab' | 'mission-center', render })` contract. It should carry a typed read-only telemetry subscription (the same shape as scripting's `ship`), size and placement rules, and settings persistence. KER and MechJeb show that readout panels are the most demanded mod type.
6. **Improve: semver the SDK and keep a compatibility promise.** Orbital already checks the `api` range. Add deprecation warnings that last at least one minor version, plus a published changelog, so mods do not all break on a game update the way KSP1 and KSP2 mods did.
7. **Improve: the trust model.** The current prompt says mods have the page's own access. Over time, run untrusted gameplay mods in a Worker or QuickJS realm (as scripts already run) with capability declarations (`network`, `storage`), and keep main-thread access for UI panels that ask for it. This avoids KSP1's "all-powerful DLL" problem.
8. **Adopt: a hosted index plus a CKAN-like resolver in the game.** A static JSON index of mods (id, versions, api range, dependencies, hash, URL) that the Mods screen can browse, resolve dependencies from, and update. CKAN shows the value of this [S2]. The current guide already lists a hosted repository as an open item.
9. **Adopt: library-mod support.** Let one mod export types and module ids for others (already possible through `ModuleMap` declarations). Encourage framework mods (planet-pack kits, contract packs) by documenting `optional` dependencies and `:NEEDS`-style conditions.
10. **Adopt: script-level extensibility in the same SDK.** kOS shows that players will write autopilots [S7]. Let mods add script globals (for example, a comms mod exposes `comms.delay`) through a `contributes.scriptApi` contract, with the same Worker isolation.
11. **Improve: visual modding without executable render code.** Mods are now limited to generators and glTF. Next would be data-driven atmosphere, cloud and terrain parameters on `defineBody` (an EVE/Scatterer-like look without shader code), and a post-processing profile like TUFX as data.
12. **Avoid: promising modding features before they exist.** KSP2's unshipped loader and Lua turned into community distrust [S10][S13]. Publish what each API version supports (the in-game `/roadmap` already does this for features).
13. **Adopt: save safety with mods.** Saves already list mods and refuse to load when one is missing. Add a "load without mod X" path that removes or converts orphaned parts with a report. A KSP1 save without a mod deletes the vessels silently or fails to load.
14. **Improve: rebalance packs as a first-class use case.** Ship an example mod that only patches stock numbers (a "hard mode" tuning) to prove the patch layer works and to invite community difficulty packs, the RP-1 spirit at browser scale.

---

## Sources

- [S1] "Module Manager Syntax" — ModuleManager GitHub wiki, https://github.com/sarbian/ModuleManager/wiki/Module%20Manager%20Syntax — checked 2026-10-17. Primary documentation of the mod. Reliable.
- [S2] CKAN — project description (signpath.org/projects/ksp-ckan and github.com/KSP-CKAN), https://signpath.org/projects/ksp-ckan — checked 2026-10-17. From search excerpts. Reliable for what CKAN is.
- [S3] SpaceDock mod pages and PC Gamer "Best KSP mods", https://spacedock.info/ and https://www.pcgamer.com/the-best-kerbal-space-program-mods/ — checked 2026-10-17. The PC Gamer page body was paywalled, so its content comes from search excerpts. No authoritative download ranking was found.
- [S4] Kerbal Space Program — Wikipedia, https://en.wikipedia.org/wiki/Kerbal_Space_Program — checked 2026-10-17. Secondary source: mods moved into stock, Asteroid Day.
- [S5] "KSP 1.6: To Vee or not To Vee" (official), https://kerbalspaceprogram.com/news/1-6-to-vee-or-not-to-vee-is-now-available — checked 2026-10-17. Official.
- [S6] "KSP 1.12 On Final Approach is now available" — KSP forum 203227, https://forum.kerbalspaceprogram.com/topic/203227-kerbal-space-program-112-on-final-approach-is-now-available — and the Kerbal Alarm Clock thread 22809 — checked 2026-10-17. Official plus mod author.
- [S7] RP-1 wiki "Extra Mods to Consider" (https://github.com/KSP-RO/RP-1/wiki/Extra-Mods-to-Consider) and PCGamesN "Best KSP mods" (https://www.pcgamesn.com/kerbal-space-program/ksp-mods) — checked 2026-10-17. Secondary sources: descriptions of MechJeb, KER, kOS, RemoteTech, Kerbalism, Principia.
- [S8] KSP Wiki "List of mods", https://wiki.kerbalspaceprogram.com/wiki/Mods — checked 2026-10-17. From search excerpts. Fair.
- [S9] "BepInEx for KSP 2 — adding modding support to the game" — KSP forum 212355, https://forum.kerbalspaceprogram.com/topic/212355-bepinex-for-ksp-2-adding-modding-support-to-the-game — together with Attack of the Fanboy's "When will KSP2 have mods" — checked 2026-10-17. The loader author's opinion plus a secondhand report of Private Division's "day one" expectation.
- [S10] "Any word on mod pipeline for KSP 2" — KSP forum 211565, https://forum.kerbalspaceprogram.com/topic/211565-any-word-on-mod-pipeline-for-ksp-2 — checked 2026-10-17. Community summary of developer statements on C# and Lua. Hearsay; marked as unconfirmed.
- [S11] "Dev Blog: SpaceWarp 2.0 — help us shape the future of modding" — KSP forum 218513, https://forum.kerbalspaceprogram.com/topic/218513-dev-blog-spacewarp-20-help-us-shape-the-future-of-modding — checked 2026-10-17. Community mod team blog, from search excerpts.
- [S12] SpaceWarp GitHub repository, https://github.com/SpaceWarpDev/SpaceWarp — checked 2026-10-17. Primary source; archived 2026-10-12, moved to KSP2Redux/Redux.ModApi.
- [S13] Kerbal Space Program 2 — Wikipedia, https://en.wikipedia.org/wiki/Kerbal_Space_Program_2 — checked 2026-10-17. Secondary source: studio closure 2024, multiplayer and colonies never released.
- [S14] "BepInEx vs SpaceWarp" (forum 214072) and Lazy Orbit README (https://github.com/schlosrat/LazyOrbit) — checked 2026-10-17. Community; install confusion, CKAN support.
- [S15] Patch Manager — GitHub, https://github.com/KSP2Community/PatchManager — and forum thread 221179 — checked 2026-10-17. Primary source; archived Oct 2026.
- [S16] Maneuver Node Controller — SpaceDock, https://spacedock.info/mod/3270/Maneuver%20Node%20Controller — and Space Warp 1.9.5 thread (forum 218490) — checked 2026-10-17. Mod pages.
- [S17] "Migrating from SpaceWarp 1.x" — KSP2 Modding Wiki, https://modding.kerbal.wiki/Migrating_from_SpaceWarp_1.x — and K2-D2 Redux listing https://spacedock.info/mod/4508 — checked 2026-10-17. Community documentation.
- [S18] "KSP2 Redux" — KSP2 Modding Wiki, https://modding.kerbal.wiki/KSP2_Redux — checked 2026-10-17. Community project page, last edited Nov 2025. Reliable for the project's stated goals.
- [S19] "Redux: New features" — kerbal.wiki, https://kerbal.wiki/Redux:New_features — checked 2026-10-17. Community page.
