# 07 — Flight physics as the player experiences it: aerodynamics, heat, structure, propulsion, attitude, ground and water, robustness

**Why this document exists.** Before a public release we need a full list of the physical behaviours a KSP player takes for granted. A missing behaviour reads as a bug ("my rocket doesn't burn up", "my plane never stalls", "fuel drains from the wrong tank"). The earlier sets cover flight controls and the HUD (`../reverse-engineering-ksp2/04-flight-and-controls.md`), the bodies (`../reverse-engineering-ksp2/10-celestial-bodies-and-world.md`), and per-part controls and SAS keys (`03-part-control-and-tweakables.md` §4). This document covers the **simulation underneath**: what forces exist, how parts heat and break, how fuel flows, how wheels and water behave, and where the simulation goes wrong.

**Method.** Public sources only: KSP2 patch notes transcribed on kerbal.wiki, official KSP1 changelogs and wiki pages (seen only as search excerpts, because on 2026-10-18 the official wiki returned an Anubis bot block, the fandom wiki returned HTTP 402 and the forum returned HTTP 403), forum threads, bug-tracker entries, and mod and modding docs. No game files were downloaded. Tags: **[KSP1]**, **[KSP1 DLC: Making History]**, **[KSP1 DLC: Breaking Ground]**, **[KSP2]**, **[KSP2 — announced, never shipped]**, **[Mod: name]**. A number I could not tie to a source that day is marked *(unverified)*. Every such item is listed again in "Needs verification" at the end.

---

## 0. Findings in brief

1. **KSP1 1.0 (April 2015) is the dividing line.** It replaced the "souposphere" (drag proportional to mass) with geometry-based drag cubes, real lift and stall, Mach effects, reentry heating with ablative heat shields, and intake-air jet engines [S8][S7]. Most of what players now call "KSP physics" dates from 1.0 to 1.2.
2. **The thermal model has two temperatures per part**, skin and internal, since 1.0.3 [S9]. Parts explode when either one passes its limit. Heat shields burn a consumable "Ablator" resource [S12].
3. **Structure is a chain of physics joints**, so rockets bend ("wobble"). KSP1 answered with struts, then **autostrut** (grandparent / root / heaviest) and **rigid attachment** [S13][S14]. KSP2 shipped with worse wobble, then added a multi-joint for wings (0.1.3) and a "reinforced joints" mode (0.2.0) [S3][S1][S27].
4. **Propulsion is pressure-aware.** Each engine has an Isp curve keyed by atmospheric pressure. Fuel flow is fixed, so thrust falls with Isp at low altitude. Jets spool up, need IntakeAir and flame out when they run short [S20][S21]. Stock engines restart without limit and have no ullage.
5. **Fuel flow in 1.2+ uses a per-tank priority number plus crossfeed toggles on decouplers.** This replaced the older "stack" rules. Asparagus staging still works, but players had to learn the new rules [S16].
6. **The simulation has seams.** These are a fixed physics step, floating origin (Krakensbane) [S22], a 2.25 km load range and a 22.5 km unload range for flying vessels [S18][S33], and on-rails packing. Kraken bugs, landed-vessel explosions on load and KSP2's orbit-decay bug (cut in 0.1.4.0 and 0.1.4.1) [S4][S5] all come from these seams.
7. **KSP2 launched without reentry heating.** The thermal system and reentry effects arrived in **0.2.0 "For Science!"** (December 2023) and were retuned in 0.2.1 [S1][S2].
8. **Feedback carries a lot of the weight.** Overheat bars on parts, the g-meter, Mach and reentry plasma effects, the aero force overlay and the thermal overlay all show physics that would otherwise be invisible. A large part of KSP1 physics is legible only through these and through mods (HotSpot, KER, FAR) [S30].

---

## 1. Aerodynamics

### 1.1 History in one table

| Version | Model |
|---|---|
| [KSP1] ≤0.90 | Drag scales with **mass**, using a per-part `maximum_drag` value, so drag ignores shape. The optimal ascent was "at terminal velocity". Nose cones were cosmetic. Players called the dense, mass-scaled atmosphere the "souposphere". |
| [KSP1] 1.0 | **Drag cubes**: drag computed from part geometry, plus lift-induced drag and **stalls** [S8]. Procedural fairings and cargo bays shield the parts inside. Mach-dependent drag (transonic hump). Reentry heating. |
| [KSP1] 1.0.x–1.2 | Tuning of the transonic drag curve. Players report the transonic onset was eased later [S7]. Buoyancy model rework in 1.0.5 [S25]. Atmosphere retune in 1.0.5, including thinner Duna [S24]. |
| [KSP1] 1.2+ | The old Alt+F12 drag-vs-Mach debug display was removed in 1.2 [S7]. The aero overlay stays. |
| [KSP2] 0.1.0 (Feb 2023) | Same family of model: per-part drag cubes and lift surfaces. The players' pre-release hope for whole-craft shape aero was not met *(still unverified: no source states the KSP2 model; inferred from KSP2 patch notes naming "drag cubes")* [S36][S1]. |
| [KSP2] 0.1.3 | Fixes: inline drag used the wrong facing for cross-section, a radial intake's drag cube was mis-oriented, structural tubes did not add drag, and the L/D readout showed NaN [S3]. A hotfix addressed **loss of atmospheric drag (and physics) after decoupling capsules** [S34]. |
| [KSP2] 0.1.4 | Airbrakes no longer respond to roll. Cargo-bay shielding fixed. The inflatable heat shield's drag cube now changes when deployed [S4]. |
| [KSP2] 0.2.0 | Drag cubes and buoyancy scalars retuned across many parts [S1]. |
| [KSP2] 0.2.1 | Heat-shield automated fairings no longer occlude nearby parts [S2]. |
| [KSP2] 0.2.2 | Parachutes no longer deploy when they would tear at once. Default deploy pressure raised from 0.01 to 0.04 atm. Chute drag retuned [S6]. |

### 1.2 Drag cubes [KSP1, KSP2]

- Each part stores a **drag cube**: six faces (±X, ±Y, ±Z), each with a silhouette **area** and a **drag coefficient**. The game renders the part from each axis to generate it, then caches it [S7]. Parts with moving geometry (deployed chutes, open bays, extended solar panels, inflated shields) carry several cubes and blend between them.
- In flight, drag on each part is ½·ρ·v²·A·Cd, with A and Cd taken from the faces that point into the airflow [S7][S36].
- **Leading vs trailing faces.** Front and back faces get separate **Mach-dependent multipliers**, set as curves in `physics.cfg`. Side faces get a much smaller "skin friction" multiplier [S7]. The curves give the transonic drag rise near Mach 1. After that, the trailing face matters less because the flow has separated [S7].
- **Occlusion.** When two parts sit stack to stack, their joining faces are hidden and add no drag. That is why a stack of tanks has about the drag of one long tank, and why nose cones and tail cones help. Surface-attached parts are mostly not occluded [S36]. Occlusion also applies to heating [S36].
- **Hollow-part problem.** Auto-generated cubes treat hollow parts (open adaptors, some engine plates) poorly [S7].
- **Shielding.** Parts fully inside a closed **procedural fairing** or **cargo bay / service bay** are flagged "shielded": no drag, no heating, and (side effect) no buoyancy, because buoyant volume is estimated from drag cubes [S25]. KSP2 had a bug where shielding left some parts out of collision checks (fixed in 0.1.4) [S4].

### 1.3 Lift [KSP1, KSP2]

- **Lifting surfaces** (wings, fins, control surfaces) produce lift and lift-induced drag. Both depend on angle of attack, through curves, and on Mach, through further curves *(still unverified: curve names `liftCurve`, `liftMachCurve`, `dragCurve`, `dragMachCurve` in `physics.cfg`)*. A wing's strength is one number per part *(still unverified: `deflectionLiftCoeff`, about 1 per 1.0 "lift rating" unit shown in the editor)*.
- **Stall.** Lift peaks at a moderate angle of attack, then drops while drag keeps rising. A stalled aircraft whose centre of mass sits behind its centre of lift will flip [S8]. KSP1 has no stall warning sound or indicator. The aero overlay is the only hint.
- **Body lift.** Non-wing parts make a small lift force from their drag cubes. Capsules and cylinders give a little "body lift" at angle of attack, so a pod can be steered slightly during reentry *(still unverified: body-lift settings live in `physics.cfg`)*.
- **Control surfaces** deflect by up to a set angle *(still unverified: about 10–15° by default)*. Per part there is an authority limiter (which can be negative to reverse the surface), pitch/yaw/roll toggles, and since 1.0 a **deploy** setting that turns surfaces into flaps or spoilers *(corrected 2026-10-18: [S41] the 1.0 notes say "Control Surfaces can now be deployed as flaps")*. Airbrakes are drag-only surfaces on the Brakes action group.
- **Editor feedback.** The SPH and VAB show the centre of mass, centre of thrust and **centre of lift** markers. The centre of lift is computed at a fixed reference condition, so it does not show the backward shift at supersonic speed or the effect of body lift [S36].
- **[Breaking Ground]** Propeller and rotor blades are lifting surfaces that spin on robotic rotors, so helicopters and propeller planes use the same lift model. Blades have pitch and authority settings and a deploy angle *(still unverified)*.
- **[Mod: FAR — Ferram Aerospace Research]** Replaces part-wise aero with a whole-vessel voxel model: wave drag from area-ruling, a stability-derivatives GUI and flight data readouts. It is the reference for "realistic" KSP aero and the source of most criticism of stock aero (no area rule, no interference drag).

