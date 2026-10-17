# 06 — Missions, Contracts and Achievements

How KSP games tell the player what to do next. This covers KSP1's procedurally generated contracts and progress milestones, KSP1 Making History's player-authored Mission Builder, KSP2's hand-written Mission Control missions, achievements on both games, and the Contract Configurator mod as prior art for data-driven contracts. It is a design analysis from public sources only, ending with concrete options for Orbital.

> **Source caveat (2026-10-17).** The official KSP wiki and forums blocked automated fetching. Facts from those pages come from search-engine snippets and are marked *(snippet)*. KSP2 mission data comes from kerbal.wiki, which was readable in full.

---

## 1. How it works

### 1.1 KSP1 contracts (Career mode) **[KSP1]**

**Origin.** Contracts arrived in v0.24 "First Contract" (2014), together with funds and reputation [S6][S7]. You access them in the **Mission Control** building at the KSC.

**Lifecycle.** The game generates contracts and *offers* them. The player *accepts* or *declines* them. Accepted contracts are *active* and end as *completed*, *failed* or *cancelled*.
- **Declining** costs a small reputation penalty, usually about −1 [S5].
- **Cancelling** an accepted contract does not count as a failure and avoids the failure penalty [S5].
- **Failure** happens when the deadline passes or a critical parameter fails (for example, the kerbal to rescue dies) [S5].
- **Deadlines** run in game time. Each contract may have its own deadline or none at all. Offers also have an *expiry*, so unaccepted offers disappear [S5].
- **Money flow.** Accepting can pay an **advance** in funds. Completion pays rewards in funds, science and/or reputation. Failure applies penalties, usually funds and reputation. The per-contract amounts scale with target body and prestige; I found no public formula [S5].

**Prestige.** Every contract has one of three tiers, ★ *Trivial*, ★★ *Significant* or ★★★ *Exceptional*. Higher tiers pay more and are more ambitious [S6]. **Reputation** controls how many offers of each tier appear [S5]. Reputation itself has diminishing returns: gains shrink exponentially as it nears its cap [S8]. See 07-economy-and-career.md.

**Facility gates.** Mission Control's upgrade level limits how many contracts can be active at once. Commonly cited figures are about 2 at level 1, 7 at level 2 and unlimited at level 3; I could not re-verify these.

**Agencies.** Contracts are issued by fictional companies (part manufacturers and the like). Agencies have flavour and *mentality* modifiers; for example, some offer shorter deadlines but bigger payouts [S5].

**Contract types (stock, as recalled from the wiki; the set grew across 1.x).**

| Family | What it asks | Notes |
|---|---|---|
| Part test | Test part X in situation Y (speed/altitude window, or "run while landed on the Mun") | Often supplies a not-yet-researched part. Main early income. |
| Rescue | Recover a stranded kerbal or a part from orbit or surface | The rescued kerbal joins your roster; see 08-crew.md. |
| Explore / "World firsts" | Reach, orbit, land on or return from a new body | Generated from the progression frontier. |
| Satellite | Put a probe into a specific orbit (with an antenna, power, etc.) | Orbit shown as a ghost in map view. |
| Station / Base | Build an outpost with N crew, docking port, power, etc. | Later extended by "add module" variants. |
| Tourism | Fly tourist passengers to listed destinations and back | Tourists are non-EVA crew. |
| Survey | Reach waypoints (ground, air or orbit) and run an instrument there | Waypoints appear on the map and navball. |
| Science collection | Return data of type X from body/situation Y | |
| Asteroid (ARM) / comet | Track, capture or redirect an asteroid; later comet samples | ARM update (v1.0 era) and 1.10. |
| ISRU / mining, Grand Tour, deployed science | Extract ore, visit many bodies, set up Breaking Ground stations | Late additions. |

