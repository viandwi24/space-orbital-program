# 11 — Resources, electric power, ISRU, thermal and science-hardware operations

A reference on how Kerbal Space Program 1 (with Making History and Breaking Ground) and Kerbal Space Program 2 handle electric charge, resource flow and transfer, in-situ resource use (ISRU), heat beyond re-entry, the day-to-day operation of science hardware, and life support (which only mods add). It ends with Adopt / Improve / Avoid notes and a launch checklist compared with what Space Orbital Program already has.

**Tags:** [KSP1] base game 1.x · [MH] Making History DLC · [BG] Breaking Ground DLC · [KSP2] shipped in KSP2 Early Access (last patch 0.2.2, 2024) · [KSP2 — never shipped] announced only · [Mod] community mod.

**Source caveat (2026-10-18).** The official KSP wiki (wiki.kerbalspaceprogram.com) now sits behind an Anubis bot wall. Direct fetches returned "Access Denied", so wiki figures come from search-engine excerpts, forum quotes of the wiki, and the bug tracker. Numbers quoted that way carry the source of the quote. Numbers from memory of the part configs that this pass could not re-check are marked *(unverified)* and repeated in the "Needs verification" list at the end. Rates are per second of game time unless a unit says otherwise. "EC" is electric charge. "u" is KSP's abstract volume unit.

Companion documents: `refs/reverse-engineering-ksp2/05-science-and-research.md` (the science value formula, the KSP2 experiment table, the tech tree) and `refs/reverse-engineering-ksp2/11-colonies-resources-interstellar.md` (colonies, routes, mod economies). This file does not repeat their tables. It covers the hardware and operations under them.

---

## 1. Electric charge

### 1.1 The model [KSP1]

- **One vessel-wide pool.** Electric charge is a massless resource stored in parts (batteries, pods, probe cores). Its flow mode is effectively "whole vessel": any consumer draws from any container, whatever the staging or crossfeed [S7]. There is no wiring, voltage, bus or per-part power budget. Every producer adds to the pool, every consumer subtracts from it, and the batteries clamp the result between empty and full.
- **Units.** EC has no SI unit. Players read it as kilojoules, but nothing in the game depends on that. Rates show as "⚡/s" in part tooltips [S1].
- **Readout.** The Resources panel at the top right of the flight scene shows a bar per resource for the vessel. A toggle limits the panel to the current stage. Electric charge always appears there with its amount and capacity. Part right-click menus show each container's EC, and producers and consumers show their current rate (for example "Energy Flow" on a panel). The VAB/SPH in stock has **no** power budget readout. Players add up the numbers by hand or use mods (Kerbal Engineer Redux, the Electrical tab of RCS Build Aid, or a dedicated power calculator) *(still unverified that stock never added a VAB power summary)*.

### 1.2 Producers [KSP1]

| Producer | Typical parts | Output (Kerbin distance) | Behaviour |
|---|---|---|---|
| Fixed solar panel | OX-STAT, OX-STAT-XL | 0.35 EC/s (OX-STAT; one forum table shows 0.33) [S1] *(verified 2026-10-18: [S20])*; OX-STAT-XL 2.80 | Never retracts, so it never breaks in an atmosphere. Output is a cosine of the angle to the sun. |
| Deployable fixed-angle panel | OX-4L/4W 1x6, SP-L/SP-W 1x6, OX-10L/10C | 1.64 EC/s (OX-4/SP 1x6 and 3x2) *(verified 2026-10-18: [S20])*, **8.25 EC/s** (OX-10 and SP-10 class, not ~7) *(corrected 2026-10-18: [S20])* [S1] | Must be deployed. Some cannot be retracted. Breaks above a dynamic-pressure or speed threshold in atmosphere. |
| Tracking (rotating) panel | SP-10L 1x5, Gigantor XL | Gigantor 24.4 EC/s at Kerbin, pointed at the sun [S1] | Pivots on one axis to follow the sun. The panel's mounting still decides whether the pivot can reach it. |
| Radioisotope generator (RTG) | PB-NUK | 0.75 EC/s *(verified 2026-10-18: [S20])* | Constant, day and night, at any distance. No fuel, no decay in stock (Kerbalism adds decay). Emits some heat. |
| Fuel cell | Fuel Cell, Fuel Cell Array | 1.5 and 18 EC/s *(verified 2026-10-18: [S20])* | Burns liquid fuel and oxidizer. Toggle by hand, or "start/stop" by action group. Has an "auto-shutdown when full" behaviour *(still unverified)*. |
| Engine alternator | Most liquid-fuel rocket engines, jet engines, LV-N Nerv | A few EC/s, scaled by throttle *(still unverified per engine)* | Free power while burning. Solid boosters and the ion engine have none. |
| Pods and probes | — | 0 | Store EC only. |
| Generators via converters | Convert-O-Tron (ISRU) | — | ISRU consumes EC, it does not produce it. |

**Solar mechanics** [KSP1]:

- **Distance falloff.** Output follows a curve of distance from the sun. It is close to the inverse square of distance with Kerbin's orbit as 100%, but it is not a pure inverse square. A 2015 player table gives the Gigantor about 22.9 EC/s at Kerbin and only about 110 EC/s at Moho. Pure inverse square would give roughly 340 EC/s at Moho's distance, about 3.9 times closer. Players attribute the gap to a temperature-efficiency term: hot panels convert less, and the curve also caps the gain close to the sun [S2]. The config fields are `powerCurve` (distance) and `temperatureEfficCurve` *(field names still unverified)*. Far out, panels become weak, and a 2015 PSA called them "useless past Dres" [S2].
- **Atmosphere.** Panels make less power inside an atmosphere. The loss grows with the air mass the light passes through, so a low sun on the ground is weak [S2].
- **Occlusion.** A raycast toward the sun checks whether a celestial body or a part blocks the panel. The part menu then shows "Blocked by …". Shadows from the vessel's own parts have changed between versions: one forum thread from the 0.90 era says own-part shadows were ignored, and later versions report "Blocked by <part>" [S2]. Behind a planet (night side, eclipse) output drops to zero.
- **Breakage.** Extended deployable panels snap off under aerodynamic load or impact. That is a design constraint for launch and re-entry.
- **Background.** Unloaded vessels do not simulate EC in stock. A probe left on the dark side of a moon is frozen at whatever charge it had when you left it, and solar panels on unloaded vessels do not charge [S3]. The active vessel in on-rails time warp is simulated with an averaged rate *(still unverified exact method)*. This is why Kerbalism and similar mods exist (§6).

### 1.3 Consumers [KSP1]

