# 14 — KSP2, the KSP1 expansions and late KSP1 updates

What *Kerbal Space Program* added late in its life (updates 1.7 to 1.12 and the two paid expansions *Making History* and *Breaking Ground*), what *Kerbal Space Program 2* actually shipped from 0.1.0 to 0.2.2, and what KSP2 announced but never delivered. The goal is a checklist, so that no system players now take for granted is missing from Space Orbital Program (SOP).

Written 2026-10-18. Design research from public sources only. Text is in my own words; numbered citations [S1].. are listed at the end with reliability notes.

**Read with:** `refs/reverse-engineering-ksp2/README.md` (the baseline), its `06-missions-contracts-achievements.md` (Mission Builder internals, KSP2 mission list — not repeated here), `11-colonies-resources-interstellar.md` (roadmap, ISRU, mod prior art — summarised only) and `12-modding.md`.

**Tags.** **[KSP1 1.x]** base-game update · **[MH]** Making History · **[BG]** Breaking Ground · **[KSP2 0.x]** shipped KSP2 build · **[KSP2 — announced, never shipped]**. *(unverified)* marks a claim I recall or saw only secondhand. The official KSP wiki and forum blocked automated fetches (Anubis challenge and HTTP 403); many facts come from search excerpts of those pages and are marked *(snippet)* where a number matters.

**Our status** comes from `docs/STATUS.md` and the `status:` fields and scope lines of `docs/plans/*.md`, read on 2026-10-18. It reflects plan scope, not a code audit.

---

## 0. Summary for the impatient

1. **Late KSP1 turned "nice mods" into stock expectations**: a Δv readout (1.6), a precise maneuver editor and orbital info panel (1.7), editing action groups in flight (1.8), comets (1.10), EVA construction and inventories (1.11), an **alarm clock** and a **transfer-window maneuver creator** (1.12), and rotating docking ports. Players coming from KSP1 will look for each of these in the first hour.
2. **Making History** is mostly a *content-authoring* feature (the Mission Builder) plus extra launch sites and space-race parts. Its lesson: player-authored scenarios are valued, but a visual node editor alone did not create a large community. Data-defined missions plus sharing did more. SOP already has missions as data (098/100) and challenges as files (131). It has no in-game editor.
3. **Breaking Ground** added three systems: **robotics** (hinges, pistons, servos, rotors, propeller blades, a keyframe controller), **deployed science** (ground stations that produce science over time on their own power), and **surface features** (rocks and formations to scan or collect). SOP has none of the three yet, though bases (128), data items (083) and stones with collision (060) are the foundation for the latter two.
4. **KSP2 shipped** a better-looking sandbox (Feb 2023): procedural wings, part paint, a multi-assembly VAB, time warp under thrust and new HUD/tutorials. It came with heavy performance problems and no heating, science or career. "For Science!" (Dec 2023) added Exploration mode: science, a four-tier tech tree, authored missions with a tracker, heating and Δv tools. Two bug-fix patches followed, then the studio was closed (June 2024).
5. **KSP2 never shipped** colonies, delivery routes, a resource economy, interstellar travel or multiplayer. SOP's foundation already covers more of that list than KSP2 did: off-world bases with ISRU and supply routes (128), markets and production (097), a deep comms model (114–121), n-body gravity (125), real-scale systems (124) and AI rival agencies (126).
6. **Biggest launch gaps for SOP** against player expectations: **docking**, an **alarm clock / upcoming-events warp**, **a transfer-window planner**, **fairings**, **procedural wings or part resizing**, **asteroids/comets**, **inventory and EVA repair**, and **robotics** (later). See §6.

---

## 1. KSP1 1.7–1.12: what late updates added

### 1.1 Digest table

The brief asked for 1.8–1.12. I include 1.6 and 1.7 because two of their features (Δv readout and the maneuver editor) are now the most cited "basic" features.

| Version (name, date) | Features players use daily | Also added | Expected by players now? |
|---|---|---|---|
| **1.6** "To Vee or not To Vee", 19 Dec 2018 *(corrected 2026-10-18: [S40])* | **Stock Δv and TWR readouts per stage** in the editor and in flight, per body and atmosphere/vacuum [S22]; 1.6 notes confirm the Δv calculations behind the burn indicator and the engineer's report *(verified 2026-10-18: [S40])*, per-body detail *(still unverified)* | Part revamps | **Yes.** No modern rocket game ships without it. |
| **1.7** "Room to Maneuver", 10 Apr 2019 [S6] | **Maneuver mode** flight UI with in-depth orbital info; **advanced maneuver node editor** (type exact Δv and time) [S6] | Part revamps; BG release followed on 1.7.1 | **Yes.** Veterans still preferred the PreciseNode mod's editor [S6]. |
| **1.8** "Moar Boosters!!!", 16 Oct 2019 [S3] | **Action groups editable in flight** [S3]; faster VAB/SPH and flight scenes [S3] | Unity 2019.2.2f1 (DX11 default on Windows, newer PhysX, GPU instancing, incremental GC) [S3]; new shaders and textures for Mun, Minmus, Duna, Ike, Eve, Gilly [S3]; four **new** SRBs (Clydesdale, Thoroughbred, Shrimp, Mite), not a revamp of old ones *(corrected 2026-10-18: [S41])* | Partly. In-flight action-group editing is expected. The visual pass set the bar for "stock looks". |
| **1.9** "There's No Place Like Home", 12 Feb 2020 [S4] | Kerbin visual revamp with an **ultra-quality terrain shader**; better performance [S4] | Revamped Moho and Dres; **FTE-1 drain valve** (dump propellant); **free camera while paused**; single camera system on DX11 [S4] | The drain valve and free camera are small but loved. |
| **1.10** "Shared Horizons", 1 Jul 2020 [S5][S7] | **Comets** in all modes: detection and visit contracts, tails, one hyperbolic interstellar comet [S5]; **Suit picker** [S7]; **flag parts and flag decals** on parts, mirrorable [S7] | ESA collaboration: BepiColombo and Rosetta missions playable without the DLCs; ESA suit texture; MTO/MPO parts; magnetometer boom; Advanced Grabbing Unit Jr. (small Klaw) [S5]; fairing fine-tune vs snap mode; fuel cells startable in the editor [S5] | Comets and asteroids: yes (capture missions are a classic). Flags on parts: expected cosmetic. |
| **1.11** "Some Reassembly Required", 17 Dec 2020 [S8][S9] | **EVA construction mode**: engineers place, move and rotate parts in the field with editor-like tools and CoM/CoT display, with the game running [S8][S9]; **inventory** with volume limits and **stackable parts** [S8]; **jetpacks and parachutes become inventory items** carried by kerbals [S8] | **EVA science experiment kit** [S9]; **repair kits** as cargo parts [S9]; EVA propellant cylinders [S8]; new lights and RCS variants [S8]; 1.11.1 (Jan 2021): **several kerbals assist** with heavy parts; the panel shows weight limit and helper count [S9] | **Yes** for repair and inventory; EVA construction is the feature players cite when asking for station building and base building by hand. |
| **1.12** "On Final Approach", 24 Jun 2021 *(verified 2026-10-18: [S42])* [S10][S11] | **Alarm Clock app** (maneuver alarms, manual alarms, orbital-position and transfer-window alarms) [S11]; **Maneuver Creator** (generate transfers to bodies, see upcoming **transfer windows**, estimate Δv) [S10][S11]; **rotating docking port collars** for alignment [S10] | **On-demand disconnecting struts**; new "Slim" suit; revamped craft and save loading menu; wheel and landing-leg improvements [S10] | **Yes.** Alarms and transfer windows were the two most-used KSP1 mods (Kerbal Alarm Clock, Transfer Window Planner) and became stock here. |
| **1.12.2**, 3 Aug 2021 [S12][S13] | **Ground Anchor** part: pin a vessel or base to the ground (paired with EVA construction) [S12]; **lock** docking-port rotation so autostrut can cross docked ports [S11] | Last feature update to KSP1 [S13] | Ground anchors fix the "bases slide on slopes" bug class; any base system needs an equivalent. |
| **1.12.3–1.12.5** (2021–2023) | Bug fixes: rotating-port drift, Alarm Clock respecting custom day length, tutorials [S14] | — | — |

