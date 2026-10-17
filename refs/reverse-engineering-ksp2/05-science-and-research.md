# 05 — Science and Research

How science is earned and spent in Kerbal Space Program 1 (the baseline) and Kerbal Space Program 2 (Early Access, "For Science!" update). Covers experiments, situations, biomes and regions, the value formula, labs, deployable experiments, and the tech tree. This is a design analysis built only from public sources (wikis, patch notes, press, mod API docs). It ends with concrete options for Orbital.

> **Source caveat (2026-10-17).** The official KSP wiki (wiki.kerbalspaceprogram.com) and the KSP forums blocked automated fetching on the check date. The fandom wiki returned HTTP 402. KSP1 numbers below come from search-engine snippets of those pages and are marked *(snippet)*. Where community sources disagree, both values are given. The KSP2 figures come from pages that could be read in full (kerbal.wiki, the Steam announcement, the kontrolsystem2 API reference).

---

## 1. How it works

### 1.1 KSP1: the science loop **[KSP1]**

**Core loop.** Put an instrument somewhere new, run it, and get a *result* for a *subject*. A subject is experiment × body × situation × (sometimes) biome. You then either **recover** the result on Kerbin for full value or **transmit** it by antenna for reduced value. Science points are a currency spent in the R&D building to unlock tech-tree nodes. In Career mode they are one of three currencies, alongside funds and reputation (see 07-economy-and-career.md).

**Situations.** There are six: *Landed*, *Splashed*, *Flying Low*, *Flying High*, *In Space Low* and *In Space High* [S1]. Boundaries are set per body. On Kerbin, the atmosphere ends at 70 km, and "space high" is commonly given as starting at about 250 km [S5]. For the Mun, players report that the low/high space boundary is roughly 60 km. One forum answer instead said 30 km, so the figure is uncertain [S5]. The Flying Low/High split on Kerbin is widely quoted as 18 km; I could not re-verify this.

**Biomes.** Each body is divided into named biomes (Kerbin has highlands, shores, the KSC itself and so on). Each experiment declares which situations are *biome-dependent*. A crew report, for example, is biome-specific on the surface but not in high space. This creates a large but finite matrix of subjects. "Biome hopping" is the main way experienced players farm science.

**Experiments (stock, approximate).** Base value and cap per subject are shown before body multipliers. Treat these as community-reported. The thermometer, barometer and gravioli figures are recalled from the wiki table and could not be re-checked, and some values changed between versions [S1][S2][S3].

| Experiment (part) | Base | Cap | Transmit | Notes |
|---|---|---|---|---|
| Crew Report (any crewed pod) | 5 | 8 *(snippet)* | 100% | Needs crew. Repeatable. |
| EVA Report (kerbal) | 8 | 10 *(snippet)* | 100% | Kerbal must be on EVA. |
| Surface Sample (kerbal) | 30 | 40 (recalled) | low (~25%, recalled) | Landed/splashed. In career it needs facility upgrades. |
| Mystery Goo Observation | 10 | 13 *(snippet; another snippet says 18)* | 30% *(snippet)* | Single use until a scientist resets it, or until recovered. |
| Materials Study (SC-9001 Science Jr.) | 25 *(snippet)* | 35 *(snippet)* | ~35% (recalled) | Single use, like Goo. |
| Temperature Scan (2HOT thermometer) | recalled ~8 | ~10 | ~50% | Anywhere. |
| Atmospheric Pressure Scan (PresMat barometer) | recalled ~12 | ~16 | ~50% | In atmosphere or space. |
| Seismic Scan (accelerometer) | recalled ~20 | ~22 | ~45% (snippet: "45% or so" typical) | Landed. |
| Gravity Scan (GRAVMAX) | recalled ~20 | ~22 | ~40% | Space or landed. Biome-dependent in orbit. |
| Atmosphere Analysis (spectro-variometer) | recalled ~20 | ~24 | ~50% | Inside an atmosphere. |
| Asteroid / comet sample | high | — | — | Taken on EVA from a grabbed or nearby asteroid or comet [S1]. |

**The value formula.** The community breaks a result into three parts [S3]:

`points = baseValue × bodySituationMultiplier × remainingFraction × (transmit ? xmitScalar : 1)`