| Consumer | Typical draw | Notes |
|---|---|---|
| Probe cores | Small continuous drain (≈0.02–0.03 EC/s for small cores *(still unverified)*) | The Stayputnik draws least when hibernating, about 15% of the OKTO's hibernating draw [S3]. Crewed pods draw nothing for themselves. |
| Reaction wheels | Proportional to torque used, per axis: pods 0.1 EC/s per kN·m; dedicated wheels 0.25 / 0.45 / 0.6 EC/s at full torque *(verified 2026-10-18: [S23])* | No EC means no wheel torque. RCS and gimbals still work. |
| Antennas transmitting science | EC per Mit of data, for example Communotron 16: 6 EC/Mit at 3.33 Mit/s (20 EC/s) *(verified 2026-10-18: [S24])* | Transmission stops when EC runs out, and partial packets can be lost (an old behaviour; later patches resume) *(still unverified)*. |
| Science experiments | Most stock KSP1 experiments are instant and free. Labs and Breaking Ground (BG) instruments draw continuously. | §5. |
| Lights | 0.04 EC/s (Illuminator Mk1) *(verified 2026-10-18: [S21])* | |
| ISRU drills and converters | Drill ~15 EC/s at full load. Converter 30 EC/s per running process [S4] | The largest consumers in stock. They need fuel cells, many panels or an RTG farm. |
| Ion engine (IX-6315 "Dawn") | 8.74 EC/s at full thrust *(verified 2026-10-18: [S21])* | Thrust scales with available EC. It is the iconic "power-limited propulsion". |
| Rover wheels | Proportional to motor torque | Large rovers need panels or fuel cells. |
| Robotics [BG] | Servos, rotors and pistons draw while moving or holding *(still unverified per part)* | Electric rotors draw heavily. |
| Mobile Processing Lab | 5 EC/s while researching, 10 EC/s while processing data *(verified 2026-10-18: [S22])* | §5.4. |
| Command seat, EVA | None. EVA kerbals' jetpack uses EVA propellant, not EC. | |

### 1.4 Storage [KSP1]

- Batteries: Z-100 (100 EC), Z-200, Z-400, Z-1k and Z-4K (4,000 EC). They are radial or inline, and very light: Z-100 5 kg, Z-200 10 kg, Z-400 20 kg, Z-1k 50 kg, Z-4K 200 kg, i.e. 5 kg per 100 EC *(verified 2026-10-18: [S20])*.
- Pods and probe cores carry small built-in charge: the Mk1 Command Pod holds 50 EC, and probe cores hold from a few to a few hundred EC depending on the core *(still unverified per core)*.
- Containers can be **disabled** (the flow toggle on a resource in the part menu), which keeps a reserve battery untouched. This is the standard trick for keeping a probe recoverable after a dark-side pass.

### 1.5 Running out [KSP1]

- **Probe core without EC:** the vessel loses control. No SAS, no steering, no staging and no throttle unless it has a crewed command part [S3]. Since CommNet (1.2), a probe without a connection has partial control (throttle and SAS lock only). EC loss is stricter than that.
- **Hibernation:** probe cores have a "Hibernate" toggle and a "hibernate in warp" option ("Auto"). Hibernation cuts the core's own draw sharply and leaves only partial control [S3]. It does not stop other consumers.
- **Crewed vessels:** the kerbals can still fly with RCS and engines, but reaction wheels, SAS that relies on wheels, and transmission stop. Nothing harms the crew in stock.
- **Recovery:** a probe whose panels are retracted and whose battery is empty cannot deploy them, because deploying needs control. Players learn to leave panels deployed or put them in an action group before the drain. A KSP2 forum thread complains that **deploying solar panels should not require electric charge** [S5].

### 1.6 KSP2 power [KSP2]

- EC exists with the same producers: solar (fixed and tracking), RTG, fuel cells, and engine alternators *(still unverified per part)*.
- **Occlusion bugs:** patch 0.2.1.0 (30 Jan 2024) fixed body occlusion of solar panels that "was not calculated correctly near and past Jool". The same patch fixed a stock craft whose panels faced the wrong way [S6]. Panels in shadow were a long-running bug class.
- **VAB:** the KSP2 VAB had an Engineer's Report with checks (for example "has a command part" and "has a power source") and Δv tables. A full EC budget with day and night estimates was asked for by players. Whether a numeric power-balance readout shipped is *(still unverified)*.
- **Background:** KSP2 kept vessels on rails, with resource changes for the active vessel only. Players reported batteries behaving inconsistently across scene changes *(still unverified)*.
- **Deploying panels without charge** was raised as a quality-of-life fix [S5]. Outcome *(still unverified)*.
- **[KSP2 — never shipped]** Colony power grids, generators and heat were planned for the Colonies milestone (see the companion document §1.2).

---

## 2. Resource flow and transfer

### 2.1 Flow modes [KSP1]

Every resource definition has a flow mode that decides which containers a consumer can draw from [S7][S8].

| Mode | Used by | Rule |
|---|---|---|
| `NO_FLOW` | Solid fuel, ablator | A part uses only what it holds itself. A solid booster burns its own fuel. |
| `ALL_VESSEL` | Electric charge, xenon, monopropellant (for RCS), intake air | Any container on the vessel, ignoring crossfeed. Monoprop "ignores decoupler crossfeed" in practice [S8]. |
| `STAGE_PRIORITY_FLOW` | Monopropellant since 0.23.5 (was ALL_VESSEL) *(verified 2026-10-18: [S25])* | Vessel-wide, but containers in later stages empty first. |
| `STACK_PRIORITY_SEARCH` | Liquid fuel, oxidizer | Walks the part tree from the consumer through crossfeed-capable parts and fuel lines. It drains the highest-priority tanks first: the farthest along a stack, then by the stage-priority number set in the editor ("Flow priority", 1.2+). |

- **Crossfeed:** decouplers and docking ports pass fuel only when crossfeed is enabled. Each has a part-menu toggle, and since 1.2 a default per part. Fuel lines are one-way pipes. Asparagus staging is the emergent design pattern that this rule creates.
- **ISRU flow:** drills and converters move ore with `ALL_VESSEL`-like behaviour within the vessel, so an ore tank anywhere feeds a converter anywhere *(still unverified exact mode)*.
- **Priority edit:** the part menu's "Flow priority" number lets players force a tank to drain first or last.

### 2.2 Manual transfer [KSP1]

- **How:** Alt + right-click (or a pinned part menu) opens several part menus. Each resource line has **In**, **Out** and **Stop** buttons. "In" on tank A pulls the resource from every other open part into A. The transfer runs at a fixed rate until stopped [S7].
- **Who may transfer:** in KSP1 stock there is no crew or Engineer requirement. A difficulty option, **"Resource transfer obeys crossfeed rules"** (off by default), makes transfers respect decouplers and fuel lines. With it on, players report needing lines in both directions [S8].
- **What cannot be transferred:** solid fuel (NO_FLOW) and ablator. Ore and xenon can. EC can only be moved by enabling and disabling containers.
- **Between vessels:** only after docking, because the docked pair becomes one vessel. Claw grabs (the Advanced Grabbing Unit) also join vessels and allow transfer and asteroid mining. There is no transfer by proximity and no hose.
- **Dumping:** stock has **no** "vent" or "dump" button for fuel. Players burn it or use the "Out" trick into a part they then decouple. Mods add jettison. Stock did add a **drain** for some resources: monopropellant became drainable in 1.9 *(corrected 2026-10-18: [S25])*.
- **EVA transfer:** a kerbal on EVA can carry a science container's data, not fuel. Mods (EVA Transfer, Kerbal Inventory System) add hoses [S9].
- **Ground-crew editing [BG?]:** 1.11 added EVA construction and an inventory system to the base game. It moves parts, not resources *(context only)*.

