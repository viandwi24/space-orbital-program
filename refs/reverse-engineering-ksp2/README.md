# Reverse engineering KSP2 — game-design research for Orbital

How *Kerbal Space Program 2* (KSP2) works as a game, system by system, with *Kerbal Space Program* (KSP1) as the baseline wherever KSP2 lacks or changed a system. Written 2026-10-17 as input for later Orbital ADRs and plans (worlds/modes, Space Center, science, missions/contracts, economy, crew, comms). Research only, no code.

"Reverse engineering" here means **design analysis from public sources only** (official wiki, dev diaries, patch notes, forums, reviews, community wikis, mod pages). No game files were downloaded or inspected. Text is summarised in our own words; every claim is cited.

## How to read the set

- Every system doc has the same shape: **purpose → how it works → player experience → interactions with other systems → known problems → Implications for Orbital → sources**. If you only have ten minutes, read this README, then the *Implications for Orbital* section of the docs you care about.
- Facts are tagged by origin: **[KSP1]**, **[KSP2]** (shipped), **[KSP2 roadmap — never shipped]**, **[Mod: name]**, **[Other: game]**.
- Implications are tagged **Adopt / Improve / Avoid**. They are options for the human to choose from, not decisions.
- Citations are per document (`[S1]`, `[S2]`, …) with a full list at the end of each doc; [`00-sources.md`](00-sources.md) collects them all with reliability notes. The official KSP wiki, fandom wikis and the KSP forum blocked automated fetches, so many KSP1 numbers come from search excerpts and are marked *(snippet)*, *(recalled)* or *†*. **Verify any number before it goes into an ADR.**
- The sibling folder [`beyond/`](beyond/) (written by a parallel session) goes past KSP: player roles and fantasies, a richer comms/radio design, economy dynamics, a universe mode, recommendations. This set is the "what KSP did" baseline; `beyond/` is the "what we could do instead".

## Index

| # | Document | What it answers |
|---|---|---|
| 00 | [Sources](00-sources.md) | Every source, date checked, reliability; corrections to common assumptions |
| 01 | [Game structure and modes](01-game-structure-and-modes.md) | Saves/campaigns, Sandbox/Science/Career vs KSP2 Exploration, difficulty and rules, tutorials |
| 02 | [Space Center and buildings](02-space-center-and-buildings.md) | KSC buildings, three upgrade levels and their gates, launch sites, KSP2's flat hub, colony plans |
| 03 | [Vehicle assembly](03-vehicle-assembly.md) | VAB/SPH vs KSP2's single VAB, workspaces, staging, Δv/TWR tools, part limits, wobble |
| 04 | [Flight and controls](04-flight-and-controls.md) | HUD, navball, SAS unlocks, warp (incl. KSP2 thrust under warp), maneuver nodes, tracking, alarms |
| 05 | [Science and research](05-science-and-research.md) | Experiments, situations/biomes, the science formula, labs, tech trees (KSP1 18.5k vs KSP2 152k science) |
| 06 | [Missions, contracts, achievements](06-missions-contracts-achievements.md) | KSP1 procedural contracts, KSP2 authored missions, Mission Builder, milestones, achievements |
| 07 | [Economy and career](07-economy-and-career.md) | Funds/reputation/science, costs and recovery, strategies, why KSP2 dropped money |
| 08 | [Crew](08-crew.md) | Roles, XP and levels, hiring, EVA, death and rescue; KSP2's role-less kerbals |
| 09 | [Communications network](09-communications-network.md) | CommNet formulas, relays, DSN levels, occlusion, probe control; RemoteTech, frequencies, link budgets |
| 10 | [Celestial bodies and world](10-celestial-bodies-and-world.md) | Kerbol system, scale, time, biomes, discoverables, persistence and on-rails vessels |
| 11 | [Colonies, resources, interstellar](11-colonies-resources-interstellar.md) | KSP2 roadmap vs what shipped, ISRU, delivery routes, interstellar; mod prior art |
| 12 | [Modding](12-modding.md) | KSP1 config/ModuleManager/C#, KSP2's community-only modding, what mods reveal stock lacked |
| 13 | [UI/UX patterns](13-ui-ux-patterns.md) | Patterns and pain points across both games; design principles |
| 14 | [Strengths, weaknesses, player feedback](14-strengths-weaknesses-and-player-feedback.md) | Timeline, reception, why KSP2 failed, competitors, lessons |

## Glossary