- **Body/situation multiplier.** Each body has six multipliers, one per situation. Kerbin is deliberately low: landed is 0.3 [S1]. Values climb with distance and difficulty. The Mun's landed value has been reported as 3.5 in an older table and about 4 later [S1]. Outer and hard bodies (Laythe, Eeloo, Tylo) reach double digits. Kerbol's high-space multiplier was cut from 6.5 to 2 around v0.90 [S4], a reminder that these are tuning knobs that move.
- **Diminishing returns.** Each subject has a cap of `cap × multiplier`. The first run yields the base value, and repeats yield a share of what remains. A wiki-talk proposal models this as `Y = T × S × (1 − P/C)`, where T is the transmission scalar, S the situation-adjusted value, P the points already earned and C the cap. Its own author flagged it as unsourced [S2]. In practice: one run yields most of the value, a second yields a little, and a third is nearly worthless.
- **Transmission penalty.** Each experiment has its own transmit scalar. Reports are 100%, while Goo is 30% [S2]. Data size in "Mits" governs how long transmission takes and how much electric charge it costs, and it scales with the result's value [S2].

**Mobile Processing Lab (MPL-LG-2).** This is a crewed lab that does two jobs [S6][S7]:
1. **Cleans** single-use experiments (Goo, Materials Bay) so they can be run again.
2. **Processes data.** You load a result into the lab once per subject. Over time it converts stored *data* into *science* at about 1 data : 5 science. The rate rises with the amount of data stored and with the number and level of scientists aboard (it needs at least one scientist). It draws heavy power, about 5 EC/s. One player reports that a landed lab gets more data per result than one in orbit around the same body [S6].

The lab turns science into an idle income stream. Many players consider it the most exploitable part of KSP1 science.

**Breaking Ground deployed science (expansion, May 2019, v1.7.1)** [S10]. Kerbals on EVA unpack a central station, power (solar or RTG), an antenna booster and instruments: weather station, active seismometer, goo observation unit and ion detector. The station must stay in place and transmit over time. The seismometer also needs *impacts*, which pushes players to crash spent stages near it on purpose [S10]. This was KSP1's only stock "long-running experiment" mechanic. Scientist level affects the yield; the exact numbers could not be verified.

### 1.2 KSP1: tech tree and R&D gates **[KSP1]**

- Each node costs science and unlocks a set of parts. Some nodes need *all* their parents; in stock, only Nuclear Propulsion and Ion Propulsion do. The rest need *any* parent [S8].
- Node costs climb steeply by column. The first nodes cost single digits, the deep nodes hundreds to about 1,000. The whole stock tree costs **18,468** science including two hidden placeholder nodes (Nanolathing 550, Experimental Motors 1,000), or **16,918** without them [S8].
- **R&D facility level caps** in Career: level 1 can research only nodes under 100 science, level 2 up to 500, level 3 has no limit [S9]. Upgrading costs funds, which ties science to the economy.
- In Career, unlocked parts must also be *purchased* once with funds before use. That is a setting; see 07-economy-and-career.md.

### 1.3 KSP2 "For Science!" (v0.2.0.0, 19 Dec 2023) **[KSP2]**

**Status.** Early Access launched 24 Feb 2023. For Science! added *Exploration Mode*, the **R&D Center** and **Mission Control** buildings, a **Research Inventory** app, 9 science parts, a 4-tier tech tree and 41 missions [S13][S14]. Patches 0.2.1 and 0.2.2 (the latter in April 2024) followed. Take-Two then laid off the Intercept Games team, with WARN-notice layoffs effective 28 June 2024. No further science content shipped [S17][S18].

**Design intent.** The developers said KSP1 science rewarded veteran players far more than newcomers. They wanted players to spend time building and flying, not on chores like resetting experiments or ferrying reports [S15].

**Data vs samples.** Every experiment produces a *Data* report, a *Sample*, or *Both* [S16]. Data can be transmitted to KSC from inside comm range. Samples must be physically returned and recovered. Recovering a craft awards everything in its research inventory [S11]. The kontrolsystem2 API (a public mod scripting reference) shows how a report is modelled: experiment id, research location (body + situation + optional region), science value, EC required, time required, transmission size, and transmission progress [S16].

**Situations.** KSP2 merges flying low and flying high into one. The API lists *Landed, Splashed, Atmosphere, LowOrbit, HighOrbit* (plus "None") [S16]. Biomes are called *regions*, and an experiment can be flagged `region_required` [S16].

**Experiments (KSP2 base values)** [S11]:

