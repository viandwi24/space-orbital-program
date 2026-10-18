# 03 — Part control and tweakables in flight (KSP1 Part Action Window, KSP2 Part Manager)

**Why this document exists.** The owner says the vessel control panel "is odd", that widths were not thought through, and that "not enough things can be controlled like in KSP". Our earlier research named the two KSP models in a paragraph each: the floating Part Action Window (PAW) in KSP1 and the docked Part Manager in KSP2 (`refs/reverse-engineering-ksp2/04-flight-and-controls.md` §1.8, `13-ui-ux-patterns.md` §1.3–1.4). This document goes one level down. It lists **what a player can actually change on each part type during a flight**, how those controls reach the screen, how action groups and the attitude controls (SAS, RCS, throttle, trim) work, what players complained about, and which mods filled the gaps. It ends with a checklist of controls a player will expect from our vessel panel. Editor-side tweakables (set before launch) are covered in `02-vab-sph-editor.md` §7; our current implementation is inventoried in `05-orbital-today-inventory.md` §3.2.

**Method.** Public sources only: the aggregated official KSP1 changelogs, official Steam announcements, KSP2 patch notes transcribed on kerbal.wiki, the KSP2 art director's UI post, community wikis (through search excerpts, because the official wiki and forum blocked automated fetches with bot protection or HTTP 403 on 2026-10-18), player threads and mod pages. No game files were inspected. Tags: **[KSP1]**, **[KSP2]**, **[KSP2 — announced, never shipped]**, **[Mod: name]**. A detail that is common community knowledge but that I could not tie to a source on the day is marked *(unverified)*.

---

## 0. Findings in brief

1. In KSP1 almost every part exposes 3–10 flight controls in its PAW, and a large share of them is hidden behind the **Advanced Tweakables** setting [S9]. The flight-time list is long: thrust limiter, gimbal limits, per-axis RCS, flow priority, chute deploy pressure and altitude, wheel friction and motor limits, robotics targets.
2. The KSP1 PAW was not static. Between 1.1 and 1.10 it gained pinning (1.5), a scrollbar and on-screen clamping (1.7), typed numeric entry (1.7.3, 1.8), a max-height setting (1.8), groups, units on sliders, an opening position away from the craft (1.10), and caching for speed (1.10) [S1][S2]. Each of these was a fix for a complaint we can avoid from day one.
3. KSP2 replaced the per-part popup with a **Part Manager** (players also say "Parts Manager"), a single tall window. Right-clicking a part opened that whole window. Players asked for the small per-part popup back, for pinning, resizing, columns and smaller fonts [S18][S19]. The art director listed the same three faults: you cannot watch many parts at once, you cannot tell which list entry is which physical part, and per-part fuel lives in a separate Resource Manager [S10].
4. Fuel transfer is a split workflow in both games: two PAWs plus In/Out buttons in KSP1 (and from 1.5, from the Resources app for highlighted parts [S1]); a separate Resource Manager app behind a 3×3-grid button in KSP2 [S17].
5. Action groups are the keyboard face of part control: 10 custom groups (keys 1–0) plus Stage, Gear (G), Lights (U), Brakes (B, held), Abort (Backspace), SAS and RCS [S5]. KSP1 allowed editing groups **in flight only from 1.8** (October 2019) [S1]; before that, the Action Groups Extended mod did it [S21].
6. For our vessel panel the lesson is: keep the Part Manager's overview (Parts tab), add KSP1's direct, small per-part inspector that can be pinned, link the two with two-way highlighting, put resources and transfers inside the same panel, and size the panel for its widest control row (a labelled slider with a value), not for a list of switches.

---

## 1. What a player can control per part type in flight

The tables below list flight-time controls. "Adv." means the control appears only with Advanced Tweakables on [S9]. The KSP2 column says what the KSP2 Part Manager exposed where a source confirms it; KSP2 generally kept the same module behaviour, with fewer advanced controls *(still unverified as a full list; KSP2 never had an Advanced Tweakables toggle that I could find)*.

### 1.1 Command: pods, probe cores, avionics

| Control | KSP1 | KSP2 | Notes |
|---|---|---|---|
| Control from here | Yes. Also an action-group action since 1.3.1 [S1] | Yes *(still unverified)* | Sets the reference frame for navball and SAS. Also on docking ports, grapples and external seats [S1]. |
| Rename vessel / set vessel type | Yes, from the command part's PAW *(still unverified)* | Yes *(still unverified)* | Vessel type drives map icons and filters. |
| Change "forward" direction | Yes, from 1.6 [S1] | Not found | For probes mounted sideways. |
| SAS modes available | Depends on pilot level or probe core level, 0–3 [S29]. "All SAS modes on all probes" is a sandbox setting; 1.12.2 fixed skill checks against it [S1] | No experience gating (KSP2 had no Kerbal XP) | See §4. |
| Hibernate / hibernate in warp | Yes on probe cores, to save power; added in 1.2 with an "auto-hibernate in warp" advanced tweakable *(verified 2026-10-18: [S37])* | Hibernation existed: 0.1.1 fixed control input "while in hibernation mode" [S11] | |
| Crew transfer, EVA, IVA | Transfer between crewed parts from the PAW; EVA from the crew portrait or hatch | EVA from portraits; no IVA in Early Access | |
| Review / transmit data | Command pods store experiment results; "Review data" lists them *(still unverified)* | Research Inventory (0.2.0) shows all collected science for the flight [S32] | |
| Torque (built-in reaction wheel) | See §1.3 | | |