| Term | Meaning |
|---|---|
| **KSC** | Kerbal Space Center, the hub scene with the buildings (VAB, SPH, pad, runway, R&D, …). Orbital: *Space Center*. |
| **VAB / SPH** | Vehicle Assembly Building (rockets, vertical) / Space Plane Hangar (planes, horizontal). KSP2 merged both into one VAB. Orbital: *Hangar*. |
| **OAB** | KSP2's planned Orbital Assembly Building for interstellar ships (never shipped). |
| **Career / Science / Sandbox** | KSP1 modes: full economy / science and tech tree only / everything unlocked. |
| **Exploration mode** | KSP2's progression mode (Dec 2023): science points, tech tree and authored missions; no money. |
| **Funds, Reputation, Science** | KSP1 Career's three currencies. |
| **Contract** | KSP1 procedurally generated job with advance, reward, penalty, deadline. |
| **Mission** | KSP2 hand-written objective, primary (story) or secondary (chains); rewards science. |
| **Strategy** | KSP1 Administration policy that converts a share of one currency's income into another. |
| **Situation / Biome** | Where an experiment runs: landed, splashed, flying low/high, space low/high; biome = named region of a body. |
| **Data vs Sample** | KSP2 split: data can be transmitted, samples must be physically returned. |
| **Transmit scalar** | Fraction of an experiment's value you get when transmitting instead of recovering. |
| **MPL** | Mobile Processing Lab: KSP1 part converting stored data into science over time. |
| **Tech tree / node / tier** | Research graph; nodes cost science and unlock parts; tiers gate groups of nodes. |
| **Δv, TWR** | Change in velocity a stage can deliver; thrust-to-weight ratio. |
| **Navball, SAS, RCS** | Attitude indicator; stability assist autopilot modes; reaction control thrusters. |
| **Maneuver node** | Planned burn on an orbit with predicted result; KSP2 modelled finite burns. |
| **On rails / physics range** | Vessels outside the active bubble follow Kepler orbits with no physics; inside (~2.3–2.5 km) they are simulated. |
| **SOI, patched conics** | Sphere of influence; chaining one conic orbit per body. |
| **CommNet** | KSP1 (1.2+) comms network: antenna power, range √(Pa·Pb), relays, signal strength, ground stations. |
| **DSN** | Deep Space Network: KSC ground stations whose power grows with Tracking Station level. |
| **ISRU** | In-situ resource utilisation (mining Ore, converting to fuel). |
| **Discoverables** | KSP2 named points of interest on bodies with their own science region. |
| **EVA / IVA** | Extra-vehicular activity (kerbal outside) / intra-vehicular view (cockpit). |
| **ModuleManager, CKAN, SpaceWarp** | KSP1 data-patching mod; mod package manager; KSP2 community mod loader. |
| **KSP2 Redux** | Volunteer fan project continuing KSP2 after development ended. |

## One-page overview: the KSP2 game loop (and KSP1's)

**KSP2 (Exploration mode, For Science!, final state June 2024)**

1. **Campaign** — create a campaign (Sandbox or Exploration) with a few difficulty options; each campaign holds its own saves and its own craft.
2. **KSC hub** — a flat Space Center: VAB, R&D, Mission Control, Tracking Station, Training Center, several pads and runways. No upgrades, no money.
3. **Mission Control** — pick from hand-written missions: 11 primary (a story arc with Dr. Keri Kerman and alien monuments) and ~30 secondary in branching chains. Rewards are science points (25–10 000).
4. **VAB** — build in a workspace holding several assemblies; procedural wings, paint; Δv/TWR per stage for a chosen body and situation; pick the launch assembly and launch site.
5. **Fly** — redesigned HUD, navball, SAS, maneuver nodes modelling finite burns, time warp **with thrust**; map view and tracking station.
6. **Do science** — 7 experiment types run on timers when their situation is met, producing data (transmittable) or samples (must be recovered). 5 situations; most value per body, extra at discoverables.
7. **Research** — spend science in R&D on a 4-tier tree (≈152 000 science total); gate nodes unlock the next tier.
8. **Repeat** — further, harder bodies; missions complete; tree fills. What was meant to come next — **colonies, resources, delivery routes, interstellar, multiplayer** — never shipped.

**KSP1 Career (the richer baseline)** adds three currencies (funds, reputation, science), procedurally generated **contracts** with advances, rewards, penalties and deadlines, **building upgrades** that gate features (part count, mass, EVA, maneuver nodes, active contracts), **strategies**, **kerbal roles and XP** (pilot SAS modes, engineer repairs, scientist labs), **CommNet** relays and ground stations, **ISRU** with one resource (Ore), asteroids and comets, and the Making History **Mission Builder** for player-authored missions.

The short version: **KSP1 is mechanically deep but grindy and opaque; KSP2 is cleaner and better presented but thin, and it shipped none of its differentiating features.** Mods carried most of the depth in both games.

## Most important findings