| Experiment | Type | Base data | Base sample | Transmit size | Crew | Run time | Requirement |
|---|---|---|---|---|---|---|---|
| Crew Observation | Data | 4 | — | 5 KiB | 1 | instant | Crew aboard, any situation |
| Environment Survey | Data+Sample | 5 | 5 | 10 KiB | 0 | instant | Any situation |
| Surface Survey | Data+Sample | 6 | 18 | 20 KiB | 0 (1 on EVA) | 0:10 | Landed or submerged |
| Orbital Survey | Data+Sample | 6 | 14 | 150 KiB | 0 (2 for Starlab) | 6:00 | Low/high orbit over a region |
| Atmospheric Survey ("Air Sniffer") | Data+Sample | 12 | 28 | 75 KiB | 0 | 2:00 | Moving through an atmosphere |
| Marine Survey | Data+Sample | 12 | 28 | 150 KiB | 1 | 0:30 | Submerged (Eve, Kerbin, Laythe, Vall) |
| Radiation Observation | Data | 16 | — | 25 KiB | 0 | 1:00 | Any situation |

Notable changes from KSP1:
- **Timed experiments with run states.** Experiments have a running time and states such as READY, RUNNING, PAUSED, INVALIDLOCATION, LOCATIONCHANGED, OUTOFRESOURCE, INSUFFICIENTCREW and ALREADYSTORED [S16]. The Orbital Survey pauses when the craft crosses into a new region. The patch notes recommend geostationary or large elliptical orbits for it [S14]. The Atmospheric Survey's long run time requires a vehicle that can loiter, such as a plane or a slow lander [S14].
- **Prompting instead of clicking parts.** An *Experiment Actions* button lights up whenever the current location offers an experiment opportunity [S14]. Combined with ALREADYSTORED de-duplication, this removed most of KSP1's right-click spam.
- **Fewer, broader experiments.** The roster dropped from about 11 KSP1 instruments to 7 experiment types. Each type can yield both a sample and data, and samples are worth roughly 2–3× more but must be flown home [S11].
- **Missions are the main early income.** Mission rewards total **86,875 science** across all 41 missions, against a tree costing 152,080 [S12]; see 06-missions-contracts-achievements.md.
- **Points of interest.** About "a couple dozen" discoverables and monuments are spread across the system, worth visiting for science and missions [S14].
- No Mobile Processing Lab and no Breaking Ground-style deployables shipped.

**KSP2 tech tree** [S12]:

| Tier | ≈Nodes | Science to fully unlock | Focus |
|---|---|---|---|
| 1 | 25 | 1,010 | Kerbin and its moons |
| 2 | 26 | 11,170 | First interplanetary flights, nuclear propulsion |
| 3 | 20 | 42,900 | Deep space |
| 4 | 16 | 97,000 | XL craft |
| 5+ | — | — | **[KSP2 roadmap — never shipped]** colonies; interstellar tiers implied |

The whole tree costs **152,080** science, about 8× KSP1's, because KSP2 rewards are inflated to match. A tier unlocks when its "top-level" gate nodes in the previous tier are researched; for example, Power Launchers (180) opens Tier 2 [S12]. Tier sums from per-node costs don't exactly match the stated totals for Tiers 1–2, so the wiki data is imperfect [S12]. The original Early Access roadmap had *Science → Colonies → Interstellar → Exploration → Multiplayer* milestones [S20]. Only Science shipped.

---

## 2. Player experience

- **KSP1, early game.** Science is a treasure hunt. The first hop to the KSC's own biomes and the first Mun landing feel generous, and each new situation is a small discovery. Situation and biome rules create emergent "plans", like an EVA report over every Minmus biome in a single flight.
- **KSP1, mid and late game.** It turns into bookkeeping. Players right-click dozens of parts, reset Goo, juggle transmit-or-keep decisions, and farm the MPL. The tree is often finished before the outer planets are visited, so science stops mattering. Many players install mods (ScienceAlert, [x] Science!) just to track which subjects are left.
- **KSP2.** The prompt-driven flow is cleaner and less fiddly. But the experiment set is smaller and long run times tie science to *mission design*, which most players read as the intended direction. Missions carry the early tree, so experiments can feel secondary. With a 4-tier tree and no colonies, the endgame is thin.

## 3. Interactions with other systems

