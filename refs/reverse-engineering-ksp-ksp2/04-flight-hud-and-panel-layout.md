# 04 — Flight HUD and panel layout (KSP1 and KSP2)

**Why this document exists.** The owner's complaint: "many UI pieces don't match the original design; the vessel control panel is odd; widths aren't considered". The original design is the refs concept (`refs/space-orbital-program-ui/`: Tesla-like glass panels, 1920×1080 artboards, tokens in `tokens/tokens.json`), which ADR 0107 adopted with accessibility deviations. The concept took KSP2's HUD as its starting point. This document records where KSP1 and KSP2 actually put things, how big they were, how their windows behaved, how they scaled, and what players said, so that our layout can borrow KSP conventions where they work and keep the concept's look. Our current implementation is inventoried in `05-orbital-today-inventory.md` §4; part controls are in `03-part-control-and-tweakables.md`.

**Method and a caveat on geometry.** Public sources only: official changelogs and dev posts, KSP2 patch notes on kerbal.wiki, community wiki excerpts, mod pages, player threads and press guides. No game files were inspected and I could not look at screenshots in this session. **No public source gives pixel geometry for either game's HUD.** Positions below come from guides, patch notes and player descriptions; sizes are my estimates and are always marked *(estimate)*. The official wiki and forum blocked automated fetches on 2026-10-18, so their content comes from search excerpts. Tags: **[KSP1]**, **[KSP2]**, **[KSP2 — announced, never shipped]**, **[Mod: name]**.

**Correction to our earlier research.** `refs/reverse-engineering-ksp2/04-flight-and-controls.md` §1.1 says KSP2's navball sits at the bottom centre. The evidence says **bottom left**: a launch walkthrough places the SAS button "at the bottom, left-hand portion of the screen" with the throttle bar to the left of the navball [S12], and in a Steam thread players asked for the navball to be centred, while one said he liked it on the left [S11].

---

## 0. Findings in brief

1. **KSP1 put the navball at bottom centre and everything else on the edges**: time and warp top left, altitude top centre, app launcher top right, staging down the left side, crew portraits bottom right. Part controls floated wherever the player clicked. This layout is the one KSP players have muscle memory for, and our concept follows it almost exactly.
2. **KSP2 moved the instruments to the bottom-left corner** (navball, SAS, throttle, readouts in one cluster) and put the app bar at the bottom right [S12][S16]. It replaced floating part windows with a large Part Manager window. Players criticised font size and thinness, density, and the fixed navball [S1][S11].
3. **Scale was the main layout lever in both games.** KSP1: one UI scale slider at 80–200 % [S9], per-group multipliers in the config file [S13][S14], a recommended scale per resolution from 1.6 [S3]; 4K players still edited the config up to 2.5 [S14]. KSP2: Flight HUD scaling arrived in 0.1.3 [S5]; a mod had offered 60–120 % before that [S17].
4. **Window rules were thin.** KSP1 stock apps were mutually exclusive (one open at a time) [S15]; PAWs could be pinned from 1.5; nothing snapped or docked. KSP2 made most windows draggable by their headers over time [S4][S5] but had no layout presets.
5. **Map view clutter was the recurring map complaint**: KSP2's own art director listed hard-to-use maneuver gizmos, tangled trajectory tags and an over-prominent SOI marker [S1]; KSP1 needed many patches to keep map icons scaling with the UI [S3].
6. For us: keep the concept's KSP1-like map of the screen, give each region a **width range and a narrow-screen rule**, widen the vessel panel to 340 px (resizable 300–440), cap the top-left capsule row, and make only the side panels resizable and collapsible, never the navball module.

---

## 1. Screen maps

### 1.1 KSP1 flight HUD (1.1–1.12)

```
+--------------------------------------------------------------------------------+
| [warp ▶▶▶ ][UT/MET]        [ altimeter tumbler ]          [app launcher icons] |
| [funds/sci/rep (career)]   [ IVA | map | KSC ]                 [app windows ↓] |
| [S]                                                                            |
| [t]                                                                            |
| [a]          (part action windows float near the clicked part)                 |
| [g]                                                                            |
| [i]                                                                            |
| [n]                     [ SAS modes ][ speed / mode strip ]                    |
| [g]                     [throttle ( NAVBALL ) SAS·RCS·g]          [crew portr.] |
| [docking/staging mode]  [   heading, Δv / burn info    ]          [IVA][EVA]   |
+--------------------------------------------------------------------------------+
```

