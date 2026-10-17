# 08 — Crew

How kerbals work as a game system in KSP1 and KSP2: professions, experience, personality stats, hiring, EVA, death and rescue, crew transfer, IVA and portraits. It is a design analysis from public sources only, ending with concrete options for Orbital's planned Astronaut Complex and per-World crew.

> **Source caveat (2026-10-17).** The official KSP wiki and forums blocked automated fetching. KSP1 facts from those pages come from search-engine snippets and are marked *(snippet)*. Facts I recall but could not re-verify are marked *(recalled)*. KSP2 crew mechanics are poorly documented publicly; gaps are stated as gaps.

---

## 1. How it works

### 1.1 KSP1 kerbals **[KSP1]**

**Professions (traits).** Pilot, Engineer and Scientist are hireable. **Tourist** is a fourth, non-hireable class that appears through tourism contracts and cannot do useful work. The *original four* are Jebediah (pilot), Bill (engineer), Bob (scientist) and, later, Valentina (pilot). They are pre-hired and flagged *badass*.

**Skills by profession.** All skills are gated by level when "Enable Kerbal Experience" is on. That is the default in Career; in Science and Sandbox it is off and everyone acts at maximum level [S1][S2].

| Trait | What the level unlocks or boosts |
|---|---|
| **Pilot** | SAS modes on crewed craft. Commonly cited ladder *(recalled)*: L0 stability hold, L1 adds prograde/retrograde, L2 adds normal/anti-normal and radial in/out, L3+ adds target/anti-target and maneuver. Probe cores have their own fixed SAS levels, so a pilot is not mandatory [S1][S2]. |
| **Engineer** | Repairs broken wheels and landing legs on EVA, and repacks parachutes [S1][S2]. Raises drill and ISRU converter efficiency (higher levels mean more output) *(recalled)*. From v1.11, EVA construction lets engineers attach and detach parts in the field, with mass limits rising with crew and level *(recalled)*. |
| **Scientist** | Resets single-use experiments (Mystery Goo, Materials Bay) on EVA. Is required to run the Mobile Processing Lab, where more and higher-level scientists process faster. Boosts Breaking Ground deployed-science output [S1] and 05-science-and-research.md. |

**Experience and levels.**
- Levels run **0 → 5**. The widely quoted thresholds are cumulative XP of 2 / 8 / 16 / 32 / 64. A 2015 player post confirms 16 XP for level 3 [S5]; the full ladder is *(recalled)*.
- **What earns XP.** The *career log* records achievements per body: flight, flyby, orbit, landing, flag planting and so on. Each has a base value times a per-body multiplier. Community examples: Kerbin flight 1, flyby 1.5, orbit 2 [S3]; Mun landing ≈4.6 and Mun flag ≈5, because of the Mun's multiplier [S3].
- **No stacking within a body.** A kerbal gets XP only for the *highest* category achieved on each body, not the sum [S3]. Landing on many different bodies is what levels a kerbal; repeat trips to the same place do not.
- **Recovery is required.** XP from the flight log is banked into the career log only when the kerbal is *recovered* at Kerbin. The difficulty option "immediate level up" can change this *(recalled)*. Stock levelling counts only the career log [S4].
- **Training.** A flight that only reaches suborbital Kerbin gives minimal XP. Players run "training flights" (often a Mun or Minmus flyby) to make new hires useful.

**Personality.** **Courage** and **stupidity** are 0–1 values. They are visible in the roster but mostly cosmetic: they drive facial animations, such as screaming in IVA and portraits during high-g or explosions. The **badass** flag suppresses panic. None of these changes the simulation in a meaningful way *(recalled; widely noted by players)*.

**Hiring and the Astronaut Complex.**
- The cost of the *n*-th hire is **150n² + 12,350n** funds, with n starting at 5 because the original four are pre-hired [S6]. More experienced applicants cost more [S6].
- Roster cap by building level: **5** at level 1, **12** at level 2, **unlimited** at level 3 [S6]. Rescued kerbals join even above the cap [S6].
- **EVA and flags.** At level 1 of the complex, EVA is restricted to the ground at Kerbin; flags need an upgrade. The level 2 upgrade enables EVA elsewhere [S6].
- The roster shows **Available / Assigned / Lost** tabs, plus *Applicants*. Firing is possible.

