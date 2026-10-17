# 02 — Space center and buildings

The space center is the hub scene between flights: a 3D campus where each building opens one management screen (build, launch, track, research, hire, contract, strategise). In **[KSP1]** Career it is also the main *progression gate*. Each building has three levels, and those levels unlock part counts, mass limits, flight-planning tools, crew capacity, contract slots and strategies. **[KSP2]** reduced it to a navigation hub with no upgrades, and planned colonies as additional hubs that never shipped. This doc covers both, plus launch sites.

> KSP2 shipped Early Access (Feb 2023) and *For Science!* (Dec 2023), and its last patch was v0.2.2.0 (Jun 2024). Colonies were announced but **never shipped** (see 01).

---

## 1. How it works

### 1.1 [KSP1] Buildings and what they do

| Building | Function |
|---|---|
| **Vehicle Assembly Building (VAB)** | Builds vertical craft with radial symmetry, launched from the Launch Pad [S2] |
| **Spaceplane Hangar (SPH)** | Builds horizontal craft with mirror symmetry, launched from the Runway [S2] |
| **Launch Pad** | Rocket launch site. Its level sets the vessel mass and size limit |
| **Runway** | Plane launch site. Its level sets the mass and size limit |
| **Tracking Station** | Shows every vessel and body, switches control, recovers or terminates vessels, tracks asteroids |
| **Mission Control** | Contracts (Career). Its level is also one of the two gates for maneuver nodes |
| **Astronaut Complex** | Hire and fire crew, view the roster |
| **Research & Development** | Tech tree. Also gates some science actions |
| **Administration** | Strategies (Career only) |

In **Sandbox and Science** modes all facilities are at maximum level. Upgrades exist only in **Career** (see 01).

### 1.2 [KSP1] Upgrade levels (Career)

Upgrades arrived in v0.90 "Beta Than Ever" (Dec 2014) [S9]. Each building has 3 levels, bought instantly with funds. The costs below come from the official community wiki as seen in search excerpts. **Older forum posts quote different prices, so costs varied across versions.** One 2015 player reported paying double on Hard [S3]. Treat every cost as approximate.

| Building | Level 1 (free) | Level 2 | Level 3 | Cost L2 → L3 (√ = Funds) |
|---|---|---|---|---|
| **VAB** | 30 parts max; no action groups | 255 parts; basic (stock) action groups | Unlimited parts; custom action groups | √337,500 → √1,267,500 per wiki excerpt [S1]. Older forum posts give much lower figures, so this is uncertain |
| **SPH** | Same pattern as the VAB (30 / 255 / unlimited parts) [S4] | | | Not verified |
| **Launch Pad** | 18 t vessel mass (plus size limits) | 140 t | Unlimited | √75,000 → √280,000 [S5] |
| **Runway** | 18 t | 140 t | Unlimited | √75,000 → √282,000 [S5] |
| **Tracking Station** | Shows orbits only, no patched conics | Patched conics (SOI changes visible) | Can track unknown objects such as asteroids | √150,000 for L2 per wiki; L3 not verified [S6] |
| **Mission Control** | Few active contracts | More active contracts; **flight planning: maneuver nodes need MC L2 *and* TS L2** [S6] | "Unlimited" contracts | Commonly cited as 2 / 7 / unlimited active contracts, but forum figures conflict (12 has also been reported). In practice the game stops offering contracts at about 14–15 active [S7]. Costs not verified |
| **Astronaut Complex** | 5 hired crew; EVA restricted | 12 crew; EVA enabled [S8] | Unlimited crew | Not verified |
| **R&D** | Can research tech nodes costing < 100 science | < 500 science; surface samples allowed when the Astronaut Complex is also L2 [S10][S11] | No limit | Not verified. One player recalled about 510k (Normal) for an R&D upgrade [S10] |
| **Administration** | 1 active strategy, 25% max commitment | 3 strategies, 60% | 5 strategies, 100% | √150,000 → √563,000 [S7] |

*The gating chain that players notice most:* maneuver nodes need **both** Tracking Station L2 and Mission Control L2. Until then, a new career player must fly by eye on the map view. This one interaction makes Career feel harder than the mass and part limits do.

### 1.3 [KSP1] Destructible buildings