### 1.2 Propulsion: engines, RCS, tanks

| Part | Control | KSP1 | KSP2 |
|---|---|---|---|
| Engine | Activate / shut down | Yes | Yes. 0.1.4 fixed the activate/deactivate button falling out of sync [S14] |
| | Thrust limiter (0–100 %) | Yes. From 1.7.2 it can be bound to an axis group [S1] | Yes *(still unverified)* |
| | Independent throttle | Adv.; lets one engine run on its own throttle value, apart from the main throttle [S24] *(version still unverified)* | Not found |
| | Gimbal: lock, limit %, per-axis pitch/yaw/roll | Lock and limit standard; per-axis and actuation speed Adv. *(still unverified exact split)* | Gimbal lock *(still unverified)* |
| | Mode switch (multi-mode engines, e.g. air-breathing/closed-cycle) | Yes, toggle plus auto-switch *(still unverified)* | Yes on the equivalent engines *(still unverified)* |
| | Status readouts: thrust, Isp, fuel flow, status text | Yes | Yes; 0.1.2 fixed engine status text [S12] |
| RCS thruster | Enable / disable | Yes, plus the global R toggle | Yes |
| | Thrust limiter | Yes | *(still unverified)* |
| | Per-axis toggles (pitch, yaw, roll, fore/aft, left/right, up/down) | Adv.; players use it to stop RCS from rotating the craft [S25] | Not found |
| Fuel tank, battery | Resource bar per resource with amount and capacity | Yes. Keyboard entry of amounts from 1.8 (in editor) [S1] | Shown in Part Manager with sliders; per-tank fuel watching pushed to the Resource Manager [S10] |
| | Enable / disable flow (per resource) | Yes, a lock toggle on each resource bar *(still unverified wording)* | *(still unverified)* |
| | Flow priority | Adv.; came with the 1.2 fuel-flow rewrite [S4] *(version of the priority field still unverified)*. 1.9 fixed Δv errors with changed priorities [S1] | Not found |
| | Transfer In / Out / Stop | Open two tank PAWs and use In/Out; from 1.5 also from the Resources app for highlighted parts [S1] | Resource Manager app, pick tanks, mark In and Out, Start [S17] |
| | Drain / dump | Not stock | Not stock |

### 1.3 Attitude and aero: reaction wheels, control surfaces

| Part | Control | KSP1 | KSP2 |
|---|---|---|---|
| Reaction wheel | Enable / disable torque | Yes | Yes *(still unverified)* |
| | Wheel mode: Normal / SAS only / Pilot only | Yes *(still unverified version)* | Not found |
| | Authority limiter % | Adv. *(still unverified)* | Not found |
| Control surface, airbrake | Pitch / yaw / roll response toggles, invert | Yes (toggles), invert *(still unverified)* | Partial *(still unverified)* |
| | Authority limiter | Yes; axis-group bindable from 1.7.2 [S1] | *(still unverified)* |
| | Deploy, deploy direction, deploy angle | Yes *(still unverified details)* | Deploy on A.I.R.B.R.A.K.E.S fixed in 0.1.5 [S15] |
| Fan / rotor blades (Breaking Ground) | Pitch, yaw, roll responses independently, authority limiter (default 3° from 1.9) | Action groups for each axis since BG 1.5 [S1] | — |

### 1.4 Structure and separation: decouplers, docking ports, fairings

| Part | Control | KSP1 | KSP2 |
|---|---|---|---|
| Decoupler / separator | Decouple | Yes; 1.5 fixed symmetry decouplers fired from the PAW [S1] | Yes; the 0.2.1 notes list "decouplers require two clicks to stage" as an issue [S35] |
| | Crossfeed enable / disable | Adv. *(still unverified)* | Not found |
| | Ejection force | Editor only in stock; **[Mod: TweakableEverything]** adds a slider [S22] | — |
| | Staging enable / disable | "Disable Staging" PAW option; 1.12.2 made it apply to all symmetry counterparts [S1] | — |
| Docking port | Undock / decouple node, control from here, set as target | Yes. 1.7.3 added switching a docked secondary port to primary from the PAW [S1]; 1.5 made docking ports stageable in flight [S1] | Yes *(still unverified details)* |
| | Crossfeed toggle | Adv. *(still unverified)* | — |
| | Angle snap enable, snap angle | Adv. *(still unverified)* | — |
| | Rotation (1.12 limited rotation to align ports) | Yes, from 1.12 [S1] | — |
| | Magnet force and torque | Not stock; **[Mod: TweakableEverything]** [S22] | — |
| Fairing | Deploy | Yes; 1.11 shows a notice on the fairing PAW when a flag is attached [S1] | Yes |

### 1.5 Recovery and ground: parachutes, legs, gear, wheels

