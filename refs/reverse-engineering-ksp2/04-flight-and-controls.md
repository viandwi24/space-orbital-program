# 04 — Flight and controls

This document covers what a player sees and touches during a flight. That includes the HUD and navball, SAS, RCS, throttle and staging, time warp, the map view with patched conics, maneuver planning, rendezvous and docking, the tracking station, part and resource windows, alarms, and revert/quicksave. KSP1 is the baseline, KSP2 is the comparison, and the mods that filled the gaps are recorded as prior art. Orbital already has a flight HUD with a navball, SAS, maneuver nodes, warp-to, time warp, a map view, a scripting panel and remappable keys. Its planned Mission Center combines the tracking station with mission control, and third-party mods can add HUD panels through a dock system. Facts are tagged **[KSP1]**, **[KSP2]**, **[KSP2 roadmap — never shipped]** or **[Mod: name]**. KSP2 timeline: Early Access on 24 Feb 2023, For Science! (0.2.0.0) on 19 Dec 2023, and the final patch 0.2.2.0 on 11 June 2024 [S9][S14].

---

## 1. How it works

### 1.1 HUD layout

| Element | KSP1 | KSP2 |
|---|---|---|
| Navball | Bottom centre. Fixed in place, with a size setting. | Bottom centre, inside a larger instrument cluster with a stats box. Players complained that it could not be moved [S10]. Redux later made the stats box expandable, adding inclination and period [S13]. |
| Staging stack | Left side. Icons per stage, with Δv per stage from 1.6 [S15]. | Left side, with Δv per stage. |
| Altitude, speed, mode | A strip above the navball with a click to switch Surface, Orbit or Target speed. | Readouts built into the cluster. |
| Time warp | Top left: arrows, the warp rate and the UT clock. | Top left: a warp bar. A "signpost" UI while warping and notices about blocked actions were added in 0.2.2 [S9]. |
| App launcher | Top right: resources, the Δv app, the Maneuver Mode panel (1.7) [S2] and mod buttons. | An app bar along the edge, with the Parts Manager, resources and the mission tracker (0.2.0). A dedicated **Recover Vessel** button was added in 0.2.2 [S9]. |
| Crew portraits | Bottom right, with IVA and EVA buttons. | Bottom right, with Kerbal portraits. |

### 1.2 Navball and markers (both games)

The navball shows the horizon and heading. It also carries the standard vector markers: **prograde** and **retrograde**, **normal** and **anti-normal**, **radial-in** and **radial-out**, **target** and **anti-target** (whenever a target is set), and the blue **maneuver** marker when a node exists. The speed mode decides whether prograde means the surface vector or the orbital vector. Target mode swaps prograde for velocity relative to the target, which is how players dock.

### 1.3 SAS, RCS and throttle

**[KSP1] SAS levels** (career, with Kerbal experience on) [S1]:

| Level | Modes added | Example sources |
|---|---|---|
| 0 | Stability Assist (hold attitude) | Pilot at level 0, plus some small probe cores |
| 1 | Prograde and Retrograde | Pilot at level 1, mid-tier probes |
| 2 | Normal, Anti-normal, Radial-in and Radial-out | Pilot at level 2 |
| 3 | Target, Anti-target and Maneuver | Pilot at level 3+, the high-end probe cores (HECS2, RGU) |

Community sources disagree on which probe cores give which level, for example the OKTO [S1]. The Avionics Hub raises a vessel's SAS to level 3. A sandbox option, "All SAS modes on all probes", removes the gating [S1]. SAS also needs actual torque from reaction wheels, RCS or gimbal.

**[KSP2]:** pilots and probe cores give the SAS modes without the experience-level gating. KSP2 never shipped Kerbal XP, and crew traits were not developed. This comes from the absence of any such system in the 0.1–0.2 patch notes; I found no explicit source.

**RCS:** toggled with R, translated with the HNJKIL keys, and fed by monopropellant. **Throttle:** Shift and Ctrl, or Z (full) and X (cut). **Staging:** spacebar. In KSP2, spacebar staging was unreliable until 0.1.2 [S5].

### 1.4 Time warp