- **Missions/contracts** pay science (and in KSP1 also funds and reputation); see 06-missions-contracts-achievements.md.
- **Economy.** KSP1's R&D level caps are bought with funds, and parts must be purchased after unlock; see 07-economy-and-career.md and 02-space-center-and-buildings.md.
- **Crew.** Scientists reset experiments and boost labs and deployables. EVA reports and samples need a kerbal; see 08-crew.md.
- **CommNet.** Transmission needs a connection, and data size × bandwidth sets transmit time; see 09-communications-network.md.
- **Bodies.** Multipliers, biomes/regions, POIs and atmosphere/ocean presence define where science is available; see 10-celestial-bodies-and-world.md.
- **VAB.** Instrument mass, power and placement are design constraints, and KSP2 states that part shape affects performance [S14]; see 03-vehicle-assembly.md.
- **Colonies.** KSP2 Tier 5 was meant to unlock colony parts; see 11-colonies-resources-interstellar.md.
- **Modding.** KSP1's experiment and body-multiplier configs were plain text, which made science heavily modded; see 12-modding.md.

## 4. Known problems / criticism

1. **Repetitive click-spam** in KSP1 (reset, collect, transmit for each part) [S15].
2. **Exploits.** Biome hopping near KSC, MPL idle farming, and stacking many cheap Goo canisters.
3. **The tree is finished too early.** At 18.5k total, KSP1 players often complete it before Jool, so late science is pointless.
4. **Opaque values.** There is no stock checklist of remaining subjects and caps, and the formula is undocumented in-game (the community still debates it [S2]).
5. **Science is only a currency.** Results don't *reveal* anything about the world. Community suggestions asked for an encyclopedia that fills in as data arrives [S21] (see 14-strengths-weaknesses-and-player-feedback.md).
6. **KSP2 specifics.** Orbital Survey pausing on region change [S14]. Mission rewards dwarf experiments [S12]. Only 7 experiment types. No labs or deployables. The tree ended at Tier 4 because of the shutdown.

## 5. Implications for Orbital

Orbital's goal is for players to feel like **scientists** and not just currency farmers. Science should teach players something about the world and feed decisions in the economy and engineering.

