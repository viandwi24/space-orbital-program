# 09 — Parts catalogue: every functional part type in KSP1, its DLCs and KSP2

Research written 2026-10-18. Goal: a complete reference of the **kinds** of part a KSP player expects to find in the catalogue, so the stock part list of Space Orbital Program misses nothing obvious. It lists functional types (what a part does), not every size variant. It records research, not decisions; any new part still needs a plan and, where it brings a new mechanic, an ADR.

Conventions:
- Tags: **[KSP1]** base game 1.12.x; **[MH]** Making History DLC; **[BG]** Breaking Ground DLC; **[KSP2]** shipped in KSP2 Early Access (0.1.x–0.2.x); **[KSP2 — never shipped]** announced on the roadmap but never released; **[Mod]** community mod, for contrast only.
- Diameter classes, with the KSP2 size letters: 0.625 m = "Tiny"/XS, 1.25 m = "Small"/SM, 1.875 m = "Medium-small" (MH only), 2.5 m = "Large"/MD, 3.75 m = "Extra large"/LG, 5 m = MH "S4"/XL. Mk2 and Mk3 are the spaceplane fuselage profiles.
- Masses are in tonnes (t), cost in funds (√), thrust in kN, Isp in seconds (sea level / vacuum), EC = Electric Charge. "u" = KSP's abstract resource unit.
- PartModule names are the class names used in KSP1 `part.cfg` files, as documented by the community. Names not confirmed by a source are marked *(unverified)*.
- The official KSP wiki and the Fandom wiki blocked automated fetching (bot wall / HTTP 402). Numbers come from a community open-source calculator whose part data is hand-transcribed ([S1]–[S6]), from the KSP2 community wiki ([S7]), and from search excerpts. Exact stats are good enough to set **ranges**; check a number before it goes into an ADR.

Our own catalogue (read from `mods/stock/src/parts.ts`, [S19]): the brief said 23 parts; the file actually defines **33** parts. It has: Command Pod (1 crew, 50 EC), Probe Core (whip antenna, 20 EC), Reaction Wheel (5 kN·m), Data Drive, Small/Medium LF+Ox tanks, LV-T30-style engine (215 kN vac, Isp 280/300), KR-4 four-bell cluster (340 kN), BST-1 solid booster, stack and radial decouplers, landing legs, heat shield, nose cone, fin, control surface, wing, strut, fuel line, five science instruments (thermometer, barometer, seismometer, surface sampler, atmosphere sampler), whip and dish antennas, a stack solar panel (0.5 EC/s), life-support pack, CO₂ scrubber, flotation collar, wheel and steering wheel. Everything is in the 1.25 m class. Resources: LiquidFuel, Oxidizer (5 kg/u), ElectricCharge, Ablator, plus life-support Supplies/Oxygen/Water/Food. There is **no parachute, no RCS/monopropellant, no battery, no docking port and no fairing**. Action groups for parachutes, lights and docking already exist with no parts behind them.

---

## 1. KSP1 categories and functional types

KSP1's editor sorts parts into these categories (1.12 order): Pods, Fuel Tanks, Engines, Command & Control, Structural, Coupling, Payload, Aerodynamics, Ground, Thermal, Electrical, Communication, Science, Cargo (1.11+), Utility, and Robotics ([BG] only). A part belongs to exactly one category, but the editor can also filter by function, size, resource, manufacturer and module ("advanced mode").

Each subsection below lists the functional types in that category, with: what it does, sizes, stat ranges, modules, and controls. "Flight" means the right-click part action window (PAW) or action groups; "Editor" means tweakables set in the VAB/SPH. Doc 03 §6.3 already lists Must/Should/Later controls per type; this doc adds the part types and their numbers.

### 1.1 Pods (crewed command parts)

| Type | What it does | Sizes | Stat ranges | Modules |
|---|---|---|---|---|
| Command pod (capsule) [KSP1] | Crewed control point, blunt re-entry shape, built-in SAS, reaction wheel, EC and some monopropellant | 1.25 m (Mk1, 1 crew), 2.5 m (Mk1-3, 3 crew); [MH] 1.875 m Mk2 pod, 0.625–1.25 m KV re-entry modules | Mk1: 0.84 t, √600, 50 EC, 10 Mono, 5 kN·m. Mk1-3: 2.72 t, √3,800, 150 EC, 30 Mono, 15 kN·m [S6] | ModuleCommand, ModuleSAS, ModuleReactionWheel, ModuleScienceExperiment (crew report), ModuleScienceContainer, ModuleDataTransmitter (built-in, 5 k range), ModuleConductionMultiplier *(still unverified)*, ModuleColorChanger (window lights) |
| Lander can [KSP1] | Light crew module for landers; poor heat tolerance | 1.25 m (Mk1, 1 crew), 2.5 m (Mk2, 2 crew) | 0.66–1.52 t, 3–15 kN·m, 50–100 EC [S6] | as above |
| Cockpit [KSP1] | Plane-style crew control with forward view | 1.25 m (Mk1, Mk1 inline), Mk2 (2 crew), Mk3 (4 crew) | 1.03–3.9 t, √1,250–10,000, 50–500 EC, 10–40 kN·m [S6] | as above |
| Cupola [KSP1] | Crewed control point with all-round windows, station top | 2.5 m → 1.25 m | 1.8 t, 1 crew, 9 kN·m [S6] | as above |
| External command seat [KSP1] | Open seat; the kerbal in it is the control point; no SAS of its own | radial | 0.05 t, √200 [S6] | KerbalSeat *(still unverified)* |
| Re-entry module "KV" [MH] | Soviet-style spherical capsules with no reaction wheel; need a heat shield | 1.25 m class | KV-1 0.77 t / 1 crew; KV-2 1.52 t / 2; KV-3 2.27 t / 3 [S6] | ModuleCommand, ModuleAblator (built in: 20 Ablator per KV pod *(verified 2026-10-18: [S23])*; module name *(still unverified)*) |
| Munar Excursion Module [MH] | All-in-one Apollo-LM-like lander cab with its own fuel | 1.25 m + legs | 2.08 t, 2 crew, 54 LF / 66 Ox / 30 Mono [S6] | ModuleCommand, tanks |

Flight controls: control from here, crew list with EVA/transfer, rename vessel, SAS level (by pilot skill or probe level), lights toggle, crew report, store/review data, hatch. Editor: crew assignment, reaction-wheel authority, part variant (colour).

### 1.2 Command & Control (probe cores and attitude control)

| Type | What it does | Sizes | Stat ranges | Modules |
|---|---|---|---|---|
| Probe core [KSP1] | Uncrewed control point; EC draw; SAS level 0–3 by tech tier; hibernate | 0.625 m (Stayputnik, QBE, OKTO, OKTO2, HECS), 1.25 m (HECS2, RC-001S, RoveMate), 2.5 m (RC-L01), Mk2 drone core | 0.04–0.5 t; √300–7,500; EC draw 1.2–4.8 EC/min (0.02–0.08 EC/s); battery 5–1,000 EC; torque 0–15 kN·m [S6] | ModuleCommand (minimumCrew = 0, hibernation multiplier), ModuleSAS (SASServiceLevel), ModuleReactionWheel, ModuleKerbNetAccess, ModuleDataTransmitter (built-in), ModuleProbeControlPoint *(still unverified)* |
| Combined probe "stage" [MH 1.10] | ESA-collab probes that fold a core, tank, battery and antenna into one part | 1.25 m | MPO probe 0.9 t, 1,000 EC, LF/Ox; MTM stage 0.8 t with 3,800 Xe [S6] | as probe core, plus tanks |
| Reaction wheel [KSP1] | Torque without propellant, at an EC cost per kN·m | 0.625 / 1.25 / 2.5 m | 5 / 15 / 30 kN·m; 0.05–0.2 t; 0.02–0.05 EC/s per kN·m [S6] | ModuleReactionWheel (modes Normal / SAS only / Pilot only; authority limiter) |
| RCS thruster block [KSP1] | Small monopropellant thrusters for translation and fine rotation | radial (4-way RV-105, 5-way, single-nozzle "Place-Anywhere 7", linear) | RV-105: 0.04 t, 1.00 kN vacuum / 0.42 kN at 1 atm per nozzle, Isp 240 / 100 *(verified 2026-10-18: [S21])* | ModuleRCSFX (per-axis toggles, thrust limiter) |
| Vernor engine [KSP1] | Large RCS thruster burning LF+Ox instead of monopropellant | radial | 12 kN vacuum (6.46 kN at 1 atm), 0.08 t, Isp 260 / 140 *(verified 2026-10-18: [S21])* | ModuleRCSFX on LF/Ox |
| Monopropellant tanks | (see 1.3) | | | |

Flight: control from here, hibernate (probes), SAS mode buttons, reaction wheel on/off + mode + authority, RCS on/off + per-axis toggles + thrust limiter. Editor: same limiters; probe orientation.

### 1.3 Fuel Tanks