### 2.3 KSP2 transfer [KSP2]

- The resource system was rebuilt around **resource requests** and **container groups**. Containers can be grouped by stage, by decoupler or by other parameters, and consumers request from groups rather than walking the tree [S10].
- A **Resource Manager** flight app shows tank groups and lets the player transfer between selected tanks or groups. Players had asked for transfer "between tank groups, not just individual tanks" [S10]. Exact UI and rules *(still unverified)*.
- Docking crossfeed exists as in KSP1. Persistent-thrust burns under time warp drain propellant from the same groups.

---

## 3. ISRU [KSP1]

### 3.1 The loop

Survey from orbit, then land at a rich spot, drill ore into tanks, convert it to fuel, and fly on. ISRU has been stock since 1.0 (2015). It is one resource (Ore) feeding one family of converters [S11].

### 3.2 Ore and abundance

- **Ore** is dense (10 kg per unit *(verified 2026-10-18: [S25])*) and stored in ore tanks (Radial Ore Tank, Small and Large Holding Tanks, about 75/300/1,500 u *(still unverified)*).
- **Concentration** varies by body, biome and spot, from 0% to some tens of percent. Some bodies (and the sun) have none. Kerbin has ore but is usually a poor place to mine *(still unverified details)*. A difficulty slider, "Resource abundance", scales it.
- **Asteroids and comets** contain ore at a fixed percentage of their mass. Drilling them makes them lighter.

### 3.3 Scanning

| Part | Where | What it gives |
|---|---|---|
| M700 Survey Scanner | Polar orbit | Click "Perform orbital survey": the whole body's overlay for ore becomes available at once in map view (low resolution). It needs a polar orbit (80°–100° inclination) within an altitude band, e.g. Kerbin 60 km–1.5 Mm, Mun 25–1,000 km, Minmus 25–300 km [S12] *(verified 2026-10-18: [S26])*. |
| M4435 Narrow-Band Scanner | Low orbit | Shows exact concentration under the craft, and powers the overlay at higher resolution. It needs the survey first [S12]. |
| Surface Scanning Module | Landed | Reads the concentration at that exact spot, and "Run analysis" gives a biome-wide answer [S12]. |
| Map overlay | Map view | A heatmap with a cut-off slider. It shows cells above a chosen concentration. |

The survey also yields a small science award, 10 science, once per body, and counts as a first science transmission *(verified 2026-10-18: [S26])*. Players found M4435 and surface readings disagreeing at the same site. The cause is that biome-level analysis must be run by hand [S12].

### 3.4 Drills

- **Rate formula** (from a forum quote of the wiki) [S4]: ore/s = base rate × concentration × thermal efficiency × engineer multiplier.
  - The base rate is about 1.5 ore/s on a planet or moon and 5.0 ore/s on an asteroid (Drill-O-Matic). The Drill-O-Matic Junior has a smaller base *(still unverified)*.
  - Thermal efficiency is 100% at a core temperature of 500 K and lower above or below that.
  - The engineer multiplier is **5% with no Engineer aboard** and rises to about 125% with a 5-star Engineer.
- **Power:** about 15 EC/s at full load, scaled by load [S4].
- **Heat:** a Drill-O-Matic makes about **100 kW of core heat** [S4]. Radiators must remove it, or the drill overheats and shuts down or becomes inefficient.
- **Deploy:** drills must extend and touch the ground. A drill only works "landed" (or attached to an asteroid or comet).

### 3.5 Converters

- **Convert-O-Tron 250** (2.5 m): processes are Lf+Ox, LiquidFuel, Oxidizer, MonoProp, and **Ore→XenonGas is not stock** *(the companion document lists Xenon; verify)*.
  - Each process draws **30 EC/s** [S4] and makes about **200 kW** of core heat, against a radiator cooling cap of about 500 kW. So players run two processes at once at most without overheating [S4].
  - It is efficient: 0.5 ore/s becomes 0.45 LF + 0.55 Ox per second at 30 EC/s, so 1 ore becomes 2 units of fuel by volume; LF-only, Ox-only and monopropellant modes also exist, and no xenon *(verified 2026-10-18: [S27])*.
- **Convert-O-Tron 125** (1.25 m): a lighter, slower and much less efficient version (roughly 10 ore to 2 fuel). It is used on small landers.
- **Engineer:** converters also scale with the Engineer's level. Converting a full tank takes about 3.5 h with a 0-star Engineer against about 40 min with a 5-star [S11].
- **Background catch-up:** converters on unloaded vessels "catch up" when the vessel is loaded, by elapsed time. The catch-up does **not** check EC or cooling [S11]. That is the one stock exception to "unloaded vessels are frozen", and a well-known free-energy exploit.

### 3.6 Who mines what

| Body class | Practical ISRU |
|---|---|
| Minmus, Mun | The classic first refuelling station. The low gravity makes the ore cheap to lift. |
| Asteroids, comets | The highest drill rate. Grabbing one with the Klaw plus a drill and converter makes a mobile refinery. |
| Duna, Ike, Laythe moons | Interplanetary staging bases. |
| Gas giant (Jool), sun | No ore. |

### 3.7 KSP2 resources

- **[KSP2]** No ore, drills, scanners or converters shipped. The resources in game are propellants (methane, oxidizer, hydrogen, monopropellant, xenon, solid fuel), EC, intake air and ablator, plus science data and samples [S13]. KSP2 used **methane** instead of KSP1's abstract "liquid fuel", and liquid **hydrogen** for the Nerv-class nuclear engine.
- **[KSP2 — never shipped]** A multi-resource system for colonies: mining, refining into parts, and delivery routes. Fan-compiled lists mention uranium for nuclear engines and metallic hydrogen. No official list was published (companion document §1.4).
- **[KSP2 Redux plan]** A colony UI for resources, power and heat, then supply routes (companion document §1.3).

---

## 4. Thermal model beyond re-entry [KSP1]

KSP1 1.0 brought in a full per-part thermal model. It does far more than re-entry.

### 4.1 Two kinds of heat

| Kind | Where it comes from | Where it goes |
|---|---|---|
| **Skin and internal temperature** | Re-entry, aerodynamic heating, engine exhaust, sunlight, conduction from neighbouring parts | Radiated to space, convected to air, conducted to parts it touches. A part explodes when either temperature exceeds its maximum. |
| **Core heat** (`ModuleCoreHeat`) | Drills and converters (and some modded reactors) | It must be pulled out by radiators. A core temperature off its optimum (500 K for stock ISRU) lowers efficiency. A core above its maximum (about 1,000 K for drills *(still unverified)*) shuts the part down. |