**[KSP1]:**
- **Physics warp** runs at ×2, ×3 or ×4 in atmosphere or under thrust. The game still simulates physics, with a bigger time step, so it is less stable.
- **On-rails warp** runs at ×5, ×10, ×50, ×100, ×1,000, ×10,000 and ×100,000 [S4]. On rails the vessel follows its Kepler orbit, and thrust is impossible.
- Each warp level has a minimum altitude per body. Some players remember ×5 and ×10 starting around 70 km at Kerbin, but that is uncertain and depends on the version [S4].
- **[Mod: Time Control]** lets players customise warp rates and altitude limits per body [S4].
- In stock, **warping under thrust is impossible** above physics warp, which makes long ion or nuclear burns tedious.

**[KSP2]:**
- KSP2 changed the simulation so that vessels **keep thrusting under on-rails time warp** ("warp under thrust" or "background burns"). This was designed in so that long, low-thrust burns are practical [S7].
- Players reported it working by March 2023, but some later 0.1.3 builds lost thrust under warp, and low-thrust engines could round to zero [S7]. In other words it shipped, but it was fragile.
- Physics warp appears only in atmosphere [S7].
- 0.1.2 fixes covered warp-bar visibility and burn-timer status icons [S5]. 0.2.2 fixed landing legs and wheels clipping into terrain after timewarp [S9].

### 1.5 Map view, patched conics and maneuvers

**[KSP1] map view.** Orbits are shown as patched conics: one Kepler conic per sphere of influence (SOI). It shows Ap and Pe markers, the ascending and descending nodes relative to a target, closest-approach markers, and SOI encounter and escape markers. A conic-patch limit setting controls how many future patches are drawn.

**[KSP1] maneuver nodes.** Click the orbit to add a node. A 6-handle gizmo (prograde, normal, radial) sets the burn. The maneuver marker shows up on the navball, along with the estimated burn time and time to node. **1.7 "Room to Maneuver"** (10 April 2019) added **Maneuver Mode**: a panel with orbital data plus an advanced node editor with precise numeric increments and a time-shift control [S2]. Experienced players still preferred **[Mod: Precise Maneuver]** [S2]. **1.12 "On Final Approach"** (24 June 2021) added a stock **Alarm Clock** app and a **Maneuver Creator** that generates transfers to other bodies and lists upcoming transfer windows [S3]. Both follow mod prior art: **[Mod: Kerbal Alarm Clock]** [S11] and **[Mod: Transfer Window Planner]** [S3]. Multiple nodes have always worked in KSP1: each later node is planned on the orbit that the earlier one produces.

**[KSP2] maneuver planning.** Nodes are **thrust-aware**: the predicted trajectory includes the vehicle's behaviour during a finite burn, not an instant impulse. Because of that, 0.1.2 capped planned burns at the fuel actually on board [S5][S6]. The developers admitted that players wanted "aspirational" planning beyond current fuel [S6]. A later fix (0.2.2) allowed creating nodes even when the vessel showed 0 Δv [S9].

KSP2's **burn timer** has LED-style lights and countdown sounds. Players praised it for timing a burn start to the second [S8], but criticised it for having no stop countdown and for computing burn time from current maximum acceleration, which goes wrong across staging [S8]. Several players said KSP2's node planning was clearly worse than KSP1's [S8]. The community filled the gap with **[Mod: Maneuver Node Controller]** and **[Mod: Flight Plan]**, which add precise node input and automated transfers [S12].

### 1.6 Target, rendezvous and docking

**[KSP1]:**
- Set a target from the map or by right-clicking.
- The navball switches to target mode, and the map shows closest-approach separation and time.
- Docking ports have a "Control from here" option, and docking mode changes the key layout.
- A typical rendezvous flow: match planes at the AN/DN, Hohmann to an intercept, kill relative velocity, then approach with RCS.
- **[KSP2]:** the flow is the same, with intercept markers that changed in 0.1.1 to avoid overlapping UI [S17].
- Mods such as **[Mod: MechJeb]** automate docking and rendezvous, and **[Mod: Docking Port Alignment Indicator]** adds a dedicated docking display (from community knowledge, not verified this session).

### 1.7 Tracking Station, flight log and notifications

