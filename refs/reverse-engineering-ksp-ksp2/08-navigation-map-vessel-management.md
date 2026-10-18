# 08 — Navigation, map view and vessel management (KSP1, DLCs, KSP2)

Research written 2026-10-18 for the public-release plan of Space Orbital Program. Public sources only; no game files were downloaded or inspected. Tags: **[KSP1]**, **[KSP1 DLC]** (Making History / Breaking Ground), **[KSP2]**, **[KSP2 — announced, never shipped]**, **[Mod: name]**. Items marked *(unverified)* come from memory, a single forum post, or a search excerpt of a page that blocked fetching (the official KSP wiki and forum both refused automated access this session). Every one of them is listed again in **Needs verification** at the end, with the URL that should confirm it.

This doc **adds depth** to, and does not repeat:
- `04-flight-hud-and-panel-layout.md` §4: conic patch settings, KSP2 map fixes by patch, art-director complaints;
- `../reverse-engineering-ksp2/04-flight-and-controls.md` §1.5–1.7: KSP2 thrust-aware nodes, the burn timer, the rendezvous flow;
- `01-time-scenes-and-persistence.md`: warp, on-rails vessels, the Tracking Station as a scene.

---

## 0. Findings in brief

1. **The KSP map is a planning tool gated by progression.** At Tracking Station level 1 you see only your current orbit. Level 2 adds patched conics (future SOI patches), and level 2 for *both* the Tracking Station and Mission Control unlocks maneuver nodes [S4][S5]. Level 3 shows asteroids and untracked objects [S4][S13] and, from 1.12, the Maneuver Tool [S2]. Sandbox has everything unlocked.
2. **Node editing took KSP1 seven years to get right.** It started with a 6-handle gizmo (since 0.21 *(still unverified)*). "Orbit ±" buttons followed in 0.23.5, numeric Maneuver Mode in 1.7 (2019), more precision in 1.8, and dragging across conic patches only in 1.12.2 (2021) [S1][S3]. Mods (Precise Node, Maneuver Node Evolved, MechJeb) filled every gap first [S25].
3. **KSP1 1.12 made the mods stock.** The Alarm Clock covered Kerbal Alarm Clock and the Maneuver Tool covered Transfer Window Planner. Both shipped with bugs for weeks: alarms fired on creation, alarms got stuck, transfer dates were unreliable [S1][S2][S6].
4. **KSP2 regressed on planning and recovered only part of it.** Players called the gizmo imprecise and the burn timer misleading across staging. There was no stock alarm clock and no numeric node editor. The VAB trip planner was criticised as narrow [S19][S21][S22][S28]. The map's *look* got many fixes (0.1.1–0.2.2); the planning *tools* did not.
5. **Vessel management is a hidden system that players notice only when it breaks.** It covers vessel naming by part priority, the nine vessel types with a merge hierarchy, debris limits, distance-scaled recovery value, `[`/`]` switching within physics range, and Fly/Recover/Terminate in the Tracking Station [S8][S9][S11][S12].
6. **For us:** the must-haves at launch are a readable map with Ap/Pe/AN/DN/closest-approach markers, a numeric node editor alongside the gizmo, warp-to-anything, an alarm list and a vessel list with type filters. Defer, at least at first, a stock trajectory-in-atmosphere predictor and a launch-window planner (§9).

---

## 1. Map view

### 1.1 What is drawn [KSP1]

