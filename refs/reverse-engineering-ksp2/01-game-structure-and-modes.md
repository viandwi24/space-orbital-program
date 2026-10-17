# 01 — Game structure and modes

How a player's progress is packaged: the save container ("save" in KSP1, "campaign" in KSP2), the game modes that decide which progression systems are active (Sandbox / Science / Career in KSP1; Sandbox / Exploration in KSP2), the difficulty rules fixed at creation or changeable later, and the onboarding (tutorials, training, scenarios) that teaches a new player the basics. This layer decides which other systems are switched on, so it is the first thing Orbital's "World" concept needs to get right.

> **Status note.** KSP2 Early Access launched 24 Feb 2023. The *For Science!* update (v0.2.0.0, 19 Dec 2023) added Exploration mode. The last patch was v0.2.2.0 on **11 Jun 2024**: it was announced 25 Apr 2024 and shipped in June, so "April 2024" is the announcement date, not the release [S6][S7]. In May 2024 Bloomberg reported that Take-Two would close Intercept Games. Former staff said the layoffs took effect 28 Jun 2024 [S5]. Anything below tagged **[KSP2 roadmap — never shipped]** was announced only.

---

## 1. How it works

### 1.1 Save containers

| | **[KSP1]** | **[KSP2]** |
|---|---|---|
| Top-level unit | A named **save** folder under `saves/<name>/` | A named **campaign**. Each campaign holds several save files (named saves, autosaves, quicksaves) under `Saves/SinglePlayer/<Campaign Name>/` [S9] |
| Main state file | `persistent.sfs`. It is loaded when the save opens and rewritten by autosave, on quitting to the main menu, and on quickload [S8] | Per-save files (community reports say JSON). Files grew to hundreds of MB during Early Access, which slowed saving and loading until a later patch [S9][S10] |
| Quicksave | F5 writes `quicksave.sfs` and F9 loads it. Loading discards all progress made since. Mod+F9 opens a menu of other named `.sfs` files [S8] | F5/F9 quicksave and quickload, plus a load menu that lists each save under its campaign [S10] |
| Autosave | One rolling autosave that overwrites `persistent.sfs`. There are no separate autosave slots [S8][S11] | Autosaves are kept inside the campaign. Running two game copies on one campaign folder makes the autosaves overwrite each other [S9] |
| Backups | Each save folder has a `Backups/` folder [S8] | — |
| Craft files | Stored **per save** in `Ships/VAB`, `Ships/SPH` and `Subassemblies`. Stock example craft are copied in [S8] | "Workspaces" (VAB projects, each a set of three files) are stored per campaign. Moving a design to another campaign means copying files by hand, and community guides exist for doing that [S9] |

**Design takeaway:** neither game separates *designs* from *progress*. A design lives inside one save or campaign, so players copy files between saves.

### 1.2 Game modes

**[KSP1]** offers three modes, plus tutorials and scenarios on the Start Game screen [S2][S3]:

| Mode | Currencies | Facilities | Progression |
|---|---|---|---|
| **Sandbox** | None | All facilities at maximum level | Every part unlocked, no limits |
| **Science** | Science only | Facilities at maximum level (no upgrade economy) | Science points unlock tech-tree nodes |
| **Career** | Funds, Reputation, Science | Start at level 1 and are upgraded with funds | Contracts, strategies, crew hiring, and limits per facility level (see 02 and 07) |

**[KSP2]** [S5][S6][S12]:

| Mode | Shipped? | Notes |
|---|---|---|
| **Sandbox** | Yes, at EA launch (Feb 2023) | Every part available. Until Dec 2023 it was the only mode |
| **Exploration** | Yes, v0.2.0.0 (Dec 2023) | Wikipedia calls it the replacement for KSP1's Science mode [S5]. Science points (from experiments and missions) unlock a 4-tier tech tree. Mission Control (story missions from "Dr. Keri Kerman") and the R&D Center appear only in this mode [S12][S13]. There are **no funds and no reputation** |
| Career with money | **[KSP2 — never planned]** | The creative director said currency was "out" and resources "in" for the career-equivalent mode [S14]. See 07 |
| Colonies, interstellar, multiplayer | **[KSP2 roadmap — never shipped]** | Planned after For Science! [S5] |