### 1.2 What these say about player expectations

- **Planning tools moved into stock late, and fast.** Δv (1.6), maneuver editor (1.7), alarm clock and transfer windows (1.12) were all popular mods first. A new game is judged against the KSP1 1.12 *plus* the essential mods (MechJeb info, Kerbal Engineer, Kerbal Alarm Clock, Transfer Window Planner). Players do not credit a game for "having" these; they punish it for lacking them.
- **The kerbal became a tool, not just a passenger.** 1.11 gave EVA a construction and repair loop: carry parts, attach them, fix broken wheels and panels. This is what made station and base building feel physical.
- **Docking quality matters.** Rotating collars and rotation lock (1.12, 1.12.2) addressed the long-running complaint that docked parts misalign and that autostrut could not cross ports.
- **Base stability.** The ground anchor exists because physics bases slid, bounced or exploded on load. Any off-world base system must have a static "anchored" mode.
- **Cosmetics are a retention feature.** Suit picker, flag decals, part variants and the "Slim" suit kept the community posting screenshots.

---

## 2. Making History [MH]

**Released** 13 Mar 2018 with KSP 1.4.1; requires the base game; free to owners who bought KSP before May 2013 [S15]. The Mission Builder's internals are described in `06-missions-contracts-achievements.md` §1.2 and are summarised here only for the community-content angle.

### 2.1 Mission Builder

- **A graph of nodes.** A mission is a set of nodes and connections that the developers compared to a **finite state machine**: the player starts at a Start node and the mission advances from node to node until it reaches an end node [S16]. The mission system checks the active node each update, plus every node reachable from it and any "catch-all" nodes [S16].
- **Node types.** *Tests* check conditions: mission elapsed time, vessel mass, speed, altitude, location, recovery, part counts and so on. *Actions* change the world: spawn a vessel or kerbal, fail or explode a part, drain a resource, give or take funds, show a message. Node families are funds, kerbal, location, resources and science, spawnable, utility and vessel [S16] (and doc 06 [S9] there).
- **Scenario setup.** The author picks the start location, pre-spawned vessels, allowed parts and part limits, writes a briefing, and defines **scoring** (points per node and global awards). *(Scoring details are from doc 06; not re-verified here.)*
- **A "Missions" game mode.** Missions run as their own mode, outside Career [S17].
- **Files and sharing.** Each mission is several files in a folder [S17]; missions can be exported and shared, and the Steam version supported Workshop *(still unverified in this pass)*.
- **Limits.** Tests are stateless snapshots; there are no variables, loops or scripts; it cannot add content to Career (doc 06).

### 2.2 Other Making History content

| Content | What it is |
|---|---|
| **History pack** | Pre-made missions modelled loosely on real space history (first spacewalks, crash landings and so on) with a kerbal twist [S15]. |
| **Woomerang launch site** | A high-latitude pad with only a pad and water tower; available when "allow other launch sites" is enabled in difficulty settings [S18]. |
| **Dessert launch site** | A better-equipped site: pad plus an airfield with a ~1.75 km runway; same difficulty setting [S18]. Wiki pages disagree on which MH version added it [S18]. |
| **Space-race parts** | Dozens of parts and suits inspired by the 1960s space race, usable in every mode [S15]. They include a 1.875 m size class, Apollo- and Soyuz-style capsules and service modules, and engines *(sizes and inspirations from memory; still unverified)*. |
| **Vintage suit** | A period suit style; the MH page lists "new astronaut suits … inspired by the historic Space Race" *(verified 2026-10-18: [S43])*. |

### 2.3 What it means for a community-content feature in SOP

1. **Data first, editor second.** The Mission Builder's node graph is a UI over a small set of test and action primitives. KSP1's Contract Configurator mod showed (doc 06) that plain-text definitions with reusable objectives produced far more community content than the graphical builder. SOP's objective evaluator (098), mission packs (100) and challenges as files (131) already follow the data-first route. A visual editor could be added later as a view over the same data.
2. **Stateful tests.** The builder's biggest technical limit was stateless tests. SOP's definitions should allow saved values ("mass at launch") and comparisons over time. That is a check for 098's evaluator.
3. **Sharing without a backend.** MH relied on files and Steam Workshop. SOP has no backend by decision (ADR 0094). Shareable files, links and mod packs are the equivalent; 131's verifiable replays are a stronger version of MH's scoring (a score that can be re-simulated).
4. **Launch sites are content.** MH sold extra sites. SOP's site choice at world creation (092) and sites in the world (084) cover more ground, since every world can have different sites.
5. **Malfunction actions.** MH's "fail a part" action is how authors made drama. SOP's part reliability rule (130) and the evaluator could expose the same as a mission action.