| Part | Control | KSP1 | KSP2 |
|---|---|---|---|
| Parachute | Deploy (arms it), cut, disarm, repack (EVA) | Yes. A staged chute waits until pressure allows semi-deploy, so "arming" is the normal state [S7] | Yes; 0.2.2 adds notifications when a chute breaks [S16] |
| | Min pressure (semi-deploy), deploy altitude (full deploy) | Yes. Tweakable ranges: altitude 50–5,000 m above ground, min pressure 0.01–0.5 atm. Defaults: main chutes (Mk16, Mk16-XL, Mk2-R) 0.04 atm and 1,000 m; drogues (Mk25, Mk12-R) 0.02 atm and 2,500 m. The default deploy mode is "when safe" since 1.2. A forum tip of min pressure 0.75 [S7] is outside the wiki's slider range *(verified 2026-10-18: [S38, S37])* | *(still unverified)* |
| | Spread angle | Adv. *(still unverified)* | — |
| | Safety state | The staging icon background shows safe (grey), risky (yellow-green, from about 250 m/s on Kerbin for main chutes and about twice that for drogues) and unsafe (dark red) from 1.0.5 *(verified 2026-10-18: [S38])*; the chute icon itself shows packed, armed, semi-deployed, deployed, destroyed [S7]. **[Mod: Chute Safety Indicator]** used green/yellow/red before [S31] | — |
| Landing leg / gear | Raise / lower (also Gear group, G) | Yes | Yes |
| | Brakes, brake torque | Brakes via B; torque slider *(still unverified)* | *(still unverified)* |
| | Friction control, spring and damper | Adv.; spring and damper up to 3 from 1.6 [S1]; auto spring/damper from 1.5 [S1] | — |
| Wheel | Motor enable, motor output limit, traction control | Yes; motor and steering action groups from 1.3.1 [S1] | *(still unverified)* |
| | Steering enable, invert, response | Yes | *(still unverified)* |

### 1.6 Power, communication, thermal, lights

| Part | Control | KSP1 | KSP2 |
|---|---|---|---|
| Solar panel | Extend / retract (non-retractable ones only extend), sun exposure and output readout | Yes; 1.12 removed the retract option from non-retractable parts [S1] | Yes |
| Antenna | Extend / retract, transmit science, combinability readout | Yes (CommNet, 1.2) [S4] | Yes |
| Radiator | Activate / deactivate cooling, extend | Yes *(still unverified details)* | Yes *(still unverified)* |
| Fuel cell, generator | Start / stop | Yes | Yes *(still unverified)* |
| Light | Toggle (one event since 1.11, to reduce PAW redraw) [S1], colour (RGB), blink *(blink still unverified)* | Colour picker; 1.12.2 fixed its alignment in the PAW [S1] | Light text in Part Manager updated in 0.1.1 [S11]; colour picker window moveable from 0.1.2 [S12] |

### 1.7 Science and resources

| Part | Control | KSP1 | KSP2 |
|---|---|---|---|
| Experiment | Run, review data, reset, collect (EVA), transmit | Yes | "Experiment Actions" button and Research Inventory from 0.2.0 [S32]; the 0.2.1 notes list the Science button flashing for completed experiments as an issue [S35] |
| Deployed science (Breaking Ground) | Open the PAW from 20 m (1.7.2), "interact" button (1.8) [S1] | Yes | — |
| Drill, ISRU | Start / stop each converter or harvester, readouts of rate and heat | Yes; 1.3.1 fixed drill action groups [S1] | Not in KSP2 Early Access (resources were roadmap) |

### 1.8 Robotics (Breaking Ground, 1.7)

| Part | Controls | Source |
|---|---|---|
| Hinge, rotation servo | Target angle, traverse rate, damping, lock, motor engage, invert *(control names still unverified)* | Hinge target-angle fixes in BG 1.7.2 [S1] |
| Rotor | RPM limit, torque limit, direction, brake; torque affects strength, not RPM (BG 1.7.3) [S1] | [S1] |
| Piston | Target extension, speed, damping | Piston fixes in BG 1.7.2–1.7.3 [S1] |
| KAL-1000 controller | A timeline editor with tracks per part field, play modes (Play Once, loop, ping-pong; "None-Restart" from 1.12.2), priority between controllers, axis bindings, preset curves, part highlight on hover, EVA play/stop from 1.11 [S1] | [S1] |
| All robotics | Shutdown/restart on resource availability (BG, 1.8) [S1] | [S1] |

### 1.9 What every part's PAW carried

- **Header:** part name, a pin button (from 1.5 in flight [S1]), and a close button.
- **Resource bars** for anything the part stores, with flow lock *(still unverified)*.
- **Temperature / thermal** readouts with debug options, plus "Thermal Highlights" and "Temperature Gauges" settings for the whole HUD [S9].
- **Aim camera** and **Set as target** on many parts *(still unverified)*.
- **Advanced tweakables** off by default; the setting is a single toggle in General settings [S9].

**Count, roughly.** A mid-size KSP1 craft (pod, 2 engines, 4 tanks, RCS, chute, legs, solar, antenna, experiments) exposes on the order of 40–70 flight controls across 15–25 parts *(my estimate from the tables above, not a measured figure)*. That is the scale "control like in KSP" means.

---

## 2. How the controls reach the screen

### 2.1 KSP1: the Part Action Window, in versions

| Version | Change to the PAW | Problem it addressed |
|---|---|---|
| 1.1 (Apr 2016) | UI rewritten on Unity 5; "right-click part menus" among the most changed elements [S3] | Old IMGUI windows |
| 1.5 (Oct 2018) | PAWs can be **pinned**; resource transfer works for parts highlighted from the Resources app [S1] | Windows closing when another part was clicked; transfer discoverability |
| 1.7 (Apr 2019) | **Scrollbar**, and the window stays on screen when it holds too much data [S2] | Long mod-heavy PAWs ran off the screen |
| 1.7.3 (Jul 2019) | **Text entry** on float fields [S1] | Sliders too coarse |
| 1.8 (Oct 2019) | Keyboard entry of resource values; **max PAW height** via `PAW_PREFERRED_HEIGHT`; windows scale down from the header; mods can set max height [S1] | Very tall windows |
| 1.8–1.10 | **Groups** with collapsible headers (1.10 fixed group headers cut off in some languages) [S1]. The collapse state was not remembered until **[Mod: KSPCommunityFixes]** PAWGroupMemory (1.8–1.12.5), which also adds stock groups (1.10.1+) [S23] | Long flat lists |
| 1.10 (Jul 2020) | PAWs **cached** for performance; sliders show **units**; long text marquee-scrolls; the PAW **opens towards the outside of the screen, not over the craft**; pinned PAWs stay open on clicks; PAWs close when their part is destroyed [S1] | Frame drops when opening, windows covering the rocket |
| 1.11 (Dec 2020) | Light On/Off events merged into one toggle "to reduce PAW redraw" [S1] | Redraw cost |