- **[KSP1] Tracking Station:** a separate KSC building with a system map, a list of all vessels and debris, recovery, and termination of vessels. Asteroid and comet tracking scale with the building's level.
- **[KSP2] Tracking Station:** it existed early in Early Access; 0.1.2 already fixed its filters and added "Return to KSC" [S5]. **Flight Report** dialogs summarise each flight [S5]. Messages and notifications pile up in a feed, and 0.2.2 added notices for chutes breaking and for blocked actions [S9].
- **[KSP1] flight results:** shown after a crash, as an event log ("F3").

### 1.8 Part windows, resources and crew

- **[KSP1] PAW (part action window):** right-click a part to get a small floating window with its actions and tweakables. With many windows open the screen gets cluttered.
- **[KSP2] Parts Manager:** one panel listing every part, filterable, usable both in the VAB and in flight [S5].
- **Resource panel (both games):** totals per resource, plus per stage or per part.
- **Crew:** **[KSP1]** has IVA (an interior cockpit view) and EVA, with crew transfer by right-clicking. **[KSP2]** has portraits and EVA. IVA was not part of the EA scope; that is from general player knowledge and I did not verify it this session.

### 1.9 Revert, quicksave and autosave

- **[KSP1]:** revert to launch, revert to the VAB, F5 quicksave, F9 quickload. Revert can be switched off in difficulty settings.
- **[KSP2]:** the same features, and revert brings back the whole workspace. 0.2.2 added more **autosave points** during flight [S9].

### 1.10 Prior art in mods

- **[Mod: Kerbal Engineer Redux]:** compact readouts in flight and in the editor, such as TWR, suicide-burn altitude, time to Ap/Pe and impact time [S16].
- **[Mod: MechJeb]:** autopilots for ascent, landing, rendezvous and docking, plus maneuver planning. In career it is unlocked through the tech tree [S16].
- **[Mod: kOS]:** scriptable autopilot programs [S16]. This is the closest prior art to Orbital's scripting panel.
- **[Mod: K2-D2]** is a KSP2 autopilot that was later ported to Redux [S13].

---

## 2. Player experience

- **What works:** the navball and marker language is the heart of KSP. Once players learn "point at prograde, burn", orbital mechanics becomes something they can feel. The KSP2 burn timer's lights and sounds turned the burn start into a skill moment [S8]. Thrust under warp in KSP2 made ion probes fun [S7].
- **What hurts:**
  - Nodes that cannot be trusted. KSP2's thrust-aware nodes are more realistic but feel unpredictable when staging changes acceleration [S8].
  - Single-node limits and caps based on current fuel feel arbitrary [S6].
  - In KSP1, many floating PAWs clutter the screen.
  - In KSP1, warp limits plus no thrust under warp make long burns a chore.
  - No stock alarms until KSP1 1.12, so missed SOI changes ruined missions; that is why Kerbal Alarm Clock was among the most installed mods [S11].
- Information density: KSP2 showed more stock information than KSP1 stock [S10], yet players still installed readout mods. The HUD is a place players want to customise.

---

## 3. Interactions with other systems

- **03-vehicle-assembly.md:** staging, action groups, Δv per stage and the Parts Manager carry over from the editor. Revert returns there.
- **05-science-and-research.md:** experiments are run from the PAW or Parts Manager. Situations (biome, altitude band) are shown in flight.
- **08-crew.md:** in KSP1, pilot level unlocks SAS modes [S1]. EVA, IVA and crew transfer happen in flight.
- **09-communications-network.md:** in KSP1 CommNet, probe control and science transmission depend on signal, and the HUD shows signal strength.
- **06-missions-contracts-achievements.md:** contract waypoints and mission-tracker objectives show in flight and on the map.
- **10-celestial-bodies-and-world.md:** SOIs, atmosphere heights and warp altitude limits per body.
- **12-modding.md:** flight UI and autopilots (KER, MechJeb, kOS, Maneuver Node Controller) are among the most common mod targets.
- **13-ui-ux-patterns.md:** HUD layout, app launcher, docked versus floating windows.
- **02-space-center-and-buildings.md:** the Tracking Station building, which is part of Orbital's Mission Center.

---

## 4. Known problems and criticism