---

## 3. Breaking Ground [BG]

**Released** 30 May 2019 with KSP 1.7.1 [S19]; consoles in December 2019 [S20]. Feature list from the official page and wiki as seen through search excerpts [S19][S20][S21].

### 3.1 Robotics

| Element | How it works |
|---|---|
| **Part types** | Hinges, pistons, rotation servos and **rotors** in several sizes [S19][S21]. Servos and hinges move to a target angle; pistons extend to a target length; rotors spin continuously under electric power. |
| **Propeller and rotor blades** | Blade parts whose **pitch angle** is controlled; with rotors they make propeller aircraft, helicopters and ducted fans [S21]. Players balance torque with pairs of counter-rotating rotors [S21]. Added in a BG update after release *(version still unverified, probably 1.7.3)*. |
| **KAL-1000 controller** | A programmable controller part: the player builds **keyframed tracks** that drive robotic parts over time, and binds playback to action groups or an axis such as the throttle [S21]. Typical use: throttle mapped to blade pitch. It draws 0.1 EC/s [S21]. |
| **Physics** | Robotic joints are real physics joints, so loads flex. Rotor thrust comes from aerodynamic lift on the blades, not a scripted force *(behaviour from memory; still unverified)*. Locking a joint makes it rigid. |
| **Problems** | Joints drifted and wobbled under load. Robotic parts and autostrut conflicted. Craft with many joints were slow. Saves could shift positions on reload *(widely reported; still unverified)*. |

**What players did with it:** walking robots, folding solar arrays, landing-gear mechanisms, cranes, helicopters on Duna and Eve, turbine-driven propeller planes, rotating stations and art. Robotics drove much of the expansion's community content.

### 3.2 Deployed science

- **Kit in a container.** The player packs science equipment into a storage container on the vessel. A kerbal takes it out on EVA and places it on the ground [S19][S20].
- **Parts of a station.** A **central station**, a **booster antenna**, a **solar panel** or an **RTG**, and experiments: **weather station**, **active seismometer**, **goo observation** and **ion detector** [S20].
- **Time.** Experiments must stay on the surface for a period of time; the data accrues and is relayed home automatically [S20]. This is the first KSP1 science that is passive and slow, rather than instant.
- **Power and crew.** Players report that each station needs enough deployed power, often one solar unit per device. Deployed solar output appeared to depend on the deploying **engineer's level** and on sun line-of-sight, not on distance from the sun [S23]. Under fast warp the power was all-or-nothing [S23]. Scientists raise the science rate and engineers raise power *(role effects from memory; still unverified)*.
- **Seismometer trick.** The seismometer records impacts, so players crashed stages near it for extra science *(from memory; still unverified)*.

### 3.3 Surface features

- Meteorites, craters, rock outcrops, cryovolcanoes and similar features are scattered on bodies [S20].
- **Small ones** are picked up by a kerbal and carried home. **Large ones** need a **robotic rover arm** that scans them for science [S20][S23].
- They are discovered by flying near them; KSP1 called them "ROCs" *(still unverified: the archived BG pages say "surface features" and do not use the acronym [S43])*.
- They gave rovers a purpose beyond driving to biomes.

### 3.4 Suits and other

- New futuristic suits and **suit colour customisation**; new rover and science parts [S19][S20] *(colour details still unverified)*.
- The expansion changed with later base-game updates: 1.8, 1.9 and 1.10 each shipped matching expansion updates [S3].

### 3.5 What it means for SOP

| BG system | Closest SOP foundation | Gap |
|---|---|---|
| Robotics | Hinged site meshes (038) are visual only; attitude mixer and control surfaces (033) | No moving joints in vessels. The single compound body per vessel (ADR 0018, plan 011) means joints need a design decision: rigid sub-bodies, kinematic joints, or animation only. |
| Propellers and rotors | Wing lift and stall (041), aeroplane gameplay (063) | 063 put propellers and jets **out**. A blade-element rotor on the wing model is the natural extension. |
| KAL-1000 | **Scripting sandbox** (010–036): QuickJS scripts drive the vessel | SOP's scripts already exceed the KAL-1000 in power. A keyframe track UI would be a beginner layer over the same command set. |
| Deployed science | Base kits that deploy (128), data items (083), science core (103), world tick and background operations (082), comms (114–121) | No ground experiment station. All pieces exist: a deployable that produces data items over world ticks, needs power and relays through the comms network. |
| Surface features | Stones with collision (060), terrain kinds (052), discovery science (129) | No collectable or scannable features. Discovery science's seed facts could place them. |

---

## 4. KSP2 shipped systems, version by version

### 4.1 Release table