**EVA.**
- **Movement.** Walk, run, swim, climb ladders, and use an **EVA jetpack** with its own propellant that refills in the pod *(recalled)*. A personal parachute was added in a 1.x update *(recalled)*.
- **Actions.** EVA report, surface sample, flag planting, grabbing/boarding, taking data from experiments into the suit, cleaning experiments (scientist), repairs (engineer), and since 1.11 a cargo **inventory** and EVA construction *(recalled)*.
- **Tourists** are restricted from meaningful EVA *(recalled)*.

**Death, MIA and respawn.**
- A kerbal in a destroyed part is **K.I.A.** (killed). A kerbal on a vessel that is lost or abandoned in a way the game treats as missing is **M.I.A.**
- The difficulty option "Missing crews respawn" brings M.I.A. kerbals back to the roster after a delay *(recalled)*. Death costs reputation in Career; see 07-economy-and-career.md.
- One mod thread states that each MIA kerbal of a profession raises that profession's hire cost by 5% [S6]. Treat this as unverified for stock.

**Rescue.** Rescue contracts spawn a stranded kerbal in orbit or on the surface, sometimes with a broken part. Recovering them adds them to the roster for free, often with a profession the player lacks [S6] and 06-missions-contracts-achievements.md.

**Crew transfer and assignment.**
- In the VAB/SPH the crew manifest auto-fills seats; you can swap kerbals before launch.
- In flight, you can transfer crew between connected crewed parts through a part's context menu (since 1.0) or go via EVA.
- Crew capacity is per part (pods, cabins, lab, cupola).

**IVA and portraits.**
- Each crewed part has an **IVA** interior with working props (navball, gauges). Players can fly from IVA, and IVA mods such as RasterPropMonitor extended it heavily.
- **Live portraits** of every crew member sit in the lower right of the flight view. They show the kerbal's real-time face, reacting to g-forces and danger. This is one of KSP1's signature emotional devices.

### 1.2 KSP2 kerbals (Early Access → v0.2.2) **[KSP2]**

- **What shipped.** Kerbals as crew with EVA (walk, jump, jetpack, ladders, flags) and EVA-gated science (the Surface Survey needs 1 crew on EVA; Crew Observation needs crew aboard) [S7][S8]. Experiments declare `crew_required` [S9]. Death is shown as kerbals "poofing" on vacuum exposure [S10]. A **Kerbal Manager** is used for the roster and seat assignment [S10]. Live portraits sit in the flight UI, and For Science! fixed EVA behaviour and portraits [S11].
- **Cosmetics.** The **Kerbal Variety System** gives kerbals varied skin tones, hair, facial hair and glasses, and For Science! added dozens of items [S10][S11]. Every 40th generated kerbal is a developer "dev kerbal" [S10].
- **No professions, XP, levels or personality stats** were found in any public KSP2 documentation or patch notes I could access [S7][S11]. KSP2 crew are interchangeable, and SAS availability comes from parts, not pilots. I treat this as the shipped state, while noting that the evidence is the absence of documentation.
- **No IVA in KSP2 Early Access.** It was not included in any update notes I found *(recalled; widely discussed by players)*.
- **No Astronaut Complex building or hiring economy**; Exploration Mode has no funds [S12].
- **[KSP2 roadmap — never shipped]** Colonies would have housed crew. I found no public, detailed plan for kerbal skills or roles [S13]. Development effectively ended with the 2024 layoffs [S14].

---

## 2. Player experience

- **KSP1.** Kerbals are the emotional core. Players name ships after them, mourn Jeb, and run rescue missions out of attachment. XP gives a light RPG layer, with veteran pilots and "my level-5 engineer on Minmus". The per-body XP rule pushes players to send crews to new places, which aligns crew with exploration. In practice, though:
  - Pilot SAS gating becomes irrelevant once probe cores have full SAS.
  - Courage and stupidity do nothing tangible, so players notice they are flavour only.
  - Hiring costs grow quadratically, so mass hiring is discouraged and rescues become the main source of crew.
  - EVA is a highlight: planting flags, jetpack mishaps, and since 1.11 field repairs and construction.