| Region | Element | What the sources say | Size at 100 % UI scale |
|---|---|---|---|
| Bottom centre | **Navball** with its frame: reference mode (click to cycle Surface, Orbit, Target) and speed above it, RCS and SAS lights, throttle gauge, g-force gauge, maneuver Δv and burn info, heading [S6]. SAS mode buttons appear beside it when SAS is on [S7] | Navball "in the bottom middle of the screen" [S7]. 1.8 added a **Warp to node** button on the navball's Δv readout [S3]. Setting: auto-hide navball in map view [S9]. 1.11: "ghosted" navigation markers setting [S9] | Navball plus frame about 260–300 px wide, 150–180 px tall *(estimate)* |
| Top centre | **Altimeter** (rolling-digit "tumbler"), plus buttons for IVA, map and return to KSC | A mod describes the top edge as "where the altimeter usually is" [S18]. 1.7 lets you click to switch ASL/AGL [S2]; 1.7 fixed a "Return to KSC" altimeter button locking input [S2]; 1.8.1 fixed altimeter and staging tumblers vanishing at some scales [S3] | About 220 × 50 px *(estimate)* |
| Top left | **Time warp** arrows, warp rate, UT or MET clock; career gauges for funds, science and reputation below it *(position from common knowledge, still unverified)* | 1.7 fixed navball, funds, science and reputation gauges disappearing at high UI scales [S2] | About 240 × 40 px *(estimate)* |
| Left side | **Staging stack**, a column of stage groups with part icons, Δv per stage from 1.6; docking-mode toggle at its bottom | Staging moved to the left side by 0.7.3 [S1]. Docking-mode button "faintly purple … just below the staging button" [S19]. 1.8 made staging and docking UI available in map view [S3] | About 80–120 px wide, up to most of the screen height *(estimate)* |
| Top right | **App launcher** (stock apps on the right, mods to their left), with each app's window dropping below its button | Stock apps right, mods left; stock apps mutually exclusive, one visible at a time (2013 post) [S15] | Icons about 40 px *(estimate)* |
| Bottom right | **Crew portraits** (live feeds) with IVA and EVA buttons. The SAS mode selector sits to the left of the navball *(verified 2026-10-18: [S26])* | Portraits were spaced around the edges by 0.7.3 [S1] | About 2 × 120 px tall *(estimate)* |
| Around parts | **Part Action Windows**; temperature gauges beside overheating parts | Settings: Temperature Gauges, Thermal Highlights [S9]; 1.10 opens PAWs towards the screen edge [S3] | PAW about 220–260 px wide *(estimate)* |
| Centre-top | **Screen messages** (short text that fades) | — | — |

**Toggles.** F2 hides the whole HUD *(common knowledge)*. Many readouts players wanted (Ap/Pe, time to Ap, TWR) were absent from the stock flight HUD, which is why Kerbal Engineer Redux and MechJeb windows sat on top of this layout (`13-ui-ux-patterns.md` §1.1).

### 1.2 KSP2 flight HUD (0.1.0–0.2.2)

```
+--------------------------------------------------------------------------------+
| [time warp bar][MET]                       [notifications / mission tracker ?] |
|                                                                                |
|                                                                                |
|              (Part Manager / Resource Manager windows open here)               |
|                                                                                |
|                                                                                |
| [SAS ring]                                                    [staging stack ?]|
| [throttle ( NAVBALL ) ALT · VEL · readouts ]          [kerbals ?] [app bar ⊞] |
+--------------------------------------------------------------------------------+
```

| Region | Element | Evidence |
|---|---|---|
| Bottom left | **Navball cluster**: navball, throttle bar to its left, SAS button with mode circle, altitude with an atmosphere bar, velocity readouts | SAS "bottom, left-hand portion"; throttle "to the left of the navigation icon"; atmosphere bar to the right of the altitude [S12]. Players asked for it centred; it could not be moved [S11]. 0.1.4: navball colour changes with velocity state [S6]. 0.2.0 and 0.2.1 fixed velocity readout precision (decimals and 4 significant figures) [S7][S8] |
| Bottom right | **App bar** with a 3×3 "bento" button that opens the tray (Part Manager, Resource Manager, Kerbal Manager, mission tracker, science) | Players located it in the bottom-right corner [S16]; 0.2.0 fixed "Action Bar Bento Menu button text runs into edge of box" [S7] |
| Right side *(still unverified)* | **Staging stack** with resource gauges and Δv per stage, Launch/"Go" button | The Resource Manager was restyled "to match new resource gauges in Staging Stack" (0.1.1) [S20]; stage boxes sit "directly above the launch button" [S12]; 0.2.2 fixed moving stages in the extended stack [S10] |
| Top left *(still unverified)* | **Time warp bar** with MET | 0.1.2: warp bar hidden with F2 [S4]; 0.2.2 added a "signpost" while warping [S10] |
| HUD | **Recover Vessel** button | Added in 0.2.2 [S10] |
| Floating | **Part Manager, Resource Manager, burn timer, Flight Report, notifications** | Burn-timer window restyled 0.1.2 [S4]; notifications for blocked actions 0.2.2 [S10] |