| Build | Date | Headline changes |
|---|---|---|
| **0.1.0** Early Access | 24 Feb 2023 [S24] | **350+ parts** including new pods, engines, wheels and cargo parts [S24]; **procedural wings** [S24]; **liquid hydrogen** as the first advanced fuel [S24]; **time warp under thrust** [S24]; reworked VAB with part sorting, **blueprint view** and **part colouring (paint)** [S24]; redesigned flight HUD and map; animated **tutorial videos** (KSP Academy / Kerbal Space Program Academy) [S25]. **Missing:** re-entry heating, science, tech tree, career, ISRU *(heating missing from memory; consistent with 0.2.0 "implemented" heating below)*. |
| **0.1.1** | 16 Mar 2023 [S26] | Autosaves on landing, SOI change and atmosphere crossing; camera collision with terrain; debris targetable; notifications when inactive vessels change SOI; maneuver alert sounds; fuel-flow calculation up to 3x faster; many maneuver-node fixes (burn duration, ETA in days, intercept markers) [S26]. |
| **0.1.2** | 12 Apr 2023 [S27] | Time-of-day lighting at KSC; height fog on Kerbin, Duna, Eve, Laythe; paginated crew cam; "Return to KSC" in flight report; passenger kerbals can exit; memory and grass optimisation; ground shading setting [S27]. Developers said they had begun investigating wobbly rockets [S27]. |
| **0.1.3** | 22 Jun 2023 [S28] | First patch with new parts: **A.I.R.B.R.A.K.E.S.**, **three Clamp-O-Tron docking ports**, Coronet, Trumpet and Tuba engines, a large methalox tank [S28]; water detection moved to a job system (150-part craft: 10 ms → 1.5 ms CPU) [S28]. |
| **0.1.4** | 30 Aug 2023 [S29] | LODs for KSC buildings; terrain shader optimisation; VAB frame rate; landing-gear jitter fixes; SAS and throttle no longer reset on decoupling; warp no longer overshoots SOI changes [S29]. |
| **0.1.5** | 25 Oct 2023 [S30] | **Atmospheric scattering** (red sunsets on Kerbin, blue on Duna), softer horizons, cloud blending; GRFN-125 and GRFN-250 **grid fins**; hover highlight on map conics; restyled kerbal and part manager UIs; Unity 2022.3.5f1 [S30]. |
| **0.2.0 "For Science!"** | 19 Dec 2023 [S31][S32] | **Exploration mode**; **Mission Control** and **R&D Center** buildings; **Mission Tracker** and **Research Inventory** apps; **four-tier tech tree**; **11 primary and 30 secondary missions**; **9 science parts**; discoverables; **part heating** with re-entry visuals and working heat shields; **Δv tools in the VAB and in flight**; **buoyancy**; two new tutorials and Cadet Orientation messages; first **cheats menu**; new ambient audio; K0 starter rocket; **reinforced joints** with player-selectable joint mode; Ap/Pe on maneuver trajectories within an SOI [S31][S32]. |
| **0.2.1** | 30 Jan 2024 [S33] | Re-entry heating made gentler in the upper atmosphere and part thermal mass raised; **time-based experiments now suspend** instead of resetting when you leave the region, and resume on return [S33]. |
| **0.2.2** | 11 Jun 2024 [S34] | **Recover Vessel button** in the flight HUD; **time-warp indicator**; notifications when an action is blocked by warp or pause; parachute-failure alerts; more flight autosaves; maneuver nodes allowed at 0 Δv; Private Division launcher removed [S34]. Last update. |
| — | May–Jun 2024 | Take-Two filed a WARN notice covering about 70 jobs at Intercept Games' Seattle office, effective 28 Jun 2024; developers confirmed the layoffs [S35][S36]. No later official update shipped *(as of this writing; status after 2024 not re-verified)*. |

### 4.2 Systems in detail

