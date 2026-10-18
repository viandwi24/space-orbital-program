# 12 — Settings, difficulty, key bindings and meta features (KSP1 + DLCs, KSP2)

A full reference of the "around the game" surface: every key binding, every difficulty or game parameter, every settings-menu row, and the system features a player expects (saves, sharing, screenshots, mods, languages, achievements, tutorials, cheats). It ends with a launch checklist compared against what Orbital has today.

Tags: **[KSP1]** base game (final version 1.12.5), **[MH]** Making History DLC, **[BG]** Breaking Ground DLC, **[KSP2]** Kerbal Space Program 2 (final version 0.2.2.0), **[Mod]** community mod. *(unverified)* means I found no public source that confirms the item. It comes from memory or a single weak source. See "Needs verification" at the end.

**Method note.** The official KSP wiki (wiki.kerbalspaceprogram.com) and the KSP forums blocked direct fetching (bot protection, HTTP 403) on 2026-10-18. Wiki facts below come from search-engine excerpts of those pages. Settings and parameter **names** come mostly from game files (a KSP 1.0.5 `settings.cfg` [S2] and a KSP 1.4.2 `persistent.sfs` [S5]) and from a mod that mirrors KSP's settings screen field by field [S7][S8]. Those are the most reliable sources here because they are dumps of what the game writes.

**What Orbital has today** (read 2026-10-18 from `apps/web/src/lib/keybindings.ts`, `apps/web/src/lib/settings/settings.ts`, `apps/web/src/lib/graphics.ts`, `packages/renderer/src/presets.ts`, `mods/stock/src/rules.ts`, `apps/web/src/lib/save/autosave.ts`):

- **Keys.** 77 rebindable actions in three modes (flight, map, VAB). Each action has one or more defaults. There is clash detection, swap and reset, and a list of reserved and fixed keys. Bindings are stored as overrides only.
- **Settings v3.** Units (metric or imperial), first-flight tutorial progress, bindings, audio (master, effects, UI, mute), touch controls (auto, on or off), interface (UI scale from 80 to 150 %, high contrast), and the dock layout.
- **Graphics.** Presets low, medium and high, plus Auto, plus "adjust quality while playing". About 30 internal parameters (MSAA, shadows, clouds, trees, terrain and so on) are not exposed one by one.
- **World rules** (stock mod). Economy, contracts, funds, cost and science multipliers, science depth, tech tree, crew experience, salaries, life support, morale, rest, G-load and radiation, crew death and return days, comms, interference, signal delay, control without signal, comms range scale, range safety, reliability, agency type, rival agencies, starting funds. Presets: Sandbox, Science, Career, Career (hardcore), Career (engineering).
- **Saves.** Load and save dialogs, quicksave and quickload, an autosave every 120 s with a 15 s minimum gap that also fires on staging, landing and tab hide, and thumbnails. There is an achievements panel, a mods manager, ghost replays, and a script-editor option for auto-closing brackets.

---

## 1. Key bindings

### 1.1 The modifier key [KSP1]

KSP1 has a **Mod** key that many bindings combine with. It is **Alt** on Windows, **Option** on macOS and **Right Shift** on Linux (1.1+). It is stored as `MODIFIER_KEY` in `settings.cfg` and can be rebound [S1][S3]. The default is `LeftAlt` in the 1.0.5 file [S2].

### 1.2 KSP1 system and UI keys (all scenes unless noted)

| Key | Action | Notes / source |
|---|---|---|
| **F1** | Take a screenshot | `TAKE_SCREENSHOT`. Saved to `Screenshots/`. `SCREENSHOT_SUPERSIZE` multiplies the resolution [S1][S2] |
| **F2** | Hide or show the whole UI | `TOGGLE_UI` [S1][S2] |
| **F3** | Show or hide the flight results / status screen (the "flight log" of events: staging, part destruction, records) | `TOGGLE_STATUS_SCREEN` [S1][S2] |
| **F4** | Toggle vessel and part labels | `TOGGLE_LABELS` [S1][S2] |
| **F5** | Quicksave | `QUICKSAVE` [S1][S2] |
| **Mod+F5** | Quicksave under a name you type | [S1] |
| **F9 (hold)** | Quickload. You must hold it, so a stray tap does not load | `QUICKLOAD` [S1][S2] |
| **Mod+F9** | Pick which quicksave to load | [S1] |
| **F10** | Toggle the temperature gauges on parts | `TOGGLE_TEMP_GAUGES` [S1][S2] |
| **Mod+F10** | Open the load-saved-game dialog | [S1] *(verified 2026-10-18: [S31])* |
| **F11** | Toggle the thermal overlay (parts tinted by heat) | `TOGGLE_TEMP_OVERLAY` [S1][S2] |
| **F12** | Toggle the aerodynamic-forces overlay (lift and drag arrows) | `TOGGLE_FLIGHT_FORCES` [S1][S2] |
| **Mod+F12** | Debug toolbar / cheat menu. The wiki also lists Ctrl+Alt+F12 and Alt+Shift+F12 on Windows and RShift+F12 on Linux | [S3][S4]. Players say clicking the version number in the Esc menu also opens it [S28] |
| **Alt+F2** | Debug log console (on-screen log of errors and messages) | One forum comment [S28] *(still unverified: not in the archived wiki key table [S31])* |
| **Esc** | Pause menu. The sim really pauses | `PAUSE` [S2] |
| **Arrow keys** | Orbit the camera | `CAMERA_ORBIT_*` [S2] |
| **Numpad + / −** | Zoom the camera | `ZOOM_IN/OUT` [S2] |
| **Page Up / Page Down** | Scroll the view (for example the staging list) | `SCROLL_VIEW_*` [S2] |
| **Home / End** | Scroll the stage icons | `SCROLL_ICONS_*` [S2] |
| **Scroll Lock** | Switch a 6-DOF device between flight and camera control | `TOGGLE_SPACENAV_FLIGHT_CONTROL` [S2] |

### 1.3 KSP1 flight keys