| Type | What it does | Sizes | Stat ranges | Modules |
|---|---|---|---|---|
| Rocket fuel tank (LF+Ox) [KSP1] | The main rocket tank; LF:Ox volume ratio 45:55; wet:dry mass ratio ≈ 9:1 | 0.625 m (Oscar-B, 0.225 t wet); 1.25 m FL-T100/200/400/800 (0.56–4.5 t wet, 100–800 u); 1.875 m FL-TX220–1800 [MH]; 2.5 m X200-8/16/32, Jumbo-64 (4.5–36 t); 3.75 m S3-3600/7200/14400 (20–81 t); 5 m S4-64…512 [MH] (36–288 t) [S2] | cost ≈ √150 per 100 u in small sizes | ModuleResourceContainer equivalent = RESOURCE nodes; ModulePartVariants (paint), ModuleFuelJettison *(still unverified)* |
| Adapter tank [KSP1] | Tapered tank joining two diameters; also holds fuel | 0.625↔1.25 (FL-A151), 1.25↔2.5 (C7), 2.5↔3.75 (ADTP-2-3), 1.25↔1.875 [MH], 3.75↔5 [MH] | 0.9–36 t wet [S2] | as above |
| Radial / external tank [KSP1] | Small tanks for surface mount | radial R-4 "Dumpling" (22 u), R-11 "Baguette" (54 u), R-12 "Doughnut" toroidal 1.25 m (60 u) | 0.12–0.34 t wet [S2] | as above |
| Liquid-fuel-only tank [KSP1] | LF only, for jets and the LV-N nuclear engine | Mk0 (0.625 m, 50 u), Mk1 (1.25 m, 400 u), Mk2 and Mk3 fuselage variants | 0.275–57 t wet [S2] | as above |
| Spaceplane fuselage tank [KSP1] | Mk2 (flat lifting) and Mk3 (big cargo) profile tanks in LF, LF+Ox and Mono variants; Mk2 bodies give lift | Mk2 short/long, Mk3 short/standard/long, Mk2/Mk3 adapters and bicouplers | Mk2 2.3–4.6 t; Mk3 14–57 t [S2] | ModuleLiftingSurface on Mk2 *(still unverified)* |
| Monopropellant tank [KSP1] | Feeds RCS and the Puff engine | 0.625 m FL-R10 (20 u), 1.25 m FL-R25 (120 u), 1.875 m FL-R5 [MH] (400 u), 2.5 m FL-R1 (750 u); radial Stratus-V (7.5–50 u); Mk2/Mk3 | 0.04–9.8 t wet; Mono density 4 kg/u [S2] | RESOURCE MonoPropellant |
| Xenon tank [KSP1] | Feeds ion engines; very light | 0.625 m PB-X150 (720 u), radial PB-X50R (405 u), 1.25 m PB-X750 (5,700 u) | 0.054–0.76 t wet; √2,220–24,300 (xenon is expensive) [S2] | RESOURCE XenonGas |
| Ore tank [KSP1] | Holds mined Ore for conversion | radial (75 u), 1.25 m (300 u), 2.5 m (1,500 u) | 0.875–17 t full (Ore 10 kg/u) [S2] | RESOURCE Ore |

Flight: per-resource bar, flow on/off (lock), transfer in/out (needs an engineer or always allowed, by setting), drain (dump): monopropellant became drainable in 1.9 *(corrected 2026-10-18: [S26])*; module name *(still unverified)*. Editor: fill level slider per resource, flow priority, variant.

### 1.4 Engines

Thrust and Isp ranges below are rounded from [S1] and community knowledge; the vacuum thrust figures are *(still unverified)* where [S1] gives only Isp.

| Type | What it does | Sizes | Stat ranges | Modules |
|---|---|---|---|---|
| Lifter (sea-level) LF+Ox engine [KSP1] | First-stage engine, good Isp at sea level | 1.25 m Reliant (no gimbal) / Swivel (3°), 2.5 m Skipper / Mainsail, 3.75 m Rhino*, Mammoth, Twin-Boar (engine with tank) | Mass 1.25–15 t; thrust ~200 → 4,000 kN vac; Isp 250–295 / 300–320 [S1] | ModuleEnginesFX, ModuleGimbal, ModuleAlternator (EC while running), ModuleJettison (shroud), ModuleSurfaceFX, FXModuleAnimateThrottle |
| Vacuum (upper-stage) engine [KSP1] | Low sea-level Isp, high vacuum Isp | 0.625 m Spark, 1.25 m Terrier, 2.5 m Poodle, 3.75 m Rhino (205/340), [MH] Cheetah 1.875, Wolfhound 2.5 (Isp 412 vac) | 0.13–9 t; 20–2,000 kN; Isp 70–150 / 320–412 [S1] | as above |
| Small / radial LF+Ox engine [KSP1] | Landers, small probes, radial thrust | 0.625 m Ant (Isp 315 vac, 2 kN), radial Spider, Twitch, Thud, Cub (22.5° gimbal), Vector (1.25 m, 1,000 kN, 10.5°) | 0.02–4 t [S1] | as above |
| Aerospike [KSP1] | Same Isp across altitudes | 1.25 m T-1 "Dart" | 1 t, Isp 290/340 [S1] | ModuleEnginesFX, no gimbal |
| Solid rocket booster [KSP1] | Fixed thrust curve, cannot throttle or shut down; has its own SolidFuel | 0.625 m Mite, Shrimp; 1.25 m Flea, Hammer, Thumper, Kickback; 2.5 m Thoroughbred, Clydesdale; [MH] 1.875 m Pollux | Wet 0.375–144 t; thrust ~12–3,300 kN; Isp 140–210 / 165–235 [S1]; editor thrust limiter is the only control | ModuleEngines (throttleLocked, allowShutdown = false), thrust curve |
| Separatron [KSP1] | Tiny radial SRB to push spent stages away | radial | 0.07 t, Isp 118/154 [S1] | as SRB |
| Launch escape system [KSP1] | Tower SRB for pulling a pod away from a failing rocket | 1.25 m | 0.90 t dry, 1.13 t wet; 750 kN vacuum for 0.5 s *(verified 2026-10-18: [S21])* | ModuleEnginesFX + decoupling |
| Nuclear thermal engine [KSP1] | LF only, Isp 800, heavy, generates heat and EC | 1.25 m LV-N "Nerv" | 3 t, 60 kN, Isp 185/800 [S1] | ModuleEnginesFX, ModuleCoreHeat *(still unverified)*, ModuleAlternator |
| Ion engine [KSP1] | Xenon + lots of EC, very low thrust, Isp 4,200 | 0.625 m IX-6315 "Dawn" | 0.25 t, 2 kN, 8.74 EC/s [S1] *(verified 2026-10-18: [S21])* | ModuleEnginesFX with EC propellant |
| Monopropellant engine [KSP1] | Small engine fed by monoprop | radial O-10 "Puff" | 0.09 t, 20 kN, Isp 120/250 [S1] | ModuleEnginesFX |
| Jet engines (air-breathing) [KSP1] | LF + IntakeAir; thrust varies with speed and altitude; spool-up | 0.625 m Juno, 1.25 m Wheesley (turbofan), Panther (afterburner mode), Whiplash (turboramjet), radial Goliath (big turbofan) | 0.25–4.5 t; "Isp" 4,000–12,600 [S1]; thrust 20–360 kN at Mach 0 (Juno 20, Goliath 360) *(verified 2026-10-18: [S24])* | ModuleEnginesFX with IntakeAir, MultiModeEngine (Panther), ModuleAlternator, ModuleGimbal (Panther) |
| Hybrid engine (RAPIER) [KSP1] | Switches between air-breathing and closed-cycle LF+Ox, automatic or manual | 1.25 m | 2 t, √6,000; Isp 3,200 air / 275–305 rocket [S1] | MultiModeEngine + two ModuleEnginesFX |
| [MH] 1.875 m and "Russian" engines | Kodiak (1.875, no gimbal), Cheetah (vacuum), Bobcat (1.875 lifter), Skiff (2.5 m vacuum-ish), Wolfhound (2.5 m vacuum), Mastodon (big lifter) | 1.875–2.5 m | 1.0–6.0 t; Isp 70–290 / 305–412 [S1] | as LF+Ox engines |
| Engine plate / engine mount [MH 1.7+] | Plate to cluster several engines under one diameter, with a built-in decoupler and shroud | 1.25–5 m: EP-12, EP-18, EP-25, EP-37, EP-50 *(verified 2026-10-18: [S23])* | — | ModuleDecouple + ModuleDecouplerShroud *(still unverified)* |

\* Rhino counts as a vacuum-leaning 3.75 m engine (Isp 205/340).

Flight: activate/shutdown, thrust limiter, gimbal lock / limit / per-axis, mode switch (multi-mode), status (thrust, Isp, flow, flameout reason), independent throttle (1.10+). Editor: thrust limiter, gimbal limit, shroud on/off, part variant.

### 1.5 Structural