### 1.4 Atmospheres per body [KSP1; KSP2 uses the same bodies]

The atmosphere stops at a hard ceiling. Above it, pressure and density are exactly zero. Pressure and temperature follow per-body curves of altitude. Temperature also varies with latitude and time of day *(still unverified: separate curves `temperatureSunMultCurve`, `latitudeTemperatureBiasCurve`)*. Density comes from pressure, temperature and molar mass.

| Body | Atmosphere height | Sea-level pressure | Oxygen (jets work) | Notes |
|---|---|---|---|---|
| Kerbin | 70 km | 101.325 kPa (1 atm) | Yes | Reference body. Isp curves keyed at 1 atm. Low orbit is about 70–80 km |
| Eve | 90 km [S23] | 5 atm (≈506 kPa) [S23] | No | Very dense. Ascent from the surface is the hardest test in the game. Jets fail on Eve, but chutes work very well |
| Duna | 50 km *(verified 2026-10-18: [S39])* | ≈0.067 atm (6.755 kPa) [S23] *(verified 2026-10-18: [S39])*, cut to about a third in 1.0.5 [S24] | No | Chutes are marginal, so landing needs powered descent |
| Laythe | 50 km [S23] | 0.6 atm (≈60.8 kPa) [S23] | **Yes** | The only other body where air-breathing engines work |
| Jool | 200 km *(verified 2026-10-18: [S39])* | 15 atm [S23] | No | Gas giant with no surface. Aerocapture target. Deep descent crushes parts (pressure limit) |
| Kerbol (Sun) | 600 km | — | — | Covered in 10-celestial-bodies |

- **Terminal velocity.** Since 1.0 terminal velocity depends on shape, so a sleek rocket can go much faster low down. The pre-1.0 rule "climb at terminal velocity" stopped working. Players fly a gravity turn and throttle to stay under the transonic drag rise and the heating limits. Terminal velocity is not shown in stock, but KER and MechJeb show it [Mod].
- **Pressure limits.** Each part has a maximum pressure (crush depth). A difficulty toggle enables pressure limits [S17]. This mostly matters on Eve and Jool.

### 1.5 Aero feedback

- **[KSP1] F12 aero overlay** *(verified 2026-10-18: [S49])*: draws force arrows on each part (drag red, lift blue). The Alt+F12 debug menu (Physics → Aero) adds "Display Aero Data in action menus", "Display Aero Data GUI" and "Display Aero Forces in Flight", plus lift multipliers; a Thermal sub-screen holds the thermal display options *(verified 2026-10-18: [S38])*.
- **[KSP1] Mach effects.** White condensation cones and shock streaks appear near Mach 1. Orange-red plasma appears during reentry and its intensity follows heating. Both share one effects system. A graphics setting, "Aerodynamic FX Quality" (Minimal / Very Low / Low / Normal), scales it *(verified 2026-10-18: [S37])*.
- **[KSP2]** Reentry effects added in 0.2.0 [S1]. In 0.2.1 their trigger points were moved to match the start of actual heating, and missing glow on heat shields and procedural wings was fixed [S2]. KSP2 shows a **lift/drag ratio** in the flight UI, which showed NaN until 0.1.3 [S3].

---

## 2. Thermal

### 2.1 The model [KSP1 1.0.3+]

| Concept | Behaviour |
|---|---|
| Two temperatures | Each part has **skin** and **internal** temperatures. Skin takes convective (aero) heat, radiates to space, and takes engine-exhaust heat. Internal is heated by modules (engines, drills, ISRU, fuel cells) and conducts to neighbouring parts. Skin and internal also exchange heat with each other [S9]. |
| Conduction | Part to part through attach nodes (internal) and between touching skins. From 1.0.3, contact **area** sets the conduction rate and thermal mass no longer does [S9]. |
| Convection | Depends on air density and speed. It dominates during reentry and hypersonic flight. Above about Mach 1 a "shock temperature" term rises with speed, so fast flight in thin air can still overheat *(still unverified detail)*. KSP2 0.2.1 cut shock heating in the top 45 % of most atmospheres [S2]. |
| Radiation | Skins radiate to space (Stefan–Boltzmann-like) and absorb sunlight and body radiation. In orbit, parts reach a sunlit/shadow equilibrium. Radiation is too weak to matter for gameplay except near Kerbol, which can overheat craft. |
| Occlusion | Front parts shade rear parts from convective heat, so the leading heat shield takes it [S36]. |
| Thermal mass | Mass × specific heat. KSP2 0.2.1 raised decoupler mass up to 3× and docking ports and wings 1.2–1.75× to stop them burning first [S2]. |
| Failure | When skin or internal passes `maxTemp` (skin has its own `skinMaxTemp`), the part **explodes**, debris spawns and child parts fall off. |

### 2.2 Limits and protection

| Item | Value |
|---|---|
| Typical tanks and structure | ≤2000 K. A modding guide says no part except heat shields, reentry pods and very hot engines should go above 2000 K [S11] |
| Reentry pods (Mk1 pod etc.) | 2400 K [S11] |
| Heat shields 0.625–3.75 m | 3300 K [S10] |
| Heat shield 10 m (inflatable class) | 3500 K (3250 K in one table) [S10]. It relies on drag rather than ablator [S12] |
| Wings and spaceplane parts | Around 2400 K for the Mk-series *(still unverified)* |
| KSP2 docking port, medium wings | 800 K and 1350 K after 0.2.1 [S2] |

- **Ablator** is a resource (1 kg per unit) introduced in 1.0. Shields burn it as they heat, which carries heat away and lowers mass. A depleted shield stops protecting [S12]. Only parts stacked **behind** the shield are protected.
- **Radiators** [KSP1] (added in 1.0.5 with "core heat") *(verified 2026-10-18: [S41])*: fixed panels and deployable radiators remove internal heat. Core heat lets drills and ISRU pull heat from attached parts, and the converters slow down when hot. Deployed radiators break above 2.5 kPa dynamic pressure (about 67 m/s at Kerbin sea level) *(verified 2026-10-18: [S51])*.
- **Engine heat.** Engines add internal heat while firing. Most survive at full throttle, but some (like the nuclear engine) need radiators or throttling. Exhaust also heats parts in the plume [S9] *(verified 2026-10-18: [S45])*.

### 2.3 Difficulty and cheats [KSP1]

- **Reentry heating %** difficulty slider. Players report 120 % as the maximum and call even that forgiving *(still unverified: range 0–120 %, default 100 %)* [S31].
- The Alt+F12 cheat menu has "Ignore Max Temperature" *(verified 2026-10-18: [S38])*.
- **[Mod: Deadly Reentry]** makes heating harsher, adds G-force deaths and heat damage. It existed before stock heating and shows players want hardcore modes.

### 2.4 Feedback

- **Overheat bars.** When a part nears its limit, a small bar appears beside it in flight, moving from yellow to red. A settings toggle "Temperature Gauges" (default on) exists *(verified 2026-10-18: [S37])*, with F10 as its key *(verified 2026-10-18: [S49])*; the bar appearance threshold (about 50 % of max) is *(still unverified)*; the part explodes when the bar fills [S45]. The bars are the main warning a part is about to explode.
- **Thermal overlay.** A debug overlay colours parts by temperature (stock key F11, "Toggle temperatures overlay", since 1.0.1 *(verified 2026-10-18: [S49])*; HotSpot also uses F11 and replaces the stock overlay) [S30]. Part windows can show temperatures through the debug option [S30].
- **Glow.** Hot parts glow orange-red, and reentry plasma surrounds the craft.
- **[Mod: HotSpot / Thermometer]** add skin and internal temperatures and limits to part windows, and a gradient overlay [S30]. That these mods exist shows stock feedback was too thin.
- **[KSP2] 0.2.0** added a thermal system, reentry effects and working heat-shield function on the shield parts [S1]. Temperature gauges once stuck after a scene change, fixed in the same release [S1]. 0.2.2 fixed the tutorial craft overheating in the reentry tutorial [S6]. Players then reported KSP2 heating as gentle *(still unverified)*. Before 0.2.0, KSP2 had no reentry heating at all.

---

## 3. Structure

### 3.1 Joints and wobble