### 1.3 Difficulty and game rules

**[KSP1]** The New Game screen has a Difficulty button with four presets (Easy, Normal, Moderate, Hard) and Custom [S1]. The settings fall into two groups:

- **Changeable mid-game from the KSC pause menu**: allow reverting flights, allow quickloading, missing crews respawn (and the respawn timer), indestructible facilities, re-entry heating, CommNet on/off and its sub-options, plus advanced options such as part and kerbal g-limits and pressure limits [S1][S4].
- **Fixed at creation (Career, and Science where relevant)**: reward multipliers, starting currencies, and penalty multipliers [S1].

| Setting (Career) | Easy | Normal | Moderate | Hard | Range |
|---|---|---|---|---|---|
| Science rewards | 200% | 100% | 90% | 60% | 10–1000% |
| Funds rewards | 200% | 100% | 90% | 60% | 10–1000% |
| Starting funds | 250,000 | 25,000 | 15,000 | 10,000 | — |
| Starting science / reputation | 0 | 0 | 0 | 0 | — |
| Funds penalties | 50% | 100% | 150% | 200% | 10–1000% |
| Reputation penalties | 50% | 100% | 150% | 200% | 10–1000% |
| Allow revert / quickload | on | on | on | off | toggle |
| Indestructible facilities | on | — | — | — | toggle (only the Easy value was confirmed) |

*Source: official KSP wiki "Game Difficulty" table, via search excerpts [S1]. Reputation-reward values and some toggle defaults per preset were not fully verified. Treat blank cells as unknown.*

**[KSP1, Making History]** adds an "Allow other launch sites" rule that enables Woomerang and Dessert. Players report that turning it on after a career has started may not work reliably [S15].

**[KSP2]** Difficulty options are set at campaign creation. Community reports mention science gain and re-entry-heating options, and one player says difficulty can be changed during a playthrough [S16]. A patch note fixing "difficulty settings don't persist after ESC menu closure" suggests some settings can be edited from the in-flight Escape menu [S12]. **I could not verify the full option list or the preset values from a public source.** Treat KSP2's difficulty set as smaller than KSP1's, editable mid-game, and not documented in detail.

### 1.4 Tutorials, training, first-time experience

**[KSP1]** Start Game leads to Resume, New, **Training** (tutorials) and **Scenarios**. Scenarios are prebuilt situations, some of them NASA-themed [S2][S3]. The tutorials are text-and-checkpoint walkthroughs, and players have long criticised them as thin. Community resources (wiki tutorials, YouTube channels) did most of the real teaching [S11].

**[KSP2]** The **Training Center** at the KSC holds four tutorial sets of animated lessons run by the AI "P.A.I.G.E." inside a simulation [S17][S18][S12]:

| Set | Lessons |
|---|---|
| Space Is the Place | 7 |
| Missing the Ground | 6 |
| Orbits are Weird | 4 |
| Orbital Transfers | 4 |

They cover building a basic rocket, reaching orbit and flying to the Mun [S18]. The developers presented them as a large improvement over KSP1's onboarding, and "Space is the Place" was promoted as an animated in-game tutorial (Feb 2024) [S12]. Exploration mode's first missions act as a second, guided onboarding path [S13].

---

## 2. Player experience

- **[KSP1] Sandbox** is a design toy, and **Career** is a management game layered on top. **Science** is the "progression without accounting" middle ground and is popular with players who find Career's money grind tedious (see 07).
- KSP1 difficulty is flexible but split in two: penalties and starting values are locked forever, while revert and quickload can be changed freely. Players treat revert and quickload as "anti-frustration" switches, and turning them off is the classic Ironman challenge.
- **[KSP2]** A new player is pointed to the Training Center first, and that path is more polished than KSP1's. Exploration then hands over a mission arc with light story. For 10 months, though, the game had only Sandbox, so early players had no progression loop at all, which was a major review complaint [S5].
- Saves feel fragile in both games. Players keep F5-ing and copy save folders by hand. Large KSP2 saves made saving and loading slow [S10].