**Behaviour, as players describe it.** Right-click a part to open its PAW near the cursor; clicking another part replaces it unless the first is pinned; several pinned PAWs can stay open at once; hovering a PAW highlights its part *(still unverified detail: KSP1 also highlights the part while hovering the window)*. 1.12.2 fixed root-part visibility when hovering its PAW in the editor [S1], which confirms the hover-highlight link.

### 2.2 Part highlighting

Highlighting is how KSP ties a control to a part. KSP1 highlights on mouseover in flight and in the editor; 1.6 fixed highlights showing from inside IVA [S1]; Breaking Ground's KAL highlights the part a track controls when you hover the track (1.8) [S1]. KSP2's Part Manager did **not** make that link well: "associating a viewed part in the manager with the actual part on the ship" is one of the three Part Manager faults its own art director listed [S10].

### 2.3 KSP1 Resources app

A stock app on the top-right launcher listing each resource on the vessel with a bar and an amount, with a toggle between the current stage and the whole vessel *(toggle wording still unverified)*. From 1.5, highlighting tanks from the app enables transfers between them [S1]. It shows levels, not rates *(still unverified that no rate column exists in stock; mods such as Kerbal Engineer show rates)*.

### 2.4 KSP2 Part Manager

- **Shape.** A single window listing the vessel's parts, grouped by part type, each entry expandable to show its controls and action buttons *(grouping detail still unverified; consistent with the 0.1.4 fix "Parts Manager shows the pod icon for all categories" [S14])*. It worked in both the VAB and flight; 0.1.2 made it open for subassemblies in the VAB [S12].
- **Right-click opened the whole manager**, not a small popup for the clicked part. Players called the large box a waste of screen room and asked for a KSP1-style single-part popup, with the full manager still on its button, or at least for the window to size to the selected part [S18]. Right-click also clashed with right-drag camera control in the VAB [S19].
- **Density.** Players described big buttons, largeish fonts, and margins and borders taking about half the vertical space; one asked for the breadcrumb font size at 100 % UI scale [S19]. 0.1.3 "optimized Part Manager by removing several layout groups" [S13]; 0.1.5 "updated Part Manager UI style" [S15]. A suggestion thread asked for resizing, pinning, columns, font size and scale settings in its title [S19]. Hidden detail: some part information appeared only when holding Shift *(player report, still unverified)*.
- **Out of sync.** 0.2.2 fixed chutes staged from the staging stack not showing as staged in the Part Manager [S16]: the list and the vessel disagreed.
- **The developer view.** In January 2024 the art director wrote that the Part Manager makes it hard to observe many parts at once, makes per-part fuel tracking depend on a separate app, and does not link list entries to the physical parts [S10].
- **What players liked.** Reaching parts buried inside a craft without hunting for them with the mouse (see `13-ui-ux-patterns.md` §1.3).

### 2.5 KSP2 Resource Manager

A separate app opened from the app bar (players located it at the bottom right, behind a 3×3-grid "bento" button) [S17]. You pick tanks, mark one "In" and one "Out", and press Start [S17]. 0.1.1 removed solid fuel from transferable resources and restyled the window to match the staging-stack gauges [S11]; 0.1.3 removed intake air from it [S13]; 0.1.2 added a missing scrollbar for vessels with many parts [S12]. Players reported that it showed no rate of change (`13-ui-ux-patterns.md` §1.4).

### 2.6 Fuel transfer, side by side

| Step | KSP1 | KSP2 |
|---|---|---|
| Find the tanks | Right-click each tank (pin the first), or highlight from the Resources app (1.5+) | Open the Resource Manager |
| Choose direction | In / Out buttons in each PAW | Mark In / Out per tank |
| Run | Transfer runs until stopped or full | Start |
| Limits | Crossfeed and resource rules apply; solid fuel not transferable | Solid fuel and intake air removed in 0.1.1 / 0.1.3 [S11][S13] |
| Rate shown | No *(still unverified)* | No |

---

## 3. Action groups in flight

| Group | Default key | Behaviour | Source |
|---|---|---|---|
| Stage | Space | Fires the next stage; Alt+L locks staging | [S6] |
| Gear | G | Toggles all gear and legs | [S5] |
| Lights | U | Toggles all lights | [S5] |
| Brakes | B | **Held**: the only group that turns itself off on release | [S5] |
| Abort | Backspace | Fires the Abort group; a 1.1-era bug fired it together with the IVA camera reset | [S5] |
| SAS / RCS | T / R | Toggle | [S6] |
| Custom 01–10 | 1–9, 0 | Player-assigned actions; in career, custom groups unlock with the level-3 VAB/SPH and basic groups at level 2; always available in sandbox and science | [S5] |