- **[KSP1] Each part is a rigidbody joined to its parent by a configurable joint.** A vessel is a tree rooted at the root part. Joint stiffness grows with the size of the attach node *(still unverified: node size 0–4 sets the strength)*. Long, thin stacks therefore bend, and heavy upper stages on thin decouplers wobble. Players learned to fix this before 1.2 by adding **EAS-4 struts** by hand. Each strut adds a rigid joint between two parts; it is physicsless and its 0.02 drag is added to the parent *(verified 2026-10-18: [S50])*.
- **Breaking force.** Each joint has breaking force and torque. If a joint is overloaded (high-G turn, aerodynamic overload, a landing that is too hard) the joint breaks and the vessel splits. Wings that rip off at high dynamic pressure are a classic failure.
- **[KSP1] 1.2: autostrut and rigid attachment** *(verified 2026-10-18: [S40])*. These are advanced tweakables on each part:
  - **Autostrut**: Off, Root Part, Heaviest Part, Grandparent Part. It adds a hidden joint from this part to the target [S13].
  - Community advice: **Grandparent** is the safest, because the struts are short and never re-target. **Heaviest** re-targets as fuel burns, and **Root** changes on dock and undock. Both can make the vessel jerk or explode [S13].
  - Wheels and landing legs autostrut to heaviest part by default *(still unverified)*.
  - **Rigid attachment** fuses the joint. It is more brittle, because it breaks before it bends. Autostruts attach at the centre of mass, so they help little against rotation [S14].
  - A visual mode in the debug menu (Physics) shows the autostrut lines *(verified 2026-10-18: [S38])*.
- **[KSP1] 1.12**: autostruts stopped crossing docking ports. 1.12.2 let them cross again **if both ports' rotation is locked** [S15].
- **[Breaking Ground]** Autostruts do not pass through unlocked robotic parts. Robotic chains with autostrut misbehaved until fixed [S29]. Locked servos drift (1.12.3 improved this) [S15].
- **[Mod: Kerbal Joint Reinforcement (KJR)]** stiffens joints, adds multi-joints and calms physics on load. It is very widely used, and its popularity shows players see wobble as a bug, not a feature.
- **Debate.** Some players argue a little flex is "Kerbal" and readable as structural feedback. Most want stiff rockets by default ("please no wobble") [S27].

### 3.2 [KSP2] wobble

- At launch (0.1.0) rockets bent far more than in KSP1. Players found a `JOINT_RIGIDITY` value in `PhysicsSettings.json` and raised it as a workaround [S27].
- A June 2023 dev update listed "wobbly rockets" at **#10** on the team's top-ten issues. The team had changed inertia tensors and added multi-joints in known flexible spots, and weighed putting wobble behind player settings [S27].
- **0.1.3**: a **multi-joint system for wings**, a scalable array of four joints along the wing root, and higher break forces for wings and control surfaces [S3].
- **0.2.0 (For Science!)**: a **reinforced joints system with player-adjustable joint mode settings** [S1][S28]. The exact option names are *(still unverified)*. Autostrut as a per-part tweakable did not return in KSP2 *(still unverified)*.
- 0.2.0 also fixed parts staying linked after their joints broke and struts disappearing after launchpad load [S1][S3].

### 3.3 Impact, G and pressure limits

| Limit | Behaviour |
|---|---|
| **Crash tolerance** (`crashTolerance`, m/s) | The part explodes if it hits something faster than this. Examples: SRB about 7 m/s, modular girders 80 m/s [S25]. Tanks are about 6 m/s (FL-T400, X200-32), the Mk1 pod 14 m/s, the Mk1 Lander Can 8 m/s and LT-1/LT-2 legs 12 m/s *(verified 2026-10-18: [S53])*. This is why "land below 6 m/s" is folk wisdom. |
| **Impact on water** | Uses the same tolerance. Water is softer than ground in practice *(still unverified)* [S25]. |
| **Part G-force limit** | Optional difficulty toggle (career "advanced" options). The part breaks above its `maxG` [S17]. |
| **Pressure limit** | Optional difficulty toggle. The part is crushed above its `maxPressure` [S17]. |
| **Kerbal G tolerance / G-LOC** | Optional difficulty toggle with a multiplier (default 1.0 on Hard). Kerbals black out above about 5–6 G sustained, higher with experience, the Pilot trait and "BadS". At multiplier 0.5 one report gives about 2.5 G. A blacked-out pilot cannot control the vessel and the screen fades [S17]. *(Unverified: introduced in 1.2; whether lethal G exists in stock — believed no deaths, only blackout.)* Contracts in 1.2+ use G-LOC ("tourist wants to experience G") [S17]. |
| **Wheel stress** | Wheels break from impact or overload since 1.1 [S19]. |
| **Cheat: "unbreakable joints"** | Alt+F12 → Cheats: unbreakable joints, no crash damage, ignore max temperature, infinite propellant and electricity, hack gravity [S31] *(verified 2026-10-18: [S38])* ("Hack Gravity", "Unbreakable Joints", "No Crash Damage", "Ignore Max Temperature", "Infinite Propellant", "Infinite Electricity"). |

### 3.4 Explosions, debris, physics-less parts

- A part that exceeds a limit explodes (visual and sound). Its children detach as new **debris vessels** with their own names. Debris obeys physics while loaded. Once unloaded it goes on rails, or is **deleted** if it is in atmosphere below a threshold (see §7) [S18].
- Debris is listed in the Tracking Station and can be filtered and terminated. A setting caps the debris count: "Max Persistent Debris" (MAX_VESSELS_BUDGET) in the main Settings, not Difficulty; default 250, range 0 to unlimited *(corrected 2026-10-18: [S37])*.
- **Physics-less parts** (small parts such as some struts, lights and antennas, flagged `PhysicalSignificance = NONE`) add their mass and drag to the parent and have no rigidbody. This cuts the cost of joints *(still unverified detail)*; the wiki marks RCS blocks, struts and lights as physicsless [S50]. **[KSP2]** physics-less parts caused bugs: wheels attached to them fell off at launch (fixed 0.2.2) [S6].
- **Launch clamps** hold the vessel. Clamps and launchpad structures can be destroyed by heavy engines.
- **[KSP1] KSC buildings are destructible** since 0.25. A crash can collapse them, and a destroyed facility is unusable until repaired for Funds. The runway's hex sections and the launchpad can break too. Flags cost 15,000 Funds to repair. The difficulty setting **Indestructible Facilities** turns this off [S26].

---

## 4. Propulsion

### 4.1 Rocket engines [KSP1, KSP2]

- **Isp vs pressure.** Each engine has `atmosphereCurve`: Isp keyed by pressure in atm (key 0 = vacuum Isp, key 1 = sea-level Isp, higher keys for Eve and Jool). Since 1.0, **fuel flow is fixed at the maximum**, so thrust = flow × Isp × g₀ and **thrust drops with Isp at sea level** *(still unverified wording; widely documented in modding guides)*. Vacuum engines (Terrier, Poodle, Nerv) have very low Isp at sea level and are nearly useless at 1 atm or on Eve. Engines can lose all thrust at high pressure *(still unverified)*.
- **Throttle.** Liquid engines respond instantly and throttle from 0–100 % *(still unverified: some 1.x engines have a throttle response rate)*. A per-engine **thrust limiter** (0–100 %) is set in the editor or in flight.
- **Ignition.** Stock: **unlimited restarts**, no ullage, no ignition resources, instant shutdown. [Mod: Real Fuels / RealismOverhaul] adds limited ignitions, ullage and throttle limits.
- **Gimbal** (see §5): per-engine range in degrees, a gimbal limiter, per-axis toggles, and gimbal lock.
- **Solid rocket boosters.** No throttle and no shutdown. Thrust limiter in the editor only, and they burn until empty. Stock SRBs follow a **thrust curve** (`thrustCurve` keyed by fuel fraction) that tails off near burnout *(still unverified for which stock SRBs)*. In 1.0+ you cannot shut an SRB down except by decoupling it.
- **Flameout causes**: no propellant, no IntakeAir (jets), no oxidiser, deep water (engines stop underwater *(still unverified)*), overheating.
- **Engine exhaust.** The plume pushes parts in it and can heat or destroy them [S9]; heating *(verified 2026-10-18: [S45])*, pushing *(still unverified)*.
- **[KSP2] 0.1.3** fixed staging an engine also firing the decouplers below it. Methane engines became surface-attachable. New engines added [S3]. 0.1.4 fixed gimbals not working off-screen and in map view, and fixed alternators making power with the engine off [S4]. KSP2 added **warp under thrust** (see 04-flight-and-controls).

### 4.2 Jet engines and intake air [KSP1 1.0+]

- Jets burn LiquidFuel plus **IntakeAir**, a resource made by intakes from air density × speed × intake area. IntakeAir is excluded from Isp (`ignoreForIsp`) [S20].
- Thrust follows **`atmCurve`** (flow multiplier vs density in atm) and **`velCurve`** (multiplier vs Mach) [S20]. Each jet therefore has a speed band: the Juno and Wheesley are subsonic, the Whiplash peaks around Mach 3 (386.7 kN at Mach 3.0) and the RAPIER around Mach 3.75 (465.6 kN) *(corrected 2026-10-18: [S44])*.
- **Spool-up**: a jet takes seconds to reach commanded thrust and seconds to spool down (turbine inertia) [S21]. This makes landings and takeoff aborts harder.
- **Flameout**: when IntakeAir runs short (about 10 % of the flow needed is a common threshold) the jet suddenly loses all thrust [S21][S20]. An asymmetric flameout on a twin-engine plane causes a flat spin, the classic spaceplane death. Players watch the IntakeAir bar in the resource panel.
- **Intake air is shared** across the vessel, so extra intakes help. Pre-1.0 "intake spam" was nerfed when intakes started adding drag.
- **[KSP1] Multimode engines.** The RAPIER switches between air-breathing and closed-cycle modes, manually or with an automatic switch when it runs out of intake air *(verified 2026-10-18: [S47])*. **[KSP2] 0.1.3**: multi-mode engines like the RAPIER switch automatically in flight [S3]. 0.2.1 fixed jets that could not be turned off until throttled to zero [S2].