- **Conduction** flows between attached parts by contact area and conductivity. Heat shields have low conductivity so the pod behind them stays cool.
- **Engines** heat their own part and neighbours. Nuclear engines (LV-N) run very hot and need radiators on long burns *(still unverified scale)*.
- **Sunlight** heats parts on the sun side. Close to the sun (Moho) a craft can overheat without radiators.
- **Thermal overlay:** a debug "thermal data in part menus" option and a heat gauge show parts near their limit. Temperature gauges appear beside the staging stack when a part nears its limit.

### 4.2 Radiators

| Part | Kind | Capacity |
|---|---|---|
| Thermal Control System (small, medium, large) | Deployable panel; some fold | Core-heat transfer 50 kW (small TCS) / 250 kW (medium) / 1,000 kW (large); fixed panels 50–200 kW *(verified 2026-10-18: [S28])* |
| Radiator Panel (small, edge, large) | Fixed surface panel | Smaller capacity, always on |
| Its role | It draws core heat from parts within reach, and also skin heat from neighbours. It needs EC while active: 0.025–0.5 EC/s by size *(verified 2026-10-18: [S28])*. | Large drills plus converters need large radiators. |

- **Rule of thumb from players:** one large drill (100 kW) or one converter process (200 kW) needs matching radiator kW. The Convert-O-Tron 250's own cooling cap (about 500 kW) is the bottleneck [S4][S14].
- **Background:** unloaded vessels have no thermal simulation, and the ISRU catch-up skips it entirely [S11].

### 4.3 KSP2 heat [KSP2]

- Re-entry heating effects and part heat came back in Early Access patches. The roadmap put basic part heat and radiators with Colonies and fuller thermal management later (companion document §1.2). Exact shipped scope (core heat, radiators) *(still unverified)*. No ISRU means no core-heat gameplay shipped.

---

## 5. Science hardware operations

The value formula, situations and the KSP2 experiment table are in `05-science-and-research.md`. This section is about how the hardware is operated.

### 5.1 KSP1 experiment roster [KSP1][BG]

| Experiment | Part / source | Where it works | Rerun | Operation notes |
|---|---|---|---|---|
| Crew Report | Any crewed command pod | Everywhere | Repeatable | Instant, 100% transmit. Biome-dependent low down. |
| EVA Report | A kerbal on EVA | Everywhere a kerbal can be | Repeatable | Store it in a pod by boarding. |
| Surface Sample | A kerbal on EVA, landed or splashed | Surface | Repeatable | Career needs Astronaut Complex and R&D upgrades. Low transmit value. |
| Mystery Goo Observation | Mystery Goo Containment Unit | Everywhere | **Single use** | Inoperable after one run until a Scientist on EVA cleans it, or a lab resets it. |
| Materials Study | SC-9001 Science Jr. | Everywhere | **Single use** | Like Goo. Heavy and draggy. |
| Temperature Scan | 2HOT Thermometer | Everywhere | Repeatable | Instant. |
| Atmospheric Pressure Scan | PresMat Barometer | Atmosphere and space | Repeatable | |
| Seismic Scan | Double-C Seismic Accelerometer | Landed | Repeatable | |
| Gravity Scan | GRAVMAX Negative Gravioli Detector | Space and landed | Repeatable | Biome-dependent in orbit. |
| Atmosphere Analysis | Atmospheric Fluid Spectro-Variometer | Inside an atmosphere | Repeatable | |
| Infrared telescope | SENTINEL Infrared Telescope | Solar orbit | — | Finds asteroids for tracking (Tracking Station level 3 needed). It **is** also a science experiment ("Infrared Telescope") *(corrected 2026-10-18: [S29])*. |
| Magnetometer | Magnetometer Boom | Space | Repeatable | DLC part: Breaking Ground or 1.7-era base *(source still unverified)*. |
| Asteroid and comet sample | A kerbal on EVA at an asteroid or comet | Next to one | Per object | High value. |
| Surface features [BG] | Rocks, craters, cryovolcanoes on bodies | Landed | Per feature | Small ones are picked up on EVA. Big ones need a robotic scanning arm (ROC arm) on a rover [S15]. |
| Deployed science [BG] | Deployable experiment kit | Landed | Accrues over time | §5.5. |

- **Running.** Click "Run" in the part menu or press an action group. A results dialog appears with **Keep**, **Transmit**, **Lab** (send to a lab on board) and **Reset/Discard**. The dialog shows the value if recovered against if transmitted.
- **Storing.** Each experiment part holds one result. Command pods and the Experiment Storage Unit hold many, but **not two copies of the same subject**. A kerbal on EVA can "Take data" from parts and "Store experiments" into a pod. Collecting from a single-use experiment frees it to rerun only if a Scientist resets it.
- **Resets.** A Scientist on EVA can "Reset" Goo or a Materials Bay. Without one, the part stays spent until recovered. The MPL can clean them remotely.
- **Transmission.** The antenna sends data in packets at its rate (Mits per second) and costs EC per Mit. A dialog queues several results. With CommNet, the signal strength factors into the time and success. The penalty is per-experiment: reports send at 100%, Goo at 30% [S16].
- **Duplicates.** Rerunning the same subject yields a share of what is left, so the dialog shows a shrinking value (detail in `05-science-and-research.md`).

### 5.2 Situations and biomes [KSP1][KSP2]

- KSP1 has six situations: landed, splashed, flying low, flying high, space low and space high. The boundaries are per body. Each experiment flags which situations are biome-dependent [S16].
- KSP2 has five (landed, splashed, atmosphere, low orbit, high orbit) with **regions** in place of biomes, and some experiments require a region [S16].
- Biome is read from a texture map of the body. KSP1's Surface Scanning Module and the Kerbnet map overlay tell the player which biome is under the craft.

### 5.3 Data against samples

- **[KSP1]** Every result can be transmitted. Each experiment's transmit scalar decides the loss. Recovery on Kerbin gives full value, and recovery also credits science stored anywhere on the craft.
- **[KSP2]** Results are tagged **Data**, **Sample**, or both. Data can be transmitted at full value from inside comm range. Samples must be recovered physically, and they are worth about 2–3× more [S16]. The **Research Inventory** app lists everything stored on the vessel, with buttons to transmit all data.

### 5.4 Labs [KSP1]