1. **KSP2 maneuver planning regressed** compared with KSP1 in the community's view. Problems included wrong burn times across staging, awkward radial corrections, and the fuel cap [S6][S8].
2. **Warp-under-thrust bugs.** Thrust was lost or rounded to zero for low-acceleration engines [S7].
3. **Orbit-line and landed-state bugs.** KSP2 0.2.2 still fixed orbit lines after decoupling or fairing separation [S9].
4. **KSP1 PAW clutter and fixed HUD positions.** In KSP2 the navball could not be moved [S10].
5. **Stock alarms came late in KSP1 (1.12) and KSP2 never had them.** I found no evidence of a KSP2 stock alarm clock; mods filled the role.
6. **Gated SAS confuses new players.** Probe-core levels are inconsistent across sources [S1].

---

## 5. Implications for Orbital

Orbital's flight HUD (SCREENS.md §1) has:
- a top-left time capsule with 8 warp segments;
- a dock rail on the left (Tracking, Orbit, Resources, Science, Maneuver, plus plugins);
- a vessel panel on the right;
- a navball module at bottom centre with 7 SAS modes;
- a staging column at bottom left;
- a map view with a switch to the Mission Center.

1. **Adopt: the KSP navball marker set exactly as it is,** including surface, orbit and target speed modes. It is a learned visual language, and the player base already knows it.
2. **Improve: thrust under warp, but deterministic.** Integrate thrust during on-rails warp with an adaptive step so low-thrust engines never round to zero (KSP2's bug [S7]). Show a "burning under warp" signpost, as KSP2 0.2.2 did [S9]. Expose the same thing to scripts.
3. **Improve: two-mode maneuver nodes.** Default to the impulsive (KSP1) preview because it is predictable. Offer a "finite-burn preview" toggle that draws the thrust-aware trajectory using per-stage acceleration through staging. Never cap planning at current fuel; warn instead with an over-budget colour [S6].
4. **Adopt: multiple chained nodes, numeric entry and a time-shift control** (the 1.7 Maneuver Mode feature set [S2]). The planned Δv editor's ±10 m/s steps should also take typed values and modifier-key fine steps.
5. **Adopt: a burn timer with countdown cues for both start and stop.** That fixes the stop gap players reported in KSP2 [S8]. Compute burn time per stage, matching the scripting guide's `burn(dv)` formula.
6. **Adopt: a stock alarm clock from the start,** as part of Mission Center "Upcoming". It should cover node, SOI change, Ap/Pe and transfer-window alarms, with warp-to on each. KSP1 needed a mod for ten years [S3][S11].
7. **Adopt: a transfer window and porkchop tool** (KSP1.12 Maneuver Creator and Transfer Window Planner [S3]) as a Mission Center panel. It fits the "players are scientists" goal.
8. **Improve: SAS gating that is legible.** If crew traits or probe tiers gate SAS modes, show locked modes greyed out with a tooltip saying "needs Pilot L2 or a better probe core". The sandbox setting turns gating off [S1].
9. **Improve: a docked Parts Manager instead of floating PAWs.** Orbital's vessel panel "Parts" tab is the right home for it, with a pinned mini-PAW for 1–2 parts during critical moments such as chute deploy. This avoids KSP1's clutter.
10. **Adopt: moveable and resizable HUD modules.** The dock-plugin system already allows it. Let the player drag the navball module and save layouts. Players complained that KSP2's was fixed [S10].
11. **Adopt: readout plugins as first-class stock panels** (KER-style suicide-burn altitude, impact time, TWR). Let mods register panels through the dock API. KER and MechJeb show that the demand is large [S16].
12. **Improve: autopilot through scripting, with an "assist" tier.** Orbital's QuickJS scripts are kOS-like. Ship stock example scripts for ascent, circularise and land, so players get MechJeb-style help that they can read and edit. That supports "feel like an engineer".
13. **Adopt: a flight report and notification feed** that records stage events, part loss, overheating and chute failure (KSP2 0.2.2 [S9]). Feed it into the Mission Center flight log and the crew records.
14. **Adopt: revert and quicksave with frequent autosaves.** Make revert a difficulty setting for career. KSP2 added autosave points late [S9]; Orbital should have them from the start.
15. **Avoid: hard warp altitude tables hidden from the player.** Show the reason when warp is blocked (for example "atmosphere below 70 km", "under acceleration"). KSP2 added such notices only in 0.2.2 [S9].

---

## Sources

- [S1] SAS/skill rules — KSP Wiki "Skill" page and KSP forum threads (95889, 187430), https://wiki.kerbalspaceprogram.com/wiki/Skill — checked 2026-10-17. From search excerpts. The sources disagree on probe levels, so treat those as approximate.
- [S2] "Kerbal 1.7 Room to Maneuver is now available" (official), https://kerbalspaceprogram.com/news/1-7-room-to-maneuver-release, plus KSP Wiki 1.7 (https://wiki.kerbalspaceprogram.com/wiki/1.7) and forum thread 183899 — checked 2026-10-17. Official plus community.
- [S3] "Kerbal Space Program 1.12: On Final Approach is now available" — KSP forum 203227, https://forum.kerbalspaceprogram.com/topic/203227-kerbal-space-program-112-on-final-approach-is-now-available — checked 2026-10-17. Official release notes, from search excerpts.
- [S4] KSP API docs "TimeWarp" (https://kerbalspaceprogram.com/ksp/api/class_time_warp.html) and "Time Control" mod thread (https://forum.kerbalspaceprogram.com/topic/143763-112-time-control-211) — checked 2026-10-17. The warp-rate list is standard KSP1 knowledge; the altitude limits were not verified.
- [S5] 0.1.2.0 — kerbal.wiki, https://kerbal.wiki/0.1.2.0 — checked 2026-10-17. A transcription of the official KSP2 patch notes (12 April 2023). Reliable.
- [S6] "Planned manoeuvres do not go as planned" — KSP forum 216534 (developer reply), https://forum.kerbalspaceprogram.com/topic/216534-planned-manoeuvres-do-not-go-as-planned — checked 2026-10-17. Developer statement, from search excerpts.
- [S7] "Acceleration during time warp doesn't work" (218717) and "KSP2 EA about the warp" (211470) — KSP forum, https://forum.kerbalspaceprogram.com/topic/218717-acceleration-during-time-warp-doesnt-work — checked 2026-10-17. Community reports. Anecdotal but consistent.
- [S8] KSP2 maneuver-node critique threads (222273, 219842, 223815 "One year of KSP2") — KSP forum, https://forum.kerbalspaceprogram.com/topic/222273-the-way-that-maneuver-nodes-seemingly-work-is-quite-silly — checked 2026-10-17. Community opinion.
- [S9] 0.2.2.0 — kerbal.wiki, https://kerbal.wiki/0.2.2.0 — checked 2026-10-17. The final KSP2 patch (11 June 2024). Reliable transcription.
- [S10] KSP2 Steam discussion on the UI, https://steamcommunity.com/app/954850/discussions/0/3772365358797995618 — checked 2026-10-17. Player opinion.
- [S11] "Kerbal Alarm Clock" forum thread (TriggerAu), https://forum.kerbalspaceprogram.com/topic/22809-112x-kerbal-alarm-clock-v31300-april-10 — checked 2026-10-17. Mod author thread.
- [S12] Maneuver Node Controller (https://spacedock.info/mod/3270/Maneuver%20Node%20Controller) and Flight Plan (https://spacedock.info/mod/3359/Flight%20Plan) — SpaceDock — checked 2026-10-17. Mod pages.
- [S13] Redux: New features — kerbal.wiki, https://kerbal.wiki/Redux:New_features — and the K2-D2 Redux listing, https://spacedock.info/mod/4508 — checked 2026-10-17. A community fan project; not stock.
- [S14] Kerbal Space Program 2 — Wikipedia, https://en.wikipedia.org/wiki/Kerbal_Space_Program_2 — checked 2026-10-17. Secondary source; timeline.
- [S15] "KSP 1.6: To Vee or not To Vee" (official), https://kerbalspaceprogram.com/news/1-6-to-vee-or-not-to-vee-is-now-available — checked 2026-10-17. Official.
- [S16] PCGamesN "Best KSP mods" (https://www.pcgamesn.com/kerbal-space-program/ksp-mods) and RP-1 wiki "Extra Mods to Consider" (https://github.com/KSP-RO/RP-1/wiki/Extra-Mods-to-Consider) — checked 2026-10-17. Secondary mod descriptions.
- [S17] "KSP2 v0.1.1.0 Patch Notes" (official), https://kerbalspaceprogram.com/news/ksp2-v0-1-1-0-patch-notes — checked 2026-10-17 (the page returned 404 on fetch; content from search excerpts and forum mirror 215108). Official.