**Where KSP2 differs from KSP1.** Instruments in one corner instead of centred; the app bar at the bottom instead of the top; one Part Manager window instead of per-part popups; a mission tracker and notification stack that stay on screen. The art director described KSP1's evolution from handwritten readouts (0.2) to a grey "junkyard" HUD (0.3) to the tidier staging stack, flight cluster and portraits of 0.7.3, and said KSP2 started from that heritage [S1].

### 1.3 The refs concept and our HUD, against both

| Region | Refs concept (1920×1080) | KSP1 | KSP2 | Verdict |
|---|---|---|---|---|
| Top left | World capsule + time control (play/pause, 8 warp segments, MET/UT), 44 px | Time warp + clock | Time warp bar | Matches KSP1 |
| Top right | Toolbar `Map · VAB · Camera | Dock · Vessel · Staging · Nav · Crew | Menu`, 44 px | App launcher | (app bar bottom right) | Matches KSP1 |
| Top centre | — (map: back + Map / Mission Center switch) | Altimeter, IVA/map buttons | — | Concept moves altitude into the navball module; fine |
| Left | Dock rail + one panel, 280 px | Staging column | — | Different: KSP1 players expect staging here; concept puts it bottom left, which is close |
| Right | Vessel panel, 300 px, three tabs | PAWs float; app windows drop from top right | Part Manager window | Concept adopts KSP2's docked overview; needs KSP1's per-part inspector (doc 03) |
| Bottom centre | Navball module 390×262, ball 176 | Navball | — (bottom left) | Matches KSP1 |
| Bottom left | Staging, 220 px | (left column) | Navball cluster | KSP1-ish |
| Bottom right | Crew, 220 px | Crew portraits | App bar | Matches KSP1 |

So the concept is, in screen geometry, **KSP1's layout with KSP2's docked part overview and the Tesla look**. That is a good place to be: KSP1 positions are what players know, and the navball centred answers a KSP2 complaint [S11].

### 1.4 UI scale settings

| Game | Setting | Range | Notes |
|---|---|---|---|
| KSP1 | UI Scale (`UI_SCALE`) | 0.8–2.0, shown 80–200 % [S9] | 1.6: the settings screen checks the recommended scale for the current resolution [S3] |
| KSP1 | Per-group scales in `settings.cfg` (for example an "appscale" for the launcher buttons) | Multiplied with the global scale; a 4.0 global with 0.5 navball gives 2.0 [S13][S14] | Values above the slider range are accepted in the file [S14]. Not exposed in the menu |
| KSP1 | Navball, altimeter, staging problems at high scales | — | Fixed in 1.7 (clipping, gauges disappearing), 1.8.1 (tumblers), 1.10 (map icons not rescaling) [S2][S3]; a player saw the navball break at 2.5 [S14] |
| KSP2 | Flight HUD UI scaling | Added 0.1.3 [S5]; 50 % was a valid value (0.1.4 fixed a HUD issue at 50 %) [S6] | Exact range *(still unverified)* |
| KSP2 | **[Mod: UI Scaler]** (0.1.1 era) | 60–120 %, default 80 % of original | Retired when the game added scaling [S17] |
| Both | Navball in map view | KSP1: auto-hide setting [S9]; KSP2: toggle added 0.1.3 [S5] | |

---

## 2. Window behaviour