- **KSP2.** Kerbals look better and more varied, and EVA feels good. With no traits, XP or IVA, however, crew are seat-fillers. There is little reason to care *which* kerbal flies. Players coming from KSP1 frequently cited this as missing depth (see 14-strengths-weaknesses-and-player-feedback.md).

## 3. Interactions with other systems

- **Science.** EVA reports and samples, scientist resets, lab and deployable boosts; see 05-science-and-research.md.
- **Missions/contracts.** Rescues, tourism, crew-count objectives, first-EVA milestones; see 06-missions-contracts-achievements.md.
- **Economy.** Hire cost, death reputation penalties, Astronaut Complex upgrades; see 07-economy-and-career.md and 02-space-center-and-buildings.md.
- **Flight.** Pilot SAS gating, crew transfer, EVA physics, IVA; see 04-flight-and-controls.md.
- **VAB.** Seat capacity, crew manifest, command parts vs probe cores; see 03-vehicle-assembly.md.
- **Comms.** A crewed pod with a pilot can provide local control without a connection (KSP1 CommNet: crewed vessels are always controllable; probes need a signal); see 09-communications-network.md.
- **Resources/colonies.** Engineer ISRU bonuses; KSP2 colonies were to house crew; see 11-colonies-resources-interstellar.md.
- **UI.** Roster screens, portraits, crew panel; see 13-ui-ux-patterns.md.

## 4. Known problems / criticism

1. **Traits are shallow.** Pilot SAS is made obsolete by probe cores, scientist value is mostly the MPL, and the engineer's value arrived late (repairs, ISRU, 1.11 construction).
2. **Courage and stupidity are cosmetic** despite being shown prominently.
3. **XP is unintuitive.** It requires recovery, does not stack per body, and is invisible until the kerbal returns [S3][S4].
4. **Hiring cost is punitive** at quadratic scale [S6].
5. **There are no life needs.** Kerbals have no food, oxygen or radiation in stock, so stranding crew costs nothing except a seat. Life-support mods filled this gap.
6. **KSP2 removed depth**: no roles, XP or IVA. Crew mattered less than in KSP1.

## 5. Implications for Orbital

The planned Astronaut Complex already has Roster/Applicants/Lost tabs, Pilot/Engineer/Scientist, XP, courage/stupidity, radio, EVA time and a flight log. The aim is to make each of these *matter* in the sim.