- **Editing in flight.** [KSP1] Not possible in stock until **1.8** ("Implement ability to edit Action Groups in flight") [S1]. 1.9 pauses the game while the action-groups panel is shown in flight; 1.11 locks staging while it is open and adds menu navigation; 1.12.2 fixed input locks and camera conflicts from the action-groups app [S1].
- **Axis groups.** 1.7.2 made engine thrust limit, cargo-bay deploy limit and control-surface authority bindable to axis groups; the MainThrottle axis can be bound in absolute mode only [S1].
- **[Mod: Action Groups Extended]** offered 250 groups, in-flight editing years before stock, named groups and career lock overrides [S21]. Its continued popularity into 1.12.5 shows that ten groups were not enough for complex craft.
- **[KSP2]** KSP2 had an "action group manager" and "Trigger Action Groups" 1–10 in input settings; 0.1.1 fixed groups breaking when an invalid action was included and fixed actions added to reserved groups [S11]. I found no source for in-flight editing in KSP2 *(still unverified)*.

---

## 4. SAS, RCS, throttle and trim

### 4.1 SAS modes and where they sit

| Mode | Holds | KSP1 level needed [S29] |
|---|---|---|
| Stability assist | current attitude | 0 |
| Prograde / retrograde | velocity vector (surface, orbit or target frame per the navball speed mode) | 1 |
| Normal / anti-normal, radial in / out | orbit-plane vectors | 2 |
| Target / anti-target | direction to target | 3 |
| Maneuver | next node's burn vector | 3 |

[KSP1] The mode buttons appear in a column beside the navball when SAS is on (a beginner guide places them to the left of the ball) [S30]; locked modes are not shown or are dimmed *(still unverified)*. The SAS and RCS states are lights on the navball frame; the navball also shows the reference mode (click to cycle Surface, Orbit, Target), throttle, g-force, maneuver Δv, burn info and heading [S8].

[KSP2] SAS controls sit at the bottom left with the navball cluster; you click SAS and then pick the mode from the circle of buttons next to it [S28]. 0.1.4 fixed mode buttons not always registering clicks [S14]; 0.1.3 fixed normal/anti-normal navball markers not matching the SAS icons [S13]; 0.2.0 made the selected hold indicator highlight correctly [S33].

### 4.2 Keys

| Function | KSP1 default | Notes |
|---|---|---|
| Throttle up / down | Shift / Ctrl | Hold for a ramp |
| Full / cut | Z / X | |
| Pitch, yaw, roll | W/S, A/D, Q/E | |
| Translate (RCS) | H/N fore/aft, I/K, J/L | |
| Precision control | Caps Lock (since 0.08.5): lowers input sensitivity for rotation and RCS; trim gauges turn blue [S6] | A mode, not a hold |
| Trim | Alt + W/S/A/D/Q/E shifts the neutral point (since 0.19); Alt+X resets [S6] | Modifier is Option on Mac, Right-Shift on Linux since 1.1 [S6] |
| SAS momentary | F (hold to invert SAS state) *(verified 2026-10-18: [S39])* | |
| Docking control mode | Separate key layout toggled by a purple button below staging; on PC it is optional, on consoles it was required [S36] | Players report odd switches into docking mode [S36] |
| Default throttle at launch | A setting, 0–100 % [S9]; KSP2 added the same setting in 0.1.3 [S13] | |

[KSP2] Same key scheme in spirit; throttle shows as a bar to the left of the navball [S28]. 0.1.4 fixed SAS and throttle resetting when decoupling [S14].

---

## 5. Known problems and mods

### 5.1 Problems

| Problem | Game | Evidence |
|---|---|---|
| Too many floating windows; they cover the craft | KSP1 | 1.10 had to move PAWs "towards the outside of the screen" and cache them [S1] |
| PAWs taller than the screen | KSP1 | 1.7 scrollbar, 1.8 max-height setting [S1][S2] |
| Collapsed groups forget their state | KSP1 | Community fix PAWGroupMemory [S23] |
| Can't find a buried part to right-click | KSP1 | The reason **[Mod: Part Commander]** existed [S20] |
| One huge window instead of a small popup | KSP2 | Player suggestion threads [S18][S19] |
| Low density; few parts visible at once | KSP2 | [S19]; dev post [S10] |
| List entry not linked to the physical part | KSP2 | dev post [S10] |
| Fuel per tank in a separate app | KSP2 | dev post [S10]; player workaround thread [S17] |
| UI state out of sync with the vessel | KSP2 | engine action button out of sync (0.1.4) [S14]; staged chutes (0.2.2) [S16] |
| No in-flight action-group editing | KSP1 before 1.8 | [S1][S21] |
| Advanced controls hidden by a global switch | KSP1 | Players are told to turn on Advanced Tweakables to find per-axis RCS [S25] |

### 5.2 Mods that show what players wanted

- **[Mod: Part Commander Continued]** gathers every part's right-click menu into one resizable, movable, scrollable window; selected parts can be popped out into their own windows; it works in IVA and map view [S20]. In other words: an overview list *and* pinned per-part windows, KSP2's idea done earlier and with the popup kept.
- **[Mod: Action Groups Extended]** 250 groups, in-flight editing, named groups [S21].
- **[Mod: TweakableEverything]** ejection force for decouplers and docking ports, docking magnet force and torque, gimbal range and reverse, decouple-staging toggles [S22]. It shows that "everything" means *physical constants that change behaviour*, not cosmetics.
- **[Mod: KSPCommunityFixes]** PAW group memory and stock groups [S23].
- **[Mod: Chute Safety Indicator]** coloured deploy safety before stock had it [S31].