| Behaviour | KSP1 | KSP2 |
|---|---|---|
| Stock app windows | Drop from their launcher button; **one stock app open at a time** [S15] | App windows restyled for consistency in 0.2.0 [S7]; open from the app bar |
| Part windows | Floating PAWs; pinnable from 1.5; open towards the screen edge from 1.10; scroll and stay on screen from 1.7; max height setting 1.8 (doc 03 §2.1) | One Part Manager window; players asked for resize, pin, columns, font size and scale [S21] |
| Dragging | PAWs and mod windows drag; KAL windows remember position per controller (1.9) [S3]; 1.10 fixed the Action Groups app position [S3] | Over time more windows became draggable by their header: colour picker (0.1.2) [S4], tutorial windows (0.1.3) [S5]; a 0.1.4 fix stopped the VAB save window being dragged sideways [S6]; 0.2.1 lists the cheats menu getting stuck inside a box [S8] |
| Docking / snapping | None in stock | None in stock |
| Z-order | Last clicked on top *(still unverified)* | *(still unverified)* |
| Collapse | PAW groups collapse (1.8+), not remembered without a mod (doc 03) | Staging stack expand/collapse; 0.1.2 hid the button with one stage [S4] |
| Persistence | Pinned map labels persist across map visits from 1.8 [S3] | Pinned map markers and a hover indicator added in 0.1.1 [S20]; 0.1.4 fixed only one body name being pinnable in the Tracking Station [S6] |
| How many windows players had open | Commonly a staging column, 1–3 pinned PAWs, a stock app and 1–3 mod windows (KER, MechJeb, Kerbal Alarm Clock) *(estimate from mod popularity; still unverified)* | Part Manager or Resource Manager, burn timer, mission tracker, notifications |

**Did KSP2 fix KSP1's clutter?** Partly. It removed the scatter of PAWs by putting every part in one window, but that window took a large share of the screen and showed few parts at once, so players traded many small windows for one big one [S21]. The art director named the Part Manager and Resource Manager split as an unsolved problem in January 2024 [S1]. Players also asked for a customisable HUD where elements could be moved or removed [S11].

---

## 3. Typography, density, colour and icons

| Topic | KSP1 | KSP2 |
|---|---|---|
| Overall style | A plain grey style that the art director credits with letting modders match the stock UI easily [S1] | Flatter "glass cockpit"; a "style unification" pass started on the busiest screens in early 2024 [S1] |
| Fonts | — | The dev post lists fonts as hard to read for size, scaling, colour and contrast [S1]. A player called the font pixelated and asked for a choice [S11]. 0.1.2 improved font fallbacks "to avoid different size characters" [S4] |
| Numbers | Altimeter as rolling digits; units m, km, m/s | Velocity display bugs: decimals only updating on integers above 999 m/s (0.2.0) and a 4-significant-figure limit (0.2.1) [S7][S8] |
| Density | Small, dense windows; long lists in PAWs | Big buttons, large fonts, heavy margins in the Part Manager [S21] |
| Colour coding | Navball blue sky / brown ground; markers by colour; chute staging icon grey / yellow-green / dark red [doc 03 S7] | Navball colour by velocity state (0.1.4) [S6]; the planned trajectory recoloured to differ from the current one; intercept node colours reworked (0.2.1) [S1] |
| Icons | Part icons in the staging stack; launcher icons | 0.1.4 updated fairing editor icons "to improve legibility" [S6]; 0.1.2 updated manager icons [S4] |
| Style guide | None public | An internal style guide was to be shared with modders when modding tools shipped **[KSP2 — announced, never shipped]** [S1] |
| Accessibility | No colour-blind mode; a UI scale slider | Audio-only launch countdown named as an accessibility problem [S1]; tooltips toggle added 0.1.3 [S5] |

---

## 4. Map view and Tracking Station

### 4.1 KSP1

- **Orbit display.** Patched conics, one per sphere of influence. `CONIC_PATCH_LIMIT` caps how many future patches draw; players quote a stock value of 3 (some say 2), with a performance cost for more [S22]. `CONIC_PATCH_DRAW_MODE` picks how patches beyond the current SOI are drawn (0 local to body … 4 dynamic; default reported as 3, relative) [S22]. Stock had no in-game control for either; **[Mod: Precise Node]** exposed both [S22].
- **Markers.** Ap and Pe, AN/DN relative to a target, closest approach, SOI encounter and escape. Hovering shows the value; clicking pins the label; pinned labels persist across visits from 1.8 [S3].
- **Maneuver node gizmo.** Click the orbit to add a node; six handles (prograde/retrograde, normal/anti-normal, radial in/out) drag the burn; drag further for a faster change *(drag-speed detail still unverified)*. 1.7 added **Maneuver Mode**, a panel with orbital data and an advanced node editor for precise values [S2]; a player noted it "fits more information in the height of the staging panel" [S23], so it sits on the left. Players asked for "+1 orbit" and longer time steps [S23]. 1.10 fixed negative handles flipping after changing "tool sensitivity" and gizmos resizing on fast clicks [S3]. 1.12.2 fixed dragging a node between patched conics [S3]. 1.12 added the Alarm Clock and the Maneuver Tool for transfers [S3].
- **Map HUD.** From 1.8, staging and docking UI stay available in map view [S3]; the navball can auto-hide [S9].
- **Tracking Station.** A separate KSC building with the system map and a vessel list; recovery and termination (see `04-flight-and-controls.md` §1.7).