1. **KSP2's loss of depth is the clearest lesson.** It dropped money, contracts, building upgrades, kerbal roles/XP, comms occlusion and ISRU, and replaced them with a few hand-written missions and a big science tree. Players missed KSP1's systemic career and procedural contracts, and liked KSP2's authored missions and onboarding (Training Center, P.A.I.G.E.). The best design keeps both: authored arcs plus systemic generation.
2. **Mods show what stock lacked**: readouts (Δv, orbit info), planning (transfer windows, alarms), automation (kOS, MechJeb), simulation depth (life support, comms delay, n-body), career structure (Contract Configurator, Strategia, build time, RP-1 programs) and visuals. Orbital already has a TypeScript SDK and scripting; these are the extension points to design for.
3. **KSP1 Career's economy breaks mid-game** (runaway funds, contract spam, lossy strategies with bugs, opaque reputation). Upkeep, salaries, investments that pay over time, and transparent numbers are the usual fixes.
4. **Gating core flight tools behind building upgrades** (maneuver nodes need Tracking Station L2 + Mission Control L2) is the most resented KSP1 gate. Gate scale and capacity, not basic understanding.
5. **CommNet is small, deterministic and good**, with formulas that fit a pure function: range √(Pa·Pb), combining exponent 0.75, per-hop strength 3x²−2x³, multi-hop product, body occlusion. KSP2 regressed (no occlusion). Mods add what Orbital's concept wants: frequencies (CommNet Constellation), signal delay and a flight computer (RemoteTech), and bandwidth that depends on signal (RealAntennas).
6. **Science works as a matrix** (experiment × body × situation × biome) with diminishing returns and a transmit penalty. KSP2's data/sample split and fewer, timed experiments cut the right-click spam. Tree size controls pacing: KSP1's tree is too small and finishes early; KSP2's is grindy.
7. **Crew matter only if they change outcomes.** KSP1's courage and stupidity are cosmetic; KSP2's kerbals are seat-fillers. Roles and XP that gate abilities (SAS modes, repairs, labs) give recruitment and survival weight.
8. **Persistence and performance**: KSP1 keeps everything outside physics range on rails and simulates nothing in the background; KSP2 saves grew to hundreds of MB; both struggled with wobble and high part counts. Orbital's deterministic, headless sim and compound rigid bodies already avoid the worst of this.
9. **KSP2 failed for organisational reasons more than design**: a studio change in 2020, a sequel-sized roadmap, a codebase rewrite that brought back solved bugs (orbital decay, wobble), a full price for an Early Access build, and publisher cuts in 2024. One strong update (For Science!) did turn reviews around, which shows sentiment recovers.
10. **Planned but unshipped KSP2 ideas are worth borrowing**: delivery routes that replay a proven flight, colonies as new launch sites with a local VAB, multiple resources, persistent thrust under warp, and interstellar as a late game.

## Top 10 decisions for the human

Each is a fork that the later ADRs need. The leaning given is a suggestion drawn from the docs; read each doc's *Implications for Orbital* section for the alternatives.

1. **Modes:** are Sandbox / Science / Career fixed modes, or presets over individual rules (economy on/off, comms required, crew death, gating) that can be mixed? *Leaning: presets over rules, with mid-game rule changes logged in the World* (01).
2. **Career shape:** KSP1-style procedural contracts, KSP2-style authored missions, or both? *Leaning: both, an authored main arc plus systemic side contracts, all defined as moddable data with deterministic objective checks* (06).
3. **Economy model:** funds plus reputation plus science as in KSP1; science only as in KSP2; or a resource economy? And how do we avoid runaway mid-game funds? *Leaning: KSP1's three currencies plus upkeep and salaries, with investments that pay over time to deliver the "investor" fantasy; resources as a second layer later* (07, 11).
4. **Progression gates:** which features do building upgrades gate? *Leaning: gate capacity and scale (part count, mass, crew, contract slots, DSN power), never core tools such as maneuver nodes or Δv readouts* (02, 04).
5. **Science model:** keep the experiment × body × situation × biome matrix with diminishing returns? Adopt the data/sample split? How big is the tech tree, and is it gated by milestones? *Leaning: matrix plus data/sample split; results fill a per-body dossier; size the tree for pacing; no uncapped idle lab* (05).
6. **Crew depth:** professions with XP that unlock abilities, or seat-fillers? Can crew die permanently, and are there salaries and hiring costs? *Leaning: three professions with traits as mod data, deterministic personality effects, death as a rule toggle* (08).
7. **Comms ambition:** CommNet-level (range, relays, occlusion) or beyond it (frequencies or channels, bandwidth that depends on signal, light-time delay, suit radios, plasma blackout as a link rule)? Is "no signal means no control" on by default? *Leaning: the KSP1 core as a pure function in the sim; channels, bandwidth and delay as difficulty options; the script runner as the flight computer* (09, and `beyond/01`).
8. **Sites and colonies:** do we build a `Site` abstraction now (the Space Center as the first site) so bases, colonies, extra launch sites and delivery routes fit later, or defer it? *Leaning: introduce the abstraction with the Space Center; ship colonies much later* (02, 11).
9. **Mod surface for the new systems:** which `define*` points ship with each system (experiments, tech nodes, contracts, comms rules, crew traits, buildings, strategies, HUD panels), and do we add a ModuleManager-style `definePatch`? *Leaning: every new system ships with its define point, and the stock content uses it* (12).
10. **Scope and release discipline:** which of these systems go into the first public release, and what do we promise publicly? *Leaning: release the v1 core first, add one system at a time as complete slices, never announce roadmap items as commitments, and keep the game free or low-friction while it is incomplete* (14).

## Out of scope / not covered

- Exact numbers that only appear in game files (not inspected by design).
- Multiplayer (KSP2 roadmap only; mentioned in 11 and 14).
- Console editions, except where they inform UI (13).