| Element | Behaviour | Source |
|---|---|---|
| Current orbit | One Kepler conic per SOI (patched conics). The active vessel's line is brightest, and a fade/trail shows the direction of travel; a KSP2 player later held this up as easier to read than KSP2's lines | [S20], colours *(still unverified)* |
| Future patches | Drawn in different colours per patch (escape, encounter, return). Their number is set by `CONIC_PATCH_LIMIT` in `settings.cfg` and how they are drawn by `CONIC_PATCH_DRAW_MODE`; see 04 §4.1 | [S36] |
| Planned (maneuver) trajectory | A separate dashed/coloured line from the node onward, with its own Ap/Pe and encounter markers. 1.12 fixed future-patch Ap/Pe markers not lining up with their conics | [S1], colour *(still unverified)* |
| Ap / Pe markers | Hover shows altitude and time-to; click pins the label. Pinned labels persist across map visits from 1.8 | [S1] |
| AN / DN | Shown relative to the **target's** plane when a target is set (otherwise relative to the equator *(still unverified)*), with the relative inclination in degrees | *(still unverified)* |
| SOI encounter / escape | Markers where the trajectory enters or leaves an SOI. KSP1 used colour-coded split arrowheads (white/amber/violet), which a KSP2 player cited as clearer than KSP2's design | [S20] |
| Closest approach | "Intercept 1" and "Intercept 2" marker pairs (one on your path, one on the target's) with separation and time. A 1.6 fix corrected the closest-approach orbit for partially executed nodes | [S1], labels *(still unverified)* |
| Behind-body markers | 1.4.4 made map nodes look different behind a celestial body; 1.4.5 made their transparency configurable | [S1] |
| Launch sites | Added to the map and its filter in 1.4.1 (Making History era) | [S1] |
| Contract and Breaking Ground markers | Contract orbits and waypoints; deployed science gets map nodes from 1.7.3 even without a Control Station | [S1][S32] |
| Body info | Clicking a body opens info (radius, gravity, atmosphere, SOI). The "Info" panel in the Tracking Station also lists science and resources (1.10 fixed resources missing in one scenario) | [S1], content *(still unverified)* |

### 1.2 Controls [KSP1]

| Action | Default | Notes |
|---|---|---|
| Toggle map | `M` | [S29] |
| Cycle focus forward / back | `Tab` / `Shift+Tab` | cycles bodies and vessels [S29] |
| Reset focus to active vessel | `Backspace` | [S29] |
| Focus on an object | double-click its icon, or right-click → Focus View | double-click behaviour *(still unverified)* [S29] |
| Orbit the camera / zoom | right-drag / scroll wheel | |
| Context menu on a vessel icon | Switch To, Set as Target, Focus View | [S12] |
| Navball in map | collapsible via a tab at the bottom; visible by default from 1.3.1 | [S1][S37] |
| Staging and docking UI in map | from 1.8 | [S1] |
| Set position cheat | middle-click (1.12, debug only) | [S1] |
| Ship commands in map | by default most flight keys are off; throttle cut works | [S37] |

**Vessel icon filters.** A row of type toggles (debris, probe, rover, lander, ship, station, base, plane, relay, EVA, flag, space object/asteroid, launch sites) hides icons and orbits per type *(exact list still unverified)*. There is no per-vessel hide in stock. Players hid contract satellites by changing their type to an unused one such as "Base" and switching that filter off [S32]. **[Mod: Haystack]** adds a searchable vessel list and per-vessel hiding [S41].

**Time warp from the map.** The warp control stays live. From an Ap/Pe marker, maneuver node or SOI marker you can **warp to** that point; a "Warp To" action on the orbit context menu dates from 1.0 *(verified 2026-10-18: [S43])* (exact marker-menu wording *(still unverified)*). 1.8 put a "Warp to node" button on the Δv readout [S1]. 1.11 extended Warp to Sunrise to the Tracking Station [S1].

**Ground track.** Stock KSP1 has **no ground track** and no impact-point prediction. It also has no trajectory with drag, so the stock trajectory ignores atmosphere until you are in it. Mods fill the gap: **[Mod: Trajectories]** draws the drag-affected path and predicted impact, assuming a prograde attitude by default [S24], and **[Mod: MechJeb]** has a landing predictor and ground track *(still unverified)* [S40].

### 1.3 Map in KSP2

| Topic | What shipped | Source |
|---|---|---|
| Look | Stylised 3D map; orbit lines take the trajectory colour, and markers inherit the colour of their trajectory (0.2.0) | [S18] |
| Iconography | 0.1.1 reworked orbital markers, trajectory colours, the gizmo, the focus item and the "scrub handle"; added a hovered/pinned indicator | [S16] |
| Overlap | 0.1.1 stopped intercept nodes overlapping; 0.1.2 improved click targets on overlapping objects | [S16], 04 §4.2 |
| SOI markers | "Enter/Exit SOI" renamed to "Encountering / Leaving *body*" (0.2.0); the body name now shows on every Ap/Pe marker | [S18] |
| Ap/Pe on maneuver trajectories inside SOIs | 0.2.0 | [S18] |
| Toggles | Some 3D map elements and the navball could be toggled (0.1.3) | [S17] |
| Notifications | Inactive vessel entering a new SOI (0.1.1) | [S16] |
| "Time warp to point" | Context option on markers; 0.2.0 removed it from *planned* trajectories, where it made no sense | [S18] |
| Map info panel | Buttons and flight info for the focused object; fixed for EVA kerbals in 0.2.0 | [S18] |

**KSP2 complaints, beyond the art director's list in 04 §4.2:**
- The direction of travel is not obvious when you focus a target body [S20].
- Orbit info disappears while you drag a node; the developers acknowledged this in early 2023 [S21].
- No snapping of nodes to Ap/Pe/AN/DN, which players asked for [S21].
- Node Δv appeared to double after pause/unpause [S21].

---

## 2. Maneuver nodes

### 2.1 KSP1 node lifecycle

| Step | KSP1 behaviour | Version / source |
|---|---|---|
| Unlock | Career: Tracking Station L2 **and** Mission Control L2. A controllable vessel is also needed: a pilot, or a probe core with a CommNet link if CommNet is on | [S4][S5] |
| Create | Click the orbit line (or a future patch) → "Add maneuver". Not possible for uncontrolled vessels or EVA kerbals since 1.3.1 | [S1] |
| Gizmo | Six handles: prograde/retrograde **green** (prograde sometimes described as yellow-green), normal/anti-normal **purple**, radial in/out **blue/cyan** | [S30] |
| Drag sensitivity | Hold a handle and the Δv rate grows with how far you pull it from the centre *(still unverified)*. A "tool sensitivity" setting exists; 1.10 fixed negative handles flipping after changing it | 04 §4.1, [S1] |
| Scroll-wheel fine adjust | Scroll while hovering a handle adds or removes small increments *(still unverified)*. 1.8 fixed the wheel direction in the Maneuver Mode editor | [S1] |
| Move along orbit | Drag the node's centre along the line. "Orbit +/−" buttons (since 0.23.5) jump the node a whole orbit later or earlier | [S3 excerpt][S31] |
| Frame bug | The handles align to the *post*-burn orbit while Δv is applied in the *pre*-burn frame, so dragging one handle shifts others; this was a long-running complaint | [S21] (bug #3953) |
| Across patches | Nodes can sit on future patches (fixes in 1.9.1). Dragging a node *between* patches works only from 1.12.2, with the camera refocusing | [S1][S2] |
| Nodes in the past | 1.12.2 lets you drag a past node forward again | [S1] |
| Multiple nodes | Allowed; each node plans on the orbit produced by the previous one, and the navball shows only the first node's Δv *(verified 2026-10-18: [S44])*. Deleting an earlier node deletes or re-bases later ones *(still unverified)* | |
| Delete | Right-click the node centre, then the red ✕; a passed node opens straight in delete mode. In our build `Delete` | *(verified 2026-10-18: [S44])* |

### 2.2 Maneuver Mode (1.7, "Room to Maneuver", 10 Apr 2019) [KSP1]

- A third flight UI mode (beside Staging and Docking), on the left in place of the staging stack. It holds an **orbital-info panel** (Ap, Pe, inclination, period, etc.) and an **advanced maneuver editor** [S3].
- The editor has numeric fields per axis (prograde, normal, radial) with ± buttons, a chosen increment, and a time field to shift the node in time [S3]. 1.8 increased editing precision and fixed input rounding [S1]. The exact increment steps were not found *(still unverified)*.
- Tabs switch between several nodes; a 1.7.3 fix touched these tabs [S1].
- Players found the "+1 orbit" control clunky. One reported that every other click closed the node and forced a reselect [S31]. They also wanted a selector reading "Current orbit / After maneuver 1…" [S31].
- Mod prior art it replaced: **[Mod: Precise Node / Precise Maneuver]** (typed Δv per axis, time ± presets, conic patch settings) and **[Mod: Maneuver Node Evolved]** (increments 0.01–100 m/s, a "next patch" jump to an encounter's midpoint) [S25].

### 2.3 Δv, burn time and execution [KSP1]

| Feature | Detail | Source |
|---|---|---|
| Node Δv | Total Δv of the node, with the remaining Δv counting down during the burn | |
| Burn time estimate | From 1.5: correct burn time, stage info, and a **warning when the current stage or vessel lacks the Δv**. Docking-port staging changes in flight update it. KSPedia gained a "Burn Time Indicator" page | [S1] |
| Burn indicator | Shows "Start burn in" and duration. Optimised in 1.6; fixed flashing in 1.6 | [S1] |
| Navball marker | A blue maneuver marker; SAS has a Maneuver hold mode; 1.12.2 fixed the "blurry blue maneuver arrow" at low texture quality | [S1] |
| Warp to node | Auto-warp stops a **configurable margin before burn start** (setting from 1.6). 1.8 added a "Warp to node" button on the Δv readout | [S1] |
| Execution | **Manual only in stock.** The player points at the marker (or uses SAS Maneuver) and throttles. **[Mod: MechJeb]** "Execute next node" and kOS scripts automate it | [S40] |
| Ghost markers | 1.11: faded markers on the navball for targets behind you | [S1][S2] |

### 2.4 KSP2 nodes (adds to sibling §1.5)

- **Thrust-aware prediction.** Planned Δv was capped at the fuel on board (0.1.2), then 0.2.2 allowed nodes at 0 Δv.
- **Burn timer.** LED countdown lights plus alert and end sounds (0.1.1). Before 0.1.1 the burn duration showed 0 until burn start, and the ETA could not show days [S16].
- **No numeric editor in stock**; **[Mod: Maneuver Node Controller]** and **[Mod: Flight Plan]** filled it.
- **No auto-execute in stock.** **[Mod: K2-D2]** autopilot did it.
- Players also reported a **gizmo usable while paused** (fixed 0.2.0) [S18]. They found dragging too coarse to set an 80×80 km orbit, and the burn timer wrong across staging because it uses current max acceleration [S21].
- 0.1.3 references a **"trip planner"**: a VAB tool where you pick a destination and one-way or round trip and see how far each stage reaches [S17][S22]. Players found it rigid. It always runs surface-to-surface and cannot start from orbit around another body [S22].

### 2.5 Gap table: what mods add over stock

| Need | KSP1 stock | KSP2 stock | Mod that filled it |
|---|---|---|---|
| Type exact Δv | 1.7+ | no | Precise Node, MNC (KSP2) |
| Snap node to Ap/Pe/AN/DN | no | no | MechJeb, Precise Node *(still unverified)* |
| Circularise / change Ap/Pe / match planes with one click | no | no | MechJeb maneuver planner |
| Hohmann to target / fine-tune closest approach | 1.12 Maneuver Tool (bodies only) | no | MechJeb, Transfer Window Planner |
| Auto-execute | no | no | MechJeb, kOS, K2-D2 |
| Porkchop / launch windows | 1.12 (Maneuver Tool, TS L3) | no | Transfer Window Planner [S38] |
| Aerobraking / impact prediction | no | no | Trajectories [S24] |

---

## 3. Targeting and rendezvous

| Feature | KSP1 | KSP2 |
|---|---|---|
| Set target | Map: click the icon → Set as Target. Flight: double-click or right-click a vessel/part; on a docking port → "Set as target" targets that **port** | Same model; the 0.1.3 "Velocity tab 'Target'" text implies a target mode on the navball speed display [S17] |
| Target bodies | Yes (needed for SOI encounter planning and AN/DN) | Yes |
| Waypoints as targets | No (contract waypoints cannot be targeted; see §4.4) [S23] | — |
| Closest approach | Two marker pairs (Intercept 1, 2) with distance and time; a 1.6 fix made the burn bar and orbit update on target change [S1] | Intercept markers; overlap fixed in 0.1.1; wrong positions during warp fixed [S16] |
| Relative velocity | Navball speed display switches to **Target** mode (click it to cycle Orbit/Surface/Target); shows closing speed | Velocity tab with Target |
| Navball markers | Target / anti-target (magenta), plus prograde/retrograde relative to the target in target mode; ghosted when behind you (1.11) [S1] | Same set |
| SAS | Target / anti-target hold modes: pilot level 3 or a top-tier probe core (HECS2, RC-001S, RC-L01, MK2 Drone, MPO) *(verified 2026-10-18: [S45])* | Same |
| Docking mode | A separate UI mode: WASD/QE translate (RCS) instead of rotate, and a lin/rot toggle. Its little indicator panel is often reported as nearly empty [S26] | Docking-mode toggle reported to give no visible indicator; RCS translation would not work with global RCS off [S26] |
| Port alignment | No stock alignment display. Players use **Locked** camera plus "Control from here" on the port [S7]. 1.12 revamped ports with **limited rotation** to align after contact [S2] | — |
| Reacquire range | Magnetic capture range per port *(values still unverified)* | 0.1.1 "tuned docking reacquisition ranges" [S16] |
| Mods | **[Mod: Docking Port Alignment Indicator]** (crosshair with lateral offset, roll, closing speed); **[Mod: Navball Docking Alignment Indicator]**; MechJeb docking autopilot [S26] | DPAI-style mods existed for KSP2 [S26] |

**The stock rendezvous loop, as players actually run it.** (1) Set the target. (2) Match planes at AN/DN using the relative inclination readout. (3) Burn a phasing or Hohmann node, dragging until the Intercept markers show under ~5 km *(rule of thumb, still unverified)*. (4) Warp to closest approach. (5) Switch the navball to Target mode and burn retrograde-relative until the closing speed is about 0. (6) Point at target, close in, then RCS in docking mode. The design lesson: each step depends on one specific readout (relative inclination, intercept distance, relative speed). If any one is missing, the loop breaks.

---

## 4. Navigation aids

### 4.1 Δv readouts [KSP1 1.6+]

- **Editor:** per-stage Δv, TWR, burn time and ISP, with a **situation** selector: a reference body, an altitude (sea level, a custom altitude, or vacuum) [S34]. The API's situation names are "current altitude", "sea level", "vacuum" [S34].
- **Flight:** per-stage Δv next to the staging stack, adjusted automatically to the current situation [S34]. Totals sit at the bottom with a "Warp to node" button (1.8) [S1].
- **Accuracy history:** fixes for asparagus staging, engine plates, docking ports and boosters (1.6–1.12); double precision from 1.11 [S1]. These are a reminder that staged Δv simulation is the bug magnet.
- **[KSP2]:** a Δv readout per stage in the VAB and flight, plus the **trip planner** (§2.4) [S22].

### 4.2 Δv map

Stock KSP1 has no interactive Δv map. KSPedia carries reference slides (planets, burn time, maneuvers), and a community Δv subway map is the de facto tool; KSPedia's own Δv map content is *(still unverified)* [S39]. Web tools such as the **KSP Visual Calculator** let you click destinations and sum the Δv [S22]. **[KSP2]** folds this into the trip planner.

### 4.3 Alarms and launch windows

| | KSP1 stock (1.12+) | [Mod: Kerbal Alarm Clock] (KSP1) | KSP2 |
|---|---|---|---|
| Raw / manual time | yes (date or "in X time"); vessel link optional (fixed 1.12.2) [S1][S2] | yes [S27] | none in stock; community "Alarm Clock" mod [S28] |
| Maneuver node | yes; margin before the node; fixes for stuck and false-firing alarms in 1.12.2 [S1] | yes | mod |
| Ap / Pe | yes ("various orbital positions") [S2][S6] | yes, plus AN/DN | mod |
| SOI change | yes [S6] | yes | notification only (0.1.1) [S16] |
| Transfer window | yes, via the Maneuver Tool. It needs a vessel with a node for transfer alarms [S28 bug]. Players reported unreliable dates (Eve→Kerbin same as Kerbin→Eve) [S6] | yes, several modes [S27] | mod |
| Contract deadline | *(still unverified)* | yes | — |
| Closest approach, launch rendezvous, crew, science | no *(still unverified)* | yes (API lists transfer, transfer-modelled, closest approach, launch rendezvous…) [S27] | — |
| Warp behaviour | the alarm halts warp *(halt vs pause options still unverified)* | kill warp / pause / message only | mod: alarms interrupt warp [S28] |
| UI | App in the toolbar plus a "next alarm" widget; 1.12.2 fixed detail-pane cutoff and map rotating under the app [S1] | Window with a list, plus an icon showing time-to-next | — |

**Known failures to design against:** background vessels' Ap/Pe alarms were missed during warp while the active vessel's SOI alarm fired [S6]. Alarms fired on creation [S1]. Transfer windows must account for the transfer time ("leave half a transfer before conjunction") [S6].

**Maneuver Tool [KSP1 1.12].** It needs Tracking Station level 3 [S2]. It lists upcoming transfer windows to other bodies with their Δv and creates the transfer node [S2]. It is hidden in Scenarios and Training (1.12.2) [S1]. Bugs on day one included recomputing when the same body was reselected and same-SOI inclined transfers [S1]. **[KSP2]** had no equivalent.

### 4.4 Waypoints and surface navigation

- **Contract waypoints [KSP1]** appear on the map and the surface. Right-click → **Activate Navigation** puts a marker (four inward blue arrows) on the navball; one waypoint is active at a time [S23].
- **Limits:** the navball marker can sit below the horizon at long range; it is useless for landers without a forward-facing control point; contract areas cannot be targets [S23].
- **Custom waypoints** are not stock in KSP1 *(still unverified)*; **[Mod: Waypoint Manager]** adds them (surface only) [S23].
- **Science regions [KSP2 0.2]** are drawn on the map. Our build already has a science-region overlay (plan 192).
- **Distance and heading** to a waypoint are only in mods (Waypoint Manager, Kerbal Engineer) *(still unverified)*.

---

## 5. Tracking Station

### 5.1 KSP1

| Topic | Detail | Source |
|---|---|---|
| Scene | Its own KSC building; a full-system map with the clock running; warp available (Warp to Sunrise from 1.11) | [S1] |
| Upgrade L1 | Orbits only (no patched conics); no object-count limit is listed; tracking unknown objects (asteroids, comets) needs level 3 *(corrected 2026-10-18: [S46])* | [S4] |
| Upgrade L2 | Patched conics; maneuver nodes too, if Mission Control is also L2 | [S4][S5] |
| Upgrade L3 | Asteroids and comets (untracked objects); Maneuver Tool (1.12) | [S4][S13][S2] |
| Vessel list | Grouped by type with tab headings (localised fixes in 1.10). Each row shows name, situation and body. A "Last seen" line exists for untracked objects | [S1] |
| Filters | Type toggles shared with the map. Disabling a type hides it in the map too. A comet/asteroid filter was fixed in 1.11 | [S1][S32] |
| Actions | **Fly** (switch into flight with that vessel), **Recover** (landed/splashed vessels; refund per §6.4), **Terminate** (deletes; confirmation dialog) | [S11], wording *(verified 2026-10-18: [S46])* |
| Recovery elsewhere | Landed vessels on other bodies cannot be recovered in KSP1, only terminated *(verified 2026-10-18: [S46, S47])* |
| Deployed science | Terminating a Breaking Ground Control Station stops the experiments (fixed in 1.7.3) | [S1] [KSP1 DLC] |
| Asteroids / comets | Untracked objects appear as "unknown object" with a class (A–E for asteroids). **Start/Stop tracking** turns them into tracked objects with orbits. An untracked object disappears after a lifetime. Classes A (≤3 m) to E (≥30 m) *(verified 2026-10-18: [S48])*; the buttons are **Track** and **Untrack**, not Start/Stop tracking *(corrected 2026-10-18: [S46])* | [S13] |
| SENTINEL telescope | Part (Asteroid Day/1.1+): must orbit the Sun outside any planet's SOI on an orbit inside the planet it watches. Start it with "Start Object Tracking" in its PAW. It finds asteroids over time in the background. 1.10 fixed lifetimes of Sentinel-found asteroids. Players reported it finds comets poorly | [S13][S1] |

### 5.2 KSP2

- A Tracking Station with an **object picker** list, a **celestial body information panel** and an **info panel** with actions [S16][S17].
- Fixes on the way: 0.1.1 fixed **Destroy** not working, a missing physical-characteristics section, and every body labelled "terrestrial". 0.1.2 fixed filters and added Return to KSC. 0.1.3 fixed a stuck parent body after destroy [S16][S17].
- 0.2.0 added **"control" and "focus"** buttons for kerbals to match vessels. Vessels landed on bodies other than Kerbin became recoverable from the Info Panel, so **KSP2 allows off-Kerbin recovery** where KSP1 did not [S18] (KSP1 side *(verified 2026-10-18: [S46, S47])*).
- No asteroids, comets or Sentinel equivalent shipped. **[KSP2 — announced, never shipped]**: colonies, orbital construction and interstellar would have added more object types to track *(per the sibling doc 11)*.

---

## 6. Vessel management in flight

### 6.1 Switching vessels

| Method | KSP1 | Notes |
|---|---|---|
| `[` / `]` | Cycle through vessels **loaded within physics range** (~2.5 km in stock; one mod author measured about 2.3 km to join and 2.6 km to leave) [S12] | From 1.9 the default keys skip debris and space objects; holding the modifier includes them [S1] |
| Map → click icon → **Switch To** | Any vessel, any range; overlapping icons make picking hard [S12] | 1.4.3 fixed lost data when switching to an unloaded vessel via the map [S1] |
| Tracking Station → Fly | Any vessel | Leaves flight through a scene change |
| Space Center → click a pad/runway | Goes to the vessel sitting there; 1.4.3 stopped this clearing the pad until launch is confirmed [S1] | |
| Camera | 1.10 improved camera placement on switch [S1]; KSP2 0.1.3 fixed the camera drifting from decoupled vehicles [S17] | |
| [Mod: Haystack] | Searchable list for switching at any range [S12][S41] | |

**Control from here.** A PAW action on command parts and docking ports. It sets the reference for the navball, SAS and "up" in Locked camera [S7]. It is essential for docking and for rovers with sideways cockpits.

### 6.2 Naming and types

- **Vessel types [KSP1]:** Debris, Probe, Rover, Lander, Ship, Station, Base, Plane, Relay [S8]. EVA, Flag, SpaceObject (asteroid/comet) and DeployedScienceController exist as internal/list categories *(still unverified as player-facing types)*. The wiki confirms nine player types including Debris, with the hierarchy Base > Station > Ship > Plane > Lander > Rover > Relay > Probe > Debris *(verified 2026-10-18: [S49])*.
- **Merge hierarchy** when craft dock: Base > Station > Ship > Plane > Lander > Rover > Relay > Probe > Debris [S8].
- **Default type** comes from the command part (Ship, Lander, Rover, Probe, Plane or Relay) [S8]. It can be changed in flight through **Rename Vessel** or the "i" info panel in Map view *(verified 2026-10-18: [S49])* (dialog layout *(still unverified)*). 1.8 fixed an overlapping "vessel type info" window [S1].
- **Part-level naming (1.4.1):** each command part can carry a name, a type and a **priority** (default 10, max 20) [S9][S10]. On dock, undock and staging the game re-evaluates. The highest-priority named part wins, so docked stations keep the station's name [S9]. Players report the priority cannot be changed in flight [S10].
- **New vessels from separation:** decoupled stages with no command part become **Debris**, named "<parent craft name> Debris" *(verified 2026-10-18: [S47])*. Undocking re-runs the naming logic [S9]. 1.7.3 turned same-vessel docking connections into real docks on undock [S1].
- **[KSP2]:** a 0.1.3 fix stopped stage numbering reversing after switching between decoupled vehicles. Undocking bugs (wheels/wings destroying the vessel, struts not releasing) ran through 0.1.3 [S17].

### 6.3 Debris

- **Settings:** "Max Persistent Debris" caps how many debris objects are kept (oldest removed); default 250, range 0 to unlimited *(verified 2026-10-18: [S50])*. "Tidy up debris cluttering KSC" is a separate option [S35].
- Debris that lands on Kerbin and is later cleaned up counts as **recovered**, not destroyed. Debris inside physics range can be recovered for funds from the Tracking Station [S11][S35].
- Unloaded vessels below a pressure/altitude threshold in an atmosphere are deleted (see 01 §5.2).

### 6.4 Recovery

| Rule | Value | Source |
|---|---|---|
| On the launch pad or runway | 100 % refund of parts and resources | [S11] |
| On KSC grounds | 98 % | [S11] *(verified 2026-10-18: [S51])* |
| Elsewhere on Kerbin | about `0.98 − distance_km / 2150`, so roughly 10 % on the far side. Remaining resources are refunded at full cost; an Administration strategy can change the fraction | [S11] *(verified 2026-10-18: [S51])* |
| Crew | Recovered kerbals return to the Astronaut Complex; with science, and with recovery-contract credit | [S11], 1.4.3 contract fixes [S1] |
| Science | Carried data and experiments are credited on recovery (Recovery report dialog; 1.7.2 cutoff fix) | [S1] |
| "Recover Vessel" button | In flight, beside the altitude tape, when the vessel is **landed or splashed on Kerbin** and has come to rest (not moving, not airborne); the button appears when hovering the altimeter *(verified 2026-10-18: [S51])*. Debris and EVA kerbals qualify too; a command part is not required. Also in the Tracking Station | |
| DLC launch sites | Recovery near Woomerang/Desert counts their facilities (1.4.3 fix) | [S1] [KSP1 DLC] |
| Missions | In Making History missions, recovery is a difficulty setting, off by default (1.4.2) | [S1] [KSP1 DLC] |
| KSP2 | Recover via the Info Panel, including off-Kerbin (0.2.0); flight report revert options removed for recovered vessels | [S18] |

**Terminate** deletes a vessel, and any crew aboard are lost (listed as "lost" in the Astronaut Complex); Terminate is disabled when recovery is possible *(verified 2026-10-18: [S46, S47])*. In KSP2 the equivalent is **Destroy**, broken until 0.1.1 [S16].

---

## 7. Launch sites

| Site | Game | Notes | Source |
|---|---|---|---|
| KSC Launch Pad, Runway | [KSP1] | Defaults: the VAB launches to the pad, the SPH to the runway | |
| Woomerang Launch Site | [KSP1] (1.4.1), DLC-gated | A pad/ramp and a water tower, about 475 km from the nearest tracking station; its own biome | [S14] |
| Desert ("Dessert") Launch Site + Airfield | [KSP1] (1.4.3), DLC-gated | A pad plus a ~1.75 km runway; "Dessert" is the in-game spelling | [S14][S1] |
| Mission Builder sites | [KSP1 DLC] | Placeable launch pads, including on water; sites usable as targets for crashed/landed nodes | [S1] |
| Easter-egg sites | [KSP1] 1.12 | Hidden sites, with an EVA-ladder fix in 1.12.2 | [S1] |
| Selection | [KSP1] | Enable **"Allow other launch sites"** in Difficulty Settings, then use the dropdown arrow beside the editor's Launch button [S14]. 1.6 made stock and mobile sites navigable in all modes; MH sites earn Points of Interest bonuses in career [S1] | |
| Island Airfield | [KSP1] | An abandoned airfield ~32 km ESE of KSC; a launch site for SPH craft when "Allow other launch sites" (Making History) is on *(corrected 2026-10-18: [S52])* | |
| KSC (KSP2) | [KSP2] | **4 launch pads, 2 runways, plus a "Boat Launch"** water site [S15]. The VAB picks the site with a launchpad-selection button, and 0.1.3 added a stock-vessel filter to the launchpad menu [S16][S17]. A stock plane defaulting to Launchpad 1 was reported as a bug [S33] | |
| Off-world launch sites | [KSP2 — announced, never shipped] | Launching from colonies and orbital VABs | sibling doc 11 |

---

## 8. Camera modes

| Mode | "Up" reference / behaviour | Use | Source |
|---|---|---|---|
| **Auto** | Picks Free near the surface and Orbital once high (Kerbin threshold quoted around a 23 km periapsis, flagged on the wiki itself) | Default | [S7] |
| **Free** | The body is at the bottom of the screen and up points away from it | Planes, landing | [S7] |
| **Orbital** | Up points to the orbited body's north pole, like map view | Orbit work | [S7] |
| **Chase** | Follows the surface prograde horizontally, with the ground at the bottom | Atmospheric flight | [S7] |
| **Locked** | Rotates with the craft; up comes from the "Control from here" part | Docking, rovers | [S7][S26] |
| Cycle | `V` cycles the modes (added 0.17). The wiki lists Free, Orbital, Chase, Locked and Auto as `V` modes *(verified 2026-10-18: [S53])* | | [S7] |
| Focus a part | Mod-click / middle-click a part to centre the camera on it *(still unverified: not in the archived key table [S53])* | | |
| Map camera | Orbits the focused object; Tab/Backspace as in §1.2 | | |
| [KSP2] | Camera modes renamed (players found the names unclear). Terrain collision added 0.1.1; Chase zoom persists | | [S16] (Steam thread in [S7]) |

1.9 added a camera mode when paused with the UI hidden [S1]. 1.10 fixed the camera mode being activated repeatedly [S1].

---

## 9. Implications for our game

Our build already has a map with maneuver nodes (`I/K, J/L, O/U` edits, `Delete`), a target panel, warp-to-node only, a Mission Center with "Warp to" for upcoming events, and a science-region overlay (05 §§3–6, plan 192). The tables below are options, not decisions.

### 9.1 Adopt / Improve / Avoid

| Area | Adopt | Improve | Avoid |
|---|---|---|---|
| Map markers | Ap, Pe, AN/DN (target-relative), SOI enter/leave with the body name, closest-approach pairs, hover-to-preview and click-to-pin | Markers take the trajectory colour (KSP2 0.2) **and** a direction-of-travel cue (fade or arrows, KSP1) | KSP2's oversized SOI bullseye; tangled label stems; markers overlapping with no declutter |
| Orbit depth | Patched conics | Expose the patch limit and draw mode in settings (stock KSP1 hid them in a cfg) | Hiding future patches behind a building upgrade without saying so in the UI |
| Node editing | The 6-handle gizmo **plus** a numeric editor from day one (our editor exists) | Align the handles to the **pre-burn** frame (fixes KSP1 bug #3953); snap to Ap/Pe/AN/DN/closest approach; ±1 orbit that doesn't lose the selection; drag across patches | KSP2's coarse drag with no numbers; orbit info vanishing while dragging |
| Burn info | Δv, burn time, start-burn-in, warning when the stage lacks Δv (KSP1 1.5) | Burn time across stages (KSP2 got this wrong); a stop countdown | Burn time from current max acceleration only |
| Warp | Warp to node with a margin setting (KSP1 1.6) | **Warp to any marker** (Ap/Pe/SOI/closest approach/alarm) from one context menu | Offering "warp to point" on planned trajectories (KSP2 0.2.0 removed it) |
| Alarms | List with raw, node, Ap/Pe, SOI and transfer types; halt warp | Alarms on **background** vessels that fire reliably (KSP1's failure) | Firing on creation; transfer alarms that need a node first |
| Planning helpers | Δv per stage with situation selector | One-click circularise / match planes / Hohmann to target (MechJeb's most-used features), as a **career unlock** | A rigid trip planner (KSP2) |
| Rendezvous | Target from map/flight/docking port; Target speed mode; Intercept markers | A docking alignment readout (DPAI-style) in our Dock panel | An empty docking indicator panel (KSP1/KSP2) |
| Tracking | A vessel list with type filters, Fly/Recover/Terminate | Search, per-vessel hide, sort by next event (Haystack/ManeuverQueue ideas) | Hiding contract junk only via type hacks |
| Vessel identity | Part-priority naming; type merge hierarchy | Let players edit priority in flight; show why a name was chosen | Debris names that all look the same |
| Recovery | Distance-scaled refund formula; crew and science credited | Show the expected refund *before* clicking | Silent recovery of debris with no notice |
| Switching | `[`/`]` in physics range skipping debris (KSP1 1.9) | A switcher list with distance and type | Map clicks unusable on overlapping icons |
| Launch sites | Pad and runway default by building | Choose the site in the hangar; extra sites as progression | Making sites a buried difficulty toggle |
| Camera | Auto/Free/Orbital/Chase/Locked | Name the modes by what they lock ("Horizon", "Orbit", "Vessel") | Unclear names (a KSP2 complaint) |

### 9.2 Launch checklist (navigation and vessel management)

**Must at public launch**
- [ ] Map: patched conics with Ap/Pe, AN/DN, SOI and closest-approach markers; hover and pin; direction cue; focus cycling (`Tab`/`Shift+Tab`/`Backspace`, double-click).
- [ ] Map filters by vessel type, plus hiding debris.
- [ ] Maneuver node: create on any patch, gizmo plus numeric editor, ±orbit, move along the orbit, multiple nodes, delete.
- [ ] Node readouts: Δv, burn time, time to node, stage-insufficient warning; navball maneuver marker; SAS maneuver hold.
- [ ] Warp to node, Ap, Pe and SOI change, with a margin.
- [ ] Targeting: vessels, bodies, docking ports; navball target/anti-target; Target speed mode; relative inclination.
- [ ] Vessel list (our Mission Center / tracking): type filters, Fly, Recover, Terminate, rename and change type.
- [ ] Switching: `[`/`]` in range, map Switch To, list switch; Control From Here.
- [ ] Recovery with a refund preview; crew and science credited.
- [ ] Debris cap setting.
- [ ] Δv per stage with situation (body, sea level/vacuum).
- [ ] Camera modes including Locked for docking.

**Should, first updates**
- [ ] Alarm list (raw, node, Ap/Pe, SOI) that halts warp and works for background vessels.
- [ ] Node snapping to markers; one-click circularise.
- [ ] Docking alignment readout.
- [ ] Contract waypoints with navball navigation and distance/bearing.
- [ ] Extra launch sites as progression.
- [ ] Settings for conic patch limit and draw mode.

**Later**
- [ ] Transfer-window planner and alarms (a porkchop view).
- [ ] Atmospheric trajectory and impact prediction; ground track.
- [ ] Custom waypoints.
- [ ] Node auto-execute (or leave it to our scripting panel, kOS-style).
- [ ] Asteroid/comet discovery with a telescope part.

---

## Needs verification

Each item should be checked in a real browser. The KSP wiki and forum blocked automated fetches this session.

| # | Claim | URL to confirm |
|---|---|---|
| V1 | KSP1 orbit line colours (active, planned, future patches), and that AN/DN default to the equator without a target | https://wiki.kerbalspaceprogram.com/wiki/Map_View — still unverified: archived Map view page has no colours or AN/DN default. |
| V2 | Closest-approach labels "Intercept 1/2" and their shown values | https://wiki.kerbalspaceprogram.com/wiki/Maneuver_node — still unverified: label wording not on the archived Maneuver node page. |
| V3 | Map vessel filter list (incl. EVA, flag, space object, launch sites) | https://wiki.kerbalspaceprogram.com/wiki/Map_View — still unverified: no filter list on the archived pages. |
| V4 | Double-click focuses a body/vessel in map | https://forum.kerbalspaceprogram.com/topic/98227-how-do-you-shift-focus-back-to-your-craft-in-map-mode — still unverified: forum blocked. |
| V5 | "Warp to" wording on Ap/Pe/SOI marker context menus | https://wiki.kerbalspaceprogram.com/wiki/Map_View — "Warp To" on the orbit menu (1.0) verified [S43]; marker wording still unverified. |
| V6 | Gizmo drag speed grows with handle distance; scroll wheel adjusts | https://wiki.kerbalspaceprogram.com/wiki/Maneuver_node — still unverified: not on the archived Maneuver node page. |
| V7 | Maneuver Mode increment steps and time-shift buttons | https://steamdb.info/patchnotes/3723985 and https://forum.kerbalspaceprogram.com/topic/183899-on-the-maneuver-panel-in-17 — still unverified: SteamDB/forum not fetched. |
| V8 | Deleting an earlier node removes later ones; KSP1 delete control | https://wiki.kerbalspaceprogram.com/wiki/Maneuver_node — Delete control verified (right-click centre, red ✕) [S44]; cascade on deleting an earlier node still unverified. |
| V9 | SAS level needed for Target hold | https://wiki.kerbalspaceprogram.com/wiki/SAS — Verified: pilot level 3 or top-tier probe core [S45]. |
| V10 | Docking port capture ranges | https://wiki.kerbalspaceprogram.com/wiki/Docking — still unverified: archived Docking page gives no numbers. |
| V11 | KSPedia Δv map content | https://forum.kerbalspaceprogram.com/topic/135091-the-delta-v-map-in-kspedia — still unverified: forum blocked. |
| V12 | Stock 1.12 alarm types: contract alarms, closest approach; halt vs pause warp option | https://forum.kerbalspaceprogram.com/topic/203532-alarm-clock-usage-discussion — still unverified: 1.12 changelog only names the app [S42]. |
| V13 | No stock custom waypoints in KSP1; distance/heading only in mods | https://wiki.kerbalspaceprogram.com/wiki/Navigation_marks — still unverified: not checked. |
| V14 | Tracking Station L1 object count limit | https://wiki.kerbalspaceprogram.com/wiki/Tracking_Station — Corrected: no count limit listed; asteroid tracking needs level 3 [S46]. |
| V15 | Fly/Recover/Terminate button wording; KSP1 cannot recover off-Kerbin | https://wiki.kerbalspaceprogram.com/wiki/Tracking_Station — Verified: Fly / Recover / Terminate; KSP1 recovers only on Kerbin [S46][S47]. |
| V16 | Asteroid classes A–E and "Start/Stop Tracking" wording | https://wiki.kerbalspaceprogram.com/wiki/Asteroid — Classes verified; buttons corrected to Track / Untrack [S46][S48]. |
| V17 | EVA/Flag/SpaceObject/DeployedScienceController as player-facing types | https://wiki.kerbalspaceprogram.com/wiki/Vessel — Nine types verified [S49]; EVA/Flag/SpaceObject still unverified as player types. |
| V18 | Rename Vessel dialog with type buttons | https://wiki.kerbalspaceprogram.com/wiki/Vessel — Rename Vessel and the "i" panel verified [S49]; layout still unverified. |
| V19 | Debris naming pattern ("… Debris") | https://wiki.kerbalspaceprogram.com/wiki/Debris — Verified: "<craft> Debris" [S47]. |
| V20 | Max persistent debris range and default | https://forum.kerbalspaceprogram.com/topic/152763-debris-and-reusable-space-programs — Verified: default 250, 0 to unlimited [S50]. |
| V21 | Exact conditions for the in-flight "Recover Vessel" button | https://wiki.kerbalspaceprogram.com/wiki/Recovery — Verified: on Kerbin, at rest, hover the altimeter [S51]. |
| V22 | Terminate kills the crew aboard | https://wiki.kerbalspaceprogram.com/wiki/Tracking_Station — Verified [S46][S47]. |
| V23 | Island Airfield is not a launch site | https://wiki.kerbalspaceprogram.com/wiki/Island_Airfield — Corrected: launchable with "Allow other launch sites" (MH) [S52]. |
| V24 | `V` cycle includes Locked; part-focus binding | https://wiki.kerbalspaceprogram.com/wiki/Camera_view and https://wiki.kerbalspaceprogram.com/wiki/Keys — `V` modes incl. Locked verified [S53]; part-focus binding still unverified. |
| V25 | MechJeb landing predictor and ground track; node snapping in Precise Node | https://github.com/MuMech/MechJeb2 and https://forum.kerbalspaceprogram.com/topic/161855-112x-precise-node-continued-precisely-edit-your-maneuver-nodes — still unverified: MechJeb/Precise Node pages not fetched. |
| V26 | Rendezvous rule of thumb (intercept under ~5 km) | https://wiki.kerbalspaceprogram.com/wiki/Tutorial:Basic_Orbital_Rendezvous — still unverified: tutorial page not fetched. |
| V27 | Maneuver gizmo introduced in 0.21 | https://wiki.kerbalspaceprogram.com/wiki/0.21 — still unverified: 0.21 changelog does not mention it.

---

## Sources

All checked 2026-10-18.

- [S1] GOG Database, "Kerbal Space Program — Release Notes" (official changelogs 1.3–1.12.2, incl. DLC notes), https://www.gogdb.org/product/1429864849/releasenotes — third-party copy of official notes. High.
- [S2] Steam News API for KSP1 (1.12 "On Final Approach" changelog, 1.12.2, 1.11, and the "KSP Loading…" previews of 20 May and 10 Jun 2021), https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=220200 — official. High.
- [S3] SteamDB patch notes for 1.7 "Room to Maneuver", https://steamdb.info/patchnotes/3723985, and KSP Wiki "1.7", https://wiki.kerbalspaceprogram.com/wiki/1.7 — search excerpts. High (excerpt).
- [S4] KSP Wiki, "Tracking Station", https://wiki.kerbalspaceprogram.com/wiki/Tracking_Station — search excerpt (fetch blocked). Good.
- [S5] kOS docs, "Career Limits", https://ksp-kos.readthedocs.io/en/latest/general/career_limits.html, and KSP Forum "Is there a facility upgrade tree", https://forum.kerbalspaceprogram.com/topic/188352-is-there-a-facility-upgrade-tree — excerpts. Good.
- [S6] KSP Forum, "New Alarm Clock not counting down maneuver nodes", https://forum.kerbalspaceprogram.com/topic/203361-new-alarm-clock-not-counting-down-maneuver-nodes, and "How do I use the stock transfer window alarm", https://forum.kerbalspaceprogram.com/topic/205981-how-do-i-use-the-stock-transfer-window-alarm — excerpts. Anecdotal.
- [S7] KSP Wiki, "Camera view", https://wiki.kerbalspaceprogram.com/wiki/Camera_view; Steam KSP2 discussion https://steamcommunity.com/app/954850/discussions/0/3772364949847356130 — excerpts. Good / Anecdotal.
- [S8] KSP Wiki, "Vessel" (Craft types and hierarchy), https://wiki.kerbalspaceprogram.com/wiki/Vessel — excerpt. Good.
- [S9] KSP developer article, "What's in a vessel name", https://forum.kerbalspaceprogram.com/developerarticles.html/whats-in-a-vessel-name-r206 — excerpt. High.
- [S10] KSP Forum, "Prioritized vessel naming", https://forum.kerbalspaceprogram.com/topic/173113-prioritized-vessel-naming, and "Vessel naming priority level in flight", https://forum.kerbalspaceprogram.com/topic/185844-vessel-naming-priority-level-in-flight — excerpts. Anecdotal.
- [S11] KSP Wiki, "Recovery", https://wiki.kerbalspaceprogram.com/wiki/Recovery — excerpt. Good.
- [S12] KSP Forum, "Switching between vessels in physics range", https://forum.kerbalspaceprogram.com/topic/179177-switching-between-vessels-in-physics-range; Steam discussion https://steamcommunity.com/app/220200/discussions/0/154641814594723427 — excerpts. Anecdotal.
- [S13] KSP Wiki, "SENTINEL Infrared Telescope", https://wiki.kerbalspaceprogram.com/wiki/Sentinel; KSP bug tracker #25670, https://bugs.kerbalspaceprogram.com/issues/25670; Forum "Asteroid groups in tracking station", https://forum.kerbalspaceprogram.com/topic/189402-asteroid-groups-in-tracking-station — excerpts. Good / Anecdotal.
- [S14] KSP Wiki, "Woomerang Launch Site", https://wiki.kerbalspaceprogram.com/wiki/Woomerang_Launch_Site, and "Dessert Launch Site", https://wiki.kerbalspaceprogram.com/wiki/Dessert_Launch_Site — excerpts. Good.
- [S15] kerbal.wiki (KSP2), "Kerbal Space Center", https://kerbal.wiki/KSC — fetched. Good.
- [S16] kerbal.wiki, "0.1.1.0" (KSP2 patch notes), https://kerbal.wiki/0.1.1.0 — fetched. High.
- [S17] kerbal.wiki, "0.1.3.0", https://kerbal.wiki/0.1.3.0 — fetched. High.
- [S18] kerbal.wiki, "0.2.0.0", https://kerbal.wiki/0.2.0.0 — fetched. High.
- [S19] Steam News, "You Can't Spell User Interface Without U & I" (KSP2 art director, 22 Jan 2024), https://steamcommunity.com/games/954850/announcements/detail/3969427240633798022 — via sibling doc 04. High.
- [S20] KSP Forum, "Suggestion: improvements to map view and orbital planning", https://forum.kerbalspaceprogram.com/topic/220522-suggestion-improvements-to-map-view-and-orbital-planning — excerpt. Player opinion.
- [S21] KSP Forum, "Maneuver nodes are really, really bad" (KSP2), https://forum.kerbalspaceprogram.com/topic/212419-maneuver-nodes-are-really-really-bad/page/4; KSP bug #3953, https://bugs.kerbalspaceprogram.com/issues/3953 — excerpts. Player opinion / bug report.
- [S22] PC Gamer, "Kerbal Space Program 2 will have a built-in trip planner", https://www.pcgamer.com/uk/kerbal-space-program-2-will-have-a-built-in-trip-planner-thank-jeb; KSP Forum "Suggestion: better trip planner", https://forum.kerbalspaceprogram.com/topic/218742-suggestion-better-trip-planner; KSP Visual Calculator thread, https://forum.kerbalspaceprogram.com/topic/202030-ksp-visual-calculator — excerpts. Fair.
- [S23] KSP Forum, "Navigation waypoints, am I missing something", https://forum.kerbalspaceprogram.com/topic/175697-navigation-waypointsam-i-missing-something, "Targetable waypoints", https://forum.kerbalspaceprogram.com/topic/118745-targetable-waypoints; KSP Wiki "Navigation marks", https://wiki.kerbalspaceprogram.com/wiki/Navigation_marks — excerpts. Fair.
- [S24] Trajectories mod, https://github.com/hyyy1211/KSPTrajectories and forum thread https://forum.kerbalspaceprogram.com/topic/162324-112x-trajectories-v245-2023-08-22-atmospheric-predictions — excerpts. Good.
- [S25] SpaceDock, "Maneuver Node Evolved", https://spacedock.info/mod/1087/Maneuver%20Node%20Evolved; KSP Forum "Precise Node Continued", https://forum.kerbalspaceprogram.com/topic/161855-112x-precise-node-continued-precisely-edit-your-maneuver-nodes — excerpts. Good.
- [S26] KSP Forum, "What is the docking screen supposed to show", https://forum.kerbalspaceprogram.com/topic/192381-what-is-the-docking-screen-supposed-to-show; "Docking Port Alignment Indicator", https://forum.kerbalspaceprogram.com/topic/215514-docking-port-alignment-indicator; Steam KSP2 thread https://steamcommunity.com/app/954850/discussions/0/3772365358792809512 — excerpts. Anecdotal.
- [S27] CurseForge, "Kerbal Alarm Clock", https://www.curseforge.com/kerbal/ksp-mods/kerbal-alarm-clock; kOS docs "Kerbal Alarm Clock", https://ksp-kos.readthedocs.io/en/latest/addons/KAC.html — excerpts. Good.
- [S28] KSP Forum, "Alarm Clock Mod [1.1.0]" (KSP2), https://forum.kerbalspaceprogram.com/topic/222369-alarm-clock-mod-110; KSP bug #28103, https://bugs.kerbalspaceprogram.com/issues/28103 — excerpts. Fair.
- [S29] TutorialTactic, "120 Kerbal Space Program keyboard shortcuts", https://tutorialtactic.com/?p=4371; KSP Forum thread 98227 (above); KSP Wiki "Key bindings", https://wiki.kerbalspaceprogram.com/wiki/Keys — excerpts. Fair.
- [S30] KSP Forum, "How to use maneuver nodes", https://forum.kerbalspaceprogram.com/topic/42065-how-to-use-maneuver-nodes; kOS docs "Maneuver Node", https://ksp-kos.readthedocs.io/en/latest/structures/vessels/node.html — excerpts. Fair.
- [S31] KSP Forum, "On the maneuver panel in 1.7", https://forum.kerbalspaceprogram.com/topic/183899-on-the-maneuver-panel-in-17, and "Maneuver node advance orbit button troubles", https://forum.kerbalspaceprogram.com/topic/116405-maneuver-node-advance-orbit-button-troubles — excerpts. Player opinion.
- [S32] KSP Forum, "Filter out contract orbit lines", https://forum.kerbalspaceprogram.com/topic/97481-filter-out-contract-orbit-llines — excerpt. Anecdotal.
- [S33] KSP Forum, "Stock Aeris K2 plane defaults to launchpad 1", https://forum.kerbalspaceprogram.com/topic/215164-stock-aeris-k2-plane-defaults-to-launchpad-1 — excerpt. Anecdotal.
- [S34] Steam discussion on the Δv readout, https://steamcommunity.com/app/220200/discussions/0/3044984779771000675; KSP API "DeltaVCalc", https://www.kerbalspaceprogram.com/ksp/api/class_delta_v_calc.html — excerpts. Fair / Good.
- [S35] KSP Forum, "Debris and reusable space programs", https://forum.kerbalspaceprogram.com/topic/152763-debris-and-reusable-space-programs — excerpt. Anecdotal.
- [S36] KSP Forum, "Conic patch settings", https://forum.kerbalspaceprogram.com/topic/193982-conic-patch-settings — via sibling doc 04 [S22]. Fair.
- [S37] KSP Wiki, "Map View", https://wiki.kerbalspaceprogram.com/wiki/Map_View — excerpt. Good.
- [S38] CurseForge, "Transfer Window Planner", https://www.curseforge.com/kerbal/ksp-mods/transfer-window-planner — excerpt. Good.
- [S39] KSP Forum, "The delta-v map in KSPedia", https://forum.kerbalspaceprogram.com/topic/135091-the-delta-v-map-in-kspedia — title only. Weak.
- [S40] MechJeb2, https://github.com/MuMech/MechJeb2 — not fetched; feature claims from general knowledge, *(unverified)*. Weak.
- [S41] CurseForge, "Haystack Continued", https://www.curseforge.com/kerbal/ksp-mods/haystack-continued — excerpt. Good.
- [S42] Internet Archive snapshots of the KSP Wiki, fetched 2026-10-18 (the live wiki shows a bot check). The specific pages follow as [S43]–[S53]. High.
- [S43] KSP Wiki, "1.0" changelog (archive), https://web.archive.org/web/20240106121052/https://wiki.kerbalspaceprogram.com/wiki/1.0 — "Warp To" on the orbit context menu. High.
- [S44] KSP Wiki, "Maneuver node" and "Map view" (archive), https://web.archive.org/web/20240102183740/https://wiki.kerbalspaceprogram.com/wiki/Maneuver_node ; https://web.archive.org/web/20240121095214/https://wiki.kerbalspaceprogram.com/wiki/Map_view. High.
- [S45] KSP Wiki, "SAS" (archive), https://web.archive.org/web/20240104235756/https://wiki.kerbalspaceprogram.com/wiki/SAS. High.
- [S46] KSP Wiki, "Tracking Station" (archive), https://web.archive.org/web/20240118210816/https://wiki.kerbalspaceprogram.com/wiki/Tracking_Station. High.
- [S47] KSP Wiki, "Debris" (archive), https://web.archive.org/web/20240121095445/https://wiki.kerbalspaceprogram.com/wiki/Debris. High.
- [S48] KSP Wiki, "Asteroid" (archive), https://web.archive.org/web/20240115042636/https://wiki.kerbalspaceprogram.com/wiki/Asteroid. High.
- [S49] KSP Wiki, "Craft" (redirect from Vessel; archive), https://web.archive.org/web/20240121090345/https://wiki.kerbalspaceprogram.com/wiki/Vessel. High.
- [S50] KSP Wiki, "Settings" (archive, 1.4), https://web.archive.org/web/20240105230555/https://wiki.kerbalspaceprogram.com/wiki/Settings. High.
- [S51] KSP Wiki, "Recovery" (archive), https://web.archive.org/web/20231219213707/https://wiki.kerbalspaceprogram.com/wiki/Recovery. High.
- [S52] KSP Wiki, "Island Airfield" and "Making History" (archive), https://web.archive.org/web/20240213223417/https://wiki.kerbalspaceprogram.com/wiki/Island_Airfield ; https://web.archive.org/web/20240108005927/https://wiki.kerbalspaceprogram.com/wiki/Making_History. High.
- [S53] KSP Wiki, "Camera view" and "Key bindings" (archive), https://web.archive.org/web/20240105225644/https://wiki.kerbalspaceprogram.com/wiki/Camera_view ; https://web.archive.org/web/20240105022508/https://wiki.kerbalspaceprogram.com/wiki/Key_Bindings. High.