### 4.2 KSP2

- **Faults named by the art director** (Jan 2024): the maneuver gizmo is hard to use, especially for precise burns; trajectory tags are hard to tell apart and their stems tangle; the SOI "bullseye" is too bright, large and prominent [S1].
- **Fixes by patch.** 0.1.1 updated map iconography (orbital markers, trajectory colours, maneuver gizmo, focus item, scrub handle), stopped intercept nodes overlapping, and added a hover/pinned marker indicator [S20]. 0.1.2 improved hover and click targets when objects overlap [S4]. 0.1.3 added a navball toggle in map and toggles for some 3D map elements [S5]. 0.1.5 highlights a conic section when hovered [S9b]. 0.2.0 added Ap/Pe on maneuver trajectories inside SOIs [S7]. 0.2.1 listed vessel and KSC icons as too large near the camera and reworked intersect node colours [S8]. 0.2.2 allowed nodes at 0 Δv [S10].
- **Map info panel** with buttons and flight info for the focused object (0.2.0 fixed it for EVA kerbals) [S7].
- **Tracking Station** existed; filters fixed in 0.1.2 (see `04-flight-and-controls.md` §1.7).

---

## 5. Resolutions, aspect ratios and known problems

| Situation | KSP1 | KSP2 |
|---|---|---|
| 1080p | Default 100 % fits; players at 27" used global 150 % with groups at 75 % [S14] | Fonts judged small and thin at 1080p (`13-ui-ux-patterns.md` §1.1) [S1] |
| 4K | Slider max 200 % "not enough" for some; config edits to 2.5 [S14]; some mod windows never scaled [S13][S14] | Thread title: "The UI in general seems weirdly scaled in both directions" [S24]; part tooltip sizing broke at non-native, non-1080p resolutions (0.1.5) [S9b] |
| Changing resolution | — | Notifications did not rescale when switching resolution (0.2.0 fix) [S7] |
| Ultrawide | Edges-anchored layout stretches with the screen *(still unverified)* | No ultrawide option in the settings menu at launch; players edited `Settings.JSON` to set the resolution [S25] |
| Small screens (1366×768, 1280×720) | Below 100 % only down to 80 % [S9]; overlaps between staging, PAWs and the navball *(still unverified)* | No source found |
| High UI scale glitches | Navball clipping, gauges vanishing, tumblers vanishing, map icons not rescaling: fixed across 1.7–1.10 [S2][S3] | HUD issue at 50 % (0.1.4) [S6] |

**Lesson.** Neither game had layout rules per width. Both relied on a scale slider, and both spent patches fixing elements that broke at the slider's ends. Mods without their own scaling stayed wrong.

---

## 6. Implications for our HUD

### 6.1 Adopt / Improve / Avoid

| # | Verdict | What | Why |
|---|---|---|---|
| 1 | **Adopt** | Keep the concept's KSP1 map: time top left, toolbar top right, navball bottom centre, staging bottom left, crew bottom right. | KSP1 muscle memory; KSP2's off-centre navball drew complaints [S11] |
| 2 | **Adopt** | A UI scale of 80–150 % (ADR 0107) **plus per-region scale** for the navball module, as KSP1 had in its config [S13][S14], exposed in the menu. | KSP1 players needed it at 4K; KSP2 added HUD scale in 0.1.3 [S5] |
| 3 | **Improve** | **Width rules per region** (table 6.2), not only a scale slider. Test at 80 % and 150 % for every region. | Both games broke at scale extremes [S2][S3][S6] |
| 4 | **Adopt** | One side panel per side open at a time; stock panels never cover the navball module or the craft's centre. | KSP1 one-app-at-a-time rule [S15]; 1.10 moved PAWs off the craft [S3] |
| 5 | **Improve** | Side panels are **resizable (drag the inner edge) and collapsible to their rail**; sizes persist per world. The navball module and capsules are fixed-size (scale only). | Players asked for resize and pin [S21] and a customisable HUD [S11] |
| 6 | **Adopt** | Pinned per-part inspectors stack in a column next to the vessel panel (doc 03 §6). | KSP1 pinning without clutter |
| 7 | **Adopt** | Tabular figures, fixed decimals per unit, and unit switching at stable thresholds (m → km at 100 km, for example) so numbers don't jump. | KSP2 velocity precision bugs [S7][S8] |
| 8 | **Adopt** | Map: hover highlights a conic; pinned labels persist; markers declutter by priority; SOI shown as a thin ring, not a bullseye; trajectory tags never share a stem. | KSP2's named map faults and fixes [S1][S20][S9b] |
| 9 | **Improve** | Maneuver editor: typed values, steps (0.1 / 1 / 10 / 100 m/s), "± 1 orbit" buttons, and a sensitivity setting; place it above the navball module as the concept does. | 1.7 Maneuver Mode and player requests [S2][S23] |
| 10 | **Avoid** | Thin, small type and big padding. Labels 10 px minimum, values 11–13 px at 600 weight. | KSP2 legibility faults [S1][S21] |
| 11 | **Avoid** | Audio-only or colour-only status (countdown, chute safety). | KSP2 dev post [S1] |
| 12 | **Improve** | Ultrawide: keep HUD regions inside a centred "safe frame" of at most 2560 px wide (setting: full width / safe frame). | Eye travel to the far edges at 3440 px; KSP2 had no ultrawide setting [S25] *(recommendation, not KSP behaviour)* |