Since v0.90, crashes can damage or destroy KSC structures (runway segments, tanks, building parts). In Career a destroyed structure must be **repaired with funds** before the building works again. The *Indestructible Facilities* difficulty toggle turns this off [S12]. Exact repair costs are not published in the sources I could reach.

### 1.4 [KSP1] Launch sites

- **Base game:** the Launch Pad and the Runway at KSC. The Island Airfield is a visitable landmark, not a stock spawn point.
- **Making History DLC (2018):** **Woomerang** (a bare launch pad on a high-latitude peninsula) and **Dessert** (launch pad plus a ~1.75 km airfield running 180/360). They are selected from a dropdown on the VAB/SPH Launch button and need the "Allow other launch sites" difficulty option [S13]. Higher-latitude and inland sites change launch inclination and abort options.
- **Mods:** Kerbal Konstructs and scenery packs add many more sites [S13].

### 1.5 [KSP2] Kerbal Space Center

KSP2's KSC is a **navigation hub with no building levels**. No upgrades are documented in any KSP2 version [S14].

| Building / site | Function | Mode |
|---|---|---|
| **VAB** | Build, save and load vessels. A single editor replaces KSP1's VAB/SPH split: there is one VAB, and launch sites are chosen in it | Both |
| **R&D Center** | Tech tree | Exploration only [S14] |
| **Mission Control** | Story missions from Dr. Keri Kerman | Exploration only [S14][S15] |
| **Tracking Station** | Shows vessels and bodies, renames vessels, takes control | Both |
| **Training Center** | Tutorials (see 01) | Both |
| **Launch Pads ×4** | Four identical pads on islands at the north end | Both |
| **Runways ×2** | Two parallel runways at the south end | Both |
| **Boat Launch** | Ocean launch site off the east coast, the only water launch | Both |
| **Landing Pads ×4** | Small pads west of the VAB for returning stages | Both |

*Source: kerbal.wiki KSC page [S14].* KSP2 has no Astronaut Complex screen and no Administration building, because there is no hiring economy and no strategies (see 07 and 08). I found **no evidence of a shipped "launch from anywhere" feature** in KSP2. Launch-site choice is limited to the KSC pads, runways and boat launch.

### 1.6 [KSP2 roadmap — never shipped] Colonies as new hubs

Developer statements in 2022–23 described [S16][S17]:
- Colonies started from inflatable starter modules (tech tier 4), extended with a **Building Assembly Editor (BAE)** that works like the VAB.
- A colony grows as resources are delivered and gathered. A mature colony eventually gets **its own VAB**, so ships can be built and launched off-Kerbin.
- **Orbital colonies / shallow-gravity construction** were the planned route to interstellar progression: you build where you do not have to climb out of Kerbin's gravity well.
- Colonies were meant to build their own vehicles, including resource-extraction rovers.

None of this shipped before development ended in 2024.

---

## 2. Player experience

- **[KSP1] Career** follows a clear loop: *fly → earn → upgrade a building → bigger rockets / new tools*. The early game feels very constrained (30 parts, 18 t, no maneuver nodes, five crew), and the first upgrades of the Launch Pad, Tracking Station and Mission Control feel like real milestones. Mid-career, money often piles up and every building gets maxed. From then on the KSC stops mattering (see 07) [S18].
- The 3D campus has charm: buildings visibly change between levels, and wrecking the runway with a failed plane is a memorable part of the Kerbal experience. But the KSC is mostly a menu you click through on every turnaround.
- **[KSP2]** The hub is prettier and has more launch options (four pads, two runways, sea launch), but nothing about it progresses. In Exploration, progress lives only in the tech tree and the mission list. The KSC never changes.

## 3. Interactions with other systems

- Facility levels gate the VAB part count and launch mass: 03-vehicle-assembly.md.
- Tracking Station + Mission Control gate maneuver nodes and patched conics: 04-flight-and-controls.md, 13-ui-ux-patterns.md.
- R&D gates tech-node cost and surface samples: 05-science-and-research.md.
- Mission Control gates contract slots: 06-missions-contracts-achievements.md.
- Upgrade and repair costs are the main funds sink, and Administration strategies convert currencies: 07-economy-and-career.md.
- The Astronaut Complex gates crew count and EVA: 08-crew.md.
- The Tracking Station dish and ground stations: 09-communications-network.md (KSP1 CommNet ground-station strength also scales with Tracking Station level).
- Launch-site latitude and terrain: 10-celestial-bodies-and-world.md. Colonies as hubs: 11-colonies-resources-interstellar.md.