## 3. Interactions with other systems

- Mode decides whether funds, reputation and contracts exist: 07-economy-and-career.md, 06-missions-contracts-achievements.md.
- Mode decides which KSC buildings and facility levels exist: 02-space-center-and-buildings.md.
- Science rewards and the tech tree: 05-science-and-research.md.
- Respawn and crew-death rules: 08-crew.md. The CommNet toggle: 09-communications-network.md.
- Re-entry heating and g-limits: 04-flight-and-controls.md, 10-celestial-bodies-and-world.md.
- Save and craft file portability, and mods: 03-vehicle-assembly.md, 12-modding.md.
- The New Game and campaign screens: 13-ui-ux-patterns.md.

## 4. Known problems / criticism

1. **[KSP1]** Craft are stored per save, so players copy `.craft` files between saves.
2. **[KSP1]** Reward and penalty multipliers are locked after creation. A player who misjudged a career has to restart.
3. **[KSP1]** A single rolling autosave plus one quicksave slot is easy to lose. One quickload wipes all progress since that quicksave [S8].
4. **[KSP1]** The tutorials are weak, and onboarding was left to the community [S11].
5. **[KSP2]** No progression mode for 10 months. When it came, Exploration had no economy, so there is still no money-based career (see 07).
6. **[KSP2]** Saves grew very large and slow, and save corruption was reported during EA [S10].
7. **[KSP2]** The difficulty options are poorly documented. There is no public preset table.

## 5. Implications for Orbital

Orbital already has save/load. Its World concept (mode + star system + difficulty + rules + progress + site + vessels + crew + comms; mods and vessel designs global) fits most of these lessons.

1. **Adopt** the three modes, Sandbox / Science / Career, as *presets over feature flags* (economy, science, contracts, crew mortality, comms), not as hard-coded branches. The stock-game-as-mod architecture can then let modders ship new modes.
2. **Improve** on KSP1 by making designs global (already planned). Add a per-World **"design compatibility" check**: missing mod parts and parts still locked in this World's tech tree, shown as a badge in the Hangar.
3. **Improve** on KSP1's split rules by grouping World settings into *Physics* (heating, g-limits, comms), *Forgiveness* (revert, quickload, respawn) and *Economy* (multipliers, start values). Allow every group to change mid-game, but **record changes in a World changelog** so achievements and leaderboards can show "rules changed on day X". This avoids KSP1's "restart to fix a mistake".
4. **Adopt** KSP1's numeric multiplier ranges (10–1000% rewards and penalties) and its preset table as the starting point for Orbital's presets. They are well understood by the KSP audience.
5. **Improve** saves: a World holds a rolling ring of N autosaves plus named snapshots. Quickload rewinds the deterministic sim, and the save keeps the *input log* so a player can branch from any snapshot without losing later ones.
6. **Adopt** a "use other launch sites" rule as part of the Site model, not a hidden difficulty flag (see 02).
7. **Improve** onboarding: build tutorials as *scripted scenarios using Orbital's kOS-like scripting* (a tutorial is a mod with a checker script). This copies the structure of KSP2's Training Center (themed sets of short lessons) and lets the community write lessons.
8. **Adopt** KSP1-style **Scenarios** (a pre-built World snapshot plus a goal) as a first-class World template. They cost little and work for teaching, challenges and sharing.
9. **Avoid** KSP2's 10-month "Sandbox only" phase. Ship a minimal Science mode before polishing Sandbox content, because the progression loop is what keeps players.
10. **Avoid** opaque difficulty. Show the effective multipliers on the World card and in the Administration building so the player always knows the rules.
11. **Adopt** the World card warning for missing mods (already in the concept), and extend it to *rule-changing mods*: a mod that alters economy constants is shown as a rule, not just as content.