### 4.3 Fuel flow rules [KSP1]

| Rule | Behaviour |
|---|---|
| Liquid fuel and oxidiser | Flow through the part tree. Pre-1.2, an engine drew from the tanks above it in its stack, with the farthest tank drained first. |
| **1.2+ flow priority** | Each tank has a numeric **flow priority**. Higher drains first, and tanks with the same priority drain together. Only relative order matters [S16]. The editor sets defaults from staging, and players report the guesses are "spotty" [S16]. |
| **Crossfeed toggles** | Decouplers, docking ports and some structural parts have a crossfeed enable/disable tweakable (advanced tweakables) [S16]. Defaults: stack decouplers off, radial decouplers off *(still unverified: one forum reply claims "enabled by default")* [S16]. 1.2 made radial-decoupler crossfeed toggling need the Fuel Systems tech *(verified 2026-10-18: [S40])*. |
| **Fuel ducts (FTX-2)** | One-way flow from source to target. Used for **asparagus staging**: outer boosters feed inner ones and drop off, so the core stays full. 1.2 broke many asparagus craft until players learned priority [S16]. |
| Monopropellant, xenon | Whole-vessel flow: every thruster reaches every tank, regardless of crossfeed [S16]. |
| Solid fuel, ablator, ore | No flow (part-local). |
| ElectricCharge | Whole-vessel, through any connection. |
| Manual transfer | In and Out buttons in part windows, and the Resources app. See 03-part-control. |
| Known quirk | In 1.2.2, fuel drained across an inline decoupler even with crossfeed disabled [S16]. |

**[KSP2]** keeps the same concepts (fuel lines, crossfeed, priority) *(still unverified: exact priority UI)*. Players reported broken asparagus and fuel lines in early access [S16].

---

## 5. Attitude control (physics side)

Keys, SAS mode levels and the UI are in `03-part-control-and-tweakables.md` §4. This section covers how torque is produced.

| Source | Model |
|---|---|
| **Reaction wheels** | Fixed torque per axis (kN·m), drawing ElectricCharge in proportion to torque used, per axis (pods 0.1 EC/s per kN·m; dedicated wheels 0.25–0.6 EC/s at full torque) *(verified 2026-10-18: [S52])*. There is no momentum saturation, so wheels never saturate. Every command pod has a small wheel. In 1.1+ each wheel has an authority limiter and modes Normal / SAS-only / Pilot-only *(still unverified)*. With no charge, the wheels stop. |
| **Engine gimbal** | The nozzle tilts by the gimbal range, a few degrees (Swivel 3° *(verified 2026-10-18: [S46])*; Vector 10.5° *(still unverified)*). Gimbal limiter, per-axis toggles and lock. Gimbal far from the centre of mass gives a lot of authority. |
| **Control surfaces** | Torque ∝ dynamic pressure, so there is none in vacuum or thin air. Authority limiter and per-axis toggles (see §1.3). |
| **RCS** | Each thruster fires with a force set by the controller from its direction relative to the centre of mass. Rotation uses thrusters with a lever arm, translation (H/N/I/J/K/L) fires to push the centre of mass. Per-thruster toggles for each axis, a thrust limiter, and fine control (Caps Lock). An RCS block placed off the centre of mass makes translation induce rotation, and the RCS build aid in the editor shows the imbalance *(still unverified: not found in the archived 1.2 changelog [S40])*. Monoprop Isp also depends on pressure. |
| **SAS controller** | [KSP1] A controller rewritten in 0.21 [S41] and reworked in 1.2 to adapt to mass properties and control authority, with "stability decay" near the target *(corrected 2026-10-18: [S40, S41])*. It commands all torque sources. Too much torque for a small craft makes it oscillate. Players fix this by limiting reaction-wheel authority [S32]. Hold modes such as prograde are tuned more aggressively than stability assist [S32]. |
| **Trim** | Shifts the neutral control input. It is kept per vessel *(still unverified)*. |
| **Fly-by-wire** | Stock SAS is the fly-by-wire. There is no separate stability augmentation for planes. [Mod: Atmosphere Autopilot] and [Mod: MechJeb] add them. |
| **[KSP2]** | Same sources. Reported issues include a drifting attitude caused by the Tiny Reaction Wheel (0.2.0) [S32]. 0.1.4 fixed inaccurate SAS burns at periapsis and SAS mode resetting on decouple [S4]. Some players report SAS wobble on flexible craft, from structure and control coupling *(still unverified)*. |

---

## 6. Ground and water

### 6.1 Wheels and legs [KSP1]

- **1.1 overhaul.** Unity 5's PhysX wheel collider was unusable, so Squad adapted a third-party vehicle physics package (VPP) [S19]. Because KSP vessels are jointed parts, not one rigidbody, wheel load is **estimated from spring compression** [S19].
- **Per-wheel settings**: friction control (auto or manual), traction control, motor on/off, motor limit and direction, steering limit, response and direction, brake force, and suspension spring and damper (auto-tuned to vessel mass by default) [S19]. Brakes on the B key, held.
- **Damage**: since 1.1 all wheels and landing gear can break from impact or overload stress, tracked separately [S19]. A broken wheel can be **repaired by an Engineer on EVA**: level 3 for wheels and level 2 for legs up to 1.10.1; from 1.11 any level-1 engineer with a repair kit *(verified 2026-10-18: [S48])*. Players noted gear became much more fragile than in 1.0 [S19].
- **Landing legs** use the same suspension module. They extend and retract, and settle on uneven ground.
- **Known issues**: "wheel bounce", sliding on slopes, rovers flipping, legs jittering on loaded landed vessels.
- **[KSP2]**: rovers flipped after driving a short way from their load origin (improved in 0.2.0) [S1]. Landing gear friction set in the VAB did not reach flight (fixed 0.1.3) [S3]. Suspension twitched in the air (fixed 0.1.4) [S4]. Legs and wheels extended fully during warp (0.2.0) and clipped into terrain after warp (0.2.2) [S1][S6]. A leg collapsed to minimum length under any weight [S2].

### 6.2 Terrain and scatter

- Terrain colliders exist only near the vessel. **Ground scatter** (rocks, trees) can be given colliders by a graphics or physics setting *(corrected 2026-10-18: [S37] the 1.4 Settings page lists Terrain Scatters and Scatter Density only and says scatter cannot be touched)*. **[Breaking Ground]** added **surface features**: rocks and objects scanned for science, which are physical objects *(still unverified collision detail)*.
- **[KSP2]**: vessels fell through the ground when the camera moved about 2,500 m away, and terrain-collider mismatches sank or destroyed vessels (fixed 0.2.0) [S1].

### 6.3 Water