**Progress tracking ("milestones", "World Firsts").** Separately from contracts, KSP1 keeps a *progress tree* of firsts: first launch, reaching space, first orbit, first flyby/orbit/landing/return per body, first EVA, docking, records for altitude, speed and depth, and so on. Each first pays a small automatic funds/science/reputation award in Career and appears as a notification. It also drives which "explore" contracts are generated next.

**Strategies.** The Administration building converts one currency into another, for example a share of funds into science. See 07-economy-and-career.md.

### 1.2 KSP1 Making History: the Mission Builder **[KSP1]**

*Making History* (paid expansion, released alongside KSP 1.4, March 2018) added a **Mission Builder**: a drag-and-drop node graph for authoring scripted scenarios, playable by others [S10][S11].
- **Node families** (from the official manual's contents): Currency/Funds, Kerbal, Location, Resources & Science, Spawnable, Utility and Vessel [S9].
- **Tests vs actions.** Test nodes check conditions (vessel mass, velocity, recovery, active part count). Action nodes change the world (explode or fail a part, drain a resource, spawn a vessel or kerbal) [S9]. Marketing describes launches, landings, rescues, malfunctions, explosions, repairs and "unique victory conditions" [S11].
- **Scenario setup.** The author sets the start (location, pre-spawned vessels, available parts, part limits), a **briefing**, and a **score** with awards that can be edited globally [S9].
- **Sharing.** Missions are packaged files that can be exported and shared, including via Steam Workshop on the Steam version.
- **Limitations.** Tests are stateless snapshots. One bug report notes that the Vessel Mass node cannot compare a mass taken at one point with a mass taken later [S12]. The builder had no general variables or scripting and could not be used inside Career.
- **Reception.** It was praised as accessible to all skill levels. In practice it saw modest community use compared with Contract Configurator packs.

### 1.3 Contract Configurator (KSP1 mod) — prior art **[KSP1 mod]**

This is a community framework, originally by nightingale (jrossignol), that defines contracts in **plain-text config files** [S13][S14]:
- `CONTRACT_TYPE` holds the title, description, synopsis, agency, prestige, rewards, advances, penalties, deadlines and how often the contract appears.
- `PARAMETER` holds objectives (reach orbit, have crew, visit waypoint, collect science and so on). Parameters can be nested, ordered or optional.
- `REQUIREMENT` decides whether the contract may be offered at all (tech unlocked, body reached, another contract completed). This creates *contract chains*.
- `BEHAVIOUR` holds side effects: spawn a vessel or kerbal, generate waypoints, award or expire things, show dialogue.
- An expression language, *DATA nodes* and a **TextGen** helper (topic/subject/motivation) give procedural variety [S13]. A debug menu reloads contract types live [S13].

Dozens of "contract packs" were built on it (field research, tourism, stations, RemoteTech relays). It showed that most contract designs are data plus a small set of reusable objective primitives. Known pitfalls include parameters that check thresholds loosely; one user reported that an electric-charge-generation parameter passed for any amount [S15].

### 1.4 KSP2 Mission Control and missions **[KSP2]**

Shipped in For Science! (v0.2.0.0, 19 Dec 2023), in **Exploration Mode** only [S1][S2][S3].
- **Hand-written, not procedural.** Every mission is predefined, unlike KSP1's generated contracts [S1].
- **Structure.** Each mission has a *customer* (an in-game manufacturer), a description of why the agency cares, objectives, and a **science-only reward**. There are no funds and no reputation [S1][S4].
- **11 Primary missions** form a linear story spine with briefings and debriefings by Dr. Keri Kerman, leading to alien "monuments" and signals [S1][S16].
- **30 Secondary missions** each have a prerequisite mission, which creates branching chains. Examples are a Kerbin water landing and returning kerbals from Eve [S1].
- **Rewards** range from 25 to 10,000 science and total **86,875** across all missions [S1]. Players reported odd balance; one cited an early mission paying 400 science against 35 for a 200-tonne Minmus landing [S17].
- **UI.** Missions are accepted and reviewed in the Mission Control building. A **Mission Tracker** app shows objectives during flight [S2][S3].

**Primary mission chain** [S1]:

| # | Mission | Objective (summary) | Reward |
|---|---|---|---|
| 1 | Launch a Rocket | Reach 10 km | 25 |
| 2 | Out of the Atmosphere | Exceed 70 km | 50 |
| 3 | Orbit Kerbin | Stable orbit 70–300 km | 75 |
| 4 | Mun or Bust | Orbit the Mun | 150 |
| 5 | One Small Step | Land on the Mun | 300 |
| 6 | Munar Signal | Find the signal source | 350 |
| 7 | Bad Signal | Probe with antenna orbiting Minmus | 400 |
| 8 | Minmus Monument | Find the surface source | 750 |
| 9 | Duna Monument | Find the surface source | 2,000 |
| 10 | Better Signal | Antenna network with 86 Gm range around Jool | 5,000 |
| 11 | Tylo Monument | Find the surface source | 10,000 |

**Objective primitives used** [S1]: altitude and orbit parameters (Ap/Pe/speed), landing (crewed, with crew size and vessel mass thresholds), flag planting, find signal or monument, enter SOI, EVA, surveys and samples, required parts (antenna, wheels, docking port, jet engine), and named locations (Kapy Rock, the Mohole).

**[KSP2 roadmap — never shipped]** Career-style economy, more mission arcs tied to colonies and interstellar travel, and multiplayer agency play [S18].

### 1.5 Achievements **[KSP1] [KSP2]**

- **KSP1 PC (Steam/GOG).** The Steam stats page for app 220200 shows no achievement data [S19]. As far as I can tell, the PC game never had platform achievements, and its "achievements" are the in-game progress milestones (§1.1). The console *Enhanced Edition* has **44** platform achievements, such as first contract and first EVA in space [S20]. A third-party KSP1 mod added about 145 achievements in categories such as R&D [S21].
- **KSP2 (Steam).** Store trackers flag KSP2 as having no Steam achievements, and the Steam stats page is empty [S19][S22]. I found no evidence that any were added before development stopped.

---

## 2. Player experience

- **KSP1 contracts.** They give purpose and rhythm: there is always something to do with a rocket. Part tests and rescues teach skills and cover early costs. The weaknesses are a "to-do list" feel, odd demands (test a heavy part at an absurd speed on the Mun), and offer boards cluttered with junk. Many veterans decline almost everything except exploration firsts. Deadlines rarely create real tension because they are measured in years.
- **World firsts.** The milestone notification is one of KSP1's best moments. It is cheap to implement and emotionally powerful.
- **Mission Builder.** Creators liked the expressive tests and actions, but most players never opened it. Its content lived outside the main campaign.
- **KSP2 missions.** They are more authored and narrative (Keri's briefings, the monument mystery). Their linear spine gives newcomers direction, and the debrief adds personality. Downsides: limited replayability once all 41 are done, science-only rewards that make missions dominate the tech tree, and balance oddities [S17]. Reviews of the one-year mark welcomed the structure but noted how thin the content was [S16].

## 3. Interactions with other systems

- **Science/tech.** Rewards fund the tree, and part tests hand out locked parts early; see 05-science-and-research.md.
- **Economy.** Advances, rewards, penalties and prestige tied to reputation; strategies; see 07-economy-and-career.md.
- **Crew.** Rescues add kerbals, tourism carries tourists, and crew-count objectives; see 08-crew.md.
- **Comms.** Satellite and relay contracts and KSP2's "Better Signal" network objective; see 09-communications-network.md.
- **World.** Waypoints, POIs, monuments and anomalies; see 10-celestial-bodies-and-world.md.
- **Buildings.** Mission Control level gates active contracts. Administration hosts strategies; see 02-space-center-and-buildings.md.
- **Modding.** Contract Configurator and the Mission Builder show that both data-driven and node-graph authoring work; see 12-modding.md.
- **UI.** Offer/active/completed lists and an in-flight tracker; see 13-ui-ux-patterns.md.

## 4. Known problems / criticism

1. **Procedural contracts feel arbitrary and grindy** in KSP1 (part-test absurdities, repeated satellite orbits).
2. **Offer-board clutter.** Decline penalties discourage curating the board.
3. **Weak failure stakes.** Deadlines are long, and cancelling avoids the failure penalty [S5].
4. **The Mission Builder is siloed** from Career. Tests are stateless and there are no variables [S12].
5. **KSP2's missions are finite and linear**, with reward balance anomalies [S17] and no economy behind them.
6. **No platform achievements on PC** for either game. Milestones are only a notification and a log, with no gallery.

## 5. Implications for Orbital

Orbital wants players to feel like **investors** too. Contracts are where money, risk and reputation meet engineering.

1. **Adopt: a data-driven contract schema in the SDK,** modelled on Contract Configurator. A contract `type` has `requirements`, `objectives[]` (nested, ordered or optional), `rewards`, `advance`, `penalties`, `deadline`, `expiry`, `prestige`, `agency` and `behaviours`. The stock contracts live in the stock mod, which fits Orbital's stock-is-a-mod principle.
2. **Adopt: a small library of deterministic objective primitives** evaluated every sim tick: orbit window, reach SOI, land/splash at body/region/waypoint, crew count/trait, has part/module, run experiment, return sample, recover vessel, docked, comms-connected, time-held, resource amount. KSP2's list [S1] is a good minimum. Being deterministic makes replays and tests reliable.
3. **Improve: scriptable missions** that combine the Mission Builder and kOS. The same objective and behaviour primitives become callable from the scripting API, so modders can write mission logic with real state and variables. This fixes the builder's stateless tests [S12]. A graph editor can come later as a front end over the same data.
4. **Adopt: a hand-written primary arc plus procedural secondaries.** KSP2's authored spine onboards well, and KSP1's generators give replayability. The Mission Center shows both, with a clear "story" lane.
5. **Improve: the investor framing in Administration.** Contracts should show expected value: reward minus estimated launch cost, against risk and deadline. Players should be able to *bid* or negotiate (more advance for a tighter deadline) and run a portfolio. Agencies should have persistent relationships, not only prestige stars.
6. **Improve: meaningful deadlines and failure.** Use shorter, telegraphed windows tied to transfer windows (planner integration). Keep "cancel" but with a real cost, and have no decline penalty for offers left untouched (they simply expire).
7. **Adopt: World Firsts as a milestone tree** with a ceremony-style toast and a permanent "agency history" log per World. This is cheap and gets the biggest emotional return.
8. **Adopt: local achievements defined as data** (`achievement: {id, condition, hidden}`), shown in a gallery. Mods can add their own. This needs no platform service because Orbital is client-side.
9. **Avoid: a science-only reward economy** in Career (KSP2). Mission rewards should cover all three currencies with tunable weights, so the tech tree isn't driven by missions alone.
10. **Adopt: a Mission Tracker in the flight dock** (the planned Contracts panel). Show live objective checkboxes and the planner/maneuver hint for the next objective.
11. **Improve: mission packs as shareable World seeds.** A mission pack declares a start state (vessels, crew, unlocked parts), so challenges can be shared like Making History scenarios. It should also be playable inside a Career World as an optional "special contract".
12. **Avoid: hard-coding contract kinds in core.** Core supplies only the evaluator, lifecycle and save schema; everything else is mod data.

## 6. Sources

- [S1] Kerbal Wiki (KSP2), "Missions", https://kerbal.wiki/Missions, checked 2026-10-17. KSP2 community wiki; fetched in full.
- [S2] Kerbal Wiki (KSP2), "Mission Control", https://kerbal.wiki/Mission_Control, checked 2026-10-17. KSP2 community wiki (via search snippet).
- [S3] Steam news, KSP2 "For Science!" announcement/patch notes, https://store.steampowered.com/news/posts/?feed=steam_community_announcements&appids=954850, checked 2026-10-17. Official.
- [S4] KSP Wiki, "Exploration mode", https://wiki.kerbalspaceprogram.com/wiki/Exploration_mode, checked 2026-10-17. Community wiki (snippet).
- [S5] KSP Wiki, "Contract", https://wiki.kerbalspaceprogram.com/wiki/Contract, checked 2026-10-17. Community wiki (snippets).
- [S6] KSP Forum dev article, "First Contract v0.24.0 complete changelog", https://forum.kerbalspaceprogram.com/developerarticles.html/ksp-first-contract-v0240-complete-changelog-r131, checked 2026-10-17. Official (snippet).
- [S7] KSP Forum dev article, "First Contract: the FAQ", https://forum.kerbalspaceprogram.com/developerarticles.html/kerbal-space-program-first-contract-the-faq-r129, checked 2026-10-17. Official (snippet).
- [S8] KSP Wiki, "Reputation", https://wiki.kerbalspaceprogram.com/wiki/Reputation, checked 2026-10-17. Community wiki (snippet).
- [S9] KSP Wiki, "Mission Builder Manual", https://wiki.kerbalspaceprogram.com/wiki/Mission_Builder_Manual, checked 2026-10-17. Official manual hosted on the wiki (table of contents via snippet).
- [S10] KSP Wiki, "Making History", https://wiki.kerbalspaceprogram.com/wiki/Making_history, checked 2026-10-17. Community wiki (snippet).
- [S11] Official product page, "Kerbal Space Program: Making History", https://www.kerbalspaceprogram.com/product/kerbal-space-program-making-history/, checked 2026-10-17. Official marketing (snippet).
- [S12] KSP bug tracker, issue 18571 (Vessel Mass node), https://bugs.kerbalspaceprogram.com/issues/18571, checked 2026-10-17. Official bug tracker (snippet).
- [S13] Contract Configurator GitHub wiki, "How To", https://github.com/jrossignol/ContractConfigurator/wiki/How-To, checked 2026-10-17. Mod documentation (snippet).
- [S14] KSP Forum, "Contract packs for Contract Configurator — general thread", https://forum.kerbalspaceprogram.com/topic/97031-contract-packs-for-contract-configurator-general-thread, checked 2026-10-17. Forum post.
- [S15] KSP Forum, "Contract Configurator" release thread (p.197), https://forum.kerbalspaceprogram.com/topic/91625-1101-contract-configurator-v1305-2020-10-05/page/197, checked 2026-10-17. Forum post.
- [S16] Entertainium, "Review: One year into Kerbal Space Program 2 Early Access", https://entertainium.co/2024/02/28/kerbal-space-program-2-review/, checked 2026-10-17. Review (snippet).
- [S17] KSP Forum, "For Science update — early feedback", https://forum.kerbalspaceprogram.com/topic/221642-for-science-update-early-feedback, checked 2026-10-17. Forum post (player report, snippet).
- [S18] KSP official news, "What's next: Early Access roadmap", https://kerbalspaceprogram.com/news/ksp-2-news-article-whats-next-early-access-roadmap-1, checked 2026-10-17. Official (snippet).
- [S19] Steam Community stats pages, https://steamcommunity.com/stats/220200/achievements and https://steamcommunity.com/stats/954850/achievements, checked 2026-10-17. Official platform pages ("No stats are available").
- [S20] TrueAchievements, "Kerbal Space Program achievements", https://www.trueachievements.com/game/Kerbal-Space-Program/achievements, checked 2026-10-17. Achievement tracker for the console edition (snippet).
- [S21] CurseForge, "KSP Achievements" mod, https://www.curseforge.com/kerbal/ksp-mods/ksp-achievements, checked 2026-10-17. Mod page (snippet).
- [S22] IsThereAnyDeal product entry for KSP2, https://isthereanydeal.com/product/01956b76-0935-733b-a767-0d8acfb555ba/, checked 2026-10-17. Third-party store tracker (low reliability).