| Type | What it does | Sizes | Modules |
|---|---|---|---|
| Girders, I-beams, panels [KSP1] | Lightweight frames, station trusses | Modular Girder (and adapter), I-beams (three lengths), structural panels (1×1, 2×2) | none (pure structure) |
| Octagonal / cubic struts, pylon [KSP1] | Small connectors and offsets | radial | none |
| Multi-couplers [KSP1] | Split one stack into 2/3/4 (bi-, tri-, quad-coupler) or adapt | 1.25 m and 2.5 m TVR series, 2.5 m adapter series | none |
| Structural adapters [KSP1] | Non-tank diameter adapters, Mk2/Mk3 adapters, Rockomax adapters | all classes | none |
| Structural fuselage [KSP1] | Empty fuselage for planes | 1.25 m, Mk2, Mk3 | none |
| Structural tubes [MH] | Hollow tubes of several lengths at 1.25–5 m that enclose engines or payload | 1.25–5 m: T-12, T-18, T-25, T-37, T-50 *(verified 2026-10-18: [S23])* | ModulePartVariants |
| Strut connector [KSP1] | Two-point rigid link between parts (editor-drawn) | — | CompoundPart / CModuleStrut |
| Fuel line [KSP1] | Two-point one-way fuel flow (asparagus staging) | — | CompoundPart / CModuleFuelLine |
| Launch clamp (stability enhancer) [KSP1] | Holds the rocket on the pad; released by staging; pumps nothing but feeds 1.0 EC/s on the pad *(verified 2026-10-18: [S21])* | ground | LaunchClamp, ModuleGenerator |
| Ladders [KSP1] | EVA climbing aids, fixed or telescopic | radial | RetractableLadder |

Editor: variant, symmetry. Flight: ladder extend/retract.

### 1.6 Coupling

| Type | What it does | Sizes | Modules |
|---|---|---|---|
| Stack decoupler [KSP1] | Breaks a stack joint; the decoupler stays with one side | TD-06/12/25/37 (0.625–3.75 m), [MH] 1.875 m and 5 m | ModuleDecouple (ejectionForce, staging toggle), ModuleToggleCrossfeed |
| Stack separator [KSP1] | Like a decoupler but destroys itself so both sides are clean | TS-06/12/25/37, [MH] 5 m | ModuleDecouple (explosive) |
| Radial decoupler [KSP1] | Side booster attach and separation | TT-38K, TT-70, Hydraulic Detachment Manifold | ModuleAnchoredDecoupler |
| Docking port [KSP1] | Joins two vessels in flight; undock; control from here; crossfeed | Jr. 0.625 m, standard 1.25 m, Sr. 2.5 m, shielded (deployable cover), inline (Mk2 profile), Mk2 Clamp-O-Tron, no MH docking ports at 1.875 or 3.75 m; MH adds the Inflatable Airlock, which works as a Jr.-size port *(corrected 2026-10-18: [S22, S23])* | ModuleDockingNode (snap/rotation 1.7+), ModuleAnimateGeneric (shield), ModuleCommand-free "control from here" |
| Grappling device "Klaw" [KSP1] | Grabs any part, asteroid or comet, then can release; free pivot | 1.25 m Advanced Grabbing Unit, 0.625 m Jr. | ModuleGrappleNode, ModuleAnimateGeneric |
| Engine plate (also decouples) [MH] | see 1.4 | — | — |

Flight: decouple, staging toggle, crossfeed enable; docking: undock, set target, control from here, decouple node, port rotation. Editor: ejection force *(1.x tweakable)*, crossfeed, staging on/off.

### 1.7 Payload

| Type | What it does | Sizes | Modules |
|---|---|---|---|
| Procedural fairing base [KSP1] | Player draws a shell in the editor; deploys in flight into shells or petals | AE-FF1 1.25 m, AE-FF2 2.5 m, AE-FF3 3.75 m, [MH] 1.875 and 5 m | ModuleProceduralFairing (panels, ejection force, interstage nodes), ModuleCargoBay (shielding) |
| Service bay [KSP1] | Short enclosed bay with doors, shields contents from drag and heat | 1.25 m (SM-18), 2.5 m (SM-25) | ModuleAnimateGeneric, ModuleCargoBay |
| Cargo bay [KSP1] | Plane cargo bays with doors | Mk2 short/long, Mk3 small/medium/large, Mk3 ramp | ModuleAnimateGeneric, ModuleCargoBay |
| Passenger cabin [KSP1] | Extra crew seats without control | Mk1 cabin (1.25 m, 2), Hitchhiker (2.5 m, 4), Mk2 and Mk3 cabins (4 and 16) | ModuleScienceContainer *(still unverified)* |

Flight: open/close doors, deploy fairing. Editor: build fairing shape (profile points), fairing panel count *(still unverified)*.

### 1.8 Aerodynamics

| Type | What it does | Modules |
|---|---|---|
| Nose cone [KSP1] | Cuts drag on a stack top; some hold monoprop | none (drag cube) |
| Fins and tail fins [KSP1] | Passive lift/stability at the bottom | ModuleLiftingSurface |
| Wings, wing connectors, strakes, delta wings [KSP1] | Lift surfaces; sizes by area; also hold LF in some (Big-S) | ModuleLiftingSurface, ModulePartVariants |
| Control surfaces (elevons, flaps, rudders) [KSP1] | Lift + pitch/yaw/roll deflection; also deploy as flaps | ModuleControlSurface (axis toggles, authority limiter, deploy angle, invert) |
| Airbrakes [KSP1] | Deployable drag; can act on pitch/yaw | ModuleAeroSurface |
| Air intakes [KSP1] | Collect IntakeAir for jets; open/close | ModuleResourceIntake (+ ModuleAnimateGeneric for the ramp) |
| Engine pre-cooler / nacelle [KSP1] | Intake + structure + small LF | ModuleResourceIntake |
| Grid fins *(still unverified as stock)* | not stock in KSP1 | — [Mod] |

Flight: control surface toggles and authority, deploy/retract (flaps, airbrakes), intake open/close. Editor: same + deflection direction.

### 1.9 Ground

| Type | What it does | Sizes | Modules |
|---|---|---|---|
| Landing legs [KSP1] | Retractable legs with suspension | LT-05 micro, LT-1, LT-2 (larger); no fourth stock leg in the base or MH part lists *(corrected 2026-10-18: [S21, S23])* | ModuleWheelBase, ModuleWheelSuspension, ModuleWheelDeployment, ModuleWheelLock *(names from wheel family; legs reuse them)* |
| Landing gear (planes) [KSP1] | Fixed or retractable wheels with brakes and steering | LY-01 fixed, LY-05 nose, LY-10 small, LY-35 medium, LY-60 large, LY-99 extra-large *(verified 2026-10-18: [S21])* | ModuleWheelBase, ModuleWheelSteering, ModuleWheelBrakes, ModuleWheelDeployment, ModuleWheelDamage, ModuleWheelSuspension |
| Rover wheels [KSP1] | Powered wheels (EC), steerable, breakable | RoveMax S2, M1, TR-2L (ruggedized), XL3 | ModuleWheelMotor, ModuleWheelSteering, ModuleWheelBrakes, ModuleWheelDamage, ModuleWheelBogey |
| Mining drill [KSP1] | Extracts Ore from the ground or an asteroid; makes heat | radial "Drill-O-Matic Junior", "Drill-O-Matic" | ModuleResourceHarvester, ModuleAsteroidDrill, ModuleCometDrill, ModuleCoreHeat, ModuleOverheatDisplay |

Flight: gear up/down, brakes, motor on/off and limit, steering on/off/invert, traction control, friction, spring/damper, drill start/stop. Editor: spring, damper, friction, motor torque, steer limit.

### 1.10 Thermal

| Type | What it does | Sizes | Modules |
|---|---|---|---|
| Heat shield [KSP1] | Ablative shield; burns Ablator to absorb heat | 0.625, 1.25, 2.5, 3.75 m, plus the 10 m inflatable shield; [MH] 1.875 m only (no 5 m) *(corrected 2026-10-18: [S23, S25])* | ModuleAblator, ModuleJettison *(fairing over the shield)*, ModuleDecouple (detachable) |
| Inflatable heat shield (HIAD) [KSP1] | Packed small, inflates to 10 m | 2.5 m packed | ModuleAblator, ModuleAnimateGeneric |
| Static radiator panels [KSP1] | Passive panels that shed heat | radial edge/small | ModuleActiveRadiator (passive variant) |
| Deployable radiators [KSP1] | Fold-out radiators; EC to pump heat; break in atmosphere at speed | small/medium/large | ModuleDeployableRadiator, ModuleActiveRadiator |
| Thermal control systems (core heat sink) [KSP1] | Move core heat out of drills/converters | — | ModuleActiveRadiator |

Flight: extend/retract, radiator on/off, ablator level. Editor: ablator fill.

### 1.11 Electrical

| Type | What it does | Stat ranges | Modules |
|---|---|---|---|
| Battery [KSP1] | Stores EC | Z-100 (radial, 100 EC, 0.005 t), Z-200 (0.625 m), Z-400 (radial), Z-1k (1.25 m), Z-4k (2.5 m, 4,000 EC, 0.3 t) [S3] | RESOURCE ElectricCharge |
| Fixed solar panel [KSP1] | Always out, cannot retract | OX-STAT 0.35 EC/s (0.005 t); OX-STAT-XL 2.8 EC/s [S3] | ModuleDeployableSolarPanel (isTracking = false) |
| Deployable solar panel [KSP1] | Extends; some track the sun; breaks in airflow | OX-4 / SP-L / SP-W ≈ 1.64 EC/s at Kerbin distance; Gigantor XL ≈ 24.4 EC/s, 0.3 t [S3] | ModuleDeployableSolarPanel (tracking, retractable, broken state) |
| RTG [KSP1] | Constant EC from nothing, no decay in stock | PB-NUK 0.75 EC/s, 0.08 t, √23,300 [S3] | ModuleGenerator |
| Fuel cell [KSP1] | Burns LF+Ox to make EC; start/stop, auto | 1.5 EC/s (single), 18 EC/s (array) [S3] | ModuleResourceConverter |
| Alternator [KSP1] | Not a part: engines generate EC while running | — | ModuleAlternator |