## 4. Known problems / criticism

1. **[KSP1]** Upgrades are **binary and front-loaded**: 3 levels with huge price jumps, nothing in between. A mod (Komplexity) expands the stock levels to ten for smoother progression [S3].
2. **[KSP1]** Some gates feel arbitrary: maneuver nodes locked behind two buildings, EVA locked behind the Astronaut Complex. Players see them as artificial difficulty, not as engineering challenges.
3. **[KSP1]** Late Career is a dead hub: once everything is maxed, the KSC has nothing left to offer.
4. **[KSP1]** Destroyed buildings cost money but add little gameplay. Most players turn on indestructible facilities or ignore it.
5. **[KSP1]** VAB/SPH split: two editors and two craft folders for essentially one task.
6. **[KSP2]** No progression in the hub at all. For Science! added buildings but no upgrades, so there is no investor/manager layer.
7. **[KSP2]** The promised payoff (colonies with their own VABs, off-world launch) never arrived.

## 5. Implications for Orbital

Orbital's concept: Space Center site = Hangar, Launchpad, Runway, Mission Center (Tracking Station + Mission Control merged), Astronaut Complex, R&D, Administration, with buildings shown by mode (Sandbox: Hangar, Launch, Mission Center; Science: + R&D; Career: all).

1. **Adopt** the single **Hangar** editor (KSP2's merged VAB) with a launch-site picker. Drop the VAB/SPH split, but keep "vertical" and "horizontal" as symmetry modes.
2. **Adopt** the merged **Mission Center**. KSP1 split tracking and contracts across two buildings for no good reason, and the merge fits the "strategy view" in the concept.
3. **Improve** KSP1's 3 big levels with **modular facility upgrades**: buy individual capabilities (part-count tier, mass tier, pad size, extra contract slot, crew bunks). The player then *invests* deliberately instead of hitting three huge price walls, which supports the "investor" fantasy.
4. **Avoid** gating **core flight tools** (maneuver nodes, patched conics) behind buildings. Orbital already ships them, and taking them away feels punitive. Gate *quality* instead (prediction horizon length, number of nodes, encounter accuracy) through Mission Center upgrades.
5. **Adopt** mass and part limits per Launchpad/Runway level as the main early constraint. They are easy to understand and push clever small-rocket design. Use KSP1's **18 t / 140 t / unlimited** as a reference scale for a Kerbin-sized home planet.
6. **Improve** limits by making them *physical*: pad load rating, tower height, fuel-feed capacity. Mods can then add pads and players can see why a limit exists.
7. **Adopt** multiple launch sites as **Site** objects in the World model (latitude, pads, runways, water), unlocked in Career by purchase or contract. KSP1's Woomerang/Dessert and KSP2's sea launch show that sites add strategic variety.
8. **Improve** on KSP2's never-shipped colonies by designing the **Site abstraction now**, so that a later colony or orbital base is "another Site with buildings". A Hangar at a colony then needs no special case, and the concept already reserves this.
9. **Avoid** costly, meaningless destruction. If buildings are destructible, damage should make the facility *temporarily unavailable* (a time cost) rather than being a pure fund tax, and it should be a World rule.
10. **Adopt** mode-dependent building visibility (already planned), but show **locked buildings as silhouettes with a short explanation** so Sandbox and Science players know what Career adds.
11. **Improve** the late-game hub. Let upgrades keep paying off (throughput: parallel build bays, faster rollout and turnaround if build time is ever added) so the hub still matters after "max level".
12. **Adopt** status chips on buildings (already in the concept: "status always visible"): new contracts, research ready, crew available, upgrade affordable.

---

## Sources

- [S1] KSP Wiki — "Vehicle Assembly Building". https://wiki.kerbalspaceprogram.com/wiki/Vehicle_Assembly_Building — checked 2026-10-17 — official community wiki (via search excerpt; direct fetch blocked).
- [S2] KSP Wiki — "Tutorial: Game Manual". https://wiki.kerbalspaceprogram.com/wiki/Tutorial:Game_Manual — checked 2026-10-17 — official community wiki (via search excerpt).
- [S3] KSP Forum — "Which KSC upgrade first?" and Komplexity mod page. https://forum.kerbalspaceprogram.com/topic/128493-which-ksc-upgrade-first/ ; https://spacedock.info/mod/2805/Komplexity — checked 2026-10-17 — forum post (2015) / mod page.
- [S4] KSP Wiki — "Spaceplane Hangar". https://wiki.kerbalspaceprogram.com/wiki/Spaceplane_Hangar — checked 2026-10-17 — official community wiki (via search listing; costs not read).
- [S5] KSP Wiki — "Runway" and "Launch Pad". https://wiki.kerbalspaceprogram.com/wiki/Runway ; https://wiki.kerbalspaceprogram.com/wiki/Launch_Pad — checked 2026-10-17 — official community wiki (via search excerpt).
- [S6] KSP Wiki — "Tracking Station". https://wiki.kerbalspaceprogram.com/wiki/Tracking_Station — checked 2026-10-17 — official community wiki (via search excerpt).
- [S7] KSP Wiki — "Administration Building"; KSP Forum — "Why can't I exceed 15 contracts with fully leveled-up Mission Control?". https://wiki.kerbalspaceprogram.com/wiki/Administration_Building ; https://forum.kerbalspaceprogram.com/topic/169453-why-cant-i-exceed-15-contracts-with-fully-leveled-up-mission-control/ — checked 2026-10-17 — official community wiki / forum post.
- [S8] KSP Wiki — "Astronaut Complex". https://wiki.kerbalspaceprogram.com/wiki/Astronaut_Complex — checked 2026-10-17 — official community wiki (via search excerpt).
- [S9] KSP Wiki — "0.90.0". https://wiki.kerbalspaceprogram.com/wiki/0.90.0 — checked 2026-10-17 — official community wiki (version history).
- [S10] KSP Wiki — "Technology tree"; Steam discussion "Can't get past some kind of level for research". https://wiki.kerbalspaceprogram.com/wiki/Technology_tree ; https://steamcommunity.com/app/220200/discussions/0/626329821155983346/ — checked 2026-10-17 — official community wiki / player forum (low reliability for costs).
- [S11] KSP Fandom — "Science". https://kerbalspaceprogram.fandom.com/wiki/Science — checked 2026-10-17 — community wiki (via search excerpt).
- [S12] KSP Wiki — "Game Difficulty" (Indestructible Facilities). https://wiki.kerbalspaceprogram.com/wiki/Game_Difficulty — checked 2026-10-17 — official community wiki (via search excerpt).
- [S13] KSP Wiki — "Woomerang Launch Site", "Dessert Launch Site", "Dessert Airfield". https://wiki.kerbalspaceprogram.com/wiki/Woomerang_Launch_Site ; https://wiki.kerbalspaceprogram.com/wiki/Dessert_Launch_Site ; https://wiki.kerbalspaceprogram.com/wiki/Dessert_Airfield — checked 2026-10-17 — official community wiki (stub pages, via search excerpt).
- [S14] kerbal.wiki — "Kerbal Space Center" (KSP2). https://kerbal.wiki/Kerbal_Space_Center — checked 2026-10-17 — community KSP2 wiki.
- [S15] PCGamesN — "KSP2's For Science update adds new Exploration mode". https://www.pcgamesn.com/kerbal-space-program-2/for-science — checked 2026-10-17 — games press.
- [S16] KSP Forum — "The Comprehensive Colony Communications Archive". https://forum.kerbalspaceprogram.com/topic/224423-the-comprehensive-colony-communications-archive/ — checked 2026-10-17 — forum compilation of official developer statements (via search excerpt).
- [S17] PC Gamer — "Kerbal Space Program director explains why 'colonies are going to change everything'". https://www.pcgamer.com/kerbal-space-program-director-explains-why-colonies-are-going-to-change-everything-lays-out-early-access-plans/ — checked 2026-10-17 — games press interview (2023, via search excerpt).
- [S18] AnandTech Forums — "The Kerbal Space Program (KSP) Thread" (career pacing comments). https://forums.anandtech.com/threads/the-kerbal-space-program-ksp-thread.2364657/post-37260471 — checked 2026-10-17 — forum post (anecdotal).