### 6.2 Layout spec we could adopt

All sizes in CSS px at 100 % UI scale. "Narrow" means a viewport under 1280 px wide or 760 px tall (the 1024×768 tablet case from ADR 0107 included). M = the 24 px HUD margin; G = the 12 px panel gap.

| Region | Contents | Width (min – default – max) | Height | At narrow widths |
|---|---|---|---|---|
| Top-left capsule row | World capsule (home, name, mode) + time control (play/pause, warp segments, MET/UT) + funds capsule | Capsules 44 high; row max width **min(640, 40 vw)** | 44 | World name truncates with ellipsis; warp shows current rate plus ◀ ▶ instead of 8 segments; funds moves into the world capsule's menu |
| Top-right toolbar | Map, VAB, Camera │ Dock, Vessel, Staging, Nav, Crew │ Menu | Content (about 9 × 36 + gaps ≈ 380) | 44 | Middle group folds into a "Panels" menu button; Map and Menu always visible |
| Left dock (rail + one panel) | Tracking, Orbit, Resources, Science, Maneuver, plugins | Rail 44; panel **260 – 280 – 400**, resizable | From below the capsule row (M + 44 + G) to above staging or the deck, scrolls inside | Panel overlays the 3D view as a drawer; opening it closes the vessel panel (one side panel at a time) |
| Right vessel panel | Overview / Parts / Comms; pinned inspectors stack to its left | **300 – 340 – 440**, resizable (doc 03 §6.2: slider rows need 334–398) | Toolbar bottom + G to crew top − G; scrolls inside | Drawer, max **min(360, 100 vw − 2M)**; inspectors open inside it as a sub-page instead of beside it |
| Pinned part inspectors | 0–3 pinned parts | 300 – 320 – 400 each | Content, max 50 % of the column | Hidden; a "Pinned (n)" chip on the vessel panel opens them |
| Bottom centre navball module | Ball, V-speed arc, heading chip, SAS pod, SAS/RCS toggles, VEL/ALT, throttle | **390 × 262 fixed** (scales with navball scale 80–150 %) | 262 | Never resized by layout; at narrow it may shrink to 85 % via its own scale; maneuver editor docks above it |
| Bottom left staging | Queue, current stage with Δv and tanks, GO, total Δv | **200 – 220 – 280** | **Max: viewport − top row − deck clearance; scrolls inside** | Collapses to current stage + next stage + GO; full stack on tap |
| Bottom right crew | Crew chips, suit, radio signal | 200 – 220 – 260 | Max 3 rows, then "+n" | Collapses to avatars only (32 px each) |
| Toasts / notifications | Event feed | 320 – 360 – 420 | Max 4 visible, history in the log | Top centre under the toolbar, never over the navball module |
| Map maneuver editor | Prograde / normal / radial with typed values, time shift, ± orbit | 390 (matches module) | Content | Same |

**Fit check at common sizes** (left panel default + right panel default + navball module, all with margins and gaps):