**VAB with multiple assemblies [KSP2 0.1.0].** One building for rockets and planes. A **workspace** holds several assemblies at once; one is chosen as the launch assembly. Saving a workspace keeps all of them. Blueprint view shows a 2D engineering drawing for precise placement. Parts can be **painted** with base and accent colours. (Details in the sibling set's `03-vehicle-assembly.md` and in `refs/reverse-engineering-ksp-ksp2/02-vab-sph-editor.md`.)

**Procedural wings and fairings [KSP2 0.1.0].** Wings are a single part with editable span, sweep and chord, plus a control-surface toggle, instead of KSP1's many wing panels [S24]. Fairings are generated by drawing a shape, as in KSP1 since 1.0 *(KSP2 fairing behaviour from memory; still unverified)*.

**Time warp under thrust [KSP2 0.1.0].** Burns continue during on-rails warp [S24]. This made ion engines and long burns practical. Early builds had bugs where fuel drained but the orbit did not change (doc 11).

**Maneuver planner [KSP2 0.1.0+].** Nodes show the burn as an arc along the orbit, with burn duration and a countdown. 0.1.1 fixed the burn timer and ETA display; 0.2.0 showed Ap/Pe for trajectories inside an SOI; 0.2.2 allowed nodes with 0 Δv [S26][S31][S34]. KSP2 never had a stock transfer-window planner or alarm clock *(not found in any patch note; still unverified)*.

**Flight HUD.** A redesigned navball and staging stack with app windows (part manager, kerbal manager, resource manager, later mission tracker and research inventory) [S30][S31]. 0.2.2 added a recover button and a warp indicator, both of which KSP1 had long had [S34].

**Exploration mode and missions [KSP2 0.2.0].** Detail in doc 06 §1.4. In short: no funds or reputation; authored missions pay science only; a mission tracker app follows objectives in flight.

**Science and research [KSP2 0.2.0–0.2.1].** Experiments run **over time** once their situation is met, producing data (transmittable) or samples (must be returned) [S31]. The **Research Inventory** app lists collected results and sends them. Collected science is redeemed at the R&D Center to unlock a four-tier tree [S31]. In 0.2.1, time-based experiments became suspendable [S33]. (Detail in doc 05.)

**Heating [KSP2 0.2.0–0.2.1].** A part thermal system with re-entry visuals arrived in 0.2.0. Players found it too harsh, and 0.2.1 softened the upper atmosphere [S31][S33].

**Tutorials [KSP2 0.1.0–0.2.0].** Animated tutorial videos at launch [S25], a Training Center with interactive tutorials [S27], and Cadet Orientation pop-up hints. 0.2.0 added two tutorials and a setting to turn off Cadet Orientation [S31].

**Performance.** Launch reviews and players reported low frame rates and high hardware requirements. Every patch until 0.1.5 listed CPU or GPU optimisation [S26]–[S30]. Wobbly rockets were acknowledged in April 2023 [S27] and addressed with reinforced joints only in 0.2.0 [S31]. *(Minimum and recommended specs were widely criticised; exact figures not re-verified.)*

**Multiplayer, colonies, interstellar.** None shipped. See §5.

### 4.3 What KSP2 teaches SOP

- **Ship the sandbox loop *and* a reason to play.** KSP2 EA had no progression for ten months. SOP already has career, science, contracts, missions and strategies (095–105).
- **Fix the basics before content.** Wobble, performance and orbital bugs dominated KSP2 reviews over any new system. SOP has rigid grouping (011), deterministic replays (131) and measured frame budgets (039).
- **Small UI items keep coming up.** A recover button, a warp indicator and "why was my action blocked" messages were still being added 16 months in. SOP already has HUD recovery (132).
- **Time-based science needs a pause rule.** KSP2 had to change resetting experiments to suspending ones. SOP's data items and world tick should define this case from the start.

---

## 5. KSP2: announced but never shipped

Doc 11 covers the roadmap, colonies, ISRU and interstellar with mod prior art. This section adds what was said about each system and maps it to SOP's plans.

| System | What was announced | Source quality |
|---|---|---|
| **Colonies** | Colony parts: habitation, power, factories, domes, roads and a **colony VAB**. Colonies on surfaces and in orbit. Colonies **bootstrap**: extract resources, build vehicles and launch them, including interstellar ships. Developers said they had "minimised colony micromanagement" so the layer serves rocket play [S37]. Basic part heat and radiators were planned for this milestone (doc 11). | Dev statements quoted in forum threads [S37]; roadmap |
| **Resources** | Resources (not money) as the driving force of exploration; collected and **transported between colonies** [S37]. The resource system ran on the simulation side, independent of physical parts [S37]. Planned late-game fuels included metallic hydrogen *(fan-compiled; doc 11)*. | Dev Insights #13 [S37]; fan lists |
| **Delivery routes** | Fly a cargo or mining run once, then turn it into a **repeating delivery** that keeps sending the resource over time; routes between colonies, including orbital hubs fed from several star systems [S37]. | Dev quotes via forum [S37] |
| **Interstellar** | Giant ships built in **orbital drydocks** from colony resources, in a "mothership" approach that docks many vessels into one superproject [S38]. First target **Debdeb**, other systems later [S38]. Exotic drives (fusion, Orion-style, antimatter) and time warp under thrust (shipped) (doc 11). | Press previews [S38] |
| **Multiplayer** | Players join or found **space agencies** and cooperate or compete; "more chaos, competition, or cooperation, depending on your friends" [S38][S39]. How time warp would be shared was never publicly specified *(nothing found)*. Positioned last on the roadmap; no combat (doc 11). | Press interviews [S38][S39] |
| **Kerbal autonomy / AI** | I found no announcement of autonomous kerbals, AI agencies or crew needs (life support) for KSP2. Colony **population growth** came up in previews but was never specified (doc 11). | Nothing found — treat as not announced |

### 5.1 What SOP's foundation already covers

| KSP2 never-shipped system | SOP plan(s) | Coverage |
|---|---|---|
| Colonies: bases on other bodies | **128 off-world bases** (base kits that deploy, outposts from landed vessels, body-filtered building catalogue), 090/091/096 building registry and levels | **Covered as bases.** Colonies with population are explicitly out of 128. |
| Colonies: orbital | 128 is surface-only in scope | **Gap.** Needs docking first. |
| Colony VAB (build ships off-world) | Not in any plan | **Gap.** Extraplanetary-Launchpads-style building is the missing step towards KSP2's bootstrapping loop. |
| Resources and ISRU | **097 markets and production**, **128 ISRU recipe** (one commodity chain), commodities in ADR 0098 | **Partly covered** (one chain); goes beyond KSP2 with markets. |
| Delivery routes | **128 supply route** repeating a proven flight on transfer windows | **Covered (first slice).** Same idea as KSP2's announced routes. |
| Population, habitation, crew needs | **107 crew simulation** (life support, morale, rest), 106 crew core | **Covered for crew**, not for colony population. |
| Interstellar | **125 n-body gravity**, **124 real-solar-system pack scales**, 081 calendar | **Groundwork only.** No other star system, no exotic drives. Warp under thrust: not found in any plan (see §6). |
| Multiplayer | None (by ADR 0094, no backend) | **Not planned.** **126 AI agencies** give rivals, races for firsts and rentable relays: the single-player version of "competing agencies". 131 replays and challenges give asynchronous competition. |
| Heat and radiators for colonies | 014 re-entry heating (skin, radiation); no radiators | **Partly.** Part heat exists; base heat and radiators do not. |
| Comms for colonies and probes | **114–121** comms tiers (link budget, routing and delay, store-and-forward, channels, suit radios), 118 planning tools | **Far beyond** both KSPs. |

---

## 6. Feature parity table

**Legend.** KSP1 / KSP2: ✓ stock · DLC (MH/BG) · ✗ absent · ann. (announced, never shipped). **Our status:** *done (plan)* · *partial (plan)* · *gap*. Priority for a **public release**: **LC** launch-critical, **LN** launch-nice, **L** later. Priorities are my recommendation for the human to decide, not decisions.

### 6.1 Vehicle building

| Feature | KSP1 | KSP2 | Our status | Priority |
|---|---|---|---|---|
| Stage Δv/TWR per body and situation | ✓ 1.6 | ✓ 0.2.0 | done (021, 022, 024) | LC ✓ |
| Trip planner / Δv map | mod | ✗ | done (034) | — |
| Stability CoM/CoP/CoL readout | ✓ | ✓ | done (029, 023) | — |
| Radial symmetry, sub-assemblies, vessel library | ✓ | ✓ | done (026, 029) | — |
| Multiple assemblies in one workspace | ✗ | ✓ 0.1.0 | partial (loose assemblies 022) | LN |
| Struts and fuel lines | ✓ | ✓ | done (041) | — |
| **Fairings** (procedural) | ✓ 1.0; fine-tune 1.10 | ✓ | gap | **LC** |
| Procedural wings / part resizing | mod (B9 PWings) | ✓ 0.1.0 | partial (fixed `stock.wing`, 041) | LN |
| Part paint / colours | ✗ (variants) | ✓ 0.1.0 | gap | LN |
| Flag decals on parts | ✓ 1.10 | ✗ | gap | L |
| Mod-defined categories, search | ✓ | ✓ | done (069) | — |
| Launch-site choice | MH (2 sites) | ✗ | done (092, 084) | — |

### 6.2 Flight and planning

| Feature | KSP1 | KSP2 | Our status | Priority |
|---|---|---|---|---|
| SAS modes | ✓ | ✓ | done (042) | — |
| Maneuver nodes with precise editor | ✓ 1.7 | ✓ | done, impulsive prediction only (045) | LC ✓ (finite-burn LN) |
| Target markers, closest approach | ✓ | ✓ | done (057, 035) | — |
| **Docking** (ports, magnetism, crossfeed) | ✓ | ✓ 0.1.3 | **gap** (milestone exists in 102; ADR 0147 says docking does not exist in the sim) | **LC** |
| Rotating docking ports, rotation lock | ✓ 1.12 | ✗ | gap | L |
| **Alarm clock** | ✓ 1.12 | ✗ | partial: Mission Center "upcoming events with warp-to" (113) | **LC** (user alarms) |
| **Transfer-window planner** | ✓ 1.12 Maneuver Creator | ✗ | gap: porkchop plots are out of 113; supply routes use windows internally (128) | **LC** |
| Time warp under thrust | ✗ (mods) | ✓ 0.1.0 | not found in plans *(verify against ADR 0021)* | LN (L for interstellar) |
| Action groups, editable in flight | ✓ 1.8 | ✓ | done (110) — in-flight editing not checked | LN |
| Recover vessel from HUD | ✓ | ✓ 0.2.2 | done (132) | — |
| Warp indicator, blocked-action notices | ✓ | ✓ 0.2.2 | done (021 toasts, 017 warp) *(not checked in detail)* | — |
| Autosaves, quicksave | ✓ | ✓ 0.1.1 | done (043) | — |
| Free camera while paused | ✓ 1.9 | ? | not checked | L |
| Propellant drain valve | ✓ 1.9 | ✗ | gap | L |
| Re-entry heating, heat shields | ✓ | ✓ 0.2.0 | done (014, 040) | — |
| Buoyancy | ✓ | ✓ 0.2.0 | done (067) | — |
| Wobble control (rigid joints) | autostrut | reinforced joints 0.2.0 | done by design (011, one body per vessel) | — |
| Scripting / autopilot | mod (kOS) | ✗ | done (010–036) | — |

### 6.3 Crew and EVA

| Feature | KSP1 | KSP2 | Our status | Priority |
|---|---|---|---|---|
| EVA walk, jetpack, flag, surface sample | ✓ | ✓ | done (109) | — |
| **Inventory** (volume, stackable, carried jetpack/chute) | ✓ 1.11 | ✗ | gap | LN |
| **EVA repair** (repair kits, fix wheels/panels) | ✓ 1.11 | ✗ | gap (part reliability 130 creates failures with no field fix) | **LN** (LC if 130 is on in a preset) |
| EVA construction (place/move parts in the field) | ✓ 1.11 | ✗ | gap (109 puts base building by hand out) | L |
| Ground anchor / static base mode | ✓ 1.12.2 | ✗ | partial: landed vessels on surface rails (016), outposts (128) | LN |
| Suit picker, suit styles | ✓ 1.10 / MH / BG | ✓ (Kerbal variety) | partial: procedural suit (109) | L |
| Crew roles, XP, roster | ✓ | ✗ (role-less) | done (106, 108) | — |
| Life support, morale | mods | ✗ | done (107) | — |

### 6.4 Science, progression and content

| Feature | KSP1 | KSP2 | Our status | Priority |
|---|---|---|---|---|
| Experiments, data vs samples, biomes | ✓ | ✓ 0.2.0 | done (103, 104, 192) | — |
| Time-based experiments with suspend | ✗ (instant) | ✓ 0.2.0/0.2.1 | partial — data items (083); suspend rule not checked | LN |
| Research inventory / stored results | ✗ | ✓ 0.2.0 | done (191 science dock panel) | — |
| Tech tree and R&D | ✓ | ✓ 0.2.0 | done (105) | — |
| Procedural contracts | ✓ | ✗ | done (099) | — |
| Authored missions, tracker | MH (as missions) | ✓ 0.2.0 | done (100) | — |
| Mission/scenario authoring | MH Mission Builder | ✗ | partial: data definitions (098), packs (100), challenges (131); no in-game editor | L |
| Strategies | ✓ | ✗ | done (101) | — |
| Milestones, achievements | ✓ (progress) | ✓ | done (102) | — |
| **Deployed science stations** | BG | ✗ | gap (pieces: 128, 083, 082, 114) | LN |
| Surface features to scan/collect | BG | ✓ discoverables (0.2.0) | partial: stones (060), discovery science (129) | LN |
| **Asteroids and comets** (capture, Klaw) | ✓ (comets 1.10) | ✗ | gap (comets out of 104) | LN |
| Tutorials | ✓ | ✓ | partial: first-flight guide (023) | **LC** (a short set covering orbit, nodes, rendezvous) |
| Cheats / debug menu, world rules | ✓ | ✓ 0.2.0 | done (078 presets) | — |

### 6.5 Systems beyond KSP1 base

| Feature | KSP1 | KSP2 | Our status | Priority |
|---|---|---|---|---|
| Robotics (hinges, pistons, servos) | BG | ✗ | gap (needs a joint ADR against ADR 0018) | L |
| Propellers, rotors, jets | BG / ✓ jets | ✓ jets | gap (063 puts them out) | LN (jets) / L (rotors) |
| Programmable sequencer | BG KAL-1000 | ✗ | covered by scripting (010–036) | — |
| CommNet-style comms | ✓ | ✓ | done, much deeper (070, 114–121) | — |
| ISRU / mining | ✓ (one ore) | ann. | partial (128 one chain) | LN |
| Markets and production | ✗ | ✗ | done (097) | — |
| Off-world bases | mods | ann. (colonies) | done (128) | — |
| Supply / delivery routes | mods | ann. | done, first slice (128) | — |
| Off-world vessel construction | mod (EL) | ann. | gap | L |
| Orbital stations as bases | ✓ (by docking) | ann. | gap (needs docking) | L |
| Interstellar | mods | ann. | groundwork (124, 125) | L |
| Multiplayer | mods (DMP, LMP) | ann. | not planned; AI agencies (126) and replays (131) instead | L |
| Part failures | mods | ✗ | done (130) | — |
| Real-scale systems, n-body | mods (RSS, Principia) | ✗ | done (124, 125) | — |
| Seasons, axial tilt | ✗ | ✗ | done (122) | — |

### 6.6 Launch-critical shortlist

From the tables above, the items I would hold a public release for:

1. **Docking.** Every KSP1 player builds a station by the second week. It is also a prerequisite for orbital bases, crew transfer and the "docking" and "station" milestones that already exist in 102.
2. **Fairings.** Without them, payloads with odd shapes have huge drag and players cannot build satellites that look right.
3. **User alarms** on top of Mission Center's upcoming events (warp-to a time, a maneuver, an SOI change, a transfer window).
4. **A transfer-window view.** At minimum, "next window to body X and its Δv" from the existing trip planner (034). A porkchop plot can come later.
5. **A short tutorial set** past the first-flight guide (orbit, a maneuver node, rendezvous and docking once docking exists).

Launch-nice in order of expected player demand: asteroids and comets, inventory with EVA repair, time-based science suspend rule, deployed science, procedural wings or resizing, part paint, multiple workspace assemblies, ground anchor, jets.

---

## Needs verification

| Claim | Why | Where to check |
|---|---|---|
| 1.6 name and stock Δv details | From memory | https://wiki.kerbalspaceprogram.com/wiki/1.6 — Name corrected to "To Vee or not To Vee" [S40]; per-body Δv details still unverified. |
| 1.12 exact release date (24 Jun 2021?) and full feature list | Forum and SteamDB blocked | https://forum.kerbalspaceprogram.com/topic/203227-kerbal-space-program-112-on-final-approach-is-now-available ; https://steamdb.info/patchnotes/6928596 — Date verified 24 Jun 2021 [S42]; full feature list still unverified. |
| 1.8 SRB revamp | Not in search excerpts | https://wiki.kerbalspaceprogram.com/wiki/1.8 — Corrected: four new SRBs, no revamp [S41]. |
| 1.11 inventory volume and mass numbers | No numbers found | https://wiki.kerbalspaceprogram.com/index.php?title=1.11 — Still unverified here (doc 10 cites kerbal inventory figures from the Kerbonaut page). |
| MH part list (1.875 m class, Apollo/Soyuz-style), vintage suit, Steam Workshop support | From memory | https://wiki.kerbalspaceprogram.com/wiki/Making_History — 1.875 m class, suits verified [S43]; Steam Workshop for missions still unverified. |
| MH scoring model | From doc 06, not re-read | https://forum.kerbalspaceprogram.com/developerarticles.html/joining-the-dots-the-mission-system-r207/ — Still unverified: developer article blocked. |
| BG version that added propellers and rotor blades (1.7.3?) | From memory | https://wiki.kerbalspaceprogram.com/wiki/Breaking_Ground — Still unverified: the BG parts page counts 48 parts "as of 1.7.3" but gives no blade date. |
| BG deployed science role effects (scientist rate, engineer power), seismometer impacts, "ROC" name | From memory and forum anecdotes | https://forum.kerbalspaceprogram.com/topic/186130-deployed-science-a-few-basics — Still unverified: forum blocked; ROC acronym not in the archived pages. |
| KSP2 0.1.0 fairing behaviour, heating absent at launch, minimum specs | From memory | https://kerbal.wiki/0.1.0.0 (fetch returned no usable content); https://kerbalspaceprogram.com/news/ksp-2-launches-in-early-access — Still unverified: no KSP2 source re-read. |
| KSP2 never had a stock alarm clock or transfer planner | Absence in patch notes read here | https://kerbal.wiki/For_Science! and later patch pages — Still unverified: absence cannot be confirmed from patch notes. |
| KSP2 status after June 2024 | Not re-checked | https://www.pcgamer.com/gaming-industry/kerbal-space-program-developers-confirm-layoffs-are-coming-at-the-end-of-june — Still unverified: not re-checked. |
| SOP: warp under thrust, in-flight action-group editing, suspend rule for time-based data | Plans not read in depth | `docs/decisions/0021-debris-lifecycle-and-time-warp.md`, `docs/plans/110-*.md`, `docs/plans/083-*.md` — Still unverified: repo plans out of scope for this pass. |

---

## Sources

All checked 2026-10-18. Reliability: **A** official or primary; **B** reputable press or community wiki with changelog; **C** forum or user post, secondhand quote; *(snippet)* means read through a search excerpt because the page blocked fetching.

| # | URL | Title | Reliability |
|---|---|---|---|
| S1 | refs/reverse-engineering-ksp2/README.md, 06-, 11-, 12- (this repo; S2 unused) | Sibling research set | B (secondary, cited inside) |
| S3 | https://wiki.kerbalspaceprogram.com/wiki/1.8 ; https://www.gamingonlinux.com/2019/09/kerbal-space-program-will-continue-to-be-upgraded-with-a-new-version-on-the-way/ | KSP wiki: 1.8; GamingOnLinux 1.8 preview | A *(snippet)* / B |
| S4 | https://wiki.kerbalspaceprogram.com/wiki/1.9 | KSP wiki: 1.9 | A *(snippet)* |
| S5 | https://wiki.kerbalspaceprogram.com/wiki/1.10 ; https://www.gamewatcher.com/kerbal-space-program-shattered-horizons-update-1-10-patch-notes | KSP wiki: 1.10; GameWatcher 1.10 patch notes | A *(snippet)* / B |
| S6 | https://wiki.kerbalspaceprogram.com/wiki/1.7 ; https://forum.kerbalspaceprogram.com/topic/183899-on-the-maneuver-panel-in-17 | KSP wiki: 1.7; forum: on the maneuver panel in 1.7 | A *(snippet)* / C |
| S7 | https://forum.kerbalspaceprogram.com/tags/shared%20horizons ; https://steamcommunity.com/app/220200/discussions/0/1754653387148172312 | Forum tag Shared Horizons; Steam discussion | C *(snippet)* |
| S8 | https://wiki.kerbalspaceprogram.com/index.php?title=1.11 ; https://www.gamingonlinux.com/articles/18237/ | KSP wiki: 1.11; GamingOnLinux 1.11 | A *(snippet)* / B |
| S9 | https://kerbalspaceprogram.com/news/release-kerbal-space-program-1-11-some-reassembly-required-is-now-available ; https://wiki.kerbalspaceprogram.com/wiki/1.11.1 ; https://Techraptor.net/gaming/news/kerbal-space-program-update-111-lets-players-fix-ships-in-field | Official 1.11 release post; wiki 1.11.1; TechRaptor | A *(snippet)* / B |
| S10 | https://forum.kerbalspaceprogram.com/topic/203227-kerbal-space-program-112-on-final-approach-is-now-available | Official forum: KSP 1.12 On Final Approach is now available | A *(snippet; 403 on fetch)* |
| S11 | https://steamdb.info/patchnotes/6928596 ; https://forum.kerbalspaceprogram.com/topic/205981-how-do-i-use-the-stock-transfer-window-alarm | SteamDB 1.12 patch notes; forum: stock transfer-window alarm | B *(snippet)* / C |
| S12 | https://www.gogdb.org/product/1429864849/releasenotes | GOG DB: release notes incl. 1.12.2 (3 Aug 2021) | B *(snippet)* |
| S13 | https://wiki.kerbalspaceprogram.com/wiki/1.12.2 ; https://www.nme.com/news/kerbal-space-program-development-has-ended-devs-shifting-gears-to-work-on-sequel-3013405 | KSP wiki 1.12.2; NME: KSP1 development ended | A *(snippet)* / B |
| S14 | https://mac.softpedia.com/progChangelog/Kerbal-Space-Program-Changelog-106651.html | Softpedia: KSP changelog 1.12.x | B *(snippet)* |
| S15 | https://www.kerbalspaceprogram.com/product/kerbal-space-program-making-history/ ; https://wiki.kerbalspaceprogram.com/wiki/Making_History | Official Making History page; KSP wiki: Making History | A *(snippet)* |
| S16 | https://forum.kerbalspaceprogram.com/developerarticles.html/joining-the-dots-the-mission-system-r207/ | Developer article: Joining the dots, the mission system | A *(snippet)* |
| S17 | https://forum.kerbalspaceprogram.com/topic/175520-modders-notes-for-making-history-expansion/ | Forum: modders' notes for Making History (JPLRepo) | A *(snippet)* |
| S18 | https://wiki.kerbalspaceprogram.com/wiki/Woomerang_Launch_Site ; https://wiki.kerbalspaceprogram.com/wiki/Dessert_Launch_Site | KSP wiki: Woomerang and Dessert launch sites | A *(snippet)* |
| S19 | https://www.kerbalspaceprogram.com/games-breakingground (404 on fetch) ; https://www.pcgamer.com/au/kerbal-space-programs-next-dlc-adds-robotics-and-more-experiments-embargoed | Official BG page; PC Gamer BG announcement | A *(snippet)* / B |
| S20 | https://wiki.kerbalspaceprogram.com/wiki/Breaking_Ground ; https://www.trueachievements.com/n39742/kerbal-science-program-breaking-ground-expansion ; https://blog.playstation.com/?p=219204 | KSP wiki: Breaking Ground; TrueAchievements; PlayStation Blog | A *(snippet)* / B |
| S21 | https://wiki.kerbalspaceprogram.com/wiki/KAL-1000_Controller ; https://wiki.kerbalspaceprogram.com/wiki/Breaking_Ground_Stock_Craft | KSP wiki: KAL-1000; BG stock craft | A *(snippet)* |
| S22 | — (memory) | KSP 1.6 Δv readout | unverified |
| S23 | https://forum.kerbalspaceprogram.com/topic/194915-deployed-science-solar-panel-power-at-other-planets ; https://forum.kerbalspaceprogram.com/topic/186130-deployed-science-a-few-basics | Forum: deployed science power; deployed science basics | C *(snippet)* |
| S24 | https://take2games.com/ir/news/kerbal-space-program-2-launches-early-access-today ; https://www.businesswire.com/news/home/20230224005064/en | Take-Two press release: KSP2 launches in Early Access | A *(snippet; 404 on fetch)* |
| S25 | https://kerbalspaceprogram.com/news/ksp-2-launches-in-early-access ; https://www.nme.com/news/kerbal-space-program-2-finally-launches-into-early-access-in-february-3333971 | Official EA launch post; NME | A *(snippet)* / B |
| S26 | https://kerbal.wiki/0.1.1.0 ; https://kerbalspaceprogram.com/news/ksp2-v0-1-1-0-patch-notes | KSP2 wiki: 0.1.1.0; official patch notes | B / A |
| S27 | https://kerbal.wiki/0.1.2.0 | KSP2 wiki: 0.1.2.0 | B |
| S28 | https://kerbal.wiki/0.1.3.0 | KSP2 wiki: 0.1.3.0 | B |
| S29 | https://kerbal.wiki/0.1.4.0 | KSP2 wiki: 0.1.4.0 | B |
| S30 | https://kerbal.wiki/0.1.5.0 ; https://store.privatedivision.com/news/ksp2-update-v0-1-5-0-patch-notes-ksp2-news-pd-store-1 | KSP2 wiki: 0.1.5.0; Private Division patch notes | B / A |
| S31 | https://kerbal.wiki/0.2.0.0 ; https://store.privatedivision.com/news/ksp2-update-v0-2-0-0-patch-notes-launcher | KSP2 wiki: 0.2.0.0; Private Division For Science! release notes | B / A |
| S32 | https://kerbal.wiki/For_Science! ; https://kerbalspaceprogram.com/news/introducing-for-science | KSP2 wiki: For Science!; official announcement | B / A *(snippet)* |
| S33 | https://kerbal.wiki/0.2.1.0 ; https://www.kerbalspaceprogram.com/news/ksp-marketing-ksp2-v0-2-1-0-patch-notes | KSP2 wiki: 0.2.1.0; official notes | B / A *(snippet)* |
| S34 | https://kerbal.wiki/0.2.2.0 | KSP2 wiki: 0.2.2.0 | B |
| S35 | https://www.pcgamer.com/gaming-industry/kerbal-space-program-developers-confirm-layoffs-are-coming-at-the-end-of-june | PC Gamer: KSP developers confirm layoffs | B *(snippet)* |
| S36 | https://www.videogameschronicle.com/news/kerbal-space-program-2-studios-future-unclear-as-take-two-makes-layoffs ; https://overclock3d.net/news/software/the-entire-kerbal-space-program-2-team-is-being-laid-off-next-month/ | VGC; Overclock3D | B *(snippet)* |
| S37 | https://forum.kerbalspaceprogram.com/topic/210669-ksp2-ea-road-map-explained-by-nate ; https://forum.kerbalspaceprogram.com/topic/207046-developer-insights-13-%E2%80%93-ksp2-resource-system ; https://forum.kerbalspaceprogram.com/topic/212213-ksp2-as-an-automation-game | Forum: EA roadmap explained by Nate; Developer Insights #13; KSP2 as an automation game | C (dev quotes secondhand) *(snippet)* |
| S38 | https://www.pcgamer.com/au/kerbal-space-program-2-release-date-multiplayer-everything-we-know/ ; https://videogameschronicle.com/features/interviews/an-in-depth-conversation-with-the-creator-of-ksp2 | PC Gamer: KSP2 everything we know; VGC interview | B *(snippet)* |
| S39 | https://ggrecon.com/guides/kerbal-space-program-2-multiplayer | GGRecon: KSP2 multiplayer | B− *(snippet)* |
| S40 | https://web.archive.org/web/20240121092216/https://wiki.kerbalspaceprogram.com/wiki/1.6 | KSP wiki: 1.6 (Internet Archive snapshot, full text) | A |
| S41 | https://web.archive.org/web/20240121090158/https://wiki.kerbalspaceprogram.com/wiki/1.8 | KSP wiki: 1.8 (archive) | A |
| S42 | https://web.archive.org/web/20240121090620/https://wiki.kerbalspaceprogram.com/wiki/1.12 | KSP wiki: 1.12 (archive) | A |
| S43 | https://web.archive.org/web/20240108005927/https://wiki.kerbalspaceprogram.com/wiki/Making_History ; https://web.archive.org/web/20240121095405/https://wiki.kerbalspaceprogram.com/wiki/Breaking_Ground ; https://web.archive.org/web/20240121084405/https://wiki.kerbalspaceprogram.com/wiki/Breaking_Ground_parts | KSP wiki: Making History, Breaking Ground, BG parts (archive) | A |