- **[KSP1] Buoyancy** since 1.0.5 is per part, with volume estimated from drag cubes. Parts inside fairings get **none**, so contents sink [S25]. Modders say every part has full buoyancy unless its config says otherwise [S25]. Dense parts float more than expected (bug report) [S25].
- **Water drag** is high. 1.0.5 pontoons "grab" the water and stop sharply [S25]. Splashdown uses the same crash tolerance, so capsules survive at about 6–8 m/s under chutes *(still unverified; the Mk1 pod's tolerance is 14 m/s [S53])*.
- Boats are possible but slow, and stock has no water propulsion. Jets and propellers work.
- **[KSP2] 0.2.0**: buoyancy overhauled and moved onto the job system to stop spinning. A water-detection maths fix stopped vessels appearing to hover [S1]. Per-part water detection was optimised (10 ms → 1.5 ms on 150 parts) in 0.1.3 [S3].

### 6.4 Runway and launchpad

- The runway and pad are colliders with hex sections that can be destroyed (§3.4) [S26]. Heavy launches can destroy the pad [S26].
- **[KSP2]** permanent "Landed" state bugs after ground decouple or fairing contact (fixed 0.2.2) [S6].

---

## 7. Simulation robustness

### 7.1 Physics step and frame budget [KSP1]

- **Fixed physics step of 0.02 s (50 Hz)** *(still unverified)*. Unity FixedUpdate.
- **"Max physics delta-time per frame"** setting (main settings, default 0.04 s *(verified 2026-10-18: [S37])*; slider range about 0.03–0.12 s *(still unverified)*; settings.cfg can exceed the slider). If a frame cannot run all due physics steps, the game **slows simulation time** instead of skipping steps. The clock turns yellow or red *(still unverified: the mission clock in the top-left shows yellow or red time when lagging)*. This trades real time for stability, and on part-heavy craft the game runs below real time.
- **Physics warp** (×2, ×3, ×4) increases the step, which reduces stability. Physics warp with structures is a known exploder [S35].

### 7.2 Floating origin and Krakensbane

- Unity uses single-precision floats, so far from the origin physics jitters. The 0.17-era "Kraken" (craft exploding at high speed or distance) came from this [S22].
- **Floating origin**: the world is shifted periodically so the active vessel stays near (0,0,0) [S22].
- **Krakensbane**: above a speed threshold (`MaxV` = 750 by default per the API page) the **frame velocity** is shifted too, so the vessel's rigidbodies move slowly in local coordinates while the frame moves [S22]. It reduced phantom forces but did not remove them [S22].
- **[KSP2] 0.2.0** reduced floating-point precision loss in rotating reference frames [S1].

### 7.3 Physics range, packing, on rails [KSP1]

| Situation | Load | Unload | Unpack | Pack |
|---|---|---|---|---|
| Flying | 2,250 m | **22,500 m** | 2,000 m | 25,000 m *(still unverified)* |
| Landed / splashed / prelaunch | 2,250 m | 2,500 m | 200–2,000 m *(version-dependent)* | 3,500 m |
| Orbit | 2,250 m | 2,500 m | 200 m *(still unverified)* | 3,500 m *(still unverified)* |

Sources: [S18][S33]. These values sit in a `VesselRanges` structure that kOS exposes [S33], and the "Physics Range Extender" mod raises them [Mod].

- **Loaded** = has a 3D model. **Unpacked** = physics running. A packed vessel moves on its Kepler orbit, or stays fixed relative to the surface if landed.
- **On-rails transitions**: time warp above physics warp packs every vessel. Coming out of warp unpacks them. Landed vessels can bounce or explode at unpack (terrain colliders loading late, suspension springs). This was one of KSP1's most hated bugs.
- **Atmospheric deletion**: when an unloaded vessel's orbit dips into atmosphere below a cut-off, it is **deleted** as burned up or crashed. The rule is pressure-based: an unloaded vessel (beyond 2.5 km) in atmosphere above about 0.1 atm is removed, which is about 23 km on Kerbin. A forum report's "30 km periapsis" [S18] is wrong *(corrected 2026-10-18: [S42])*. This is why stage recovery needs mods (StageRecovery).
- **Time-warp limits**: above ×4 there is no thrust in KSP1, and warp levels are capped by altitude per body (see 04-flight-and-controls). Above ×4 on-rails warp is refused while the vessel is under non-orbital acceleration (in atmosphere, moving on a surface, or throttled) *(verified 2026-10-18: [S43])*; the "part moving" case is *(still unverified)*.

### 7.4 Kraken bugs (both games)

- **Phantom forces** from part clipping and collider overlap, and the **"Kraken drive"** exploits (clipping docking ports or wheels to make free thrust) [S22].
- **Landed-vessel explosions on load** and **wobble resonance** at unpack.
- **Autostrut to heaviest or root** re-targeting mid-flight, causing a sudden force pulse [S13].
- **[KSP2]** orbits changed when crossing an SOI under warp (fixed 0.1.4.0). AP/PE shifted after save/load (0.2.0). Ships were destroyed when switching away with engines running (0.2.0). Visual drift of engines at high warp (0.2.0) [S4][S1].

### 7.5 [KSP2] orbital decay

- Through mid-2023, vessels on stable orbits **lost altitude** without thrust, especially around low-gravity bodies (Minmus, Gilly, moons). Players blamed accumulated physics error from vessels never truly going on rails. Long missions and station orbits became untrustworthy.
- **0.1.4.0 (Aug 2023)**: "orbit decay handled better for vessels that aren't under thrust" [S4].
- **0.1.4.1 hotfix (Sept 2023)**: "vastly reduced orbital decay in low gravity spheres of influence". The official notes still listed a "miniscule" decay case after cutting thrust in low-gravity SOIs [S5].
- **Lesson**: KSP1's hard split between rails (analytic) and physics avoided this class of bug. KSP2's blended model, needed for warp under thrust, introduced it.

---

## 8. Player-facing feedback: inventory

| Feedback | KSP1 | KSP2 |
|---|---|---|
| G-meter on navball | Yes, needle beside the ball | Yes *(still unverified placement)* |
| Atmosphere depth gauge | Altitude tape on the left of the screen whose colour shows air density *(still unverified description)* | Atmosphere indicator in the flight UI *(still unverified)* |
| Speed modes | Surface / Orbit / Target, click on the speed display | Same |
| Mach readout | No stock Mach number (mods). Visual condensation | Mach shown in flight UI *(still unverified)* |
| Overheat bars on parts | Yes | Yes since 0.2.0 [S1] |
| Thermal overlay | Debug overlay [S30] | *(still unverified)* |
| Aero force overlay | Yes (F12) *(verified 2026-10-18: [S49])* | *(still unverified)* |
| Lift/drag readout | Debug part-window data | L/D readout [S3] |
| Reentry plasma, shock cones | Yes | Since 0.2.0, retuned 0.2.1 [S1][S2] |
| Part explosion + flight log | Yes. F3 log lists what exploded and why (e.g. "exceeded temperature tolerance"); F3 = "Toggle results screen" *(verified 2026-10-18: [S49])*, log wording *(still unverified)* | Yes |
| G-LOC fade | Screen fades and controls lock while the kerbal is out [S17] | Not shipped *(still unverified)* |
| Resource bars (IntakeAir, Ablator) | Resources app | Resource Manager |
| Sounds | Engine loops by throttle, jet spool whine, wind noise that grows with dynamic pressure, explosions, creaks *(still unverified)*, decoupler bangs, wheel and gear sounds | Similar. Reentry audio arrived with heating *(still unverified)* |
| Time-lag indicator | Mission clock turns yellow or red *(still unverified)* | *(still unverified)* |
| Wobble visibility | Visible bending. Autostrut lines in debug | Visible bending |

---

## 9. Implications for Space Orbital Program

### 9.1 Adopt

1. **Drag from geometry with occlusion and Mach curves** (drag-cube style): six-face area and Cd per part, front/back Mach multipliers and a transonic hump. Stack nodes hide joining faces, and fairings and bays shield their contents. This is cheap to compute in a browser and is what players now expect. Nose cones must matter.
2. **Lift surfaces with stall and induced drag**, plus small body lift. Show centre of lift in the editor.
3. **Two-temperature thermal model with ablator.** Skin and internal, conduction by area, convective heating with occlusion, radiation in space, and part explosion at the limit. Ablator as a real resource.
4. **Pressure-keyed Isp with fixed fuel flow**, so thrust drops at sea level. This alone teaches "vacuum engine vs lifter engine".
5. **Jet spool, IntakeAir and flameout**, including the asymmetric flameout spin. These failures make spaceplanes interesting.
6. **Explicit flow priority plus crossfeed toggles**, with fuel ducts. The 1.2 model is simpler to explain than "stack order".
7. **Crash tolerance per part** as one number, shown in the editor. "Below X m/s" is learnable.
8. **Hard split between analytic rails and simulated physics.** Unloaded vessels follow Kepler exactly, which avoids KSP2's orbital decay. This fits our existing ADR for debris lifecycle (ADR 0021, see 10-celestial-bodies).
9. **Floating origin with frame-velocity shift** (Krakensbane equivalent) in our renderer/physics. A browser's JS doubles help the simulation, but GPU and physics-engine floats are still 32-bit.
10. **Slow time rather than skip steps** when the frame budget runs out, and show it on the clock.

### 9.2 Improve

1. **Stiff by default.** Make joints rigid (or one compound rigidbody per vessel, broken only by a force or impact check), with optional, readable flex. Do not ship KSP2's wobble or require autostrut knowledge. If we keep autostrut, offer only a safe "grandparent" style and never re-targeting modes.
2. **Feedback first.** Every limit (temperature, G, pressure, crash speed, joint load) should have a visible gauge before failure, plus a post-failure reason in the flight log ("Fuel tank T-400 exceeded 2000 K skin temperature at 34 km, Mach 6.2"). KSP1 needed HotSpot, KER and FAR for this.
3. **Shielded parts float.** Compute buoyancy from part volume, not from drag cubes, so fairing contents do not sink (a KSP1 bug).
4. **Stall and Mach warnings** in the HUD: an AoA indicator, a stall horn and a Mach number. KSP1 had none.
5. **Explain fuel flow in the editor**: an overlay showing drain order per stage and Δv per stage, so asparagus is learnable without trial and error.
6. **Deterministic unpacking for landed vessels.** Snap them to terrain with suspension pre-compressed and frozen for N ticks. Never let a landed base explode on load.
7. **Debris fate is explicit, not silent** (already ADR 0021). Simulate a cheap ballistic reentry for atmospheric debris instead of deleting it at a cut-off.
8. **Heating difficulty slider** (0–150 %) and separate G, pressure and crash toggles, as in KSP1, but shown in the new-game screen with plain wording.
9. **RCS balance aid and torque readout** in the editor (KSP1 added the RCS aid late). Reaction-wheel authority should default lower on small craft to avoid SAS oscillation.

### 9.3 Avoid

1. Mass-based "souposphere" drag (pre-1.0).
2. Wobble as a default experience, and autostrut modes that re-target (heaviest, root).
3. Blending rails and physics so that orbits drift (KSP2 0.1.x decay).
4. Shipping without heating and adding it later (KSP2). It changes craft balance and invalidates player designs.
5. Hidden thresholds such as the ≈30 km atmospheric deletion cut-off without feedback.
6. Physics-less-part special cases that break attachments (KSP2 0.2.2 wheel bug). If we use mass merging, apply it uniformly.
7. Instant gear destruction with no repair path. Keep repair (EVA engineer) and show wheel stress.

### 9.4 Launch checklist

**Must have at public launch**

- [ ] Fixed-step physics with a frame-budget cap that slows time instead of exploding; a lag indicator on the clock
- [ ] Floating origin plus frame-velocity shift; analytic on-rails propagation for unloaded vessels and all warp levels above physics warp
- [ ] Load, unload and pack ranges with deterministic, safe transitions (landed vessels frozen during unpack)
- [ ] Geometry drag with occlusion, Mach multipliers (transonic rise) and fairing/bay shielding
- [ ] Lift surfaces with stall, control surfaces with authority and per-axis toggles; CoM, CoL and CoT markers in the editor
- [ ] Per-body atmosphere curves (pressure, temperature, density, ceiling, oxygen flag) for every body with an atmosphere
- [ ] Pressure-keyed engine Isp with fixed flow; thrust limiter; SRBs without throttle
- [ ] Jet engines with IntakeAir, spool and flameout; one multimode engine
- [ ] Fuel flow: priority, crossfeed toggles, fuel ducts, whole-vessel monoprop and EC
- [ ] Reaction wheels (torque + EC), gimbal, RCS rotate and translate, SAS modes (see 03-part-control)
- [ ] Reentry heating: skin/internal temperatures, ablator heat shields, overheat bars, part explosion
- [ ] Crash tolerance, part explosions, debris vessels with explicit fate
- [ ] Parachutes with deploy pressure and altitude and a safe-to-deploy check (KSP2 0.2.2 lesson)
- [ ] Wheels and landing legs with suspension, brakes, friction and steering
- [ ] Buoyancy and splashdown
- [ ] Feedback: G-meter, Mach and dynamic pressure readout, reentry and Mach visuals, explosion reasons in the flight log, core sounds (engine, jet spool, wind, explosion)
- [ ] Difficulty: heating %, crash damage on/off, unbreakable joints (as an accessibility option)

**Can come later**

- [ ] Optional joint flex with a visual stress overlay
- [ ] Part G-force and pressure limits; Kerbal G-LOC with blackout fade
- [ ] Radiators and core heat for drills and ISRU; engine heat management for nuclear engines
- [ ] Aero and thermal debug overlays (force arrows, temperature gradient)
- [ ] Wheel damage and EVA repair
- [ ] Destructible KSC buildings with repair costs
- [ ] Robotics (servos, rotors, propeller blades) and their joint rules [Breaking Ground]
- [ ] Scatter colliders and surface features
- [ ] Limited ignitions and ullage as a "realism" difficulty option
- [ ] Whole-vessel (voxel) aerodynamics as an advanced mode, FAR-style
- [ ] Physics warp ×2–×4

---

## Needs verification

Each item below should be checked in a real browser at the given URL. The official wiki blocked automated fetches on 2026-10-18.

- Fixed physics step of 0.02 s and the "max physics delta-time per frame" range and default (0.03–0.12, 0.04): https://wiki.kerbalspaceprogram.com/wiki/Settings and https://wiki.kerbalspaceprogram.com/wiki/Physics_warp
   - Default 0.04 s verified [S37]; still unverified: 0.02 s step and slider range (not on the archived page).
- Clock turning yellow or red when the simulation lags: https://wiki.kerbalspaceprogram.com/wiki/Settings
   - Still unverified: no archived page mentions it.
- Duna atmosphere height 50 km and current sea-level pressure after 1.0.5: https://wiki.kerbalspaceprogram.com/wiki/Duna
   - Verified 2026-10-18: 50 km, 6.755 kPa [S39].
- Jool atmosphere height 200 km: https://wiki.kerbalspaceprogram.com/wiki/Jool
   - Verified 2026-10-18: 200 km [S39].
- Temperature curves (sun multiplier, latitude bias) per body: https://wiki.kerbalspaceprogram.com/wiki/Atmosphere
   - Still unverified: archived Atmosphere page has no curve names.
- `physics.cfg` lift and drag curve names, body lift, `deflectionLiftCoeff` meaning: https://wiki.kerbalspaceprogram.com/wiki/CFG_File_Documentation
   - Still unverified: CFG documentation page not fetched; debug toolbar confirms lift, body-lift and drag multipliers exist [S38].
- Default control-surface deflection range (about 10–15°) and deploy (flap) feature version: https://wiki.kerbalspaceprogram.com/wiki/1.1
   - Deploy (flap) version corrected to 1.0 [S41]; deflection range still unverified.
- Breaking Ground propeller blade settings (pitch, authority, deploy angle) and surface-feature collisions: https://wiki.kerbalspaceprogram.com/wiki/Breaking_Ground
   - Still unverified: blade part names are confirmed in doc 09, but not the blade settings.
- Aero overlay key (F12) and Alt+F12 Physics → Aero menu labels: https://wiki.kerbalspaceprogram.com/wiki/Key_bindings and https://wiki.kerbalspaceprogram.com/wiki/Debug_toolbar
   - Verified 2026-10-18 [S49][S38].
- Aerodynamic FX graphics setting: https://wiki.kerbalspaceprogram.com/wiki/Settings
   - Verified 2026-10-18: "Aerodynamic FX Quality" [S37].
- Shock-temperature term above Mach 1: https://wiki.kerbalspaceprogram.com/wiki/Heat
   - Still unverified: not on the archived Heat page.
- Mk-series spaceplane part max temperatures (about 2400 K): https://wiki.kerbalspaceprogram.com/wiki/Parts/Thermal
   - Still unverified: archived Parts/Thermal lists only heat shields and radiators.
- Radiators and core heat added in 1.0.5; deployed radiators break in airflow: https://wiki.kerbalspaceprogram.com/wiki/1.0.5 and https://wiki.kerbalspaceprogram.com/wiki/Radiator
   - Verified 2026-10-18 [S41][S51].
- Engine exhaust heating and pushing parts: https://wiki.kerbalspaceprogram.com/wiki/Heat
   - Heating verified [S45]; pushing still unverified.
- Reentry heating % slider range (0–120 %) and default 100 %: https://wiki.kerbalspaceprogram.com/wiki/Difficulty
   - Still unverified: archived Game Difficulty page lacks the row.
- Exact Alt+F12 cheat labels (unbreakable joints, no crash damage, ignore max temperature): https://wiki.kerbalspaceprogram.com/wiki/Debug_toolbar
   - Verified 2026-10-18 [S38].
- Overheat bar threshold (about 50 % of max) and the "show temperature gauges" setting name: https://wiki.kerbalspaceprogram.com/wiki/Heat
   - Setting name "Temperature Gauges" verified [S37]; threshold still unverified.
- Stock thermal overlay key: https://wiki.kerbalspaceprogram.com/wiki/Debug_toolbar
   - Verified 2026-10-18: F11 [S49].
- KSP2 heating judged "gentle" after 0.2.0: https://forum.kerbalspaceprogram.com/forum/138-ksp2-discussion/
   - Still unverified: forum blocked.
- Attach-node size sets joint strength; strut drag: https://wiki.kerbalspaceprogram.com/wiki/Strut
   - Strut drag/physicsless verified [S50]; node-size strength still unverified.
- Autostrut and rigid attachment introduced in 1.2; wheels default to heaviest-part autostrut; debug autostrut lines: https://wiki.kerbalspaceprogram.com/wiki/1.2 and https://wiki.kerbalspaceprogram.com/wiki/Autostrut
   - 1.2 and debug autostrut lines verified [S40][S38]; wheel default still unverified.
- KSP2 0.2.0 reinforced-joint option names; absence of per-part autostrut in KSP2: https://kerbal.wiki/0.2.0.0 and the KSP2 settings screen
   - Still unverified: no KSP2 settings source read this pass.
- Crash tolerances for tanks (6–8 m/s), pods (12–14 m/s) and legs (12 m/s); water vs ground impact: https://wiki.kerbalspaceprogram.com/wiki/Parts
   - Verified 2026-10-18 [S53]: tanks 6, Mk1 pod 14, Lander Can 8, legs 12 m/s; water vs ground still unverified.
- G-LOC introduced in 1.2; whether stock G can kill kerbals: https://wiki.kerbalspaceprogram.com/wiki/1.2 and https://wiki.kerbalspaceprogram.com/wiki/G-force
   - Verified 2026-10-18: 1.2 added the Kerbal G option; kerbals go unconscious [S40]. Whether G kills is still unverified.
- "Max persistent debris" difficulty setting: https://wiki.kerbalspaceprogram.com/wiki/Difficulty
   - Corrected 2026-10-18: it is a main Settings option, default 250 [S37].
- Physics-less parts (`PhysicalSignificance = NONE`) behaviour: https://wiki.kerbalspaceprogram.com/wiki/CFG_File_Documentation
   - Still unverified: CFG documentation not fetched.
- Fixed fuel flow with thrust scaling with Isp since 1.0; engines losing all thrust at high pressure: https://wiki.kerbalspaceprogram.com/wiki/Specific_impulse
   - Still unverified: Specific impulse page not fetched.
- Throttle response rate on liquid engines: https://wiki.kerbalspaceprogram.com/wiki/Liquid_fuel_engine
   - Still unverified: not fetched.
- Which stock SRBs use thrust curves: https://wiki.kerbalspaceprogram.com/wiki/Solid_rocket_booster
   - Still unverified: archived SRB page has no curve data.
- Engines stop underwater: https://wiki.kerbalspaceprogram.com/wiki/Water
   - Still unverified: Water page has no archive snapshot.
- Jet speed bands (Whiplash Mach 3–4, RAPIER Mach 4–5): https://wiki.kerbalspaceprogram.com/wiki/Jet_engine
   - Corrected 2026-10-18: Whiplash ~Mach 3, RAPIER ~Mach 3.75 [S44].
- RAPIER automatic mode switch setting in KSP1: https://wiki.kerbalspaceprogram.com/wiki/CR-7_R.A.P.I.E.R._Engine
   - Verified 2026-10-18 [S47].
- Default crossfeed state of stack and radial decouplers in 1.2+: https://wiki.kerbalspaceprogram.com/wiki/Fuel_flow_rules
   - Still unverified: Fuel flow rules page has no archive snapshot.
- KSP2 fuel priority UI: https://kerbal.wiki/0.2.0.0
   - Still unverified: not checked.
- Reaction-wheel EC per use, authority limiter and modes (1.1): https://wiki.kerbalspaceprogram.com/wiki/Reaction_wheel
   - EC per torque verified [S52]; modes/limiter version still unverified.
- Gimbal ranges (Swivel 3°, Vector 10.5°): https://wiki.kerbalspaceprogram.com/wiki/LV-T45_%22Swivel%22_Liquid_Fuel_Engine
   - Swivel 3° verified [S46]; Vector still unverified.
- RCS build aid added in 1.2; SAS rewrite in 1.1; trim kept per vessel: https://wiki.kerbalspaceprogram.com/wiki/1.2 and https://wiki.kerbalspaceprogram.com/wiki/1.1
   - SAS corrected (0.21 rewrite, 1.2 rework) [S40][S41]; RCS build aid and trim still unverified.
- KSP2 SAS wobble on flexible craft: https://forum.kerbalspaceprogram.com/forum/144-ksp2-bug-reports/
   - Still unverified: forum blocked.
- Required engineer level for wheel repair: https://wiki.kerbalspaceprogram.com/wiki/Engineer
   - Verified 2026-10-18: wheels level 3, legs level 2 (to 1.10.1); kits from 1.11 [S48].
- Scatter collision option: https://wiki.kerbalspaceprogram.com/wiki/Settings
   - Corrected 2026-10-18: no such option in 1.4 settings [S37].
- Splashdown survivable speed under chutes (6–8 m/s): https://wiki.kerbalspaceprogram.com/wiki/Water
   - Still unverified: Water page has no snapshot.
- Flying pack distance of 25 km; orbit unpack and pack values: https://ksp-kos.readthedocs.io/en/latest/structures/misc/loaddistance.html
   - Still unverified: kOS page gives no numbers; no primary table found.
- Atmospheric deletion rule (pressure-based vs about 30 km periapsis): https://forum.kerbalspaceprogram.com/topic/88026-ksp-vessel-lifecycle-and-related-stuff
   - Corrected 2026-10-18: pressure > ~0.1 atm, ~23 km on Kerbin [S42].
- Cannot warp under acceleration or while parts move: https://wiki.kerbalspaceprogram.com/wiki/Time_warp
   - Acceleration rule verified [S43]; moving-part case still unverified.
- KSP2 HUD items (G-meter placement, atmosphere indicator, Mach readout), KSP2 thermal and aero overlays, G-LOC absence, reentry audio: https://kerbal.wiki/0.2.0.0
   - Still unverified: kerbal.wiki not re-read this pass.
- KSP1 altitude tape colour and density, F3 log explosion wording, creak sounds: https://wiki.kerbalspaceprogram.com/wiki/Flight_log
   - F3 key verified [S49]; tape colour, log wording and creaks still unverified.
- Whether KSP2 used per-part drag cubes rather than whole-craft aero: https://kerbal.wiki/0.2.0.0 and https://forum.kerbalspaceprogram.com/topic/199638-aerodynamics-in-ksp2
   - Still unverified: not checked.

---

## Sources

All checked 2026-10-18. "Excerpt" means the page blocked automated fetching and the content was read from search-engine excerpts.

- [S1] kerbal.wiki — "0.2.0.0" (KSP2 For Science! patch notes). https://kerbal.wiki/0.2.0.0 — community transcription of official notes; high.
- [S2] kerbal.wiki — "0.2.1.0". https://kerbal.wiki/0.2.1.0 — community transcription of official notes; high.
- [S3] kerbal.wiki — "0.1.3.0". https://kerbal.wiki/0.1.3.0 — community transcription of official notes; high.
- [S4] kerbal.wiki — "0.1.4.0". https://kerbal.wiki/0.1.4.0 — community transcription of official notes; high.
- [S5] kerbal.wiki — "0.1.4.1". https://kerbal.wiki/0.1.4.1 — community transcription of official notes; high.
- [S6] kerbal.wiki — "0.2.2.0". https://kerbal.wiki/0.2.2.0 — community transcription of official notes; high.
- [S7] KSP Forum — "Aerodynamics and transoms" and "The drag of parts". https://forum.kerbalspaceprogram.com/topic/157294-aerodynamics-and-transoms ; https://forum.kerbalspaceprogram.com/topic/182616-the-drag-of-parts — player analysis, excerpt; medium.
- [S8] Squad — "KSP 1.0 is released". https://forum.kerbalspaceprogram.com/developerarticles.html/ksp-10-is-released-r162 — official, excerpt; high.
- [S9] KSP Wiki — "1.0.3". https://wiki.kerbalspaceprogram.com/wiki/1.0.3 — official wiki changelog, excerpt; high.
- [S10] KSP Wiki — "Parts/Thermal". https://wiki.kerbalspaceprogram.com/wiki/Parts/Thermal — official wiki table, excerpt; high.
- [S11] KSP Forum — "Guide: new temperature rules for parts in 1.0/1.0.2". https://forum.kerbalspaceprogram.com/topic/106241-guide-new-temperature-rules-for-parts-in-10-102-updates — modding guide, excerpt; medium.
- [S12] KSP Wiki — "Ablator" and "Heat". https://wiki.kerbalspaceprogram.com/wiki/Ablator ; https://wiki.kerbalspaceprogram.com/wiki/Heat — official wiki, excerpt; high.
- [S13] KSP Forum — "How does autostrut work" and "What is this autostrut of which you speak". https://forum.kerbalspaceprogram.com/topic/150213-how-does-autostrut-works ; https://forum.kerbalspaceprogram.com/topic/201292-what-is-this-autostrut-of-which-you-speak — player consensus, excerpt; medium.
- [S14] KSP bug tracker — Bug #21426 (rigid attachment and autostrut). https://bugs.kerbalspaceprogram.com/issues/21426 — tracker, excerpt; medium-high.
- [S15] KSP Forum — "1.12 autostrut changes"; KSP Wiki — "1.12.2", "1.12.3". https://forum.kerbalspaceprogram.com/topic/203282-112-autostrut-changes ; https://wiki.kerbalspaceprogram.com/wiki/1.12.2 — forum plus official changelog, excerpt; medium-high.
- [S16] KSP Forum — "Fuel flow in KSP 1.2" and related. https://forum.kerbalspaceprogram.com/topic/151212-fuel-flow-in-ksp-12 ; https://forum.kerbalspaceprogram.com/topic/159460-why-is-fuel-flowing-across-an-inline-decoupler — player reports, excerpt; medium.
- [S17] KSP Forum — "New career: kerbal G-force tolerance multiplier" and "G-forces killing crew". https://forum.kerbalspaceprogram.com/topic/154152-new-career-kerbal-g-force-tolerance-multiplier ; https://forum.kerbalspaceprogram.com/topic/107270-g-forces-killing-crew — player reports, excerpt; medium.
- [S18] KSP Forum — "KSP vessel lifecycle and related stuff" and "How does KSP handle out-of-range vessels". https://forum.kerbalspaceprogram.com/topic/88026-ksp-vessel-lifecycle-and-related-stuff ; https://forum.kerbalspaceprogram.com/topic/99170-how-does-ksp-handle-out-of-range-vessels — modder analysis, excerpt; medium.
- [S19] KSP Wiki — "1.1"; Squad — "Development update: KSP and Unity 5". https://wiki.kerbalspaceprogram.com/wiki/1.1 ; https://forum.kerbalspaceprogram.com/developerarticles.html/development-update-ksp-and-unity-5-r168 — official, excerpt; high.
- [S20] KSP Forum — "HOWTO: airbreathing engines in KSP 1.0" and "Reverse engineering jet engines: velCurve and atmCurve". https://forum.kerbalspaceprogram.com/topic/108848-howto-airbreathing-engines-in-ksp-10 ; https://forum.kerbalspaceprogram.com/topic/105424-reverse-engineering-jet-engines-how-do-velcurve-and-atmcurve-work — modder analysis, excerpt; medium.
- [S21] KSP Wiki — "Jet engine". https://wiki.kerbalspaceprogram.com/wiki/Jet_engine — official wiki, excerpt; high.
- [S22] KSP Wiki — "API:Krakensbane" and "Kraken Drive"; KSP Forum — "Origins of the Kraken". https://wiki.kerbalspaceprogram.com/wiki/API:Krakensbane ; https://forum.kerbalspaceprogram.com/topic/141709-origins-of-the-kraken — wiki plus forum, excerpt; medium-high.
- [S23] KSP Wiki — "Eve", "Laythe"; KSP Forum — "Isp at sea level from bodies other than Kerbin". https://wiki.kerbalspaceprogram.com/wiki/Eve ; https://wiki.kerbalspaceprogram.com/wiki/Laythe ; https://forum.kerbalspaceprogram.com/topic/170935-isp-at-sealevel-from-bodies-other-than-kerbin — wiki plus forum, excerpt; medium-high.
- [S24] KSP Forum — "Atmospheric density/pressure graphs for 1.0.5". https://forum.kerbalspaceprogram.com/topic/125676-atmospheric-densitypressure-graphs-for-105 — player data, excerpt; medium.
- [S25] KSP Forum — "1.0.5 buoyancy: what sinks", "New-fangled buoyancy model"; bug #5930. https://forum.kerbalspaceprogram.com/topic/124934-105-buoyancy-what-sinks ; https://forum.kerbalspaceprogram.com/topic/126118-new-fangled-buoyancy-model-anyone-know-how-it-works ; https://bugs.kerbalspaceprogram.com/issues/5930 — player reports, excerpt; medium.
- [S26] KSP Wiki — "0.25", "Kerbal Space Center", "Flagpole". https://wiki.kerbalspaceprogram.com/wiki/0.25 ; https://wiki.kerbalspaceprogram.com/wiki/Ksc — official wiki, excerpt; high.
- [S27] KSP Forum — "Please no wobble" (KSP2) and the June 2023 KSP2 development update quoted there. https://forum.kerbalspaceprogram.com/topic/214159-please-no-wobble — forum plus dev statement, excerpt; medium-high.
- [S28] KSP Forum — KSP2 "Bug status" posts. https://forum.kerbalspaceprogram.com/topic/221038-bug-status-121 ; https://forum.kerbalspaceprogram.com/topic/220179-bug-status-1023 — official community-manager posts, excerpt; high.
- [S29] KSP bug tracker — Bug #23492 (robotics and autostrut). https://bugs.kerbalspaceprogram.com/issues/23492 — tracker, excerpt; medium-high.
- [S30] GitHub — Apokee/HotSpot README. https://github.com/Apokee/HotSpot/blob/9b30b5c2f69c12e35109b109d63b3e1862a8a7f8/README.md — mod documentation, excerpt; medium.
- [S31] KSP Forum — "Re-entry heating setting recommendations". https://forum.kerbalspaceprogram.com/topic/116693-re-entry-heating-setting-recommendations — player reports, excerpt; low-medium.
- [S32] KSP Forum — "Parts are moving slightly out of place during flight, affecting SAS" (KSP2) and "Small craft wobble under SAS". https://forum.kerbalspaceprogram.com/topic/222330-parts-are-moving-slightly-out-of-place-during-flight-affecting-sas ; https://forum.kerbalspaceprogram.com/topic/129422-small-craft-wobble-under-sas — player reports, excerpt; medium.
- [S33] kOS documentation — "Vessel Load Distance". https://ksp-kos.readthedocs.io/en/latest/structures/misc/loaddistance.html — mod API docs exposing stock values; medium-high.
- [S34] KSP Forum — "Not slowing down on reentry" (KSP2 0.1.3 drag loss) and "Hotfix summer". https://forum.kerbalspaceprogram.com/topic/217838-not-slowing-down-on-reentry/page/3 ; https://forum.kerbalspaceprogram.com/topic/218119-hotfix-summer — forum plus official, excerpt; medium.
- [S35] KSP Wiki — "Physics warp". https://wiki.kerbalspaceprogram.com/wiki/Physics_warp — official wiki, excerpt; high.
- [S36] KSP Forum — "Concerned about KSP2 aerodynamics", "Which parts of KSP1 aero do we want to keep", "KSP stock aerodynamics". https://forum.kerbalspaceprogram.com/topic/210343-concerned-about-ksp2-aerodynamics ; https://forum.kerbalspaceprogram.com/topic/188420-which-parts-of-ksp1-aero-do-we-want-to-keep/page/2 — player discussion, excerpt; low-medium.
- [S37] KSP Wiki — "Settings" (Internet Archive snapshot, describes 1.4). https://web.archive.org/web/20240105230555/https://wiki.kerbalspaceprogram.com/wiki/Settings — full text; high.
- [S38] KSP Wiki — "Debug Toolbar" (archive). https://web.archive.org/web/20240121092844/https://wiki.kerbalspaceprogram.com/wiki/Debug_Toolbar — full text; high.
- [S39] KSP Wiki — "Duna", "Jool" (archive). https://web.archive.org/web/20231222184731/https://wiki.kerbalspaceprogram.com/wiki/Duna ; https://web.archive.org/web/20240106004003/https://wiki.kerbalspaceprogram.com/wiki/Jool — high.
- [S40] KSP Wiki — "1.2" changelog (archive). https://web.archive.org/web/20240225060311/https://wiki.kerbalspaceprogram.com/wiki/1.2 — official notes; high.
- [S41] KSP Wiki — "0.21", "1.0", "1.0.5" changelogs (archive). https://web.archive.org/web/20240121095032/https://wiki.kerbalspaceprogram.com/wiki/0.21 ; https://web.archive.org/web/20240106121052/https://wiki.kerbalspaceprogram.com/wiki/1.0 ; https://web.archive.org/web/20231008012129/https://wiki.kerbalspaceprogram.com/wiki/1.0.5 — high.
- [S42] KSP Wiki — "Debris" (archive). https://web.archive.org/web/20240121095445/https://wiki.kerbalspaceprogram.com/wiki/Debris — wiki; medium-high (wiki says "density" but gives the value in atm).
- [S43] KSP Wiki — "Time warp" and "Kerbin" (archive). https://web.archive.org/web/20231130112639/https://wiki.kerbalspaceprogram.com/wiki/Time_warp ; https://web.archive.org/web/20231228015152/https://wiki.kerbalspaceprogram.com/wiki/Kerbin — high.
- [S44] KSP Wiki — "Jet engine" (archive). https://web.archive.org/web/20231014025927/https://wiki.kerbalspaceprogram.com/wiki/Jet_engine — high.
- [S45] KSP Wiki — "Heat" (archive). https://web.archive.org/web/20230123203116/https://wiki.kerbalspaceprogram.com/wiki/Heat — high.
- [S46] KSP Wiki — "LV-T45 Swivel" (archive). https://web.archive.org/web/20240521203632/https://wiki.kerbalspaceprogram.com/wiki/LV-T45_%22Swivel%22_Liquid_Fuel_Engine — high.
- [S47] KSP Wiki — "CR-7 R.A.P.I.E.R. Engine" (archive). https://web.archive.org/web/20240107081300/https://wiki.kerbalspaceprogram.com/wiki/CR-7_R.A.P.I.E.R._Engine — high.
- [S48] KSP Wiki — "Engineer" and "EVA" (archive). https://web.archive.org/web/20231230000145/https://wiki.kerbalspaceprogram.com/wiki/Engineer ; https://web.archive.org/web/20240420190746/https://wiki.kerbalspaceprogram.com/wiki/EVA — high.
- [S49] KSP Wiki — "Key bindings" (archive). https://web.archive.org/web/20240105022508/https://wiki.kerbalspaceprogram.com/wiki/Key_Bindings — high.
- [S50] KSP Wiki — "EAS-4 Strut Connector" (archive). https://web.archive.org/web/20240105211234/https://wiki.kerbalspaceprogram.com/wiki/EAS-4_Strut_Connector — high.
- [S51] KSP Wiki — "Radiator" (archive). https://web.archive.org/web/20240103075425/https://wiki.kerbalspaceprogram.com/wiki/Radiator — high.
- [S52] KSP Wiki — "Reaction wheel" (archive). https://web.archive.org/web/20240104235213/https://wiki.kerbalspaceprogram.com/wiki/Reaction_wheel — high.
- [S53] KSP Wiki — "Parts" table (archive). https://web.archive.org/web/20240121085152/https://wiki.kerbalspaceprogram.com/wiki/Parts — high.