Flight: extend/retract panel, flow and output readout, fuel cell start/stop. Editor: deploy state.

### 1.12 Communication

| Type | What it does | Stat ranges | Modules |
|---|---|---|---|
| Direct antenna (whip/foldable) [KSP1] | Talk to KSC; combinable | Communotron 16 (500 k power, 0.005 t), 16-S (fixed, surface), DTS-M1 (2 G), HG-55 (15 G), 88-88 (100 G) [S4] | ModuleDataTransmitter (antennaType DIRECT), ModuleDeployableAntenna |
| Relay antenna [KSP1] | Passes signal for other vessels | HG-5 (5 M), RA-2 (2 G), RA-15 (15 G), RA-100 (100 G); 0.07–0.65 t [S4] | ModuleDataTransmitter (antennaType RELAY) |
| Internal antenna [KSP1] | Built into every pod/probe core | 5 k power (pods) [S4] | ModuleDataTransmitter (INTERNAL) |
| Ground station [KSP1] | Tracking station tier sets KSC range (2 G / 50 G / 250 G) [S4] | building | — |

Flight: extend/retract, transmit data, link status. The DSN tier and combinability exponent (0.75) matter for range math.

### 1.13 Science

| Type | What it does | Modules |
|---|---|---|
| Mystery Goo, Materials Bay (SC-9001 Science Jr.) [KSP1] | Observation experiments; can be run once, then must be reset by a scientist | ModuleScienceExperiment (rerunnable = false), ModuleAnimateGeneric |
| Thermometer, barometer, accelerometer, gravioli detector, seismometer [KSP1] | Surface-mounted sensors; give readouts and science | ModuleEnviroSensor, ModuleScienceExperiment |
| Atmospheric Fluid Spectro-Variometer [KSP1] | Atmosphere analysis | ModuleScienceExperiment |
| Crew report, EVA report, surface sample [KSP1] | Not parts: done from pods or by kerbals on EVA | ModuleScienceExperiment on the pod / kerbal |
| Experiment storage unit [KSP1] | Collects and stores data from experiments on the vessel | ModuleScienceContainer |
| Mobile Processing Lab [KSP1] | Turns data into a slow science stream; resets experiments | ModuleScienceLab, ModuleScienceConverter |
| Infrared telescope "Sentinel" [KSP1] | Finds asteroids from Kerbol orbit | ModuleInfraredTelescope *(still unverified)* |
| Orbital survey scanner (M700) [KSP1] | Maps a body's ore from polar orbit | ModuleOrbitalScanner, ModuleOrbitalSurveyor |
| Narrow-band scanner (M4435) [KSP1] | Detects ore concentration at the current position from orbit | ModuleResourceScanner |
| Surface scanning module [KSP1] | Refines ore readings on the ground; gives no science [S12] | ModuleResourceScanner (surface) |
| Asteroid/comet sample [KSP1] | Taken on EVA | — |
| EVA Experiments Kit [KSP1 1.11] | Inventory item a kerbal deploys on the ground | ModuleGroundExperiment *(still unverified)* |
| Deployed science station set [BG] | see §3.2 | ModuleGroundSciencePart, ModuleGroundExpControl, ModuleGroundCommsPart *(still unverified)* |
| Scanning arm [BG] | see §3.2 | ModuleRobotArmScanner [S12] |

Flight: run, review, transmit, reset, collect (EVA), toggle readout. Editor: none beyond variants.

### 1.14 Cargo (1.11 inventory) [KSP1]

| Type | What it does | Modules |
|---|---|---|
| Inventory containers | Hold items kerbals carry or place: small SEQ-9 "Container Module" and larger SEQ-24 "Cargo Storage Unit" [S18], plus radial boxes | ModuleInventoryPart |
| Cargo parts | Any small part flagged as cargo (batteries, struts, experiments, parachute packs, wheels) can be stored and attached on EVA by an engineer | ModuleCargoPart (packed volume, stackable) |
| EVA jetpack / EVA parachute | Kerbal's own equipment, swapped in the inventory (1.11) | KerbalEVA |

Flight: kerbal inventory, construction mode (attach/detach on EVA). Editor: pre-load inventories.

### 1.15 Utility

| Type | What it does | Sizes / stats | Modules |
|---|---|---|---|
| Main parachute [KSP1] | Semi-deployed at min pressure, full at deploy altitude; safe/risky/unsafe indicator | Mk16 (0.625 m top, 0.1 t), Mk2-R radial, Mk16-XL (1.25 m), Mk25 drogue (radial), Mk12-R radial drogue | ModuleParachute (minAirPressureToOpen, deployAltitude, spreadAngle, cut, repack on EVA) |
| Lights [KSP1] | Spot and floodlights; colour (1.x tweakable); 1.10+ added blink and new lights | 0.04 EC/s (Illuminator Mk1) *(verified 2026-10-18: [S21])* | ModuleLight |
| Hatch / crew transfer | not a part; in pods | | |
| Klaw | see Coupling | | |
| Converters (ISRU) [KSP1] | Ore → LF, Ox, LF+Ox, Mono; needs EC and cooling; engineer boosts | Convert-O-Tron 250 (2.5 m) and 125 (1.25 m); 30 EC/s *(rates from [S5], small-unit rates suspect)* | ModuleResourceConverter (multiple modes), ModuleCoreHeat, ModuleOverheatDisplay |
| Drills | see Ground | | |
| Small RCS tanks | see Fuel Tanks | | |
| Launch clamps | see Structural | | |

### 1.16 Robotics [BG]

See §3.2.

---

## 2. Resources

Densities are mass per unit (u) in KSP1. Numbers are well-known community values; [S2]'s wet-mass figures agree with LF/Ox 5 kg/u, Mono 4 kg/u, Xenon 0.1 kg/u, Ore 10 kg/u (check: FL-T800 holds 800 u and 4 t of propellant; FL-R25 120 u Mono → 0.48 t; PB-X750 5,700 u → 0.57 t; small holding tank 300 u Ore → 3 t).

| Resource | Density | Flow mode | Used by | Produced by | Game |
|---|---|---|---|---|---|
| LiquidFuel | 5 kg/u | stack priority | LF+Ox engines, jets, LV-N, fuel cells | Convert-O-Tron | [KSP1] |
| Oxidizer | 5 kg/u | stack priority | LF+Ox engines, fuel cells | Convert-O-Tron | [KSP1] |
| MonoPropellant | 4 kg/u | all vessel | RCS, Puff, EVA pack refill | Convert-O-Tron | [KSP1] |
| SolidFuel | 7.5 kg/u | no flow (own part) | SRBs, Separatron | — | [KSP1] |
| XenonGas | 0.1 kg/u | all vessel | Ion engine | — | [KSP1] |
| ElectricCharge | 0 (massless) | all vessel | probe cores, wheels, ion engine, lights, transmit, converters, rover motors, robotics | solar, RTG, fuel cell, alternator | [KSP1] |
| IntakeAir | 5 kg/u *(verified 2026-10-18: [S26])* | intake only | jets | intakes (from atmosphere and speed) | [KSP1] |
| Ore | 10 kg/u | all vessel | converters | drills | [KSP1] |
| Ablator | 1 kg/u | no flow | heat shields | — | [KSP1] |
| EVA Propellant | 5 kg/u since 1.11 *(corrected 2026-10-18: [S26])* (the older Resource table still lists 0) | kerbal only | EVA jetpack (1.11 made it a separate resource refilled from monoprop) | refill in pod | [KSP1 1.11] |
| Methane (KSP2 name for LF) | — | stack | jets, methane-only tanks | — | [KSP2] [S7] |
| Methalox (CH₄+O₂ in one tank) | — | stack | all chemical rocket engines | — | [KSP2] [S7] |
| Hydrogen | low density, so larger tanks [S9] | stack | LV-N Nerv, LV-SW SWERV | — | [KSP2] |
| Uranium | KR4-P3 reactor holds 1 t; ~333 h at full power [S9] | own part | fission reactor | — | [KSP2] |
| Xenon, Monoprop, Solid, Ablator, EC, IntakeAir | as KSP1 | | | | [KSP2] |
| Ore / ISRU resources, metallic hydrogen, fissionables for Orion-style pulse drives | — | — | interstellar engines, colonies | — | [KSP2 — never shipped] [S15] |