---

## 6. Implications for Space Orbital Program

Our vessel panel (refs concept: right side, 300 px, tabs Overview / Parts / Comms, group switches with a "mixed" state, part rows with a switch, info and icon actions; `refs/space-orbital-program-ui/docs/CONCEPT.md` §4) is the KSP2 Part Manager model. The concept is sound; what is missing is the KSP1 half and the width to carry real controls.

### 6.1 Adopt / Improve / Avoid

| # | Verdict | What | Why |
|---|---|---|---|
| 1 | **Adopt** | A **per-part inspector** opened by clicking a part in the 3D view *or* its row in the Parts tab. It is the same component in both cases. | KSP1's directness plus KSP2's overview; KSP2 players asked for exactly this [S18] |
| 2 | **Adopt** | **Pin** an inspector so it stays open while you click others; allow 2–3 pinned at once, stacked in a column to the left of the vessel panel, never floating over the craft. | KSP1 1.5 pinning [S1]; 1.10 moved PAWs off the craft [S1] |
| 3 | **Adopt** | **Two-way highlight**: hovering a row or inspector outlines the part; hovering a part highlights its row and scrolls it into view. Selected parts keep a persistent outline. | The link KSP2 lacked [S10]. Our panel already emits `onhighlight`; keep it and add the reverse |
| 4 | **Adopt** | **Groups with remembered collapse state** in Parts (by type: Command, Engines, Tanks, RCS, Attitude, Separation, Recovery, Ground, Power, Comms, Science, Lights, Robotics) and a **search box** plus a "in current stage" filter. | KSP1 needed a mod to remember groups [S23] |
| 5 | **Improve** | **Resources and transfer inside the vessel panel**: per-tank bars with **rate and time-to-empty**, a flow lock per resource, and transfer by selecting a source and a target row (or drag from one to the other), with a stop button and the rate shown. | KSP2's separate app was a named fault [S10]; neither game showed rates |
| 6 | **Adopt** | **Typed numeric entry** on every slider, with units, plus Shift for fine steps. | KSP1 1.7.3 and 1.8, 1.10 units [S1] |
| 7 | **Improve** | **No global "Advanced Tweakables" switch.** Show common controls first, put the rest in a per-part "More" disclosure that remembers its state. | KSP1's hidden-by-setting controls confused players [S25] |
| 8 | **Adopt** | **Action groups editable in flight**, from the inspector ("Add to group…") and from a groups view. Ten custom groups plus Stage, Gear, Lights, Brakes (held), Abort, SAS, RCS; allow more, with names. | KSP1 waited until 1.8 [S1]; AGX demand [S21] |
| 9 | **Adopt** | **Axis bindings** for continuous fields (thrust limit, authority, deploy limit, robotics targets). | KSP1 1.7.2 [S1] |
| 10 | **Adopt** | **State from the sim, never from the UI.** Each row reads the part's state every HUD tick so staging, action groups and scripts can't desync it. | KSP2 desync bugs [S14][S16] |
| 11 | **Adopt** | **Safety state in the row**: chute safe/risky/unsafe with text, engine flameout, overheating, out of power. Never colour alone. | KSP1 1.0.5 chute colours [S7]; ADR 0107 rule |
| 12 | **Avoid** | One huge window opened by right-click. Right-click (or long-press) opens the small inspector; the full Parts tab stays on its button. | KSP2 complaint [S18] |
| 13 | **Avoid** | Heavy padding. Part row 32–36 px, control row 28–32 px, labels 10–11 px (our minimum from ADR 0107). | KSP2 density complaint [S19] |
| 14 | **Avoid** | Floating, free-dragged windows over the craft as the default. Allow undocking an inspector as an option only. | KSP1 clutter (`13-ui-ux-patterns.md`) |

### 6.2 Width: what the panel must hold

The widest common row in KSP's part controls is a **labelled slider with a typed value and unit** ("Thrust limiter ▮▮▮▮▯ 85 %"), sometimes with a reset or lock icon. At our type sizes (label 10–11 px, value 11–13 px tabular):

| Element | Width (px at 100 % UI scale) |
|---|---|
| Panel padding 10 + 10 | 20 |
| Label column ("Deploy altitude", "Min pressure") | 96–112 |
| Slider track (usable on a trackpad) | 120–160 |
| Value field ("1,000 m", "0.75 atm", "100 %") | 56–64 |
| Trailing icon (lock / more) | 24 |
| Gaps (3 × 6) | 18 |
| **Total** | **334–398** |

So a 300 px panel cannot show a slider row without cramming or wrapping. Recommendation: **vessel panel 340 px default, resizable 300–440 px**; the inspector 320 px (min 300, max 400); below 300 px, sliders turn into a value field with − / + steppers. The concept's 300 px works for the Overview tab's group switches, which is why it looked right in the mockup. Doc 04 §6 places these widths in the whole HUD.

### 6.3 Checklist: controls a player expects per part (our vessel panel)

Must = expected by a KSP player on day one; Should = expected by the time the part exists; Later = depends on systems we may not have.