| Key | Action | Binding name [S2] |
|---|---|---|
| W / S | Pitch down / up | PITCH_DOWN / PITCH_UP |
| A / D | Yaw left / right | YAW_LEFT / YAW_RIGHT |
| Q / E | Roll left / right | ROLL_LEFT / ROLL_RIGHT |
| W / S, A / D | Wheel throttle and wheel steering (rovers) | WHEEL_THROTTLE_*, WHEEL_STEER_* |
| Left Shift / Left Ctrl | Throttle up / down | THROTTLE_UP / THROTTLE_DOWN |
| Z / X | Full throttle / cut throttle | THROTTLE_FULL / THROTTLE_CUTOFF |
| Space | Activate the next stage (or launch) | LAUNCH_STAGES |
| T | Toggle SAS | SAS_TOGGLE |
| F (hold) | SAS while held. With SAS on, holding F turns it off temporarily | SAS_HOLD |
| R | Toggle RCS | RCS_TOGGLE |
| H / N | RCS translate forward / back | TRANSLATE_FWD / TRANSLATE_BACK |
| I / K | RCS translate down / up | TRANSLATE_DOWN / TRANSLATE_UP |
| J / L | RCS translate left / right | TRANSLATE_LEFT / TRANSLATE_RIGHT |
| G | Landing gear | LANDING_GEAR |
| U | Lights | HEADLIGHT_TOGGLE |
| B | Brakes (hold). The wiki lists no stock toggle; a parking brake is mod-only *(corrected 2026-10-18: [S31])* | BRAKES |
| Backspace | Abort action group | AbortActionGroup |
| 1 … 9, 0 | Custom action groups 1–10 | CustomActionGroup1–10 |
| Caps Lock | Precision controls. Smaller inputs, and the gauge needles turn blue | PRECISION_CTRL |
| Mod + W/S/A/D/Q/E | Trim pitch, yaw or roll | [S1] |
| Mod + X | Reset trim | [S1] |
| Mod + L | Lock or unlock staging (Space does nothing while locked) | [S1] |
| Insert | Staging mode for the lower-left UI | UIMODE_STAGING |
| Delete | Docking mode UI (on-screen translation and rotation pad) | UIMODE_DOCKING |
| Numpad . (Del) | Toggle the navball | [S1] |
| M | Map view | MAP_VIEW_TOGGLE |
| ] / [ | Switch to the next or previous vessel in physics range | FOCUS_NEXT_VESSEL / FOCUS_PREV_VESSEL |
| . / , | Time warp up / down | TIME_WARP_INCREASE / DECREASE |
| Mod + . / , | Physics warp (up to 4×, physics keeps running) | [S1] |
| / | Stop time warp | [S1] |
| C | IVA (cockpit) view | CAMERA_MODE |
| V | Cycle camera modes: Auto, Free, Orbital, Chase, Locked | CAMERA_NEXT |
| ` (back quote) | Reset the camera (since 1.2.1). Backspace is the abort group, not camera reset *(corrected 2026-10-18: [S31])* | CAMERA_RESET [S1][S2] |
| \ | Toggle mouse camera control | CAMERA_MOUSE_TOGGLE |
| Right-click a part | Part action window (PAW) | [S1] |
| Mod + right-click | Open several PAWs at once (needed for fuel transfer) | [S1] |

**Docking mode** (toggled with Delete) [S1][S2]: Space switches between linear and rotation mode (`Docking_toggleRotLin`). In linear mode W/S translate forward and back, A/D left and right, Shift/Ctrl up and down. In rotation mode the keys act as pitch, yaw and roll.

**Map view** [S1]: Tab and Shift+Tab move the focus to the next or previous body or vessel. ` (back quote) resets the focus to the active vessel *(corrected 2026-10-18: [S31])*. Double-click focuses a body. KSP1 has **no keyboard control of maneuver nodes**: you drag the node handles with the mouse. 1.7 added the advanced Maneuver Node editor with numeric fields and step buttons [S36]; the archived key table lists no maneuver keys *(verified 2026-10-18: [S31])*.

### 1.4 KSP1 EVA keys

| Key | Action | Notes |
|---|---|---|
| W / A / S / D | Walk, or jetpack translation when the pack is on | EVA_forward/back/left/right, EVA_Pack_* [S2] |
| Q / E | Rotate (yaw) | EVA_yaw_left/right |
| Left Shift | Run (on the ground), jetpack up | EVA_Run, EVA_Pack_up |
| Left Ctrl | Jetpack down | EVA_Pack_down |
| R | Toggle the jetpack | EVA_TogglePack |
| Space | Jump. With the pack on, turn to face the camera | EVA_Jump, EVA_Orient |
| Mod (Left Alt) | Toggle movement mode (walk or strafe) | EVA_ToggleMovementMode [S2] |
| F | Use: grab a ladder, take science, repair | EVA_Use |
| B | Board the nearest crew part | EVA_Board |
| U (L in 1.0.5) | Helmet lamp | EVA_Lights. The 1.0.5 default was L [S2], later guides list U [S1] |
| O | Helmet on or off (only where it is safe to breathe) | [S1], since 1.6 *(corrected 2026-10-18: [S31, S40])* |
| P | Deploy the EVA parachute | [S1], since 1.4.0 per the key table; the Kerbonaut page says 1.5 *(corrected 2026-10-18: [S31, S35])* |
| I | **EVA Construction Mode** (attach and detach parts in the field) | Added in 1.11.0 [S3] |
| Shift + W/A/S/D + Space | Jump off a ladder in that direction | [S1] |
| Mouse drag | Rotate while on the jetpack | [S1] |

### 1.5 KSP1 editor (VAB/SPH) keys

| Key | Action | Notes |
|---|---|---|
| W / S, A / D, Q / E | Rotate the held part: pitch, yaw, roll (90° steps) | Editor_pitch*/yaw*/roll* [S2] |
| Shift + rotate key | Rotate in fine 5° steps | Editor_fineTweak [S1][S2] |
| Space | Reset the part's rotation | Editor_resetRotation |
| 1 / 2 / 3 / 4 | Gizmo mode: Place, Offset, Rotate, Re-root | Editor_modePlace/Offset/Rotate/Root |
| F | Gizmo coordinates: absolute or local | Editor_coordSystem |
| R | Symmetry method: radial or mirror | Editor_toggleSymMethod |
| X / Shift+X | Cycle the symmetry count forward or back (1, 2, 3, 4, 6, 8) | Editor_toggleSymMode |
| C | Angle snap | Editor_toggleAngleSnap |
| Mod (hold) | Allow stack attach only (no surface attach) | [S1] |
| Mod + left-click | Copy a part or subassembly | [S1] |
| Shift + left-click | Pick up the whole craft | [S1] |
| Ctrl + left-click | Jump to that part in the part list | [S1] |
| Delete | Delete the selected part | [S1] |
| Ctrl+Z / Ctrl+Y | Undo / redo | [S1] |
| Enter | Reset the staging list to the default order | [S1] |
| ` (backtick) | Focus the part search field | [S1] |
| Mouse | Right-drag orbits. Scroll moves the camera up and down. Shift+scroll zooms. Middle-drag pans | *(still unverified: the wiki key table only lists Page Up/Down for scrolling [S31])* |

### 1.6 DLC keys

- **[MH]** The Mission Builder canvas (GAP) uses the mouse. Two settings exist: "VAB camera controls in GAP" and "minimum canvas zoom" [S7]. I found no special default keys.
- **[BG]** Robotics are driven by action groups and the KAL-1000 controller's timeline. Robotic axes can be bound to custom axis groups that a joystick or keyboard can drive *(unverified that keyboard defaults exist)*. Breaking Ground also adds deployed science and surface features, with no new keys.

### 1.7 KSP2 key differences

KSP2 reused most of KSP1's flight scheme in Unity's new InputSystem. The Settings → Input tab lets you rebind [S11][S12].

| Area | KSP2 default | Difference from KSP1 |
|---|---|---|
| Flight attitude, translation, throttle, Z/X, Space, T, R, G, U, B, 1–0, M, [ ] | Same as KSP1 [S11] | — |
| Docking controls | **Delete** | Same key, but a plain swap of translation and rotation |
| Precision | Caps Lock | Same |
| Trim | **Hold Left Alt** + attitude keys | Same idea as Mod+WASD [S12] |
| Camera mode | V | Same. There is **no IVA** in KSP2 |
| Toggle HUD | **F2** | Same idea, "Toggle Flight HUD" [S11] |
| Mouse look | **Tab** | New. In KSP1 Tab cycles map focus [S11] |
| Camera fine movement | Alt (hold) | New [S11] |
| Quicksave / quickload | F5 / F9. Quickload has two bindings: press and hold [S26] | KSP1 needs a hold |
| Time warp | , . and / to stop. One listing shows odd glyphs [S11] *(unverified mapping)* | — |
| Map view | **Home** resets the camera [S11] | KSP1 uses Backspace |
| OAB (VAB) | Ctrl+C / Ctrl+V copy and paste an assembly, **Ctrl+F** search, Ctrl+A select the primary assembly, X / Shift+X symmetry, C angle snap, F frame of reference, Alt disables stack attach, Space resets orientation, Home centres the camera, Shift is the fast modifier, Ctrl+Z/Y undo/redo [S11] | Clipboard-style shortcuts are new. There are no 1–4 gizmo-mode keys; workspaces and the gizmo use mouse buttons |
| EVA | WASD walk, Shift runs, Space jumps, Shift/Ctrl jetpack up/down, Q/E and J/L jetpack yaw and roll [S11] | No construction mode, helmet or parachute keys |
| Debug / cheats | Alt+C opened the cheats menu in Early Access builds *(unverified)* | — |
| Gamepad | Weak native support. The community mod *Inputbinder* exists to "make gamepads usable" and to add a throttle axis, trim axes and SAS-mode actions [S13] | KSP1 PC had joystick axis binding with deadzones but no gamepad layout |

### 1.8 KSP default → Orbital key → status

"Ours" is the default in `keybindings.ts`. **Conflict** means our key already means something else in KSP, which surprises KSP players.

| Action | KSP1 default | Orbital default | Status |
|---|---|---|---|
| Pitch / yaw / roll | WS / AD / QE | WS / AD / QE | Same |
| Throttle up / down | Shift / Ctrl | Shift / Ctrl | Same |
| Full / cut | Z / X | Z / X | Same |
| Stage | Space | Space | Same |
| SAS toggle | T | T | Same |
| SAS hold-to-invert | F (hold) | — | Missing |
| SAS modes (prograde and so on) | Navball buttons, no keys | 1–9, 0, ; | **Different.** In KSP the digits are action groups. Ours are a sensible addition, but they take KSP's action-group keys |
| Custom action groups 1–10 | 1–9, 0 | Numpad 1–9, 0 | **Different.** Many laptops have no numpad |
| Abort | Backspace | — | **Missing.** Backspace is reserved in our list |
| RCS toggle | R | — | **Missing** |
| RCS translation | H N I K J L | — | **Missing.** Our N is mute and our I/K/J/L are map-node keys, so adding translation would clash |
| Gear | G | — | Missing |
| Lights | U | — | Missing |
| Brakes | B | C | **Conflict.** C is IVA in KSP |
| Precision mode | Caps Lock | — | Missing |
| Trim | Mod+WASDQE, Mod+X resets | ] / [ (pitch only) | **Conflict.** [ ] switch vessels in KSP. Yaw/roll trim and trim reset are missing |
| Map | M | M | Same |
| Map focus next / previous / reset | Tab / Shift+Tab / Backspace | Tab (next only) | Partly. Previous and reset are missing |
| Maneuver node keys | none (mouse) | I K L J O U, Delete | Orbital extra (good). The keys clash with KSP's translation keys |
| Speed display mode | Click the navball readout | V | **Conflict.** V cycles camera modes in KSP |
| Next target | Mouse | Y | Orbital extra |
| Camera mode cycle | V | — | Missing |
| Camera reset | ` or Backspace | — | Missing |
| IVA | C | — | N/A for now |
| Switch vessel | ] / [ | — | Missing (and our trim sits on these keys) |
| Time warp up / down | . / , | . / , | Same |
| Physics warp | Mod + . / , | — | Missing |
| Stop warp | / | — | Missing. Our / is VAB search, but scopes differ, so it is free in flight |
| Quicksave / quickload | F5 / F9 (hold) | F5 / F9 (press) | Same keys. Consider hold-to-load or a confirmation |
| Pause | Esc | Esc | Same |
| Screenshot | F1 | — | **Conflict.** Our F1 is help (also `?`) |
| Hide UI | F2 | — | **Missing (high value for screenshots)** |
| Flight results / log | F3 | — | Missing |
| Labels | F4 | — | Missing |
| Thermal gauges / overlay / aero overlay | F10 / F11 / F12 | — | Missing. F11 and F12 are browser-reserved (fullscreen, devtools) |
| Debug / cheats | Mod+F12 | (dev-only P autopilot) | Missing |
| Mute | (none) | N | Orbital extra. It clashes with KSP's translate-back |
| Help / key list | (none) | ? or F1 | Orbital extra |
| Navball toggle | Numpad . | — | Missing |
| Stage lock | Mod+L | — | Missing |
| Docking mode | Delete | — | Missing |
| EVA set | WASD, R, Space, F, B, U, O, P, I | — | N/A until EVA exists |
| VAB rotate | WASDQE (+Shift fine) | Q/E turn radial only | **Different** |
| VAB gizmo modes | 1–4 | — | Missing |
| VAB symmetry count / method | X / R | X / — | Count is the same, method missing |
| VAB angle snap | C | — | Missing |
| VAB coordinate frame | F | — (F is frame vessel) | Different |
| VAB delete | Delete | Delete | Same |
| VAB undo / redo | Ctrl+Z / Y | Ctrl+Z / Y | Same |
| VAB copy | Mod+click (KSP2: Ctrl+C/V) | — | Missing |
| VAB search | ` (KSP2: Ctrl+F) | / | Different, which is fine |
| VAB pick up whole craft | Shift+click | Shift+carry | Similar |
| Mod key | Alt / Option / RShift | Not a concept | Missing. Browsers grab many Alt combos, so prefer Shift or Ctrl |

**Browser caveats for remapping.** F5 reloads the page and F11 toggles fullscreen. F12 and Ctrl+Shift+I open devtools. Ctrl+W closes the tab, and Ctrl+T, Ctrl+N and Ctrl+Tab are browser shortcuts. Alt focuses the menu bar on Windows Firefox. Ctrl+W, Ctrl+T and Ctrl+N cannot be captured at all outside fullscreen with the Keyboard Lock API. F5 and F1 can be prevented with `preventDefault` while the canvas has focus, but must never fire while a text field has focus.

---

## 2. Difficulty and game parameters

### 2.1 KSP1 structure

The New Game screen has a mode (Sandbox, Science, Career, and Mission with MH), a title, a flag, and a **Difficulty** button with presets **Easy, Normal, Moderate, Hard, Custom** [S6]. The parameters are saved in `persistent.sfs` under `PARAMETERS` with these sub-nodes [S5]: `FLIGHT`, `EDITOR`, `TRACKINGSTATION`, `SPACECENTER` (scene permissions that scenarios and tutorials use to lock things down), `DIFFICULTY`, `CAREER`, `CommNetParams`, `AdvancedParams`, and per-DLC nodes (`MissionParams*`). Most `DIFFICULTY`, `CommNet` and `Advanced` values can be changed later from the KSC pause menu ("Difficulty Options"). The `CAREER` starting values and multipliers are fixed at creation [S6].

### 2.2 KSP1 `DIFFICULTY` node (basic options)

| Setting (UI name) | Key [S5] | Default (Normal) | Range / meaning |
|---|---|---|---|
| Allow Stock Vessels | AllowStockVessels | on for Easy, off for Normal, Moderate and Hard *(corrected 2026-10-18: [S32])* | Show the stock craft in the editor load dialog |
| Allow Quick Loading | (in FLIGHT: CanQuickLoad) | on | F9 and Mod+F9 |
| Allow Reverting Flights | (in FLIGHT: CanRestart / CanLeaveToEditor) | on | Revert to launch, revert to VAB |
| Auto-hire crews | AutoHireCrews | on (Easy and Normal), off (Moderate and Hard) *(corrected 2026-10-18: [S32])* | Hire kerbals automatically when a seat is empty |
| Missing Crews Respawn | MissingCrewsRespawn | on (Easy and Normal), off (Moderate and Hard) [S6] | A lost kerbal returns to the roster after the timer |
| Respawn Timer | RespawnTimer | 7200 s = **2 h** game time *(unit from the key name: verify)* [S5] | Delay before a lost kerbal returns |
| Bypass Entry Purchase After Research | BypassEntryPurchaseAfterResearch | on (Easy and Normal), off (Moderate and Hard) *(verified 2026-10-18: [S32])* | Researched parts need no extra funds to unlock |
| Indestructible Facilities | IndestructibleFacilities | on only for Easy [S6] | KSC buildings cannot be destroyed |
| Resource Abundance | ResourceAbundance | 1 (100 %) | Scales ore and other resource concentrations. Added in 1.0 [S6] |
| Re-entry Heating | ReentryHeatScale | 1 (100 %) | Scales aerodynamic heating. Lower is more forgiving |
| Enable CommNet | EnableCommNet | on | Turns the whole comms system on or off |
| Allow Other Launch Sites **[MH]** | AllowOtherLaunchSites | off | Enables Woomerang and Dessert, and the Island Airfield runway *(verified 2026-10-18: [S38, S39])* |
| Building impact damage | (Advanced) BuildingImpactDamageMult | 0.05 | How much crashes damage buildings |

### 2.3 KSP1 `CAREER` node (fixed at creation)

| Setting | Key [S5] | Easy | Normal | Moderate | Hard | Range |
|---|---|---|---|---|---|---|
| Starting funds | StartingFunds | 250,000 | 25,000 | 15,000 | 10,000 | 0–500,000 [S6][S27] *(verified 2026-10-18: [S32])* |
| Starting science | StartingScience | 0 | 0 | 0 | 0 | 0–5,000 *(verified 2026-10-18: [S32])* |
| Starting reputation | StartingReputation | 0 | 0 | 0 | 0 | −1,000 to +1,000 *(verified 2026-10-18: [S32])* |
| Funds rewards | FundsGainMultiplier | 200 % | 100 % | 90 % | 60 % | 10–1000 % |
| Science rewards | ScienceGainMultiplier | 200 % | 100 % | 90 % | 60 % | 10–1000 % |
| Reputation rewards | RepGainMultiplier | 200 % | 100 % | 90 % | 60 % | 10–1000 % *(verified 2026-10-18: [S32])* |
| Funds penalties | FundsLossMultiplier | 50 % | 100 % | 150 % | 200 % | 10–1000 % |
| Reputation penalties | RepLossMultiplier | 50 % | 100 % | 150 % | 200 % | 10–1000 % |
| Decline penalty | RepLossDeclined | *(still unverified)* | 1 | *(still unverified)* | *(still unverified)* | Reputation lost per declined contract |
| Tech tree | TechTreeUrl | stock | stock | stock | stock | A path to a tech-tree config, so mods can replace the tree |

In Science mode only the science multiplier and starting science apply. Allow-revert and quickload are **off on Hard** [S27]. Per-preset values for heating, abundance and the Advanced toggles below are not in any source I could read *(still unverified: the archived Game Difficulty page [S32] lists only the basic and Career rows)*. From memory, Hard turns on the part pressure and G limits and "require signal for control", and Easy lowers re-entry heating.

### 2.4 KSP1 `CommNetParams` (Difficulty → CommNet tab)

| Setting | Key [S5] | Default | Meaning |
|---|---|---|---|
| Require Signal for Control | requireSignalForControl | off | Off: an unconnected probe keeps partial control (SAS and staging but no full control, per the probe-core rules). On: no control at all without a link |
| Plasma Blackout | plasmaBlackout | off | Lose the link during re-entry plasma |
| Range Modifier | rangeModifier | 1 | Scales all antenna ranges |
| DSN Modifier | DSNModifier | 1 | Scales the ground-station (Deep Space Network) power |
| Occlusion (vacuum) | occlusionMultiplierVac | 0.9 | How much bodies block the line of sight in vacuum |
| Occlusion (atmosphere) | occlusionMultiplierAtm | 0.75 | The same through atmosphere |
| Enable Extra Ground Stations | enableGroundStations | on | Extra DSN dishes around Kerbin, not only at the KSC |

### 2.5 KSP1 `AdvancedParams` (Difficulty → Advanced tab)

| Setting | Key [S5] | Default | Meaning |
|---|---|---|---|
| Enable Kerbal Experience | EnableKerbalExperience | on in Career, off in Science and Sandbox (all kerbals 5★) [S24] | Kerbals level up through flights. Changing it later may not apply to existing saves |
| Kerbals Level Up Immediately | ImmediateLevelUp | off | XP applies at once instead of after recovery at the KSC |
| Allow Negative Currency | AllowNegativeCurrency | off | Funds can go below zero. Later versions split this into funds, science and reputation *(still unverified split)* |
| Part Pressure Limits | PressurePartLimits | off | Parts break when their pressure limit is exceeded (deep oceans or atmospheres) |
| Part G-Force Limits | GPartLimits | off | Parts break above their G limit |
| Kerbal G-Force Limits | GKerbalLimits | off | Kerbals black out (G-LOC) and can die under sustained high G |
| Kerbal G-Force Tolerance | KerbalGToleranceMult | 1 | Multiplier on kerbal G tolerance. Players report it does not change existing saves [S25] |
| Resource Transfer Obeys Crossfeed | ResourceTransferObeyCrossfeed | off | Manual fuel transfer follows crossfeed rules |
| Action Groups Always Available | ActionGroupsAlways | off | Off: custom action groups unlock with VAB/SPH level |
| Building Damage Multiplier | BuildingImpactDamageMult | 0.05 | — |
| Part Upgrades in Sandbox / Career / Mission | PartUpgradesInSandbox / InCareer / InMission | off / on / off | Tech-node part upgrades apply |
| Enable full SAS in Sandbox and Science | EnableFullSASInSandbox | — | 1.6 added a game setting to toggle full probe SAS in Sandbox and Science [S40]; key name *(still unverified)* |
| Obey crash tolerance | (no such option: crash tolerance always applies; the cheat "No Crash Damage" overrides it) | — | — |
| EVA in atmosphere / construction | (no difficulty option. The carry limit is 60 kg per kerbal in Kerbin gravity, scaled by gravity, +60 kg per helper since 1.11.1 [S41]; 1.12 added a debug cheat to ignore it [S37]) | — | *(verified 2026-10-18: [S37, S41])* |
| Persistent action groups | (no stock option. Action groups save with the craft; "persistent" is a mod idea) | — | — |

### 2.6 KSP1 scene permissions (`FLIGHT`, `EDITOR`, `SPACECENTER`, `TRACKINGSTATION`) [S5]

Scenarios and tutorials use these to restrict the player. All are on in a normal save.

- **FLIGHT:** CanQuickSave, CanQuickLoad, CanAutoSave, CanUseMap, CanSwitchVesselsNear, CanSwitchVesselsFar, CanTimeWarpHigh, CanTimeWarpLow, CanEVA, CanIVA, CanBoard, CanRestart, CanLeaveToEditor, CanLeaveToTrackingStation, CanLeaveToSpaceCenter, CanLeaveToMainMenu.
- **EDITOR:** CanSave, CanLoad, CanStartNew, CanLaunch, CanLeaveToSpaceCenter, CanLeaveToMainMenu, startUpMode, craftFileToLoad.
- **TRACKINGSTATION:** CanFlyVessel, CanAbortVessel, CanLeaveToSpaceCenter, CanLeaveToMainMenu.
- **SPACECENTER:** CanGoInVAB, CanGoInSPH, CanGoInTrackingStation, CanLaunchAtPad, CanLaunchAtRunway, CanGoToAdmin, CanGoToAstronautC, CanGoToMissionControl, CanGoToR&D, CanSelectFlag, CanLeaveToMainMenu.

**Design takeaway.** One capability-flag layer serves both difficulty and tutorials. Orbital's rule system could use the same idea for scripted lessons: "this lesson disables time warp and map".

### 2.7 [MH] Mission parameters [S5]

Mission Builder missions carry their own parameters: enableFunding, startingFunds (100,000 by default), enableKerbalLevels with a start level per class (pilot, scientist, engineer), preventVesselRecovery, facilityOpenAC, astronautHiresAreFree, facilityOpenEditor, launchSitesOpen, **cheatsEnabled** (whether the debug cheats are allowed in this mission), and a level for each KSC facility.

### 2.8 Stock contract toggles

`StockContractParametersTemplate` lets each of the 14 stock contract types be switched on or off: station, survey, tourism, satellite, sentinel (asteroid scanning), and others [S5].

### 2.9 [KSP2] Difficulty and campaign options

KSP2 shows its difficulty options when you create a campaign. Some of them can be edited later from the pause menu. A patch fixed "difficulty settings don't persist after ESC menu closure" [S27]. No official table is public. Option names, reconstructed from a trainer and mod listings that mirror in-game toggles [S14][S15]:

| Option | Kind | Notes |
|---|---|---|
| Allow Revert | toggle | [S14][S15] |
| Allow Quickload | toggle | [S14][S15] |
| Include Stock Vessels | toggle | [S14][S15] |
| Probes Require Signal for Control | toggle | KSP2's comms (0.2.0+) [S14] |
| Unbreakable Joints | toggle (debug/cheat) | [S14][S15] |
| Unlimited Fuel / Unlimited Power | toggle (debug/cheat) | [S14] |
| Heat Enabled / Part Overheating | toggle | Re-entry and engine heat [S14] |
| Science rewards multiplier | slider | *(unverified)* |

**Missing in KSP2 compared with KSP1:** kerbal levels and roles, probe-core levels, kerbal G limits, part pressure limits, and money and reputation (Exploration has no economy) [S23][S27]. There were no Easy/Normal/Hard presets with published values *(unverified)*.

---

## 3. Settings menus

### 3.1 KSP1 General tab (1.12) [S7][S8]

**Gameplay**

| Row | Field | Control |
|---|---|---|
| Show Vessel Labels | FLT_VESSEL_LABELS | toggle |
| Show Space Center Crew | SHOW_SPACE_CENTER_CREW | toggle (kerbals walking around the KSC) |
| Display Kerbin Time | KERBIN_TIME | toggle: 6-hour days or 24-hour days |
| Contract Deadlines as Dates | SHOW_DEADLINES_AS_DATES | toggle |
| Temperature Gauges / Thermal Highlights | TEMPERATURE_GAUGES_MODE | bitmask, default 3 (both) |
| Double-Click Mouse Look | CAMERA_DOUBLECLICK_MOUSELOOK | toggle |
| EVAs Auto-Rotate to Camera | EVA_ROTATE_ON_MOVE | toggle |
| Retain Control Point on Enter IVA | IVA_RETAIN_CONTROL_POINT | toggle |
| **UI Scale** | UI_SCALE | slider 80–200 % |
| Camera Wobble External / Internal | CAMERA_FX_EXTERNAL / INTERNAL | slider 0–2 (motion-sickness relevant) |
| **Advanced Tweakables** | ADVANCED_TWEAKABLES | toggle. Unlocks extra PAW options: autostrut, crossfeed toggles, rigid attachment, engine and RCS tweaks, centre-of-thrust and similar |
| Default Throttle in Prelaunch | PRELAUNCH_DEFAULT_THROTTLE | slider 0–100 % |
| Autohide Navball in Map View | AUTOHIDE_NAVBALL | toggle |
| Show Extended Burn Indicator | EXTENDED_BURNTIME | toggle |
| KerbNet Map Aligns with Orbit | KERBNET_ALIGNS_WITH_ORBIT | toggle |
| Advanced Message Application | ADVANCED_MESSAGESAPP | toggle |
| Ghosted Navigation Markers on Navball | NAVIGATION_GHOSTING | toggle |
| EVA: Helmet on / Neck ring on by default | EVA_DEFAULT_HELMET_ON / NECKRING_ON | toggle |
| Kerbals stop at end of ladder | EVA_LADDER_CHECK_END | toggle |

Separate scale fields exist in `settings.cfg` for the navball, the time-warp widget, the altimeter, the staging stack and the app launcher. They multiply with UI_SCALE [S10] *(exact field names unverified)*.

**System**

| Row | Field | Control |
|---|---|---|
| Exit-to-main-menu confirmation | SHOW_EXIT_TO_MENU_CONFIRMATION | toggle |
| Wrong-vessel-type-on-launch confirmation | SHOW_WRONG_VESSEL_TYPE_CONFIRMATION | toggle |
| Delete-alarm confirmation | SHOW_DELETE_ALARM_CONFIRMATION | toggle |
| **Simulate in Background** | SIMULATE_IN_BACKGROUND | toggle: keep running when the window loses focus |
| Don't show game launcher | dontShowLauncher | toggle |
| Version watermark | SHOW_VERSION_WATERMARK | toggle |
| Analytics dialog next start | SHOW_ANALYTICS_DIALOG | toggle (telemetry consent) |
| **Max Persistent Debris** | MAX_VESSELS_BUDGET | 0–10,000 (250 in 1.0.5 [S2]) |
| Tidy up KSC debris | DECLUTTER_KSC | toggle |
| **Max Physics Delta-Time per Frame** | PHYSICS_FRAME_DT_LIMIT | 0.03–0.12 s (performance vs accuracy) |
| Orbital Drift Compensation | ORBIT_DRIFT_COMPENSATION | toggle |
| Ease in Gravity | PHYSICS_EASE | toggle (soft physics start on load) |
| Verbose Logging | VERBOSE_DEBUG_LOG | toggle |
| [MH] GAP camera uses VAB controls / minimum canvas zoom | MISSION_GAP_* | toggle / slider |

**Map-view rows** (shown under Graphics → Gameplay in the mod mirror) [S8]: Conic Patch Draw Mode (about five ways to draw the trajectory past an SOI change [S9]), Conic Patch Limit (how many future SOI patches to draw; 3 in 1.0.5 [S2]), Orbit Line Fade Strength, Orbit Line Fade Reversed, Always Show Closest Approach for Target, CommNet Line Brightness.

**settings.cfg-only** [S2][S9]: AUTOSAVE_INTERVAL = 300 s, AUTOSAVE_SHORT_INTERVAL = 30 s, CHECK_FOR_UPDATES, CALL_HOME, SEND_PROGRESS_DATA, DONT_SEND_IP, SHOW_PWARP_WARNING (physics-warp warning), SHOW_CONSOLE_ON_ERROR, UI_OPACITY.

### 3.2 KSP1 Graphics tab [S2][S8]

| Group | Rows |
|---|---|
| Screen | Resolution, Full screen, V-Sync (off / every / every second vblank), Frame limit (FRAMERATE_LIMIT, default 60), UI scale |
| Detail | Render quality preset (Unity quality levels), Texture quality (full / half / quarter / eighth), Pixel light count, Anti-aliasing (off / 2× / 4× / 8×) |
| Brightness | Ambient light boost: global, map-only, editor-only (seeing dark sides) |
| Shadows / reflections | Shadow cascades (0–4), Celestial bodies cast shadows (eclipses on terrain), Reflection refresh mode (off / low / medium / high), Reflection texture resolution |
| Planets | Terrain detail (Low / Default / High, plus Ultra shaders from 1.9 *(unverified)*), Terrain shader quality, Terrain scatter on/off, Scatter density |
| Effects | Aerodynamic FX quality, Surface FX, Underwater FX, Highlight FX (part edge highlights), Part highlighter in flight, Part highlighter brightness |
| Hidden | SCREENSHOT_SUPERSIZE (screenshot resolution multiplier), FALLBACK_PART_SHADERS, PLANET_FORCE_SHADER_MODEL_2_0 [S2] |

### 3.3 KSP1 Audio tab [S8]

Master, Spacecraft, Ambience, UI, Music, Voices (each 0–100 %). The **Sound Normalizer** has enabled, threshold (0–5) and responsiveness (0–32), and keeps loud engine noise from drowning everything else. KSP1 has **no subtitles** and no voice lines worth captioning [S18].

### 3.4 KSP1 Input tab [S2][S8]

- **Key bindings** grouped as Flight, Docking, EVA, Editors, Camera, Misc. About 127 bindings in total, each with **primary and secondary** keys, a group and a mode mask (which scenes it applies to) [S8].
- **Axis bindings**: pitch, roll, yaw, throttle, throttle increment, camera heading and pitch, translate X/Y/Z, wheel steer and throttle, and EVA translate and rotate axes. Each axis has a primary and secondary device axis with **deadzone, sensitivity and invert** [S2]. This is how joysticks, HOTAS and gamepads work on PC.
- **Mouse**: wheel sensitivity.
- **Keyboard sensitivity**: `INPUT_KEYBOARD_SENSIVITITY` (sic) [S2].
- **TrackIR**: enable, plus per-scene toggles (flight external, IVA, EVA, map, KSC, tracking station, editors) [S8].
- **6-DOF (SpaceNavigator)**: camera and flight sensitivity and sharpness, a roll-lock key, and a camera/flight switch key [S8].
- **Camera sensitivities** (settings.cfg only): VAB and flight orbit and zoom sensitivity, chase sharpness, chase uses the velocity vector [S2].
- **Console (Enhanced Edition)**: a full controller scheme with radial menus and a cursor mode. PC has no controller UI navigation *(unverified)*.

### 3.5 KSP1 debug options (Debug Toolbar, Mod+F12) [S4]

From 1.7 the sections are **Console, Database, Cheats, Physics, Contracts, Kerbals**, plus DLC sections [S4].

| Section | Contents |
|---|---|
| Cheats | **Hack Gravity** (slider 0.01–10 g), **Unbreakable Joints**, **No Crash Damage** (unreliable at high speed), **Ignore Max Temperature**, **Infinite Propellant** (can overheat modded engines), **Infinite Electricity**, **Biomes Visible in Map**, Part Clipping in Editors, Non-Strict Part Attachment Checks, Pause on Vessel Unpack *(verified 2026-10-18: [S33])*, **Set Orbit** (body plus seven elements; "set" teleports the vessel) and Rendezvous (teleport within 150 m of a target), Set Position (teleport to a body at zero speed) *(verified 2026-10-18: [S33])*, buttons to change **Science, Reputation** (±10/±100) and **Funds** (±1,000/±100,000) or max them, plus Technology/Facility/Experience/Progression unlock-all buttons *(corrected 2026-10-18: [S33])*, **Set Vessel Situation** *(still unverified: not in the archived page)* |
| Physics | Physics database load/save, autostrut visualisation, orbit targeting; Aero ("Display Aero Data in action menus", aero GUI, force display, lift multipliers), Drag and Thermal sub-screens *(corrected 2026-10-18: [S33])* |
| Console | Log view, a debug-screen-on-error option, log-file options [S28] |
| Database | Reload all game data (configs, parts) without restarting. Used by modders |
| Contracts | Tab exists *(verified 2026-10-18: [S33])*; spawn/complete detail *(still unverified)* |
| Kerbals | Create kerbals with chosen name, gender, trait and level (added 1.2) *(verified 2026-10-18: [S33])* |

Console: using the cheat menu blocks trophies for the rest of the save [S30]. On PC there are no achievements to block.

### 3.6 KSP2 settings

Reported tabs: General / Gameplay, Graphics, Audio, Input, Accessibility *(unverified)*. Graphics rows a community performance guide mentions [S16]: **environment props, environment density, draw distance, ground shading, texture quality, shadow detail, atmospheric clouds** (the heaviest option; lowering it can double the frame rate), anti-aliasing, anisotropic filtering. There is **no ultrawide option in the menu**; it needs a config edit [S17]. Audio has per-channel volumes, including music *(unverified list)*. Input: rebinding through the Unity InputSystem. Gamepads were poor without the Inputbinder mod [S13]. Players asked for a UI/HUD scale; I could not confirm whether KSP2 shipped one *(unverified)*. KSP2 added a "Toggle Flight HUD" key (F2) [S11].

---

## 4. Meta and system features

### 4.1 Saves

| Feature | KSP1 | KSP2 | Source |
|---|---|---|---|
| Container | `saves/<name>/` holding persistent.sfs, quicksave.sfs, Ships/, Subassemblies/, Backups/ | Campaign folder with many save files | [S27] |
| Multiple saves | Yes, via Resume Game | Yes, campaigns and saves inside them | [S27] |
| Autosave | One rolling persistent.sfs, written every AUTOSAVE_INTERVAL (300 s) and on scene changes | Autosave slots inside the campaign *(interval setting unverified)* | [S2][S9][S27] |
| Quicksave | F5 to one slot. Mod+F5 names a slot | F5, one slot plus named saves | [S1] |
| Quickload | Hold F9. Mod+F9 picks a named slot. Disabled by a difficulty option | F9, press or hold | [S1][S26] |
| Load dialog | Esc menu at the KSC; Mod+F10 | Esc → Load | [S1] |
| Revert | Esc → Revert to Launch / Revert to VAB (or SPH). Disabled by a difficulty option | Same, toggled by the "Allow Revert" option | [S5][S14] |
| Save on exit | Writes persistent.sfs on quitting to the main menu | Yes | [S27] |
| Backups | `Backups/` folder | — | [S27] |
| Safety | Holding F9; an exit-to-menu confirmation setting | — | [S1][S7] |

### 4.2 Craft sharing

- **[KSP1]** `.craft` files are text, stored per save in `Ships/VAB`, `Ships/SPH` and `Subassemblies` [S27]. Stock craft are copied in when "Allow Stock Vessels" is on.
- **Steam Workshop [KSP1]**: craft (and MH missions *(unverified)*) can be exported from the editor and subscribed to. A 1.4.5 fix saves the craft before export so the Workshop item ID stays in the file [S19].
- **KerbalX** (third party): uploads craft, scans them for the mods they need, and lists those on the craft page [S20]. Sketchfab could also show KSP craft in 3D [S19].
- **[KSP2]** Workspaces are per campaign. Sharing means copying files by hand [S27]. There was no Workshop.

### 4.3 Screenshots, flight log, overlays

- F1 takes a screenshot, with a supersize multiplier for higher resolution. F2 hides the UI for clean shots [S1][S2].
- **F3 flight results**: an event log of the flight. It records part destruction (with cause: overheating, impact, structural failure), staging, altitude and speed records, and the final outcome. It pops up after a crash. It is KSP1's after-action report [S1][S2].
- F4 toggles labels. F10, F11 and F12 toggle the thermal and aero overlays [S1].

### 4.4 Mods

- **[KSP1]** Everything lives in `GameData/`. Part configs are text, and plugins are .NET DLLs. **Module Manager** is the de-facto patch layer that edits configs without overwriting them. **CKAN** is the community package manager with dependency resolution. SpaceDock and CurseForge host mods. The Database section of the debug toolbar reloads configs live. See `12-modding.md` in the KSP2 refs.
- **[KSP2]** BepInEx / SpaceWarp, Patch Manager, and the CKAN fork. Mods such as LogConsole and Inputbinder fill gaps in the base game [S13].

### 4.5 Localisation

**[KSP1]** English, Spanish, Simplified Chinese, Japanese and Russian came first. 1.4 added **French, German, Italian and Brazilian Portuguese** [S18]. That makes nine interface languages, with no audio or subtitle localisation [S18]. Text is keyed `#autoLOC_*` in `dictionary.cfg`, and mods can add languages. **[KSP2]** A wider list was reported (including Korean, Polish and Traditional Chinese) *(unverified)*.

### 4.6 Achievements

- **[KSP1 PC]**: **no Steam achievements**. Players have asked for them [S21]. In-game "progress" milestones (first orbit, first landing per body) feed Career rewards and the progress tracking archive, and the mod "KSP Achievements" adds about 145 [S21].
- **[KSP1 console]**: 44 Xbox achievements and PlayStation trophies. Opening cheats disables them [S21][S30].
- **[KSP2]**: Steam achievements *(unverified whether any shipped)*.

### 4.7 Tutorials, scenarios, KSPedia

- **[KSP1] Training** (Start Game → Training). Text-and-checkpoint lessons covering basic construction, basic flight, intermediate construction, orbiting, docking, plane construction and flight, science, EVA, and the two-part Asteroid Redirect Mission [S29]. The 1.1 list (Basic/Intermediate/Advanced Construction, Suborbital Flight, Go For Orbit, Orbit 101, Science Basics, three Mun lessons, Docking, two asteroid lessons) is *(verified 2026-10-18: [S36])*; plane and EVA lessons *(still unverified)*. The ARM lessons cannot be saved mid-way [S29].
- **[KSP1] Scenarios**: prebuilt saves with a goal (for example a station resupply and "Refuel at Minmus") *(unverified list)*. **[MH]** adds the **Mission Builder** and stock missions (historic-style missions with scoring, plus a mission editor).
- **KSPedia [KSP1]**: an in-game illustrated encyclopedia, opened from the app launcher. Mods can add pages. Added in 1.1 *(verified 2026-10-18: [S36])*.
- **[KSP2] Training Center**: four sets of animated lessons (7, 6, 4 and 4 lessons) [S22].

### 4.8 Credits, telemetry, crash reports, updates

- **[KSP1]** Credits on the main menu. **Telemetry**: Unity Analytics with a consent dialog (SHOW_ANALYTICS_DIALOG), plus CALL_HOME and SEND_PROGRESS_DATA in settings.cfg, and an update check (CHECK_FOR_UPDATES) [S2][S7]. Unity writes crash dumps and `KSP.log`.
- **[KSP2]** Private Division launcher, telemetry and crash reporter *(unverified detail)*.

### 4.9 Performance options [KSP1]

Max physics delta-time per frame, max persistent debris, simulate in background, terrain detail and scatter, shadow cascades, aero FX, frame limit, reflections, and the conic patch limit [S7][S8]. The physics-warp warning and the "Ease in Gravity" load smoothing help stability.

### 4.10 Pause behaviour

Esc pauses the whole simulation in every scene, and the debug and settings windows can open while paused. SIMULATE_IN_BACKGROUND decides whether the game keeps running when the window loses focus [S7]. Time warp cannot start while the vessel is under acceleration, and physics warp shows a warning [S2]. **[KSP2]** behaves the same way, with an explicit Pause key in Global [S11].

---

## 5. Accessibility

| Aspect | KSP1 | KSP2 | Note for Orbital |
|---|---|---|---|
| Colourblind modes | **None.** Navball colours (prograde yellow-green, normal purple, radial cyan, target magenta) and the comms line colours are fixed | None found *(unverified)* | Shape-coded markers (ours have distinct glyphs?) plus a palette option |
| Text and UI scale | UI scale 80–200 %, plus separate navball and other widget scales in the cfg [S7][S10] | Requested *(unverified)* | Ours: 80–150 %. Extend to 200 % for 4K and TV |
| High contrast | No | No | **Ours has it (ahead)** |
| Remapping | Every key, primary and secondary. Axes with deadzone, sensitivity and invert [S2] | Full remap, weak gamepad [S13] | Ours: one key per action in the UI, more in storage. Axes missing |
| Controller | Joystick axes on PC; full controller scheme on console | Weak | Gamepad API: fly with sticks first, menus later |
| Motion | Camera wobble sliders (external and internal) [S7] | ? | Ours: reduced-motion CSS. Add a camera-shake slider |
| Audio | Six channels and a normaliser, no subtitles | — | Ours: master, effects, UI, mute. Add music when music exists |
| Time pressure | Pause anywhere, warp control | Same | Keep pause-anywhere |
| Touch | None | None | **Ours has touch controls (ahead)** |
| Screen readers / keyboard-only UI | No | No | Ours: segmented controls with arrow keys; can go further |
| Units | Metric only (Kerbin or Earth time choice) | Metric | Ours: metric or imperial (ahead) |

---

## 6. Implications for Orbital: launch checklist

Priority: **P0** blocks a public launch, **P1** expected by KSP players and should ship soon after, **P2** later.

### 6.1 Settings and options

| Option | KSP reference | Orbital today | Priority |
|---|---|---|---|
| Key rebinding with clash handling | Input tab | **Have** (one key per action shown) | — |
| Primary + secondary key per action | Input tab | Partial (defaults may have two, the UI sets one) | P1 |
| Reset all bindings | Input tab | Have (per action), all *(check)* | P1 |
| Help list of keys | Esc → Controls (console) | **Have** (?, F1) | — |
| UI scale | 80–200 % | Have, 80–150 % | P1: extend to 200 % |
| HUD element scales (navball etc.) | cfg | Missing | P2 |
| High contrast | — | **Have** | — |
| Colourblind palette for markers and orbit lines | Missing in KSP | Missing | P1 |
| Units | Kerbin or Earth time | Have (metric/imperial). **Missing: day-length / calendar display** | P1 |
| Master / effects / UI volumes, mute | 6 channels | Have 3 + mute | P1: add music and ambience when they exist |
| Graphics preset + auto | Quality preset | **Have** (low, medium, high, auto, adaptive) | — |
| Individual graphics toggles (shadows, clouds, scatter, AA, pixel ratio, frame cap) | Graphics tab | Missing (internal only) | P1: expose 5–6 of them |
| Frame-rate cap / power saving | FRAMERATE_LIMIT | Missing | P1 (laptops) |
| Ambient light boost (see dark sides) | Graphics | Missing | P2 |
| Camera shake / wobble slider | General | Missing | P1 (motion sickness) |
| Mouse / zoom sensitivity, invert | settings.cfg | Missing | P1 |
| Gamepad / joystick axes, deadzone | Input tab | Missing | P2 (P1 for the throttle axis) |
| Touch controls | — | **Have** | — |
| Simulate in background (tab hidden) | System | Implicit (autosave on hide); behaviour undocumented | P1: explicit "pause when tab hidden" (default on) |
| Max debris | System | Missing | P2 |
| Conic patch limit / draw mode | Map | Missing | P2 |
| Confirmation toggles (exit, launch wrong site) | System | Missing | P2 |
| Advanced tweakables | General | Unknown | P2 |
| Language | 9 languages | English only | P2 (prepare string keys now: P1) |
| Telemetry / crash-report consent | Analytics dialog | None (good for privacy) | P1 if we add any; P0 if we collect data at all |
| Reset all settings / export settings | — | Missing | P1 |

### 6.2 Difficulty / world rules

| Rule | KSP | Orbital (`mods/stock/src/rules.ts`) | Priority |
|---|---|---|---|
| Mode presets | Sandbox / Science / Career / Mission | **Have** 5 presets | — |
| Difficulty presets (Easy…Hard) inside a mode | Easy, Normal, Moderate, Hard, Custom | Partial (Career hardcore and engineering) | P1: add Easy/Normal/Hard as rule bundles |
| Allow revert | on, off on Hard | **Missing as a rule** (revert exists in flight) | **P0** (Ironman players expect it) |
| Allow quickload | on, off on Hard | **Missing as a rule** | **P0** |
| Allow stock vessels | toggle | Missing | P2 |
| Funds / science multipliers | 10–1000 % | **Have** (funds, cost, science) | — |
| Reputation multipliers, penalties | 10–1000 % | Missing (no reputation?) | P1 if reputation exists |
| Starting funds / science / rep | per preset | Have funds only | P1 |
| Missing crew respawn + timer | toggle + 2 h | **Have** (crew-death: return, days) | — |
| Re-entry heating scale | 0–120 % *(still unverified range)* | Missing | **P0** (the most-used KSP accessibility knob) |
| Resource abundance | % | Missing | P2 (when resources exist) |
| Indestructible facilities | toggle | Missing | P2 |
| CommNet on / off | toggle | **Have** | — |
| Require signal for control | toggle | **Have** (full / partial / none, richer) | — |
| Plasma blackout | toggle | Partial (`blackout.ts` exists; no rule) | P1 |
| Range modifier / DSN modifier | multipliers | Have range scale. DSN missing | P2 |
| Occlusion multipliers / extra ground stations | — | Interference rule | P2 |
| Kerbal experience / immediate level-up | toggles | Have experience. Immediate level-up missing | P2 |
| Kerbal G limits + tolerance | toggle + multiplier | Have (G-load and radiation) but no tolerance multiplier | P1 |
| Part G / pressure limits | toggles | Missing | P2 |
| Crash tolerance obeyed | always (cheat overrides) | n/a | — |
| Action groups always available | toggle | Missing (if facility-gated) | P2 |
| Other launch sites | toggle [MH] | Site model | P2 |
| Allow negative funds | toggle | Missing | P2 |
| Changeable mid-game with a record | KSC pause menu | `changeable` flag per rule | — (add a change log: P1) |
| Scene permissions (for lessons) | FLIGHT/EDITOR flags | Missing | P1 for tutorials |

### 6.3 Keys to add or change before launch

1. **P0**: RCS toggle (R), gear (G), lights (U), abort (Backspace, or a non-reserved key), **hide UI (F2)**, screenshot (F1 → move help to `?` only, or keep both and add screenshot to another key), stop warp (/), camera reset.
2. **P0 conflicts to settle**: brakes C → B; trim [ ] → Alt/Shift+WASD, so [ ] can switch vessels; speed mode V → leave V for the camera mode; mute N → M is taken, so use Ctrl+M or no default. Decide whether the digit row is SAS (ours) or action groups (KSP). Offer a **"KSP classic" key profile** next to ours.
3. **P1**: RCS translation (H N I K J L, needs node keys moved, e.g. to the numpad or Shift), precision mode (Caps Lock), docking mode, physics warp (Shift + . ,), next/previous vessel, F3 flight log, F4 labels, map focus previous/reset, stage lock, navball toggle.
4. **P1 VAB**: WASDQE rotate with Shift for fine steps, C angle snap, R symmetry method, 1–4 gizmo modes, copy (Ctrl+C/V like KSP2), Ctrl+F search alias.
5. **P2**: EVA set (when EVA exists), joystick axes, a binding profile export.

### 6.4 Meta features

| Feature | Orbital | Priority |
|---|---|---|
| Multiple saves / worlds, load dialog, thumbnails | **Have** | — |
| Autosave (timer + events), quicksave/quickload | **Have** | — |
| Rolling autosave ring + backups | Check (`saves.ts`) | P1 |
| Save export / import file (browser storage is fragile) | Check | **P0** (localStorage and IndexedDB can be evicted) |
| Revert to launch / to VAB | Have | — |
| Craft export/import (file, link) | Library exists. Sharing is unclear | P1 |
| Screenshot key + hide UI | Missing | P0/P1 |
| Flight results / event log (F3) | Missing (replays exist) | P1 |
| Mods manager | **Have** | — |
| Achievements | **Have** | — |
| Tutorials | First-flight guide | P1: more lessons, scenario templates |
| KSPedia-style help | Help key list only | P2 |
| Cheats / debug menu (infinite fuel, no crash, set orbit, hack gravity, unbreakable joints, add funds) | Dev-only autopilot | P1: sandbox-only cheat panel, flagged in the save |
| Credits | **Have** (`/credits` route) | — |
| Localisation | English only | P2 |
| Telemetry | None | Keep none, or add opt-in only |
| Pause when hidden, Esc pause | Have Esc | P0: make sure the hidden tab pauses or keeps running consistently |

---

## Sources

All checked 2026-10-18.

- [S1] Steam Community guide, "All Key bindings – Kerbal Space Program". https://steamcommunity.com/sharedfiles/filedetails/?id=2158532486. Community guide (KSP 1.x). Medium-high.
- [S2] KSP 1.0.5 `settings.cfg` dump. https://pastebin.com/p907ejAF. Game file, high for that version. Some defaults changed later.
- [S3] KSP Wiki, "Key bindings" (also /wiki/Keys). https://wiki.kerbalspaceprogram.com/wiki/Key_bindings. Official community wiki, read via search excerpts because the fetch was blocked. High.
- [S4] KSP Wiki, "Debug Toolbar". https://wiki.kerbalspaceprogram.com/wiki/Debug_Toolbar. Read via search excerpts. High, but the page is about two years old.
- [S5] KSP 1.4.2 `persistent.sfs` (PARAMETERS block). https://pastebin.com/0uB0GHng. Game file, high for 1.4.2. Includes some mod nodes (Contract Configurator) that I ignored.
- [S6] KSP Wiki, "Game Difficulty". https://wiki.kerbalspaceprogram.com/wiki/Game_Difficulty. Read via search excerpts. High.
- [S7] ReDefinition issue #15, "KSP settings: Gameplay and System (KSP's General tab)". https://github.com/CaptainKeyboard/ReDefinition/issues/15. A mod mirroring KSP 1.12's settings screen field by field. Medium-high.
- [S8] ReDefinition `KSP.cfg` and issues #14 (Audio), #16 (Mouse/TrackIR/6-DOF), #23 (Graphics rows), #8 (bindings). https://github.com/CaptainKeyboard/ReDefinition. Medium-high.
- [S9] KSP Wiki, "Settings.cfg". https://wiki.kerbalspaceprogram.com/wiki/Settings.cfg, plus a Steam thread on conic draw modes: https://steamcommunity.com/app/220200/discussions/0/1500126447381947872. Read via excerpts. Medium.
- [S10] KSP Forum, "4K resolution – UI too small". https://forum.kerbalspaceprogram.com/topic/154337-4k-resolution-ui-too-small/. Forum, medium.
- [S11] DefKey, "Kerbal Space Program 2 keyboard controls". https://defkey.com/kerbal-space-program-2-shortcuts. Aggregator, medium-low (one time-warp glyph looks wrong).
- [S12] Gamepressure, "Controls in KSP 2". https://www.gamepressure.com/newsroom/controls-in-ksp-2-we-will-guide-you/z4518f. Games press, medium.
- [S13] Codenade, ksp2-inputbinder README. https://github.com/Codenade/ksp2-inputbinder/blob/0.5.4/README.md. Mod documentation, medium.
- [S14] WeMod community, "Kerbal Space Program 2 Cheats and Trainer". https://community.wemod.com/t/kerbal-space-program-2-cheats-and-trainer-for-steam/253019. Trainer that mirrors in-game toggles. Low-medium (names only).
- [S15] GameBuff, KSP2 trainer page. https://gamebuff.cn/en/game/standard/kerbal-space-program-2.html. Low.
- [S16] Steam guide, "How To Improve Framerate Of KSP 2 Without Sacrificing Visuals". https://steamcommunity.com/sharedfiles/filedetails/?id=3100727423. Read via excerpt. Medium.
- [S17] Gamepressure, "How to Run KSP2 in Ultrawide". https://www.gamepressure.com/newsroom/how-to-run-kerbal-space-program-2-in-ultrawide-resolution/z2517e. Read via excerpt. Medium.
- [S18] KSP Wiki "1.4" (four new languages): https://wiki.kerbalspaceprogram.com/wiki/1.4, and Steambase language table: https://steambase.io/games/kerbal-space-program/info. Medium-high.
- [S19] Kerbal Space Program "Learn" page (Steam Workshop): https://kerbalspaceprogram.com/learn; Softpedia KSP changelog 1.4.5: https://games.softpedia.com/progChangelog/Kerbal-Space-Program-Changelog-95208.html; Sketchfab blog. Read via excerpts. Medium.
- [S20] KerbalX, About. https://kerbalx.com/about. Read via excerpt. Medium-high.
- [S21] TrueAchievements KSP (Xbox, 44 achievements): https://www.trueachievements.com/game/Kerbal-Space-Program/achievements; KSP Forum "Steam achievements": https://forum.kerbalspaceprogram.com/topic/156049-steam-achievements; CurseForge "KSP Achievements" mod. Medium.
- [S22] kerbal.wiki, "Tutorials" (KSP2). https://kerbal.wiki/Tutorials. Community wiki, medium-high.
- [S23] KSP Forum, "KSP 2 and missing challenges". https://forum.kerbalspaceprogram.com/topic/222838-ksp-2-and-missing-challenges. Read via excerpt. Medium-low.
- [S24] KSP Wiki, "Skill" / "XP". https://wiki.kerbalspaceprogram.com/wiki/Skill. Read via excerpt. High.
- [S25] KSP Forum, "changing G-force tolerance". https://forum.kerbalspaceprogram.com/topic/200153-changing-g-force-tolerance/. Read via excerpt. Medium.
- [S26] KSP Forum, "KSP2 Keybinds" (KSP2 Dev Updates). https://forum.kerbalspaceprogram.com/topic/218360-ksp2-keybinds/. Read via excerpt. Medium-high (official subforum).
- [S27] Internal: `refs/reverse-engineering-ksp2/01-game-structure-and-modes.md` and its sources (KSP Wiki Game Difficulty, KSP2 patch notes). Secondary.
- [S28] Steam discussion on the KSP1 debug menu (Alt+F2 console, version-number click). https://steamcommunity.com/app/220200/discussions/0/4120176169357202767. Read via excerpt. Low.
- [S29] KSP Forum, "All training missions start except Asteroid Redirect Part 1". https://forum.kerbalspaceprogram.com/topic/192149-all-training-missions-start-except-asteroid-redirect-part-1. Read via excerpt. Medium-low.
- [S30] PlayStationTrophies, "Easy Platinum Guide (cheat warning)". https://www.playstationtrophies.org/forum/topic/298337-easy-platinum-guide-1-2-hours-cheat-warning/. Medium-low.
- [S31] KSP Wiki, "Key bindings" (Internet Archive snapshot, page last edited 20 Mar 2023). https://web.archive.org/web/20240105022508/https://wiki.kerbalspaceprogram.com/wiki/Key_Bindings. Official community wiki, full text. High.
- [S32] KSP Wiki, "Game Difficulty" (archive). https://web.archive.org/web/20240121084144/https://wiki.kerbalspaceprogram.com/wiki/Game_Difficulty. High.
- [S33] KSP Wiki, "Debug Toolbar" (archive). https://web.archive.org/web/20240121092844/https://wiki.kerbalspaceprogram.com/wiki/Debug_Toolbar. High (describes 1.7+).
- [S34] KSP Wiki, "Settings" (archive, describes 1.4). https://web.archive.org/web/20240105230555/https://wiki.kerbalspaceprogram.com/wiki/Settings. High.
- [S35] KSP Wiki, "Kerbonaut" (archive). https://web.archive.org/web/20240105030702/https://wiki.kerbalspaceprogram.com/wiki/Kerbonaut. High.
- [S36] KSP Wiki, "1.1" and "1.7" changelogs (archive). https://web.archive.org/web/20240422180507/https://wiki.kerbalspaceprogram.com/wiki/1.1 ; https://web.archive.org/web/20240121091711/https://wiki.kerbalspaceprogram.com/wiki/1.7. High.
- [S37] KSP Wiki, "1.12" changelog (archive). https://web.archive.org/web/20240121090620/https://wiki.kerbalspaceprogram.com/wiki/1.12. High.
- [S38] KSP Wiki, "Making History" (archive). https://web.archive.org/web/20240108005927/https://wiki.kerbalspaceprogram.com/wiki/Making_History. High.
- [S39] KSP Wiki, "Island Airfield" (archive). https://web.archive.org/web/20240213223417/https://wiki.kerbalspaceprogram.com/wiki/Island_Airfield. High.
- [S40] KSP Wiki, "1.6" changelog (archive). https://web.archive.org/web/20240121092216/https://wiki.kerbalspaceprogram.com/wiki/1.6. High.
- [S41] KSP Wiki, "EVA Construction Mode" (archive). https://web.archive.org/web/20240106115233/https://wiki.kerbalspaceprogram.com/wiki/EVA_Construction_Mode. High.

## Needs verification

Fetch these pages in a normal browser (the wiki and forums blocked automated fetches) and correct the items marked *(unverified)*.

1. **Full preset table** (re-entry heating %, resource abundance, Advanced and CommNet toggles per Easy/Normal/Moderate/Hard, reputation reward values, decline penalty, re-entry heating range): https://wiki.kerbalspaceprogram.com/wiki/Game_Difficulty
   - 2026-10-18: basic-option presets, starting values and all reward/penalty multipliers (incl. reputation) verified from the archived page [S32]; Auto-hire and Allow Stock Vessels corrected. Still unverified: re-entry heating %, resource abundance, Advanced/CommNet per-preset values and the decline penalty (not on the archived page).
2. **1.12 AdvancedParams keys** (negative funds, science and reputation split; EnableFullSASInSandbox): open a 1.12 `persistent.sfs`, or https://wiki.kerbalspaceprogram.com/wiki/1.12
   - Still unverified: needs a 1.12 save file; 1.6 confirms a probe-SAS toggle setting exists [S40] but not its key name.
3. **Complete key list including the 1.11/1.12 EVA and editor keys** (helmet O, parachute P, construction I, any maneuver-editor keys; ` vs Backspace for camera reset; Mod+F10; Alt+F2): https://wiki.kerbalspaceprogram.com/wiki/Key_bindings
   - 2026-10-18: done from the archived key table [S31]. Helmet O (1.6), parachute P (1.4.0), construction I (1.11.0), Mod+F10 verified; camera reset is ` (corrected). Still unverified: Alt+F2 (not in the table).
4. **Debug toolbar Cheats list for 1.12** (part clipping, non-strict attachment, set position, funds/science/rep, Kerbals and Contracts tabs): https://wiki.kerbalspaceprogram.com/wiki/Debug_Toolbar
   - 2026-10-18: verified/corrected from the archived page [S33]. Still unverified: "Set Vessel Situation" and Contracts-tab detail.
5. **KSP1 per-widget UI scale field names** (navball and others): https://wiki.kerbalspaceprogram.com/wiki/Settings.cfg and https://forum.kerbalspaceprogram.com/topic/154337-4k-resolution-ui-too-small/
   - Still unverified: the archived Settings page [S34] only names a single UI Scale (default 100 %).
6. **Training and scenario lists** (KSP1 1.12): https://wiki.kerbalspaceprogram.com/wiki/Tutorial and the in-game `Scenarios/` and `Tutorials/` folders
   - Partly verified: 1.1 tutorial list [S36]. Still unverified: scenario list and later plane/EVA lessons (wiki Tutorial page is a user-guide index).
7. **KSPedia introduction version**: https://wiki.kerbalspaceprogram.com/wiki/KSPedia
   - Verified 2026-10-18: added in 1.1 [S36].
8. **Steam Workshop in KSP1** (version added, missions included): https://wiki.kerbalspaceprogram.com/wiki/1.4 and the Steam news for 1.4.0
   - Still unverified: the archived 1.4 page was not read for Workshop details; MH missions in Workshop not confirmed.
9. **KSP2 difficulty screen, settings tabs, UI scale, accessibility, Alt+C cheats, achievements, languages, autosave interval**: https://forum.kerbalspaceprogram.com/topic/221279-ksp2-release-notes-for-science-milestone-v0200/, https://www.pcgamingwiki.com/wiki/Kerbal_Space_Program_2, https://forum.kerbalspaceprogram.com/topic/218360-ksp2-keybinds/
   - Still unverified: forum blocked; no archived KSP2 settings source found this pass.
10. **KSP1 PC data** (languages, controller support, Workshop, achievements cross-check): https://www.pcgamingwiki.com/wiki/Kerbal_Space_Program
   - Still unverified: not fetched this pass.
11. **[BG] robotics axis-group keys** and any **[MH]** Mission Builder shortcuts: https://wiki.kerbalspaceprogram.com/wiki/Breaking_Ground and https://wiki.kerbalspaceprogram.com/wiki/Making_History
   - Still unverified: the archived key table [S31] lists no robotics or Mission Builder keys, which suggests none exist, but no page says so.