---

## Sources

- [S1] KSP Wiki — "Game Difficulty". https://wiki.kerbalspaceprogram.com/wiki/Game_Difficulty — checked 2026-10-17 — official community wiki. Read via search excerpts because direct fetch was blocked.
- [S2] KSP Wiki — "Tutorial: Game Manual". https://wiki.kerbalspaceprogram.com/wiki/Tutorial:Game_Manual — checked 2026-10-17 — official community wiki (via search excerpt).
- [S3] Critic.co.nz — "Kerbal Space Program" review. https://www.critic.co.nz/culture/article/5195/kerbal-space-program — checked 2026-10-17 — review.
- [S4] KSP Forum — "Settings explained" (KSP1 Tutorials). https://forum.kerbalspaceprogram.com/topic/158325-settings-explained/ — checked 2026-10-17 — forum post (older, ~2017). Seen via search excerpt.
- [S5] Wikipedia — "Kerbal Space Program 2". https://en.wikipedia.org/wiki/Kerbal_Space_Program_2 — checked 2026-10-17 — encyclopedia (secondary, well-cited).
- [S6] kerbal.wiki — "0.2.2.0". https://kerbal.wiki/0.2.2.0 — checked 2026-10-17 — community KSP2 wiki.
- [S7] changelog.gg — KSP2 update history. https://changelog.gg/games/kerbal-space-program-2-954850/updates — checked 2026-10-17 — aggregator of official Steam news.
- [S8] KSP Forum — "Is there a way to save the game" / save-file explanations (KSP1). https://forum.kerbalspaceprogram.com/topic/190942-is-there-a-way-to-save-the-game — checked 2026-10-17 — forum post (via search excerpt).
- [S9] GamePretty — "KSP2: How to Move Your Blueprints Between Campaign Save File". https://gamepretty.com/kerbal-space-program-2-how-to-move-your-blueprints-between-campaign-save-file/ — checked 2026-10-17 — community guide (Steam guide mirror).
- [S10] SpaceDock — "Savefile Pruner" (KSP2 mod). https://spacedock.info/mod/3348/Savefile%20Pruner — checked 2026-10-17 — mod page (community).
- [S11] KSP Forum — "How do I load autosaves". https://forum.kerbalspaceprogram.com/topic/26134-how-do-i-load-autosaves/ — checked 2026-10-17 — forum post.
- [S12] KSP Forum — "v0.2.0.0 'For Science!' Release Notes". https://forum.kerbalspaceprogram.com/ksp2-release-notes/v0200-for-science-r12/ — checked 2026-10-17 — official patch notes (via search excerpt).
- [S13] PCGamesN — "Kerbal Space Program 2's For Science update adds new Exploration mode". https://www.pcgamesn.com/kerbal-space-program-2/for-science — checked 2026-10-17 — games press.
- [S14] PC Gamer — "Kerbal Space Program director explains why 'colonies are going to change everything'". https://www.pcgamer.com/kerbal-space-program-director-explains-why-colonies-are-going-to-change-everything-lays-out-early-access-plans/ — checked 2026-10-17 — games press interview (2023, via search excerpt).
- [S15] KSP Wiki — "Woomerang Launch Site". https://wiki.kerbalspaceprogram.com/wiki/Woomerang_Launch_Site — checked 2026-10-17 — official community wiki (via search excerpt); plus a Steam discussion on enabling sites mid-career (anecdotal).
- [S16] Steam Community — "Should I buy KSP 2?" discussion. https://steamcommunity.com/app/954850/discussions/0/4033601393691441189/ — checked 2026-10-17 — player forum post (low reliability).
- [S17] kerbal.wiki — "Training Center". https://kerbal.wiki/Training_Center — checked 2026-10-17 — community KSP2 wiki.
- [S18] kerbal.wiki — "Tutorials". https://kerbal.wiki/Tutorials — checked 2026-10-17 — community KSP2 wiki.