| Part type | Must | Should | Later |
|---|---|---|---|
| Command pod / probe core | Control from here; rename vessel and type; SAS level shown; crew list with EVA and transfer | Hibernate; forward direction; stored data with review | IVA |
| Engine | On/off; thrust limiter with typed value; status (thrust, Isp, flow, flameout reason) | Gimbal lock and limit; mode switch with auto; independent throttle | Per-axis gimbal |
| Fuel tank / battery | Per-resource bar with amount, capacity, **rate** and **time to empty**; flow lock | Transfer in/out with rate; flow priority | Dump |
| RCS | On/off; thrust limiter | Per-axis toggles (rotation vs translation) | — |
| Reaction wheel | On/off; mode (normal, SAS only, pilot only) | Authority limiter | — |
| Control surface | Pitch/yaw/roll toggles; authority limiter; deploy | Invert; deploy angle | — |
| Decoupler / separator | Decouple; include in staging toggle | Crossfeed toggle | Ejection force |
| Docking port | Undock; control from here; set as target; crossfeed | Angle snap; rotation | Magnet force |
| Fairing | Deploy | — | — |
| Parachute | Arm/deploy; cut; disarm; **safety state**; min pressure; deploy altitude | Spread angle; repack on EVA | — |
| Leg / gear | Raise/lower; brakes | Friction; spring and damper | — |
| Wheel | Motor on/off and limit; steering on/off and invert; brakes | Traction control; response | — |
| Solar panel | Extend/retract (if retractable); exposure and output | Sun tracking | — |
| Antenna | Extend/retract; transmit; link status | Combinability readout | — |
| Radiator / generator / fuel cell | On/off; output | — | — |
| Light | On/off; colour | Blink | — |
| Experiment | Run; review; transmit; reset; collect (EVA) | Value remaining in this situation | — |
| Drill / converter | Start/stop each mode; rate; heat | — | — |
| Robotics | — | Target angle/extension/RPM, rate, lock, motor | Sequencer (KAL-like) |
| Every part | Name, highlight link, pin, temperature when hot, action-group membership | Aim camera; part info | — |

### 6.4 Overview tab (group switches) — keep, with two additions

The concept's group switch with a mixed state is better than anything stock KSP had. Add: (a) a count beside each group ("Engines 3/4 on") so the mixed state has text, and (b) a jump from each group to the Parts tab filtered on that group.

---

## Sources

All checked 2026-10-18.