| Viewport | Left (M + 44 + 280) | Centre module | Right (340 + M) | Free for the 3D view beside the module | Rule |
|---|---|---|---|---|---|
| 1920×1080 | 348 | 390 | 364 | about 410 each side of the module | Both side panels may be open |
| 1440×900 | 348 | 390 | 364 | about 170 each side | Both may be open. Bottom row check: staging ends 24 + 220 = 244 px from the left edge, the module starts 720 − 195 = 525 px from it ✓ |
| 1366×768 | 348 | 390 | 364 | about 130 each side | Both may be open but tight; height: 768 − 80 (top) − 262 (deck) − 2M ≈ 378 for side panels above the deck |
| 1280×720 | — | — | — | — | Narrow: one side panel at a time |
| 1024×768 (tablet) | — | — | — | — | Narrow: drawers; touch targets 44 (ADR 0063) |
| 3440×1440 | — | — | — | — | Safe frame 2560 centred (option) |

### 6.3 Which concept panels should borrow which KSP convention

| Concept panel | Borrow from | Concretely |
|---|---|---|
| Vessel panel | KSP1 PAW (direct, small, pinnable) + KSP2 Part Manager (overview, groups) | Widen to 340, resizable; per-part inspector on click; pins; search and stage filter (doc 03 §6) |
| Left dock | KSP1 stock apps (one open at a time) | Keep "one panel at a time"; make it resizable and collapsible; remember the last panel per world |
| Staging | KSP1 staging column, KSP2 per-stage Δv and gauges | Give it a max height and inner scroll (today it is unbounded, see doc 05 §4); keep part icons per stage; stage lock (Alt+L) indicator |
| Navball module | KSP1 frame contents | Keep reference-mode click (Surface / Orbit / Target), throttle, g-force, maneuver Δv with a warp-to-node button (KSP1 1.8) [S3], heading |
| Time control | KSP1 top-left warp + KSP2 signpost | Show why warp is blocked; show "burning under warp" (KSP2 0.2.2 signpost) [S10] |
| Crew | KSP1 portraits | Keep EVA per crew; add transfer from here |
| Map | KSP1 markers + KSP2 fixes | Pinned labels persist; hover highlights conic; patch limit setting in the map's layer menu |

---

## Sources

All checked 2026-10-18.