1. **Adopt: per-World crew with three professions plus tourists,** and a flight log per World (planned). This is proven, readable and emotionally strong.
2. **Improve: traits as moddable data.** `trait: {id, skills: [{effect, levelCurve}]}`, where effects are SDK hooks (sasModes, repair, isruEfficiency, experimentReset, labRate, scriptSlots, commsRelay). Mods can add, for example, a Medic or a Navigator.
3. **Improve: give pilots skills that probes lack.** Examples: finer manual control damping, landing-precision assist, a higher g-tolerance trait, or **piloting kOS-like scripts with fewer restrictions** (more script instruction budget or autopilot features when a pilot is aboard). This avoids KSP1's obsolete SAS gate.
4. **Improve: make courage and stupidity mechanical, deterministically.** Use them for g-tolerance and blackout thresholds, EVA mishap odds (seeded RNG in the sim), panic during re-entry blackout (ties to Orbital's existing blackout system), and the quality of radio chatter and reports. Show the effect in the tooltip.
5. **Adopt: XP by "new place × difficulty"** with KSP1's highest-per-body rule. Improve it by banking XP at *safe return or long-duration presence* (a station or base counts after N days), and show pending XP live in the crew panel.
6. **Adopt: hiring as an investment decision in Career.** Applicants have visible stats and salary/hire cost. Orbital could add **ongoing salaries** (not in stock KSP) as an economy sink, and rescue contracts as cheap recruitment. Keep cost curves in mod data, not core.
7. **Adopt: EVA as a first-class actor.** Jetpack with propellant, ladders, flags, EVA science, repair and part attach; track EVA time per kerbal (planned stat). Make an EVA kerbal a scriptable vessel in the kOS-like API.
8. **Improve: a radio/comms stat.** The suit radio range and the kerbal's radio skill let a crewed lander relay or provide local control (09-communications-network.md). This matches the planned crew radio indicator.
9. **Adopt: K.I.A./M.I.A. with optional respawn** as a World rule (difficulty). Lost kerbals go to the "Lost" tab, with a memorial in the flight log. Death has a reputation cost in Career.
10. **Consider (Improve): optional life support** as a World rule or stock-mod module (food/O₂/days). Off by default to keep the KSP1 feel, but available to make crew logistics an engineering problem.
11. **Adopt: live portraits** in the crew panel with expressions driven by sim state (g-load, heating, blackout). This is cheap and high in emotional value. A full IVA is optional; Orbital's browser target suggests a simple cockpit view or none.
12. **Avoid: KSP2's interchangeable crew.** Even minimal traits create stories and attachment; seat-filler kerbals were a widely felt regression.

## 6. Sources

- [S1] KSP Wiki, "Skill", https://wiki.kerbalspaceprogram.com/wiki/Skill, checked 2026-10-17. Community wiki (snippet).
- [S2] KSP Forum, tag "specializations", https://forum.kerbalspaceprogram.com/tags/specializations, checked 2026-10-17. Forum posts (snippet).
- [S3] KSP Forum, "New experience table" / "Kerbal leveling", https://forum.kerbalspaceprogram.com/topic/107851-new-expierence-table and https://forum.kerbalspaceprogram.com/topic/130929-kerbal-leveling, checked 2026-10-17. Forum posts (community-measured values, snippets).
- [S4] SpaceDock, "KerbalStats" / Field Experience mod description, https://spacedock.info/mod/3736/KerbalStats, checked 2026-10-17. Mod page (describes stock career-log rule; snippet).
- [S5] Steam Community discussion (KSP), https://steamcommunity.com/app/220200/discussions/0/627456486930588325, checked 2026-10-17. Player post, 2015 (snippet; anecdotal).
- [S6] KSP Wiki, "Astronaut Complex", https://wiki.kerbalspaceprogram.com/wiki/Astronaut_Complex, checked 2026-10-17. Community wiki (snippet: hire formula, roster caps, EVA gate). The 5% MIA figure is from a mod thread in the same search, https://forum.kerbalspaceprogram.com/topic/163315-112x-trp-hire-formerly-ksi-hiring.
- [S7] Kerbal Wiki (KSP2), "Science", https://kerbal.wiki/Science, checked 2026-10-17. KSP2 community wiki; fetched in full.
- [S8] Steam news, KSP2 "For Science!" announcement/patch notes, https://store.steampowered.com/news/posts/?feed=steam_community_announcements&appids=954850, checked 2026-10-17. Official.
- [S9] kontrolsystem2 docs, "ksp::science", https://kontrolsystem2.readthedocs.io/en/latest/reference/ksp/science.html, checked 2026-10-17. Public mod API reference (shows `crew_required`, INSUFFICIENTCREW).
- [S10] Kerbal Wiki (KSP2), "Kerbals", https://kerbal.wiki/Kerbals, checked 2026-10-17. KSP2 community wiki; lore-heavy, little on mechanics.
- [S11] Kerbal Wiki (KSP2), "For Science!", https://kerbal.wiki/For_Science!, checked 2026-10-17. KSP2 community wiki (release-note summary).
- [S12] KSP Wiki, "Exploration mode", https://wiki.kerbalspaceprogram.com/wiki/Exploration_mode, checked 2026-10-17. Community wiki (snippet: missions instead of contracts, science-only rewards).
- [S13] KSP official news, "What's next: Early Access roadmap", https://kerbalspaceprogram.com/news/ksp-2-news-article-whats-next-early-access-roadmap-1, checked 2026-10-17. Official (snippet).
- [S14] PC Gamer, "Kerbal Space Program developers confirm layoffs are coming at the end of June", https://pcgamer.com/gaming-industry/kerbal-space-program-developers-confirm-layoffs-are-coming-at-the-end-of-june, checked 2026-10-17. Press.