1. **Adopt: a subject matrix (experiment × body × situation × region) with per-subject diminishing returns.** It is proven, it rewards exploration, and it is simple to make deterministic. Store `collected/cap` per subject in the World save.
2. **Improve: put every number in moddable data.** Base, cap, transmit scalar, data size, situations, region dependency, run time, EC, crew and sample/data flags all live in the stock mod through the SDK. Body multipliers live on the body definition (10-celestial-bodies-and-world.md). KSP1's tunable configs were the reason science mods thrived.
3. **Adopt: KSP2's data-vs-sample split.** Data is transmittable, constrained by the comms network (09). Samples need a return trip. This creates real logistics and sample-return mission design.
4. **Improve: make results produce knowledge.** Each result should fill in a body "dossier": atmosphere profile from barometer/thermometer readings, gravity anomalies, resource hints, ocean depth. Some dossier entries can unlock gameplay, such as more accurate landing predictions, resource maps (11) or aerobraking data. This is the "feel like a scientist" lever.
5. **Adopt: KSP2-style prompts and run states.** Use an "Experiment available" indicator in the Science dock panel, plus explicit states (READY/RUNNING/PAUSED/INVALID). Auto-run rules should be scriptable (kOS-like): "run all fresh experiments on situation change". This removes spam without removing player agency.
6. **Improve: timed and long-duration experiments as engineering problems.** Use loiter, survey and deployed-station experiments that need power, comms and time, similar to Breaking Ground and KSP2's surveys. Simulate them on rails deterministically, so a station on the Moon earns while the player flies elsewhere.
7. **Avoid: an unbounded idle converter like the MPL.** If Orbital adds labs, cap the output per subject or per body, or make lab output feed *research projects* instead of raw points.
8. **Improve: a tech tree that can't be "finished" too early.** Use tiers gated by *milestones* (reach orbit, land on the Moon) as well as points, as KSP2's gate nodes did. Science should also have sinks beyond nodes: part upgrades, experimental prototypes, and contracts that ask for specific data.
9. **Adopt: an R&D building level that caps node cost** (KSP1's 100/500/unlimited), but only in Career. Science mode should not use funds.
10. **Improve: an investor angle.** In Career, rare data (first samples from a body) can be *sold or licensed* to agencies for funds or reputation through Administration (07). This makes the scientist, engineer and investor roles interact.
11. **Adopt: an honest in-game science archive.** Show every subject with collected/cap and where it was earned. The UI concept's honest-placeholder rule (`[—]`) fits well here, and it avoids the need for KSP1's tracking mods.
12. **Avoid: hard-coding instrument lists in core.** The experiment kinds and the situations enum should be extensible by mods. Even KSP2 hard-coded only 5 situations [S16].

## 6. Sources

- [S1] KSP Wiki, "Science", https://wiki.kerbalspaceprogram.com/wiki/Science, checked 2026-10-17. Community wiki (official-hosted); bot-blocked, used via search snippets.
- [S2] KSP Wiki, "Talk:Science", https://wiki.kerbalspaceprogram.com/wiki/Talk:Science, checked 2026-10-17. Community wiki talk page; speculative formula, snippets only.
- [S3] KSP Forum, "Understanding science points", https://forum.kerbalspaceprogram.com/topic/56973-understanding-science-points, checked 2026-10-17. Forum post (community explanation, older version).
- [S4] KSP Forum, "Kerbol orbit disappointing science return", https://forum.kerbalspaceprogram.com/topic/123699-kerbol-orbit-disappointing-science-return, checked 2026-10-17. Forum post.
- [S5] KSP Forum, "How to find the boundary between high space and near space", https://forum.kerbalspaceprogram.com/topic/123787-how-to-find-the-boundary-between-high-space-and-near-space, checked 2026-10-17. Forum post; conflicting answers.
- [S6] KSP Wiki, "Mobile Processing Lab MPL-LG-2", https://wiki.kerbalspaceprogram.com/wiki/Mobile_Processing_Lab_MPL-LG-2, checked 2026-10-17. Community wiki (snippets).
- [S7] KSP Forum, "Reducing data/science conversion rate in Mobile Processing Lab", https://forum.kerbalspaceprogram.com/topic/184716-reducing-data-science-conversion-rate-in-mobile-processing-lab, checked 2026-10-17. Forum post.
- [S8] KSP Wiki, "Technology tree", https://wiki.kerbalspaceprogram.com/wiki/Tech_tree, checked 2026-10-17. Community wiki (snippets).
- [S9] KSP Wiki, "Research and Development", https://wiki.kerbalspaceprogram.com/wiki/Research_and_Development, checked 2026-10-17. Community wiki (snippets).
- [S10] KSP Wiki "Breaking Ground", https://wiki.kerbalspaceprogram.com/wiki/Breaking_Ground, and official product page https://kerbalspaceprogram.com/games-breakingground, checked 2026-10-17. Wiki plus official marketing (snippets).
- [S11] Kerbal Wiki (KSP2), "Science", https://kerbal.wiki/Science, checked 2026-10-17. KSP2 community wiki, edited Sept 2024; fetched in full.
- [S12] Kerbal Wiki (KSP2), "Tech Tree" and "Missions", https://kerbal.wiki/Tech_Tree, https://kerbal.wiki/Missions, checked 2026-10-17. KSP2 community wiki; some internal inconsistencies.
- [S13] Kerbal Wiki (KSP2), "For Science!", https://kerbal.wiki/For_Science!, checked 2026-10-17. KSP2 community wiki (release-note summary).
- [S14] Steam news, KSP2 "For Science!" announcement/patch notes, https://store.steampowered.com/news/posts/?feed=steam_community_announcements&appids=954850, checked 2026-10-17. Official.
- [S15] PCGamesN, "…Kerbal Space Program 2…For Science", https://www.pcgamesn.com/kerbal-space-program-2/for-science, checked 2026-10-17. Press article with developer interviews.
- [S16] kontrolsystem2 docs, "ksp::science", https://kontrolsystem2.readthedocs.io/en/latest/reference/ksp/science.html, checked 2026-10-17. Public mod scripting API reference (shows KSP2 data model; not official).
- [S17] Wikipedia, "Kerbal Space Program 2", https://en.wikipedia.org/wiki/Kerbal_Space_Program_2, checked 2026-10-17. Encyclopedia (secondary).
- [S18] PC Gamer, "Kerbal Space Program developers confirm layoffs are coming at the end of June", https://pcgamer.com/gaming-industry/kerbal-space-program-developers-confirm-layoffs-are-coming-at-the-end-of-june, checked 2026-10-17. Press.
- [S19] Ludo.guide, "Scientific Instruments — KSP", https://www.ludo.guide/guide/kerbal-space-program/items-equipment/utility-science/scientific-instruments, checked 2026-10-17. Low-reliability guide site (only confirmed instrument names).
- [S20] KSP official news, "What's next: Early Access roadmap", https://kerbalspaceprogram.com/news/ksp-2-news-article-whats-next-early-access-roadmap-1, checked 2026-10-17. Official (via search summary).
- [S21] KSP Forum, "KSP2 science progress" (2022 design-wish thread), https://forum.kerbalspaceprogram.com/topic/210215-ksp2-science-progress, checked 2026-10-17. Forum post (community wishes, not documentation).