- **Mobile Processing Lab (MPL-LG-2):** a crewed lab that needs at least one Scientist. It has two jobs.
  1. **Clean** single-use experiments on the same vessel, so Goo and Materials Bays can run again.
  2. **Research.** Each subject can be loaded into the lab **once**, which adds "data" (the subject's value scaled by a factor). Over time the lab turns data into science. The rate grows with stored data and with the number and level of Scientists. The often-quoted ratio is "1 data → up to 5 science" [S17].
- **Capacity:** about 750 data stored. One player's lab with about 744 data was producing about 5 science per day [S17]. Accumulated science must be **transmitted** from the lab before its science store (500 science *(verified 2026-10-18: [S22])*) fills; the data buffer holds 750.
- **Location factor:** a lab gets a bonus for data from the sphere of influence it is in, and data from a landed situation counts more. A lab landed on Kerbin takes a 90% penalty, which makes it near worthless there [S17].
- **Power:** a continuous EC draw while researching: 5 EC/s *(verified 2026-10-18: [S22])*. The lab pauses with no EC.
- **Reception:** it is an idle science engine and the most-exploited stock science source. Many players see it as a chore multiplier that is also needed to finish the tree.

### 5.5 Breaking Ground deployed science [BG]

- A **Deployable Science Kit** packs into a cargo container. A kerbal on EVA places each piece on the ground [S15]:
  - Central station (the hub that must exist and be linked to Kerbin by CommNet);
  - **Power:** a deployable solar panel or a small RTG;
  - **Antenna booster** for range;
  - **Instruments:** Weather station, Active Seismometer, Goo Observation, Ion Collector (ion detector).
- **Power budget:** each instrument has a power need, and the station only runs the instruments its generators cover. A solar unit makes nothing at night *(still unverified exact units)*.
- **Scientist and Engineer bonuses:** the level of the kerbal who deployed an instrument raises its output or power *(still unverified)*.
- **Science over time:** each experiment accrues to a cap over days and transmits automatically while the station is connected. The **Active Seismometer** also needs impacts: spent stages crashed near it award large bonuses, which is a deliberate emergent goal [S15].
- **Background:** deployed experiments keep accruing while the player is elsewhere *(still unverified whether simulated or computed on load)*. It is the one stock "set and forget" science before the MPL.

### 5.6 KSP2 For Science! operations [KSP2]

- Experiments have **durations** (instant to 6 hours) and **states**: ready, running, paused, invalid location, location changed, out of resource, insufficient crew, already stored [S16]. "Out of resource" means EC can pause an experiment.
- An **Experiment Actions** button lights up when the current location offers something new [S16]. Players no longer hunt part by part.
- **Research Inventory** stores data and samples per vessel, de-duplicated by subject. Recovery credits everything.
- No labs and no deployables shipped. No ISRU-related science (surveys) shipped.

---

## 6. Life support

### 6.1 Stock: none [KSP1][KSP2]

Neither game has stock food, water, oxygen or CO2. Crew live forever in a pod with no power. KSP2 also never announced stock life support. Habitation was hinted for colonies, and population and morale were never specified (companion document §1.2).

### 6.2 What the mods do [Mod]

| Mod | Consumables | Failure | Design takeaway |
|---|---|---|---|
| **Snacks!** | One resource, "Snacks", eaten at set times. Optional "Soil" recycling. | Kerbals stop working (they become tourists) or get reputation penalties. Death is optional. | The simplest, forgiving version. Pairs well with career pacing. |
| **TAC Life Support** | Food, water, oxygen and EC per kerbal. Waste products (CO2, waste water) can be recycled by parts. | Death after a grace: about 360 h without food, 36 h without water, 2 h without oxygen or EC (forum-reported defaults) [S18]. | The classic "real" model. Rates are visible in a window with time left. |
| **USI Life Support** | "Supplies" eaten, "Mulch" produced and recycled. Plus **Habitation** time (months of living space) and EC. | Kerbals become tourists (no skills) when supplies or habitation run out. Optional death. | Separates "food" from "living space", so long trips need bigger habitats, not just more cans. |
| **Kerbalism** | Food, water, oxygen, CO2 scrubbing, EC, plus radiation, stress (comfort, living space), and part reliability. Science is also produced and transmitted over time. | Death, breakdown, or kerbals making mistakes (pressing buttons). | Simulates **every** vessel in the background in closed form, which fixes stock's frozen unloaded vessels. Deep, but steep [S19]. |

- Common pattern: consumption is **per kerbal per day**, the UI shows **days left** per vessel, and failure is either death after a grace or loss of skills.
- Mods that keep EC as life support (TAC, Kerbalism) make power the true survival limit. A dead battery on the night side kills the crew, which turns solar sizing into a life-or-death design task.

---

## 7. Implications for Space Orbital Program

### 7.1 What our code already has (grep of 2026-10-18)

| Area | Status in our code | Where |
|---|---|---|
| EC resource, vessel-wide flow | Yes: `stock.electric-charge`, `flowMode: 'vessel'`, near-massless density | `mods/stock/src/resources.ts` |
| Flow modes | `stack` (LF, Ox), `vessel` (EC, life support), `none` (ablator). Reachability by plan 007. | `resources.ts` |
| Storage | Built into the command pod (50 EC) and probe core (20 EC). Data drive part. **No battery part.** | `mods/stock/src/parts.ts` |
| Solar panel | One stock panel: a constant 0.5 EC/s while deployed, the same in flight and background (rate × dt), clamped by storage. **No sun direction, distance, occlusion, atmosphere or breakage** (deferred to plans 122 and 065). | `mods/stock/src/solar.ts`, ADR 0171 |
| Consumers | Reaction wheel (`chargeRate`, torque reduced without EC), experiments (`power` per second; pause with "no electric charge"), CO2 scrubber (EC per served person per day) | `modules.ts`, `science.ts`, ADR 0181 |
| Zero-EC control loss | Command source rule (ADR 0109). Probe cores do **not** drain EC themselves *(per grep)*. | `docs/decisions/0109-*` |
| Transmission | `transmit-data` × the item's transmit factor. **No EC cost or duration per Kbit** in the module (KBIT constants exist in science.ts). | `packages/sim/src/science.ts` |
| Science | Six KSP1 situations, timed experiments with states (KSP2-style), data and samples, stored results, science dock | `mods/stock/src/science.ts`, ADRs 0178, 0192, 0194 |
| ISRU | Site-level ISRU: drills on outpost members add `stock.ice` 50 u per day. The ISRU plant recipe turns 100 ice into 40 LF + 49 Ox per day. `power` inputs are declared but do not limit. | `mods/stock/src/bases.ts`, ADR 0125 |
| Markets and storage | Commodities, recipes, site storage, launch fuel from storage then market | ADR 0124 |
| Thermal | Re-entry heating and part temperature only. **No core heat, no radiators.** | `packages/sim/src/thermal.ts`, ADR 0023 |
| Life support | Rules off / simple / full. Supplies or O2, water and food per crew per day. Scrubbers. Exact run-out times under warp. Grace and death. | ADR 0181 |
| Labs, deployables, scanners, fuel cells, RTGs, batteries | **None** | — |

### 7.2 Adopt

1. **Adopt KSP1's single vessel-wide EC pool** with producers, consumers and batteries. Players understand it, and we already have it. Keep the "disable this container" toggle as the reserve-battery tool.
2. **Adopt sun-aware solar:** output = rated × cos(angle) × falloff(distance) × atmosphere factor × (not occluded). Use a curve, not a pure inverse square, so panels near the sun don't become absurd (the KSP1 lesson [S2]). Compute occlusion by bodies analytically (a shadow cylinder or cone of each body along the sun line). It is cheap and deterministic.
3. **Adopt the core trio of producers:** solar (fixed, deployable, tracking), RTG (constant) and fuel cell (burns LF+Ox). These three cover every early design question: day and night, distance, and burst power.
4. **Adopt drills' "rate × concentration × efficiency × crew skill"** shape when vessel-level ore arrives. It reads well and ties crew skills to ISRU.
5. **Adopt KSP2's data/sample split, timed experiments and the "experiment available here" prompt.** We already did. Keep it.
6. **Adopt one lab-like late-game sink,** but bounded (§7.4).
7. **Adopt life-support mod lessons:** per crew per day, days-left readout, grace then consequence. We already did this (ADR 0181), and in a cleaner way than any single mod.

### 7.3 Improve

1. **Background power in closed form.** KSP1 freezes unloaded vessels, and the ISRU catch-up ignores EC and heat [S11]. Integrate EC piecewise-linearly with event times, exactly as ADR 0181 does for consumables: sunlight and shadow intervals come from the orbit (the time of entry into and exit from a body's shadow is computable per orbit). So a probe on the far side of the Mun really does run flat, and ISRU on rails is limited by power. This is the single biggest step past KSP1 and KSP2.
2. **Power budget in the editor.** Show producers and consumers, day and night balance, and "battery lasts X min in shadow at this orbit". KSP1 never had it in stock, and KSP2's was thin. Our sim can compute the worst shadow time for a target orbit.
3. **Transmission costs EC and time,** sized in Kbit (we already store sizes). It pauses on no EC and resumes, never losing data. That avoids the KSP1 lost-packet complaint.
4. **Panels deploy without EC,** or with a stored-charge reserve. This fixes the "dead probe can't open its panels" trap that KSP2 players asked about [S5]. Keep control loss at zero EC, but offer **hibernate** (minimal drain, wakes on a timer or when charge crosses a threshold), because it is a meaningful player choice.
5. **Power gates ISRU at sites too.** ADR 0125 declares `power` inputs that do not limit. Close that with a site power budget (generators as buildings, or solar by latitude and day length from plan 122's axial tilt), so a base must actually be powered.
6. **Heat as a budget, not a temperature puzzle.** Represent core heat as "kW produced" against "kW removed" per vessel or site. A shortfall reduces efficiency on a clear curve, rather than KSP1's hidden 500 K optimum. Radiators become simple capacity parts. Keep the full temperature model for re-entry only.
7. **Scanning as science.** An orbital survey reveals a body's resource map and pays a one-time science result, which ties the ISRU loop to the science loop.
8. **Transfer UI:** a Resource panel where you pick source and destination containers (or groups, KSP2-style) and press Transfer, with "obey crossfeed" as a world rule. Add a **vent/dump** action, which KSP1 lacked.

### 7.4 Avoid

1. **Avoid the MPL's idle infinite science.** If a lab exists, cap its output per subject and make it need fresh data, or make it convert data into a different reward (for example faster research) rather than unbounded science.
2. **Avoid free catch-up.** Never apply elapsed-time production without checking power, heat, storage and input limits.
3. **Avoid hidden numbers:** a 5% "no engineer" drill, thermal efficiency curves and cooling caps learned only from the forum [S4]. Show every multiplier in the part card and the flow panel.
4. **Avoid one resource to rule them all** (KSP1's Ore). We already have ice → LF + Ox as a recipe. Keep recipes as data so more chains are content, not code.
5. **Avoid single-use experiments that need EVA resets** as a chore loop. The KSP2 team called this out as a veteran-only grind (see `05-science-and-research.md`).
6. **Avoid alt-click multi-menu transfer.** It is the least discoverable control in KSP1.

### 7.5 Checklist: needed at public launch vs later

| Feature | Launch | Later | We have it? |
|---|---|---|---|
| EC pool, vessel flow, containers with disable toggle | ✔ | | Pool yes. Toggle *(check)*. |
| Battery parts (2–3 sizes) | ✔ | | **No** (built-in only) |
| Solar with sun angle, distance curve, body shadow | ✔ | | **No** (constant rate; plans 122/065) |
| Atmosphere attenuation and panel breakage under load | | ✔ | No |
| RTG | ✔ | | No |
| Fuel cell | | ✔ | No |
| Engine alternators | | ✔ | No |
| Probe core drain, zero-EC control loss, hibernate | ✔ (drain + loss), hibernate later | ✔ | Loss rule via command source. Drain no. |
| Reaction wheels draw EC | ✔ | | Yes |
| Experiments draw EC, pause without it | ✔ | | Yes |
| Transmission costs EC and time | ✔ | | **No** (instant) |
| Background EC integration with shadow intervals | ✔ | | Partial (solar background is rate × dt, no shadow) |
| Editor power budget (day/night, shadow length) | ✔ | | No |
| Resource panel with amounts and rates | ✔ | | *(check flight HUD)* |
| Manual transfer between containers, crossfeed toggle | ✔ | | Fuel line and crossfeed exist. Transfer UI *(check)*. |
| Dump/vent | | ✔ | No |
| Crew life support (simple), days-left readout | ✔ | | Yes (ADR 0181) |
| Full life support (O2/water/food, scrubbers) | | ✔ (as rule) | Yes |
| Site ISRU (ice → LF/Ox), storage, routes | ✔ (thin slice) | | Yes (ADR 0125) |
| Site power limits recipes | | ✔ | No (declared, not limiting) |
| Vessel-level drill and converter, ore tanks | | ✔ | No |
| Orbital survey scanner and resource overlay | | ✔ | No |
| Core heat and radiators (as kW budget) | | ✔ (with vessel ISRU) | No |
| Science lab (bounded) | | ✔ | No |
| Deployed science stations | | ✔ | No |
| Asteroid/comet mining | | ✔ | No |

**Launch-critical gaps:** batteries, sun-aware solar with shadows (in flight and background), an RTG, transmission EC and time, and an editor power readout. Everything else in this document can follow the first public build.

---

## Sources

- [S1] KSP Wiki (via search excerpts) — "Gigantor XL Solar Array", "OX-10C Photovoltaic Panels", "SP-10L 1x5 Photovoltaic Panels", "Parts/Electrical". https://wiki.kerbalspaceprogram.com/wiki/Gigantor_XL ; https://wiki.kerbalspaceprogram.com/wiki/Parts/Electrical — checked 2026-10-18 — official community wiki, but the direct fetch was blocked (Anubis), so these come from search snippets (medium).
- [S2] KSP Forum — "Looking for solar panel math models in KSP", "PSA: Solar panels generate less power in atmospheres", "PSA: Solar panels now useless past Dres", "Solar panels no longer blocked". https://forum.kerbalspaceprogram.com/topic/195935-looking-for-solar-panel-math-models-in-ksp ; https://forum.kerbalspaceprogram.com/topic/110315-psa-solar-panels-generate-less-power-in-atmospheres/page/2 ; https://forum.kerbalspaceprogram.com/topic/107012-psa-solar-panels-now-useless-past-dres-as-it-should-be ; https://forum.kerbalspaceprogram.com/topic/103684-solar-panels-no-longer-blocked — checked 2026-10-18 — player measurements and discussion (medium; version-dependent).
- [S3] KSP Wiki "Command module" and "Probodobodyne Stayputnik" (excerpts); KSP Forum "Enable inactive vessel electricity consumption", "Why can't I get this probe back to life". https://wiki.kerbalspaceprogram.com/wiki/Cockpit ; https://wiki.kerbalspaceprogram.com/wiki/Stayputnik ; https://forum.kerbalspaceprogram.com/topic/72859-enable-inactive-vessel-electricity-consumption ; https://forum.kerbalspaceprogram.com/topic/123073-why-cant-i-get-this-probe-back-to-life — checked 2026-10-18 — wiki excerpts (medium) and forum (low–medium).
- [S4] KSP Forum — "Mining assistance", "An optimizing guide for mining bases", "Mining vs cooling", "How much Convert-O-Tron power do I need per Drill-O-Matic"; KSP bug tracker Bug #10099. https://forum.kerbalspaceprogram.com/topic/160431-mining-assistance ; https://forum.kerbalspaceprogram.com/topic/165362-an-optimizing-guide-for-mining-bases ; https://forum.kerbalspaceprogram.com/topic/152956-mining-vs-cooling ; https://forum.kerbalspaceprogram.com/topic/134227-how-much-convert-o-tron-power-do-i-need-per-drill-o-matic ; https://bugs.kerbalspaceprogram.com/issues/10099 — checked 2026-10-18 — community guides quoting the wiki, plus a bug report (medium).
- [S5] KSP Forum — "Deploying solar panels should not require electric charge" (KSP2 suggestion). https://forum.kerbalspaceprogram.com/topic/220732-deploying-solar-panels-should-not-require-electric-charge — checked 2026-10-18 — player suggestion (low–medium).
- [S6] kerbal.wiki — "0.2.1.0" patch notes. https://kerbal.wiki/0.2.1.0 — checked 2026-10-18 — community KSP2 wiki mirroring official notes (medium–high).
- [S7] KSP Wiki — "Fuel transfer", "Fuels" (excerpts). https://wiki.kerbalspaceprogram.com/wiki/Fuel_transfer ; https://wiki.kerbalspaceprogram.com/wiki/Fuels — checked 2026-10-18 — official community wiki via snippets (medium).
- [S8] KSP Forum — "ResourceFlowMode and ResourceTransferMode", "How to stop fuel flow between 2 parts", "Mod request: monopropellant and crossfeed"; KSP bug tracker Bug #26820. https://forum.kerbalspaceprogram.com/topic/188030-resourceflowmode-and-resourcetransfermode ; https://forum.kerbalspaceprogram.com/topic/130353-how-to-stop-fuel-flow-between-2-parts ; https://forum.kerbalspaceprogram.com/topic/161739-mod-request-monopropellant-and-crossfeed ; https://bugs.kerbalspaceprogram.com/issues/26820 — checked 2026-10-18 — modder discussion and bug report (medium).
- [S9] GitHub — DMagic1/KSP-EVA-Transfer; SpaceDock mod 546 (resource balancing). https://github.com/DMagic1/KSP-EVA-Transfer ; https://spacedock.info/mod/546 — checked 2026-10-18 — mod pages (high for the mods themselves).
- [S10] Kerbal Space Program — "Dev Diaries: Developer Insights #13 – KSP2 Resource System" (now 404) and its forum thread. https://kerbalspaceprogram.com/news/dev-diaries-developer-insights-13-ksp2-resource-system ; https://forum.kerbalspaceprogram.com/topic/207046-developer-insights-13-%E2%80%93-ksp2-resource-system/page/2 — checked 2026-10-18 — official dev diary known through search excerpts (medium).
- [S11] KSP Wiki — "Convert-O-Tron 250", "ISRU" (via the companion document's S8). https://wiki.kerbalspaceprogram.com/wiki/Convert-O-Tron_250 ; https://wiki.kerbalspaceprogram.com/wiki/ISRU — checked 2026-10-17/18 — official community wiki via snippets (medium).
- [S12] KSP Wiki "M4435 Narrow-Band Scanner", "M700 Survey Scanner", "Resource scanner" (excerpts); KSP Forum "How to scan for resources", "Disagreeing resource scanners". https://wiki.kerbalspaceprogram.com/wiki/M4435_Narrow-Band_Scanner ; https://wiki.kerbalspaceprogram.com/wiki/Surveyor ; https://forum.kerbalspaceprogram.com/topic/106175-how-to-scan-for-resources ; https://forum.kerbalspaceprogram.com/topic/174981-disagreeing-resource-scanners — checked 2026-10-18 — wiki excerpts and forum (medium).
- [S13] kerbal.wiki — "0.2.0.0" (For Science! notes). https://kerbal.wiki/0.2.0.0 — checked 2026-10-17 — community KSP2 wiki (medium–high).
- [S14] KSP Forum — "Cooling Convert-O-Tron: I have this right?", "Mining and overheating". https://forum.kerbalspaceprogram.com/topic/169366-cooling-convert-o-tron-i-have-this-right ; https://forum.kerbalspaceprogram.com/topic/164489-mining-and-overheating — checked 2026-10-18 — forum (medium).
- [S15] Kerbal Space Program — "Breaking Ground" product page; KSP Wiki "Breaking Ground" (excerpt). https://kerbalspaceprogram.com/games-breakingground ; https://wiki.kerbalspaceprogram.com/wiki/Breaking_Ground — checked 2026-10-18 — official product copy (high for listed parts; no numbers).
- [S16] `refs/reverse-engineering-ksp2/05-science-and-research.md` and its sources S1–S16 (KSP wiki excerpts, KSP2 patch notes, the kontrolsystem2 API reference). Local file — checked 2026-10-18 — secondary compilation (medium).
- [S17] KSP Forum — "How to use Mobile Processing Lab" (page 2), "Mobile processing lab" tag; Steam discussion 1483235412197751098. https://forum.kerbalspaceprogram.com/topic/171390-how-to-use-mobile-processing-lab/page/2 ; https://steamcommunity.com/app/220200/discussions/0/1483235412197751098 — checked 2026-10-18 — player reports quoting the wiki (medium).
- [S18] KSP Forum — "[1.0.5] TAC Life Support" (via the companion document's S16). https://forum.kerbalspaceprogram.com/topic/37449-105-tac-life-support-v01121-12dec — checked 2026-10-17 — mod thread (medium; old version).
- [S19] GitHub — Kerbalism/Kerbalism. https://github.com/Kerbalism/Kerbalism — checked 2026-10-17 — mod README (high for the mod).
- [S20] KSP Wiki — "Parts/Electrical" (Internet Archive snapshot). https://web.archive.org/web/20241204171931/https://wiki.kerbalspaceprogram.com/wiki/Parts/Electrical — full table of generators and batteries; high.
- [S21] KSP Wiki — "IX-6315 Dawn" and "Illuminator Mk1" (archive). https://web.archive.org/web/20240103234539/https://wiki.kerbalspaceprogram.com/wiki/IX-6315_%22Dawn%22_Electric_Propulsion_System ; https://web.archive.org/web/20240115214058/https://wiki.kerbalspaceprogram.com/wiki/Illuminator_Mk1 — high.
- [S22] KSP Wiki — "Mobile Processing Lab MPL-LG-2" (archive). https://web.archive.org/web/20240105030649/https://wiki.kerbalspaceprogram.com/wiki/Mobile_Processing_Lab_MPL-LG-2 — high.
- [S23] KSP Wiki — "Reaction wheel" (archive). https://web.archive.org/web/20240104235213/https://wiki.kerbalspaceprogram.com/wiki/Reaction_wheel — high.
- [S24] KSP Wiki — "Antenna" (archive). https://web.archive.org/web/20231018234521/https://wiki.kerbalspaceprogram.com/wiki/Antenna — high.
- [S25] KSP Wiki — "Resource" and "Monopropellant" (archive). https://web.archive.org/web/20240121092520/https://wiki.kerbalspaceprogram.com/wiki/Resource ; https://web.archive.org/web/20240118183523/https://wiki.kerbalspaceprogram.com/wiki/Monopropellant — high.
- [S26] KSP Wiki — "M700 Survey Scanner" (archive). https://web.archive.org/web/20240107143336/https://wiki.kerbalspaceprogram.com/wiki/M700_Survey_Scanner — high.
- [S27] KSP Wiki — "Convert-O-Tron 250" (archive). https://web.archive.org/web/20240107143742/https://wiki.kerbalspaceprogram.com/wiki/Convert-O-Tron_250 — high.
- [S28] KSP Wiki — "Radiator" (archive). https://web.archive.org/web/20240103075425/https://wiki.kerbalspaceprogram.com/wiki/Radiator — high.
- [S29] KSP Wiki — "SENTINEL Infrared Telescope" (archive). https://web.archive.org/web/20240106170258/https://wiki.kerbalspaceprogram.com/wiki/SENTINEL_Infrared_Telescope — high.

Snacks! and USI-LS behaviours in §6.2 are from general knowledge of those mods *(still unverified this pass)*.

---

## Needs verification

| Claim | Where to check |
|---|---|
| Per-part EC outputs and draws (OX-STAT 0.35 or 0.33, 1x6 ~1.6, OX-10 ~7, PB-NUK 0.75, fuel cells 1.5/18, probe cores, lights, Dawn ion engine 8.7, MPL draw) | https://wiki.kerbalspaceprogram.com/wiki/Parts/Electrical ; the stock part `.cfg` files in `GameData/Squad/Parts` — 2026-10-18: verified from archived tables [S20]–[S24] (OX-STAT 0.35, 1x6 1.64, RTG 0.75, fuel cells 1.5/18, Dawn 8.74, lights 0.04, MPL 5); OX-10 corrected to 8.25. Probe-core draws still unverified. |
| Solar config fields (`powerCurve`, `temperatureEfficCurve`) and the atmosphere attenuation formula | https://forum.kerbalspaceprogram.com/topic/195935-looking-for-solar-panel-math-models-in-ksp — still unverified: forum blocked; no config mirror read. |
| Whether own-part shadows block panels in 1.12 | https://forum.kerbalspaceprogram.com/topic/103684-solar-panels-no-longer-blocked — still unverified: forum blocked. |
| How on-rails warp of the active vessel computes EC | https://forum.kerbalspaceprogram.com/topic/72859-enable-inactive-vessel-electricity-consumption — still unverified: forum blocked. |
| Antenna EC per Mit and the behaviour when EC runs out mid-transmission | https://wiki.kerbalspaceprogram.com/wiki/Antenna — 6 EC/Mit for Communotron 16 verified [S24]; out-of-EC behaviour still unverified. |
| Monopropellant flow mode (`STAGE_PRIORITY_FLOW` or `ALL_VESSEL`) and ore's flow mode | https://forum.kerbalspaceprogram.com/topic/188030-resourceflowmode-and-resourcetransfermode — Verified: STAGE_PRIORITY_FLOW since 0.23.5; ore flows "Everywhere" [S25]. |
| Whether stock KSP1 ever added a fuel dump or a VAB power summary | https://wiki.kerbalspaceprogram.com/wiki/Fuel_transfer — Corrected: monoprop drainable since 1.9 [S25]; VAB power summary still unverified. |
| Ore tank capacities, M700 altitude band, survey science award, Kerbin's ore | https://wiki.kerbalspaceprogram.com/wiki/Surveyor ; https://wiki.kerbalspaceprogram.com/wiki/ISRU — Survey band and 10-science award verified [S26]; ore tank sizes and Kerbin ore still unverified. |
| Convert-O-Tron 250 processes (XenonGas or not) and exact ratios; Convert-O-Tron 125 ratios | https://wiki.kerbalspaceprogram.com/wiki/Convert-O-Tron_250 — 250 verified: LF+Ox, LF, Ox, monoprop; no xenon [S27]. Convert-O-Tron 125 still unverified. |
| Drill core maximum temperature, radiator kW per part, whether radiators draw EC | https://wiki.kerbalspaceprogram.com/wiki/Radiator — Radiator kW and EC draw verified [S28]; drill core max temperature still unverified. |
| Magnetometer Boom origin (base game or Breaking Ground); SENTINEL telescope's science role | https://wiki.kerbalspaceprogram.com/wiki/Breaking_Ground — SENTINEL corrected (it is a science experiment) [S29]; Magnetometer origin still unverified (not in the archived BG parts list). |
| MPL science store (500?), EC draw, Scientist rate formula | https://wiki.kerbalspaceprogram.com/wiki/Mobile_Processing_Lab_MPL-LG-2 — Verified: 500 science store, 750 data, 5 EC/s [S22]; Scientist rate formula still unverified. |
| Breaking Ground power units, kerbal-level bonuses, and background accrual | https://wiki.kerbalspaceprogram.com/wiki/Deployed_Science — still unverified: Deployed Science page not fetched. |
| KSP2 Resource Manager UI, VAB power readout, KSP2 heat and radiator scope, EC on unloaded vessels | https://kerbal.wiki/0.2.0.0 ; https://kerbal.wiki/0.2.1.0 ; https://kerbal.wiki/0.2.2.0 — still unverified: kerbal.wiki not re-read. |
| Snacks! and USI-LS failure rules | https://forum.kerbalspaceprogram.com (mod threads) ; https://github.com/UmbraSpaceIndustries/USI-LS — still unverified: mod sources not fetched. |
| Our code: resource disable toggle, the flight Resource panel and the transfer UI | `apps/` HUD code and plans 007 and 110 in this repo — still unverified: repo code is out of scope for this pass. |