Our resources (`mods/stock/src/resources.ts`): LiquidFuel and Oxidizer at 5 kg/u (match KSP1), ElectricCharge, Ablator at 1 kg/u (match), plus life-support resources KSP never had in stock. Missing: MonoPropellant, SolidFuel as a separate resource *(our booster's propellant is not checked here)*, IntakeAir, Ore, Xenon.

---

## 3. DLC parts

### 3.1 Making History [MH] (KSP 1.4, March 2018; parts added through 1.10)

Theme: historical (Apollo/Soyuz/Vostok-like) parts, a new 1.875 m size class and a 5 m class, plus the Mission Builder.

| Group | Parts (functional) | Notes |
|---|---|---|
| Soviet-style pods | KV-1 "Onion", KV-2 "Pea", KV-3 "Pomegranate" re-entry modules (1–3 crew, no reaction wheel) [S6] | spherical, need a heat shield |
| Apollo-style pods | Mk2 Command Pod (1.875 m) [S6]; Munar Excursion Module lander can with its own fuel [S6] | |
| 1.875 m tanks | FL-TX220 → FL-TX1800, FL-A adapters, FL-C1000 (1.875 m tank with a different shape) [S2] | first stock size between 1.25 and 2.5 m |
| 5 m tanks | Kerbodyne S4-64/128/256/512, S3-S4 adapter, engine cluster adapter tank [S2] | |
| Engines | LV-T91 Cheetah, LV-TX87 Bobcat, RK-7 Kodiak, RE-I2 Skiff, RE-J10 Wolfhound, KE-1 Mastodon; THK "Pollux" SRB (1.875 m, 51.5 t wet) [S1]; all seven are in the archived Making History parts list *(verified 2026-10-18: [S23])* | |
| Structural | Structural tubes (hollow, multiple lengths), engine plates (1.7 update), TD-18/TD-50 decouplers and TS-18/TS-50 separators, a 1.875 m heat shield *(verified 2026-10-18: [S23])*; no new docking-port sizes and no 5 m heat shield *(corrected 2026-10-18: [S23])* | |
| ESA "Shared Horizons" probes (1.10) | MPO probe, MTM stage [S6] | combined parts |
| EVA parachute, kerbal flag | in 1.4 era *(still unverified whether base or MH)* | |
| Mission Builder | Not parts: a node graph of triggers ("vessel reaches altitude", "part destroyed") and actions ("spawn vessel", "fail part", "message"); test nodes check parts, crew and resources | Not relevant to the catalogue, but part *failure* nodes need parts to be breakable |

### 3.2 Breaking Ground [BG] (KSP 1.7.1, May 2019)

Two themes: **robotics** and **deployed surface science**; plus new suits and surface features.

Robotics ([S13], [S14], [S17]):

| Type | What it does | Variants | Key stats | Modules |
|---|---|---|---|---|
| Hinge | One-axis joint with angle limits; target angle, speed, lock, damping | small/medium/large plus an "alligator" (two-sided) hinge *(G-00, G-11, G-32W hinges and G-01L / G-12L alligator hinges *(corrected 2026-10-18: [S27])*)* | torque grows with size; EC draw while moving | ModuleRoboticServoHinge [S17] |
| Rotation servo | Rotating joint with angle target (not continuous) | four servos: M-06, M-12, M-25 and F-12 (no M-50) *(corrected 2026-10-18: [S27])* | | ModuleRoboticRotationServo *(still unverified)* |
| Piston | Linear actuator with extension target | 2–4 lengths/diameters *(still unverified)* | | ModuleRoboticServoPiston *(still unverified)* |
| Electric rotor | Continuous rotation by RPM target, torque limit, direction; drives props | EM-16 (tiny, 1.6 EC/s) [S13], larger EM-32, EM-64, each with an "S" variant *(verified 2026-10-18: [S27])* | max ~460 rpm in practice [S13 forum] | ModuleRoboticServoRotor *(still unverified)* |
| Turboshaft rotor | Fuel-burning rotor: LF+IntakeAir instead of EC | R121 (small) and R7000 (large) [S13] | | ModuleRoboticServoRotor + ModuleEnginesFX *(still unverified)* |
| Propeller and helicopter blades | Lifting surfaces with a pitch (deploy angle) control | Propeller Blade Type A/B/S and Helicopter Blade Type A/B/S *(verified 2026-10-18: [S27])* | | ModuleControlSurface (deploy angle used as blade pitch) |
| Ducted fan | Shrouded propeller | R-062/R-12/R-25 ducted fan blades with S-062/S-12/S-25 fan shrouds *(verified 2026-10-18: [S27])* | | |
| Robotic controller KAL-1000 | Keyframe sequencer: tracks per joint axis over time, play/loop/ping-pong, action-group bound | one part | | ModuleRoboticController |

Deployed science ([S14], [S20], [S12]):

| Type | What it does |
|---|---|
| Central station | Control unit for a deployed station; needed for the others to report |
| Booster antenna | Raises the station's comm range |
| Solar panel / RTG power units | Power the station |
| Weather station | Long-running atmosphere experiment |
| Seismometer (active) | Records impacts; the player crashes things nearby for bonus science |
| Goo observation | Long-running goo experiment |
| Ion detector | Space-weather / ion measurement |
All are carried in inventory and deployed on EVA; science trickles over time and depends on the scientist's level. Modules: ModuleGroundExperiment, ModuleGroundSciencePart, ModuleGroundExpControl, ModuleGroundCommsPart *(still unverified)*.

Surface features: rocks and formations unique per biome; a kerbal or a rover **scanning arm** studies the large ones. Arms: CRSY Light (2 m reach), SPRT Medium (3 m), OP-E Large (4 m, four instruments) [S12], module ModuleRobotArmScanner.

---

## 4. KSP2 parts (Early Access 0.1.0, Feb 2023 → 0.2.2, 2024)

KSP2 groups parts into 12 categories: Command, Fuel Tanks, Engines, Structures, Coupling, Payloads, Aerodynamics, Ground, Thermal, Electrical, Communication, Utility — over 350 parts [S11] — plus Science (added 0.2.0 "For Science!") [S7], [S8]. KSP2 has no Cargo/inventory category and no Robotics.

### 4.1 By category (KSP2 community wiki [S7])

| Category | Sub-groups and notable parts | New vs KSP1 |
|---|---|---|
| Command | Pods (Mk1 "Tin Can", Mk1-3 "Gumball", Mk2 "Tuna Can", PPD-12 "Sightseer", Mk1 "Explorer", **Mk3-5 "Cockatoo" 5 crew**, **Mk3-L "Wanderer" 4-crew lander**), probes (KSP1 set + RC-HL02, RC-XL01), cockpits (all renamed with bird names), rovers (**TR-3 "Bulldog" truck cab**, EAS-1 seat) | 5-crew pod and big lander can; truck cab |
| Fuel Tanks | Methalox (~37 parts incl. RF-AD adapter series, S4 5 m tanks), Methane (jet fuel), Monoprop (incl. **Stratus-V Embiggened**), **Hydrogen** (HFT-S/T series and "Spherotron" 2X), Xenon (incl. **PB-X3000**) | Hydrogen tanks, spherical tanks |
| Engines | Methalox (KSP1 set renamed + **LV-1000 "Cornet"**, **LV-2000 "Trumpet"**, **LV-3000 "Tuba"**, **S3 KS-100 "Mammoth-II"**, **SC-TT "Labradoodle"** 650 kN vac / Isp 343), Methane jets (J-20 "Whittle" replaces Juno), SRBs (incl. **LES "Bottle-Rocket"**), Mono (Puff), Xenon (Dawn), Hydrogen (**LV-N Nerv**, **LV-SW "SWERV"** gas-core, 700 kN, Isp 320/1,450) [S7], [S9] | SWERV; more methalox sizes |
| Structures | struts (EAS-4), launch clamp, **engine mounts** (MEM-125…500, EM-500 Hotplate), adapters, beams, body, **panels**, **hubs** (STJ/CTJ), **trusses** (many square/circular sizes), truss adapters/resizers, **TOOB tubes** | Large modular truss system |
| Coupling | Stack decouplers TD-06…50, separators TS-06…50, radial (AD/TT series), docking ports incl. **CC375-D, CC5-D** (3.75 / 5 m) | Bigger docking ports |
| Payloads | **Procedural fairings** (AE-FF000…500, drawn with sections and bends), cargo bays (Mk2/Mk3 and round CBS/CBL/CN series), crew cabins (incl. **PPD-20 "Wayfarer" 8 crew**), lattice trusses | Fairing editor, round cargo bays |
| Aerodynamics | Nose cones, intakes, **procedural wings** (LPW-250 "Flux", MPW-500, HPW-1000: drag sliders for span, chord, sweep, thickness), procedural stabilisers and control surfaces, **GRFN-125/250 grid fins**, airbrakes, tail connectors | Procedural wings, grid fins |
| Ground | Landing legs (LT-1/2/3/5), gear LY-01…99, RoveMax wheels | LT-3 heavy leg |
| Thermal | Heat shields HS-01T…HS-500, HS-I inflatable. **No radiators.** [S7] | Heat shields only worked from 0.2.0 [S8] |
| Electrical | Batteries (Z series + **Z-375**, **ZX-10K**), solar (+**SP-XXL "Colossus"** 35 EC/s), generators: **RTG-500** (10 EC/s, decays ~108 years), **KR4-P3 fission reactor** (uranium, 50 EC/s), FC-01 / FCA-06 fuel cells, PB-NUK [S7], [S9] | Reactor; decaying RTG |
| Communication | Same antenna set as KSP1 [S7] | — |
| Utility | Parachutes (Mk12-R, Mk16, Mk16-R, Mk16-XL, Mk25), RCS (incl. **VR-N1ER Veer-Governor**), reaction wheels "Stabilizers" (TRW, SRW, MRW, **LRW-375**), **7 lights**, 4 ladders [S7] | Large wheel, more lights |
| Science (0.2.0) | Science Jr. (GSCM-01) and Jr. Jr., Little Sniffer, Air Sniffer, Sample Grabber (robotic arm), Mini-Lab, "U-Dunk-It" underwater chamber, WSRL-01, OSL-25 "Starlab" [S7]; the 0.2.0 notes say "9 new science collection parts" (magnetometer, atmosphere survey, underwater chamber, greenhouse lab, two goo devices, robotic arm, Science Jr. XS, camera per [S10]) | Every experiment is a part; samples vs data |

### 4.2 Missing at KSP2 release vs KSP1

At 0.1.0 (Feb 2023): no science parts (until 0.2.0), heat shields without function (re-entry heating arrived in 0.2.0 [S8]), no ISRU (drills, converters, ore tanks, scanners), no Klaw, no robotics, no inventory/cargo items, no deployed science, no radiators, no mobile lab, no orbital survey scanner. These were never added before development stopped in 2024 [S15]. KSP2 kept almost all KSP1 rocket parts but renamed propellants and many parts.

### 4.3 Announced, never shipped [KSP2 — never shipped]

Colonies (habitation and production modules, surface and orbital VAB), resource gathering, interstellar engines (Orion-style pulse drive; fusion and metallic-hydrogen drives shown in trailers), interstellar resources, multiplayer [S15]. Exact colony part types were never published *(still unverified beyond trailers)*.

---

## 5. The "first hour": parts a beginner meets in career (tiers 0–2)

KSP1's tech tree starts with one free node and spends science on nodes of 5, 15–20, 45, 90 … science. The table below was corrected 2026-10-18 against the archived wiki "Technology tree" page [S28], which reflects the 1.7+ tree (it lists engine plates and KV pods).

| Tier (science) | Node | Parts (functional types) |
|---|---|---|
| 0 (free) | Start | Mk1 Command Pod; Mk16 Parachute; RT-5 "Flea" SRB; Basic Fin; Mystery Goo; Modular Girder Segment; EVA Jetpack and Personal Parachute; [MH] KV-1 pod *(corrected 2026-10-18: [S28])* |
| 1 (5) | Basic Rocketry | LV-T45 "Swivel"; RT-10 "Hammer"; FL-T100 *(corrected 2026-10-18: [S28])* |
| 1 (5) | Engineering 101 | TD-12 decoupler; 2HOT thermometer; Communotron 16 and 16-S *(corrected 2026-10-18: [S28])* |
| 2 (20) | General Rocketry | LV-T30 "Reliant"; BACC "Thumper"; FL-T200 *(corrected 2026-10-18: [S28])* |
| 2 (18) | Stability | Aerodynamic nose cone; AV-T1 winglet; TT-38K radial decoupler *(corrected 2026-10-18: [S28])* |
| 2 (15) | Survivability | 0.625 and 1.25 m heat shields; PresMat barometer; small radiator; LT-05 leg; Mk12-R drogue and Mk2-R radial chutes; 1.25 m service bay *(corrected 2026-10-18: [S28])* |

What this means for us: the first flight in KSP is **pod + parachute + SRB + fin**, landing under canopy. The second hour adds a liquid engine and tanks, a decoupler, a radial decoupler, a thermometer/barometer, a nose cone, and a heat shield. A probe core, solar panels, batteries and antennas come in tier 3 ("Basic Science", "Electrics", "Flight Control"), together with RCS and monoprop. KSP2's 0.2.0 tree had 4 tiers, with Tier 1 roughly the same set [S8].

**The parachute is the single most important part of the first hour, and we do not have one.**

---

## 6. Gap table against our stock parts

Status: **have** (we have a part of this type that works), **partial** (some of the behaviour or only one size), **missing**. Priority for a public release: **Launch-critical** (a KSP player would feel the game is broken or unfinished without it), **Launch-nice** (expected within the first few hours of play), **Later** (endgame, DLC-level, or needs a system we don't have).

### 6.1 Pods, probes, control

| Functional type | Ours | Status | Priority | Reason |
|---|---|---|---|---|
| Crewed capsule | Command Pod (1 crew, 50 EC) | partial | Launch-critical | Needs built-in reaction wheel/SAS, a little monoprop, crew report; only 1.25 m |
| 3-crew 2.5 m capsule | — | missing | Launch-nice | Players build bigger missions once 2.5 m exists |
| Lander can | — | missing | Launch-nice | Mun landers use light cans, not heavy capsules |
| Cockpit (plane) | — | missing | Launch-nice | We have wings and wheels; planes need a forward-facing cockpit |
| Cupola / passenger cabin | — | missing | Later | Stations and tourism contracts |
| External command seat | — | missing | Later | Small rovers and fun builds |
| Probe core | Probe Core (whip, 20 EC) | partial | Launch-critical | Needs SAS level by tier, EC draw, hibernate; one size |
| Probe cores in more sizes (0.625, 2.5 m) | — | missing | Launch-nice | Small probes are a first-hour contract target |
| Reaction wheel | Reaction Wheel (5 kN·m) | partial | Launch-nice | Add 0.625 and 2.5 m sizes; mode/authority controls |
| RCS thruster | — | missing | Launch-critical | Docking and fine control are core KSP; action group exists without parts |
| Vernor (LF/Ox RCS) | — | missing | Later | Niche |

### 6.2 Tanks and resources

| Functional type | Ours | Status | Priority | Reason |
|---|---|---|---|---|
| LF+Ox tank 1.25 m | Small, Medium | partial | Launch-critical | Need 3–4 lengths to tune Δv (FL-T100…T800) |
| LF+Ox tanks 2.5 m / 3.75 m | — | missing | Launch-critical | Without a second diameter a "rocket game" feels toy-like; needs matching engines and adapters |
| 0.625 m tanks | — | missing | Launch-nice | Small probes/landers |
| Adapter tanks | — | missing | Launch-critical (with 2.5 m) | Diameter changes are needed as soon as there are two sizes |
| Radial tanks | — | missing | Launch-nice | Common in landers |
| LF-only tank | — | missing | Launch-nice (with jets / nuclear) | Jets burn LF only |
| Monopropellant tanks + resource | — | missing | Launch-critical (with RCS) | RCS needs it |
| Xenon tanks + resource | — | missing | Later | Ion engines are mid/late tree |
| Ore tanks, Ore | — | missing | Later | ISRU system |
| Spaceplane fuselage tanks (Mk2/Mk3) | — | missing | Later | Needs a plane line |
| Life-support containers | Life Support Pack, CO₂ Scrubber | have (beyond KSP) | — | Not in stock KSP; keep as our differentiator, make it optional by rule |
| Data storage | Data Drive | have (differs) | — | Our version of an experiment storage unit |

### 6.3 Engines

| Functional type | Ours | Status | Priority | Reason |
|---|---|---|---|---|
| Lifter LF+Ox engine 1.25 m | LV-T30-style (215 kN) | have | — | Add a gimballed twin (Swivel-like); ours has gimbal per ADR 0045 |
| Engine cluster | KR-4 | have | — | Unusual in stock; fine |
| Vacuum upper-stage engine | — | missing | Launch-critical | Upper stages with sea-level engines make orbit math feel wrong; Terrier-like 60 kN Isp 345 |
| Small lander engine (0.625 m / radial) | — | missing | Launch-nice | Ant/Spark/Spider landers are a staple |
| 2.5 m lifter and vacuum engines | — | missing | Launch-critical (with 2.5 m) | Pairs with bigger tanks |
| 3.75 m / 5 m engines | — | missing | Later | Late-game heavy lift |
| SRB | BST-1 Booster | partial | Launch-critical | Need 2–3 sizes (Flea/Hammer/Thumper-like) and the editor thrust limiter; first-hour parts |
| Separatron | — | missing | Launch-nice | Clean separation of spent stages |
| Launch escape tower | — | missing | Later | Fun but rare |
| Aerospike | — | missing | Later | Niche |
| Nuclear thermal (LF only) | — | missing | Launch-nice | Every interplanetary player expects the "Nerv" |
| Ion (xenon + EC) | — | missing | Later | Needs xenon + big EC budget |
| Monoprop engine | — | missing | Later | Niche |
| Jet engines + intakes + IntakeAir | — | missing | Launch-nice | We already ship wings, control surfaces and wheels; planes without jets are gliders |
| Hybrid RAPIER | — | missing | Later | SSTO endgame |
| Engine plate | — | missing | Later | Convenience |

### 6.4 Structure, coupling, payload

| Functional type | Ours | Status | Priority | Reason |
|---|---|---|---|---|
| Stack decoupler | Stack Decoupler | have | — | Add other sizes as diameters arrive |
| Stack separator | — | missing | Launch-nice | Cheap variant; clean interstage |
| Radial decoupler | Radial Decoupler | have | — | |
| Docking port | — | missing | Launch-critical | Rendezvous and docking is a core KSP loop; action group exists |
| Klaw grabber | — | missing | Later | Asteroids |
| Procedural fairing | — | missing | Launch-critical | Every satellite launch uses one; drag/heat shielding |
| Service bay / cargo bay | — | missing | Launch-nice | Hide fragile parts |
| Passenger cabin | — | missing | Launch-nice | Tourism/rescue contracts |
| Girders, beams, panels | — | missing | Launch-nice | Stations and creative builds |
| Multi-couplers (bi/tri/quad) | — | missing | Launch-nice | Clustering engines; part of "fun" building |
| Structural adapters / tubes | — | missing | Launch-nice | Needed with 2 diameters |
| Strut | Strut | have | — | |
| Fuel line | Fuel Line | have | — | |
| Launch clamp | — | missing | Launch-critical | Tall rockets need it; also feeds EC on the pad |
| Ladder | — | missing | Launch-nice | EVA exists (eva.ts); getting back in from the ground needs ladders |

### 6.5 Aero, ground, thermal

| Functional type | Ours | Status | Priority | Reason |
|---|---|---|---|---|
| Nose cone | Nose Cone (booster size) | partial | Launch-critical | Need 1.25 m and later 2.5 m |
| Fin | Fin | have | — | |
| Wing | Wing | have | — | KSP2 style procedural wings worth considering later |
| Control surface | Control Surface | have | — | |
| Airbrake | — | missing | Launch-nice | Planes and booster recovery |
| Air intake | — | missing | Launch-nice (with jets) | |
| Grid fin | — | missing | Later | KSP2-only; booster recovery |
| Landing legs | Landing Legs | partial | Launch-critical | Need small and large sizes; ours are a fixed set of legs, not a radial part per leg *(check)* |
| Plane landing gear | Wheel / Steering wheel | partial | Launch-nice | Need retract/deploy and sizes |
| Rover wheels (powered) | Wheel (motor?) | partial | Launch-nice | Motor, EC draw, breakage |
| Heat shield | Heat Shield | have | — | Add 2.5 m; inflatable later |
| Radiators | — | missing | Later | Only needed with drills/converters/nuclear heat |
| Flotation collar | Flotation Collar | have (beyond KSP) | — | Our water-landing feature |

### 6.6 Power, comms, science, utility

| Functional type | Ours | Status | Priority | Reason |
|---|---|---|---|---|
| Battery | — | missing | Launch-critical | Probes and night side are unplayable without storage; action group exists |
| Fixed solar panel | — | missing | Launch-nice | Cheap early power |
| Deployable solar panel | Solar Panel (stack, 0.5 EC/s) | partial | Launch-critical | KSP's panels are radial, deployable, break in airflow; ours is stack-mounted |
| RTG | — | missing | Launch-nice | Outer planets |
| Fuel cell | — | missing | Later | |
| Engine alternator | — | missing *(check engine module)* | Launch-nice | Engines charging batteries is expected |
| Direct antennas (several ranges) | Whip, Dish | partial | Launch-nice | KSP has 5 direct and 4 relay; we have 2 |
| Relay antenna | — | missing | Launch-nice | CommNet relay networks are a mid-game goal |
| Thermometer / barometer / seismometer | have | have | — | |
| Accelerometer, gravity detector | — | missing | Launch-nice | Cheap science variety |
| Mystery Goo / Materials Bay | — | missing | Launch-critical | Iconic first-hour science parts |
| Atmosphere sampler | Atmosphere Sampler | have | — | |
| Surface sampler | Surface Sampler (part) | have (differs) | — | KSP does this on EVA |
| Experiment storage / data | Data Drive | have | — | |
| Mobile lab | — | missing | Later | Science grind system |
| Ore scanners (orbital, narrow-band, surface) | — | missing | Later | ISRU |
| Telescope | — | missing | Later | Asteroid hunting |
| Parachute (main, drogue, radial) | — | missing | **Launch-critical** | First part of the first flight in KSP; action group already exists |
| Lights | — | missing | Launch-nice | Night landings; action group exists |
| Drill / converter (ISRU) | — | missing | Later | Whole system |
| Inventory/cargo containers | — | missing | Later | 1.11 system |
| Robotics (hinge, servo, piston, rotor, blades, controller) | — | missing | Later | DLC-level system; needs joints in physics |
| Deployed science | — | missing | Later | DLC-level |

### 6.7 Summary of the gap

- **Launch-critical, missing outright (8):** parachute, RCS thruster + monopropellant tank/resource, battery, docking port, procedural fairing, vacuum upper-stage engine, launch clamp, Mystery Goo/Materials Bay.
- **Launch-critical, needs widening (8):** 2.5 m size class (tanks, engines, adapters, decoupler, nose cone, heat shield), more tank lengths, SRB sizes, capsule reaction wheel/monoprop, probe-core SAS levels, landing-leg sizes, radial deployable solar panels, 1.25 m nose cone.
- **Launch-nice (about 25):** jets and intakes, Nerv, lander engines, lander can, cockpit, 3-crew pod, girders/couplers, ladder, lights, RTG, relay antennas, airbrakes, separatron, service bay, cabins, and more.
- Things **we have that KSP doesn't**: life support, flotation collar, data drive, separate surface sampler part. Keep them, but a KSP player will look for KSP's set first.

---

## Sources

All checked 2026-10-18.

- [S1] niobos, "ksp-tools" — `src/utils/kspParts-engine.ts`, https://github.com/niobos/ksp-tools/blob/main/src/utils/kspParts-engine.ts — open-source community calculator with hand-transcribed stock engine stats (cost, mass, Isp, gimbal; base + mods tagged). Medium-high: community data, matches known values; thrust not stored directly.
- [S2] same repo, `kspParts-fuelTanks.ts` — tank cost, wet mass and contents. Medium-high (its "dry mass" column holds wet mass).
- [S3] same repo, `kspParts-electric.ts` — batteries, solar, RTG, fuel cells. Medium-high.
- [S4] same repo, `kspParts-antenna.ts` — antenna power, mass, cost, relay/direct, DSN tiers. Medium-high.
- [S5] same repo, `kspParts-converters.ts` — ISRU and drill rates. Medium (some small-converter rates look wrong).
- [S6] same repo, `kspParts-other.ts` — pods, probe cores, reaction wheels with torque, EC and crew. Medium-high.
- [S7] Kerbal Space Program 2 Wiki, "Parts", https://kerbal.wiki/Parts — community KSP2 wiki, full part list by category. High for names.
- [S8] Kerbal Space Program 2 Wiki, "For Science!" (0.2.0 changelog), https://kerbal.wiki/For_Science! — community copy of patch notes. High.
- [S9] GamePretty, "Kerbal Space Program 2: All New Parts (Overview and Tutorial)", https://gamepretty.com/kerbal-space-program-2-all-new-parts-overview-and-tutorial/ — fan guide from Early Access launch. Medium.
- [S10] KSP Forum, "For Science! knowledge base", https://forum.kerbalspaceprogram.com/topic/221039-for-science-knowledge-base — via search excerpt. Medium.
- [S11] KSP Wiki, "KSP 2 parts", https://wiki.kerbalspaceprogram.com/wiki/KSP_2_parts — via search excerpt (fetch blocked). Medium-high.
- [S12] KSP Wiki, "CRSY Light Scanning Arm", "SPRT Medium Scanning Arm", "OP-E Large Scanning Arm", "Surface Scanning Module", https://wiki.kerbalspaceprogram.com/wiki/CRSY_Light_Scanning_Arm (and siblings); forum thread https://forum.kerbalspaceprogram.com/topic/188433 — search excerpts. Medium-high.
- [S13] KSP Wiki, "EM-16 Light Duty Rotor", https://wiki.kerbalspaceprogram.com/wiki/EM-16_Light_Duty_Rotor, and "R7000 Turboshaft Engine", https://wiki.kerbalspaceprogram.com/wiki/R7000_Turboshaft_Engine; forum tag "turboshaft", https://forum.kerbalspaceprogram.com/tags/turboshaft — search excerpts. Medium.
- [S14] PC Gamer, "Kerbal Space Program's Breaking Ground DLC adds robotics and more experiments", https://www.pcgamer.com/au/kerbal-space-programs-next-dlc-adds-robotics-and-more-experiments-embargoed; Gematsu console announcement, https://gematsu.com/2019/11/kerbal-space-program-dlc-breaking-ground-for-consoles-launches-december-5 — press, via search excerpts. Medium-high.
- [S15] Wikipedia, "Kerbal Space Program 2", https://en.wikipedia.org/wiki/Kerbal_Space_Program_2 — roadmap and studio closure. High.
- [S16] KSP Wiki, "API:List of Part Modules", https://wiki.kerbalspaceprogram.com/wiki/API:List_of_Part_Modules — via search excerpt; page says it is incomplete and written for 1.1. Medium.
- [S17] KSP Forum, "How to get BG robotics to work correctly", https://forum.kerbalspaceprogram.com/topic/196203-how-to-get-bg-robotics-to-work-correctly — shows a `ModuleRoboticServoHinge` config block. Medium.
- [S18] KSP Wiki, "SEQ-9 Container Module", https://wiki.kerbalspaceprogram.com/wiki/SEQ-9_Container_Module — via search excerpt. Medium-high.
- [S19] This repo: `mods/stock/src/parts.ts`, `resources.ts`, `categories.ts`, `action-groups.ts` (read 2026-10-18). High.
- [S20] Squad, "Breaking Ground" product page, https://kerbalspaceprogram.com/games-breakingground — official, via search excerpt. High.
- [S21] Internet Archive snapshots of KSP Wiki part pages (fetched 2026-10-18; live wiki shows a bot check): Parts table https://web.archive.org/web/20240121085152/https://wiki.kerbalspaceprogram.com/wiki/Parts ; RV-105 https://web.archive.org/web/20240121094949/https://wiki.kerbalspaceprogram.com/wiki/RV-105_RCS_Thruster_Block ; Vernor https://web.archive.org/web/20231211093336/https://wiki.kerbalspaceprogram.com/wiki/Vernor_Engine ; Dawn https://web.archive.org/web/20240103234539/https://wiki.kerbalspaceprogram.com/wiki/IX-6315_%22Dawn%22_Electric_Propulsion_System ; LES https://web.archive.org/web/20240516115725/https://wiki.kerbalspaceprogram.com/wiki/Launch_Escape_System ; TT18-A https://web.archive.org/web/20240105212044/https://wiki.kerbalspaceprogram.com/wiki/TT18-A_Launch_Stability_Enhancer ; Illuminator Mk1 https://web.archive.org/web/20240115214058/https://wiki.kerbalspaceprogram.com/wiki/Illuminator_Mk1. High.
- [S22] KSP Wiki, "Docking" (archive). https://web.archive.org/web/20231231102657/https://wiki.kerbalspaceprogram.com/wiki/Docking. High.
- [S23] KSP Wiki, "Making History parts" (archive). https://web.archive.org/web/20240121094209/https://wiki.kerbalspaceprogram.com/wiki/Making_History_parts. High.
- [S24] KSP Wiki, "Jet engine" (archive). https://web.archive.org/web/20231014025927/https://wiki.kerbalspaceprogram.com/wiki/Jet_engine. High.
- [S25] KSP Wiki, "Parts/Thermal" (archive). https://web.archive.org/web/20221005192430/https://wiki.kerbalspaceprogram.com/wiki/Parts/Thermal. High.
- [S26] KSP Wiki, "Resource", "Monopropellant", "EVA propellant" (archive). https://web.archive.org/web/20240121092520/https://wiki.kerbalspaceprogram.com/wiki/Resource ; https://web.archive.org/web/20240118183523/https://wiki.kerbalspaceprogram.com/wiki/Monopropellant ; https://web.archive.org/web/20240115025124/https://wiki.kerbalspaceprogram.com/wiki/EVA_propellant. High (the Resource table is older than the EVA propellant page).
- [S27] KSP Wiki, "Breaking Ground parts" (archive). https://web.archive.org/web/20240121084405/https://wiki.kerbalspaceprogram.com/wiki/Breaking_Ground_parts. High.
- [S28] KSP Wiki, "Technology tree" (archive). https://web.archive.org/web/20240103210936/https://wiki.kerbalspaceprogram.com/wiki/Technology_tree. High.

---

## Needs verification

Each item below is marked *(unverified)* above. The URL is where it should be confirmed (KSP wiki pages need a human browser; the bot wall blocks fetches).

| # | Claim | Where to confirm |
|---|---|---|
| 1 | Vacuum thrust figures for all engines (only Isp and mass came from [S1]) | https://wiki.kerbalspaceprogram.com/wiki/Parts#Engines — still unverified: only Swivel, RAPIER, LES, Dawn, Vernor and the jets were checked [S21][S24]; the full engine table was not re-read. |
| 2 | RCS block stats (1 kN, Isp 240/100) and Vernor 12 kN | https://wiki.kerbalspaceprogram.com/wiki/RV-105_RCS_Thruster_Block , https://wiki.kerbalspaceprogram.com/wiki/Vernor_Engine — Verified [S21]. |
| 3 | Ion engine EC draw (~8.7 EC/s) | https://wiki.kerbalspaceprogram.com/wiki/IX-6315_%22Dawn%22_Electric_Propulsion_System — Verified: 8.74 EC/s [S21]. |
| 4 | Jet engine thrust 20–360 kN | https://wiki.kerbalspaceprogram.com/wiki/J-33_%22Wheesley%22_Turbofan_Engine (and siblings) — Verified [S24]. |
| 5 | Launch escape system mass | https://wiki.kerbalspaceprogram.com/wiki/Launch_Escape_System — Verified: 0.90 t dry, 1.13 t wet [S21]. |
| 6 | Module names: ModuleConductionMultiplier on pods, ModuleProbeControlPoint, KerbalSeat, ModuleFuelJettison, ModuleResourceDrain, ModuleCoreHeat on Nerv, ModuleInfraredTelescope, ModuleDecouplerShroud | https://wiki.kerbalspaceprogram.com/wiki/API:List_of_Part_Modules — still unverified: API module list not fetched. |
| 7 | KV pods have built-in ablator | https://wiki.kerbalspaceprogram.com/wiki/KV-1_%22Onion%22_Reentry_Module — Verified: 20 Ablator each [S23]; module name still unverified. |
| 8 | Engine plates: sizes 1.25–5 m, decoupler module | https://wiki.kerbalspaceprogram.com/wiki/Making_History — Sizes verified EP-12…EP-50 [S23]; decoupler module still unverified. |
| 9 | MH structural tubes sizes; 1.875/5 m decouplers, docking ports, heat shields | https://wiki.kerbalspaceprogram.com/wiki/Making_History — Tubes, TD/TS sizes and 1.875 m shield verified; MH docking ports and 5 m shield corrected (none) [S23]. |
| 10 | Which engines are MH vs base (Cheetah, Bobcat, Kodiak, Skiff, Wolfhound, Mastodon, Pollux) | https://wiki.kerbalspaceprogram.com/wiki/Making_History — Verified: all seven in the MH list [S23]. |
| 11 | EVA parachute / flag: base or MH | https://wiki.kerbalspaceprogram.com/wiki/1.4 — still unverified: Personal Parachute is in the stock Start node [S28], suggesting base game, but no page says so outright. |
| 12 | Launch clamp feeds EC on the pad | https://wiki.kerbalspaceprogram.com/wiki/TT18-A_Launch_Stability_Enhancer — Verified: 1.0 EC/s [S21]. |
| 13 | Landing leg sizes and a 4th leg; plane gear names LY-50/60 | https://wiki.kerbalspaceprogram.com/wiki/Parts#Ground — Corrected: three legs only; LY-60 verified [S21]. |
| 14 | Fairing panel-count tweakable; 1.875/5 m fairing bases | https://wiki.kerbalspaceprogram.com/wiki/AE-FF1_Airstream_Protective_Shell_(1.25m) — still unverified: fairing pages not read; MH lists Payload Fairings without sizes in the extract. |
| 15 | Light EC draw (~0.04 EC/s) | https://wiki.kerbalspaceprogram.com/wiki/Illuminator_Mk1 — Verified: 0.04 EC/s [S21]. |
| 16 | IntakeAir and EVA Propellant densities | https://wiki.kerbalspaceprogram.com/wiki/Resource — IntakeAir verified 5 kg/u; EVA Propellant corrected to 5 kg/u [S26]. |
| 17 | Mass-ejection/drain ("dump") tweakable version | https://wiki.kerbalspaceprogram.com/wiki/1.10 — Corrected: drainable from 1.9 (monopropellant) [S26]. |
| 18 | BG robotic part names (G-00/G-11/G-L01 hinges, M-06…M-50 servos, piston names, EM-32/EM-64 rotors, blade names, ducted fan) | https://wiki.kerbalspaceprogram.com/wiki/Breaking_Ground — Corrected: hinges G-00/G-11/G-32W + G-01L/G-12L, servos M-06/M-12/M-25/F-12; rotors verified [S27]. |
| 19 | BG module names: ModuleRoboticRotationServo, ModuleRoboticServoPiston, ModuleRoboticServoRotor, ModuleRoboticController | https://wiki.kerbalspaceprogram.com/wiki/API:List_of_Part_Modules — still unverified: API module list not fetched. |
| 20 | Deployed-science module names (ModuleGroundExperiment, ModuleGroundSciencePart, ModuleGroundExpControl, ModuleGroundCommsPart) | https://wiki.kerbalspaceprogram.com/wiki/Deployed_Science — still unverified: not fetched. |
| 21 | Full 1.12 tech-tree contents for tiers 0–2 (§5) | https://wiki.kerbalspaceprogram.com/wiki/Technology_tree — Corrected tiers 0–2 from the archived tree [S28]. |
| 22 | KSP2 colony part types | https://kerbal.wiki/Colonies (if present) or official dev diaries at https://www.kerbalspaceprogram.com/news — still unverified: never published. |
| 23 | Our landing legs: one part with four legs, or a radial single leg; whether our wheels have a motor; whether our engines have an alternator | `mods/stock/src/modules.ts` (ModuleLandingLeg, ModuleWheel, ModuleEngine) — still unverified: repo code is out of scope for this pass. |