- [S1] Steam News, "You Can't Spell User Interface Without U & I" (Ness, Art Director, Intercept Games, 22 Jan 2024), https://steamcommunity.com/games/954850/announcements/detail/3969427240633798022 (read via https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=954850) — official dev post. High.
- [S2] Steam News, "Kerbal Space Program 1.7: Room to Maneuver" (April 2019), via https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=220200 — official changelog. High.
- [S3] GOG Database, "Kerbal Space Program — Release Notes" (official changelogs 1.3–1.12.x), https://www.gogdb.org/product/1429864849/releasenotes — third-party copy of official notes. High.
- [S4] kerbal.wiki, "0.1.2.0" (KSP2 patch notes), https://kerbal.wiki/0.1.2.0 — transcription. High.
- [S5] kerbal.wiki, "0.1.3.0", https://kerbal.wiki/0.1.3.0 — transcription. High.
- [S6] kerbal.wiki, "0.1.4.0", https://kerbal.wiki/0.1.4.0 — transcription. High.
- [S7] kerbal.wiki, "0.2.0.0", https://kerbal.wiki/0.2.0.0 — transcription. High.
- [S8] kerbal.wiki, "0.2.1.0", https://kerbal.wiki/0.2.1.0 — transcription. High.
- [S9] GitHub, CaptainKeyboard/ReDefinition issue #15, "KSP settings: Gameplay and System", https://github.com/CaptainKeyboard/ReDefinition/issues/15 — transcription of KSP1's settings with keys and ranges. Good.
- [S9b] kerbal.wiki, "0.1.5.0", https://kerbal.wiki/0.1.5.0, and the Steam news item "v0.1.5.0 Patch Notes" (25 Oct 2023) — transcription / official. High.
- [S10] kerbal.wiki, "0.2.2.0", https://kerbal.wiki/0.2.2.0 — transcription. High.
- [S11] Steam, KSP2 discussion "Somethings that are better than in KSP 1" (27 Feb 2023), https://steamcommunity.com/app/954850/discussions/0/3772365358797995618 — player opinion. Fair.
- [S12] TheGamer, "Kerbal Space Program 2: How To Launch Your First Rocket", https://www.thegamer.com/kerbal-space-program-2-launch-rocket-beginner-walkthrough/ — press guide. Fair.
- [S13] Steam, KSP discussion "Scale", https://steamcommunity.com/app/220200/discussions/0/3317353727671727773/ — players ("appscale" key; mod windows not scaling). Anecdotal.
- [S14] Steam, KSP discussion "UI Scale", https://steamcommunity.com/app/220200/discussions/0/1743342647554721818/, and KSP Forum "4K resolution - UI too small", https://forum.kerbalspaceprogram.com/topic/154337-4k-resolution-ui-too-small/ (search excerpt: per-group values multiply with the global scale) — players. Anecdotal.
- [S15] KSP Forum, "Application launcher and mods", https://forum.kerbalspaceprogram.com/topic/78231-application-launcher-and-mods — a 0.24-era post (stock apps right, mods left, one stock app at a time). May be dated.
- [S16] Steam, KSP2 discussion "Can't view resources in fuel tanks and can't transfer fuel between tanks" (25 Feb 2023), https://steamcommunity.com/app/954850/discussions/0/3772364949851326657/ — player (app bar bottom right, 3×3 grid). Fair.
- [S17] SpaceDock, "UI Scaler" (Halbann, KSP2 0.1.1.0), https://spacedock.info/mod/3291/UI%20Scaler — mod page. Good.
- [S18] SpaceDock, "AltimeterAutoHide", https://spacedock.info/mod/2541/AltimeterAutoHide — mod page (search excerpt). Fair.
- [S19] KSP Wiki, "Docking", https://wiki.kerbalspaceprogram.com/wiki/Docking — search excerpt. Good.
- [S20] kerbal.wiki, "0.1.1.0", https://kerbal.wiki/0.1.1.0 — transcription. High.
- [S21] KSP Forum, "Parts Manager (In game Windows) Suggestions - ReSize, Pin, Columns, FontSize, Scale", https://forum.kerbalspaceprogram.com/topic/219161-parts-manager-in-game-windows-suggestions-resize-pin-columns-fontsize-scale/, and "Parts Manager Suggestion", https://forum.kerbalspaceprogram.com/topic/214498-parts-manager-suggestion/ — search excerpts. Player opinion.
- [S22] KSP Forum, "Conic patch settings", https://forum.kerbalspaceprogram.com/topic/193982-conic-patch-settings, and "New conic patch draw mode", https://forum.kerbalspaceprogram.com/topic/64165-new-conic-patch-draw-mode — search excerpts; sources disagree on defaults. Fair.
- [S23] KSP Forum, "On the maneuver panel in 1.7", https://forum.kerbalspaceprogram.com/topic/183899-on-the-maneuver-panel-in-17, and "Precise Maneuver Editor" thread, https://forum.kerbalspaceprogram.com/topic/128303-18x-precise-maneuver-editor/page/3 — search excerpts. Player opinion.
- [S24] KSP Forum, "The UI in general seems weirdly scaled in both directions" (KSP2), https://forum.kerbalspaceprogram.com/topic/212601-the-ui-in-general-seems-weirdly-scaled-in-both-directions/ — title only. Weak.
- [S25] Gamepressure, "How to Run Kerbal Space Program 2 in Ultrawide Resolution" (24 Feb 2023), https://www.gamepressure.com/newsroom/how-to-run-kerbal-space-program-2-in-ultrawide-resolution/z2517e — press guide. Fair.
- [S26] KSP Wiki, "SAS", "Docking" and "Time warp" (Internet Archive snapshots). https://web.archive.org/web/20240104235756/https://wiki.kerbalspaceprogram.com/wiki/SAS ; https://web.archive.org/web/20231231102657/https://wiki.kerbalspaceprogram.com/wiki/Docking ; https://web.archive.org/web/20231130112639/https://wiki.kerbalspaceprogram.com/wiki/Time_warp. The Docking page places the docking-mode button "bottom left … below the green staging button, and above the blue map button"; the Time warp page puts the warp arrows "above the MET" without naming a screen corner. High.

## Needs verification

Added 2026-10-18 by the verification pass (see `16-verification-log.md`).

- KSP1 time-warp widget and career gauges in the top left: still unverified: archived pages say "above the MET" but no page names the corner.
- KSP2 HUD positions (staging stack on the right, warp bar top left), KSP2 HUD scale range: still unverified: no KSP2 layout description found; the KSP2 art director's Steam UI post (22 Jan 2024) describes KSP1 UI history, not KSP2 positions, and the forum is blocked.
- PAW z-order, number of windows players keep open, ultrawide stretching, small-screen overlaps: still unverified: estimates, no source.
- Maneuver gizmo drag-speed behaviour: still unverified: the archived Maneuver node page does not describe it.