- [S1] GOG Database, "Kerbal Space Program — Release Notes" (official changelogs 1.3–1.12.x and Breaking Ground, aggregated), https://www.gogdb.org/product/1429864849/releasenotes — a third-party copy of the official patch notes. High for version facts.
- [S2] Steam News, "Kerbal Space Program 1.7: Room to Maneuver" (official announcement and changelog, April 2019), via https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=220200 — official. High.
- [S3] Steam News, "Kerbal Space Program 1.1 Turbo Charged" (HarvesteR, April 2016), same feed — official. High.
- [S4] Steam News, "Kerbal Space Program 1.2: Loud and Clear" (October 2016), same feed — official, summary only (full changelog was a link). High for what it says.
- [S5] KSP Wiki, "Action group", https://wiki.kerbalspaceprogram.com/wiki/Action_group, and "Key bindings", https://wiki.kerbalspaceprogram.com/wiki/Keys — community wiki, seen through search excerpts (site blocked fetches). Good.
- [S6] KSP Wiki, "Key bindings" (precision mode, trim, Alt+L, modifier per OS), https://wiki.kerbalspaceprogram.com/wiki/Keys, plus forum "Extended trim", https://forum.kerbalspaceprogram.com/topic/81915-extended-trim — search excerpts. Good.
- [S7] KSP Wiki, "Parachute", https://wiki.kerbalspaceprogram.com/wiki/Parachute, and forum "When is a parachute safe to open", https://forum.kerbalspaceprogram.com/topic/174042-when-is-a-parachute-safe-to-open — search excerpts. Good / anecdotal for the pressure tip.
- [S8] KSP Wiki, "Navball", https://wiki.kerbalspaceprogram.com/wiki/Navball — search excerpt listing the navball's indicators. Good.
- [S9] GitHub, CaptainKeyboard/ReDefinition issue #15, "KSP settings: Gameplay and System", https://github.com/CaptainKeyboard/ReDefinition/issues/15 — a modder's transcription of the settings screen with keys and ranges. Good.
- [S10] Steam News, "You Can't Spell User Interface Without U & I" (Ness, Art Director, Intercept Games, 22 Jan 2024), https://steamcommunity.com/games/954850/announcements/detail/3969427240633798022 (read via the Steam news API) — official dev post. High.
- [S11] kerbal.wiki, "0.1.1.0" (KSP2 patch notes), https://kerbal.wiki/0.1.1.0 — transcription of official notes. High.
- [S12] kerbal.wiki, "0.1.2.0", https://kerbal.wiki/0.1.2.0 — as above. High.
- [S13] kerbal.wiki, "0.1.3.0", https://kerbal.wiki/0.1.3.0 — as above. High.
- [S14] kerbal.wiki, "0.1.4.0", https://kerbal.wiki/0.1.4.0 — as above. High.
- [S15] kerbal.wiki, "0.1.5.0", https://kerbal.wiki/0.1.5.0 — as above. High.
- [S16] kerbal.wiki, "0.2.2.0", https://kerbal.wiki/0.2.2.0 — as above. High.
- [S17] Steam, KSP2 discussion "Can't view resources in fuel tanks and can't transfer fuel between tanks" (25 Feb 2023), https://steamcommunity.com/app/954850/discussions/0/3772364949851326657/, and deltacalculator "How to transfer fuel in KSP & KSP2", https://www.deltacalculator.com/ksp/transferfuel/ (search excerpt; page blocked fetch) — players / guide. Fair.
- [S18] KSP Forum, "Parts Manager Suggestion" (KSP2, 2023), https://forum.kerbalspaceprogram.com/topic/214498-parts-manager-suggestion/ — search excerpt. Player opinion.
- [S19] KSP Forum, "Parts Manager (In game Windows) Suggestions - ReSize, Pin, Columns, FontSize, Scale", https://forum.kerbalspaceprogram.com/topic/219161-parts-manager-in-game-windows-suggestions-resize-pin-columns-fontsize-scale/, and Steam "[BUG] Feedback & Bug list", https://steamcommunity.com/app/954850/discussions/0/3772364949850426646/ — search excerpts. Player opinion.
- [S20] KSP Forum, "[1.12.x] Part Commander Continued" (linuxgurugamer), https://forum.kerbalspaceprogram.com/topic/150122-112x-part-commander-continued — search excerpt. Mod author.
- [S21] KSP Forum, "Action Groups Extended: 250 Action Groups, in-flight editing", https://forum.kerbalspaceprogram.com/topic/67235-122dec1016-action-groups-extended-250-action-groups-in-flight-editing-now-kosremotetech/, and SpaceDock, https://spacedock.info/mod/1685/Action%20Groups%20Extended — mod pages. Good.
- [S22] SpaceDock, "TweakableEverythingContinued", https://spacedock.info/mod/1059/TweakableEverythingContinued — mod page. Good.
- [S23] GitHub, KSPModdingLibs/KSPCommunityFixes (PAWGroupMemory, PAWStockGroups), https://github.com/KSPModdingLibs/KSPCommunityFixes — mod README. Good.
- [S24] Steam, KSP discussion on throttle ("independent throttle mode comes with turning advanced tweakables on"), https://steamcommunity.com/app/220200/discussions/0/3421062490361938101/ — search excerpt; the exact thread attribution is uncertain. Anecdotal.
- [S25] Steam, KSP discussion "RCS Only for moving, not for turning", https://steamcommunity.com/app/220200/discussions/0/1754653780720662734/ — search excerpt. Player answer. Fair.
- [S29] KSP Wiki, "Skill" (SAS levels), https://wiki.kerbalspaceprogram.com/wiki/Skill — from our prior research (`04-flight-and-controls.md` [S1]). Sources disagree on probe levels.
- [S30] Steam guide "How To Get Started In KSP", https://steamcommunity.com/sharedfiles/filedetails/?id=2144756111 — old player guide (item since removed). Low–fair.
- [S31] KSP Forum, "Chute Safety Indicator", https://forum.kerbalspaceprogram.com/topic/116325-104-chute-safety-indicator-v102-august-6-2015 — mod thread. Good.
- [S28] TheGamer, "Kerbal Space Program 2: How To Launch Your First Rocket", https://www.thegamer.com/kerbal-space-program-2-launch-rocket-beginner-walkthrough/ — press guide. Fair.
- [S32] Steam News, "Introducing For Science!" (21 Oct 2023) and "For Science! OUT NOW!" (19 Dec 2023), via the Steam news API for app 954850 — official. High.
- [S33] kerbal.wiki, "0.2.0.0", https://kerbal.wiki/0.2.0.0 — patch notes transcription. High.
- [S35] kerbal.wiki, "0.2.1.0" (KSP2 patch notes, 30 Jan 2024), https://kerbal.wiki/0.2.1.0 — transcription of official notes. High.
- [S36] KSP Wiki "Docking" (search excerpt, docking-mode button and console note), https://wiki.kerbalspaceprogram.com/wiki/Docking, and KSP Forum "Possible bug with keybindings for docking mode", https://forum.kerbalspaceprogram.com/topic/184719-possible-bug-with-keybindings-for-docking-mode — wiki good; forum anecdotal.
- [S37] KSP Wiki, "1.2" changelog (Internet Archive snapshot). https://web.archive.org/web/20240225060311/https://wiki.kerbalspaceprogram.com/wiki/1.2. Official notes, full text. High.
- [S38] KSP Wiki, "Parachute" (archive). https://web.archive.org/web/20240106232329/https://wiki.kerbalspaceprogram.com/wiki/Parachute. High.
- [S39] KSP Wiki, "Key bindings" and "SAS" (archive). https://web.archive.org/web/20240105022508/https://wiki.kerbalspaceprogram.com/wiki/Key_Bindings ; https://web.archive.org/web/20240104235756/https://wiki.kerbalspaceprogram.com/wiki/SAS. High.

## Needs verification

Added 2026-10-18 by the verification pass (see `16-verification-log.md`). Every remaining *(still unverified)* tag above is in this list.

- KSP2 Part Manager equivalents of KSP1 controls (most KSP2 cells): still unverified: no KSP2 Part Manager documentation read; kerbal.wiki patch notes only mention fixes.
- Which KSP1 controls are Advanced-Tweakables only (spread angle, crossfeed, angle snap, authority limiter, per-axis gimbal): still unverified: the archived Settings page only says AT adds "increased fuel flow options and autostruts".
- Reaction-wheel mode version, control-surface invert, wheel brake-torque slider, light blink, flow-lock wording, Resource-app toggle wording: still unverified: part pages read this pass do not describe the PAW controls.
- "Review data" wording and PAW hover-highlight in flight: still unverified: no source found.

*(S26, S27 and S34 are intentionally unused.)*
