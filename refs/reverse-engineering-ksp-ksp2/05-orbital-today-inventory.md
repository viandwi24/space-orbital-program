# 05 — Space Orbital Program today: a code inventory

> Read-only inventory of the checkout at branch `lead/followups`, 2026-10-18 (plans 001–132 and 190–191 done; 133, 192, 193 are drafts). For comparison with the KSP1/KSP2 research in this folder. Paths are relative to the repo root; `web/` means `apps/web/src/`. "Implemented" means the code exists and is wired to the UI; "partial" means it exists but is limited; "missing" means no code was found by search. Nothing was run: no build, test, dev server or browser. The flight HUD layout section is read from CSS only.
>
> Scope note: section 1 was traced by hand; sections 2 and 3 come from focused read-only audits of the editor and flight-control code; section 4 is read from CSS only.

Sources read first: `docs/STATUS.md`, `docs/product/visual-direction.md`, `docs/decisions/0107-ui-adopts-the-refs-visual-language-in-stages.md`, `docs/decisions/0118-mission-center-system-scope-own-sim-and-fly.md`, `refs/space-orbital-program-ui/` (`README.md`, `docs/CONCEPT.md`, `docs/SCREENS.md`, `docs/STYLE.md`, `tokens/`), and the plan titles in `docs/plans/`.

---

## 0. The intended design, in one paragraph

The UI concept (`refs/space-orbital-program-ui/docs/CONCEPT.md`, `SCREENS.md`) is "Tesla for rockets". The flow is Home → Worlds → Space Center → {Hangar → Launch → Flight ⇄ Map → Mission Center, Astronaut Complex, R&D, Administration}. Each flight-type screen has a world capsule with a home button back to the Space Center (`README.md`, "Alur navigasi"). The flight HUD (`SCREENS.md` §1) has:

- top left: the world capsule and a time control with play/pause, 8 warp segments and MET/UT;
- top right: the toolbar `Map · VAB · Camera | Dock · Vessel · Staging · Nav · Crew | Menu`;
- left: the dock rail with the Panel library;
- right: the vessel panel (Overview, Parts, Comms);
- bottom centre: a 390×262 navball module;
- bottom left: staging, 220 wide;
- bottom right: crew, 220 wide.

Panel widths: Staging/Crew 220, Dock 280, Vessel 300, detail 320–520 (`STYLE.md` §4). ADR 0107 adopts these tokens with these deviations: text never below 10 px, a UI scale of 80–150 %, 44 px touch targets, and support for 1024×768 tablets in landscape.

---

## 1. World time and screen flow

### 1.1 How the sim runs

- Every screen that needs the world starts **its own sim Worker**. `startSimWorker` builds it from a save (`resume`), from the world's start info (`world`), or empty (`web/lib/sim-client.ts:239-276`). There is no shared or persistent sim across routes; ADR 0118 states this in its context: "Every route starts its own sim Worker … there is no shared sim".
- The worker steps the sim from wall time on a `setInterval` (`web/lib/sim.worker.ts:64-67`). The host owns the clock (`web/lib/sim-host.ts:2`) and starts unpaused (`let paused = false`, `sim-host.ts:164`). It caps the wall delta so a stalled tab does not burst (`sim-host.ts:28`). So **on every screen that starts a sim, world time advances at 1× by default**.
- Pause is a message to the host (`SimClient.setPaused`, `sim-client.ts` interface, line ~46; handled at `sim-host.ts:599`). Warp is a `warp` or `warp-to` command (`sim-host.ts:101-108`). The steps are `[1, 2, 5, 10, 50, 100, 1 000, 10 000, 100 000]` (`web/lib/warp.ts:2`).
- **Catch up to now** (plan 087, ADR 0143): on a Gregorian calendar, a world behind the real date gets an offer to warp to it, and only when every vessel is on rails (`web/lib/worlds/world-model.ts:219-246`). The flight shows it in the time capsule (`web/routes/flight/+page.svelte:741-745`).
- Background operations while away come from the world tick (plan 082) and are not covered here.

### 1.2 Routes that start a sim

| Route | Starts a sim from | Code |
|---|---|---|
| `/flight` | `?load=<id>`, a scenario start, or the Hangar draft plus the newest world save (`into`) | `web/routes/flight/+page.svelte:335-400`, `web/lib/flight-loop.ts:237` |
| `/space-center` | newest world save, else world start info | `web/routes/space-center/+page.svelte:262-300`, `web/lib/space-center/space-center-loop.ts:43-46` |
| `/mission-center` | `?load`, else newest save, else start info (ADR 0118 §1) | `web/lib/mission-center/mission-center-loop.ts:51-54` |
| `/rnd` | newest save or world | `web/routes/rnd/+page.svelte:80` |
| `/administration` | newest save or world | `web/routes/administration/+page.svelte:99` |
| `/astronauts` | newest save or world | `web/routes/astronauts/+page.svelte:85` |
| `/test-stand` | newest save or world | `web/routes/test-stand/+page.svelte:90` |
| `/vab`, `/launch`, `/worlds`, `/` | no sim | — |

Every sim route disposes its worker when it unmounts: `administration:106`, `astronauts:92`, `flight:517`, `mission-center:276`, `rnd:90`, `space-center:304`, `test-stand:100`.

### 1.3 Screen × time behaviour

| Screen | Sim running? | Clock advances? | Pause control | Warp control | Saves on leave? | When it saves |
|---|---|---|---|---|---|---|
| Flight | yes | yes, 1× unless warped | partial: the pause button and Esc open the pause **menu**. Pausing is modal; there is no play/pause toggle that leaves the HUD usable (`WarpControl.svelte:28-50`, `flight/+page.svelte:521-526`) | yes: 9 segments with slower/faster buttons and `,`/`.` (`WarpControl.svelte`, `keybindings.ts:99-100`); warp-to-node (`flight/+page.svelte:842-843`) | **no**: the home capsule (`WorldCapsule.svelte:14`) and the toolbar VAB link (`AppBar.svelte:61`) are plain `<a href>` with no save first; only Map → Mission Center autosaves first (`flight/+page.svelte:228-231`) | timer every 120 s, min gap 15 s, only while flying (`save/autosave.ts:13,41`); on staging and touchdown (`flight:280-288`); when the tab is hidden (`flight:325-330`); F5 quicksave; before Recover (`flight:255-264`) |
| Map (inside flight) | same sim | yes | as flight | as flight | as flight | as flight |
| Mission Center | yes | yes, 1× | **missing** | partial: only "Warp to" per Upcoming event; the current warp is shown in the capsule (`MissionCenterOverlay.svelte:137-138,218`); no free warp segments | **no**: the back button goes to `/space-center` without saving (`MissionCenterOverlay.svelte:135`); only Fly autosaves (`mission-center/+page.svelte:228`) | Fly |
| Space Center | yes (sites, economy, construction) | yes, 1× | **missing** | **missing** | **no** | after a building is placed, upgraded or removed (`space-center/+page.svelte:172-177`) |
| R&D | yes | yes, 1× | missing | missing | no | after a research (`rnd/+page.svelte:64`) |
| Administration | yes | yes, 1× | missing | missing | no | after accept, decline or strategy (`administration/+page.svelte:125,136`) |
| Astronaut Complex | yes | yes, 1× | missing | missing | no | after hire or other actions (`astronauts/+page.svelte:104`) |
| Test stand | yes | yes | missing | missing | no | after a run (`test-stand/+page.svelte:74`) |
| Hangar (VAB), Launch, Worlds, Home | no sim | no | n/a | n/a | the Hangar draft is kept in local storage (`saveDraft`, `launch/+page.svelte:181`) | — |

The world clock is not shown on the Space Center, R&D, Administration or Astronaut Complex screens. The Space Center capsule shows only the world name and "Space Center" (`SpaceCenterOverlay.svelte:75-78`). The concept puts the world time top left (`SCREENS.md`, Space Center, "Kiri atas").

### 1.4 Navigation

- **Full reloads** (`location.assign`), which give a fresh Worker:
  - Flight → Mission Center (`flight:230`);
  - Recover → `/vab` (`flight:263`);
  - every `startLoad` (`/flight?load=`) on flight, space-center, mission-center, rnd, administration, astronauts and test-stand (lines 215, 52, 81, 38, 61, 52, 50);
  - Mission Center Fly (`mission-center:228`).
- **Client navigation** (SvelteKit `goto` or `<a href>`):
  - Hangar → Launch or Flight (`web/lib/vab/controller.svelte.ts:1148`);
  - Launch → Flight (`launch/+page.svelte:189`);
  - Worlds → Space Center (`worlds/+page.svelte:142`);
  - Space Center building links (`web/lib/space-center/model.ts:45-57`);
  - every BackButton (`web/lib/ui/BackButton.svelte:13-14`);
  - flight world capsule and AppBar VAB.

  `data-sveltekit-preload-data="hover"` is set globally (`web/app.html:11`).

### 1.5 Consequences for the player (from the code paths above)

1. **Time and state can be lost when leaving a screen.** Each screen resumes the *newest save*. If you fly, then click the home capsule 100 s after the last autosave, the Space Center resumes the older save. Those 100 s and the vessel's progress are gone. The same happens leaving the Mission Center, R&D, Administration, or the Space Center without a change.
2. **Clocks diverge.** Time that passes idly on a building screen is thrown away unless that screen happens to save.
3. **No warp outside flight and the Mission Center's warp-to.** KSP lets you warp at the KSC and in the Tracking Station. This build cannot wait out a construction or a contract deadline from the Space Center.
4. **Each screen change costs a sim boot.** ADR 0118, Consequences: "about the flight's load time".
5. **Pause equals the pause menu.** You cannot pause and keep inspecting the HUD or map (KSP1 has a pause menu too, but warp ×0 and the map remain usable in KSP2).

---

## 2. Hangar / VAB editor

There is a single route, `/vab`, labelled "Hangar" in the UI (`web/routes/vab/+page.svelte`, 431 lines, layout only). Where the logic lives:

- **Controller:** all state, pointer and keyboard handling are in `web/lib/vab/controller.svelte.ts` (1418 lines).
- **Pure editor logic:** `web/lib/editor/state.ts` (1069 lines), plus `checks.ts`, `stats.ts`, `stability.ts`, `staging.ts`, `categories.ts`, `part-info.ts`, `trip.ts` and `assembly.ts`.
- **Components:** `web/lib/vab/{Catalogue,StageEditor,StatsStrip,SelectionCard,ToolPill,TopBar,ChecksList,LibraryDialog}.svelte`.
- **Renderer:** `packages/renderer/src/vab/` (`view.ts`, `orbit-camera.ts`, `picking.ts`, `highlight.ts`, `stability-markers.ts`, `part-layer.ts`, `hangar*.ts`).

The VAB plans are all done: 022, 029, 034, 069, 073 and 093.

| Feature | State | Behaviour and evidence |
|---|---|---|
| Camera | implemented | Orbit camera: distance 2.5–60 m, max pitch 1.35 rad, pan kept inside a 14 m box (`renderer/src/vab/orbit-camera.ts:28-36,77,90,120`). `frame()` respects the side-panel insets (`view.ts:547,581-612`). No fixed top or side views |
| Picking and placement | implemented | A catalogue click arms a part (`controller:775`). The ghost preview comes from `buildScene` (`:297-313`). Pick order is node sphere, then part raycast, then ghost (`view.ts:627-656`). With nothing armed, a click selects. Struts and fuel lines take two clicks, snapping to 15° and 0.2 m (`controller:837-858`) |
| Stack attach nodes | implemented | Free nodes in opposite directions are paired, sorted top-down for Tab (`editor/state.ts:999-1061`) |
| Surface attach | partial | Radial only, for parts with a horizontal node, on cylinders and boxes. Uses angle and height, with three keyboard stops per cylinder (`state.ts:905,972,1040-1055`). You cannot attach to any surface the way KSP allows |
| Symmetry | partial | Radial ×1/2/3/4/6 (`state.ts:184`), cycled with X only while a part is armed (`controller:1347-1354`), plus ToolPill buttons (`ToolPill.svelte:15-27`). Group edits apply to every copy unless "Only this part" is set (`SelectionCard.svelte:106-113`). **No mirror symmetry** |
| Angle snap | partial | Fixed: 15° (or 360/(n·round(24/n)) with symmetry), height on a 0.125 m grid, and a pull to the parent's ends (`state.ts:954-970`). **Alt** turns snapping off (`controller:1227,1250`). No snap toggle or step setting |
| Offset / rotate | partial | Sliders, not 3D handles: angle 0–359° and height (`SelectionCard.svelte:134-195`), tilt X/Y/Z ±90° with Reset (`:197-230`), and Q/E turn (`controller:1355-1371`) |
| Re-root | **missing** | The root is fixed; no `reroot` in the code |
| Undo / redo | implemented | 100 steps (`state.ts:63,98-111`), buttons in ToolPill (`:46-59`) |
| Catalogue | implemented | Category rail from a registry; stock has 9 categories (`mods/stock/src/categories.ts:7-17`) and 23 parts (`mods/stock/src/parts.ts:62-776`). Search needs every word to match (`editor/categories.ts:142-146`). Cards show a 3D thumbnail, mass and cost; an info panel shows thrust, Isp and so on (`Catalogue.svelte:221-268`, `part-info.ts:17-78`) |
| Catalogue filters and sort | **missing** | Category is the only filter. Locked-tech parts are not marked in the catalogue; they only fail a launch check (`checks.ts:210`) |
| Sub-assemblies | implemented | Save the selected subtree with A or "Keep", then place it from the Sub-assemblies tab, with symmetry (`controller:724-748`, `state.ts:294`). **No merge of a whole craft** |
| Editor tweakables | **missing** | A design part holds only index, part, parent, symmetry, tilt and link (`packages/core/src/protocol.ts:433-463`). No fuel fill, thrust limit, decoupler force or crew seat. SelectionCard offers only a stage dropdown, sliders and Move/Detach/Delete/Keep (`SelectionCard.svelte:77-132`) |
| Staging editor | implemented | HTML5 drag-and-drop between stages, a new-stage row and the unstaged tray. Alt+↑/↓ moves a part between stages, and there is an Auto-stage button. Each stage shows Δv, TWR at ignition and burn time (`StageEditor.svelte:54-211`). Drag-and-drop does not work on touch |
| Action-group editor | **missing** | `design.groups` exists in core (`protocol.ts:457-462`), but nothing in `lib/vab` or `lib/editor` reads or writes it |
| CoM / CoL / CoT | implemented | Markers for CoM, CoP (standing in for CoL), CoM when empty, and CoT of the first stage's engines (`controller:236-279`). CoM and CoT toggles are in ToolPill (`:29-44`). A Stable/Marginal/Unstable tile shows the margin in calibres (`StatsStrip.svelte:43-67`). No thrust or lift vectors |
| Δv / TWR | partial | Per stage and in total (`stats.ts`, `web/lib/delta-v.ts`). Liftoff TWR is red below 1 and amber below 1.3 (`StatsStrip.svelte:34-42`). Only Sea level / Vacuum can be chosen (`stats.ts:16`, `StageEditor.svelte:116-127`), and gravity is always the home body's (`controller:131`). The trip planner has a destination drop-down (`StatsStrip.svelte:124-189`). **No per-body or altitude choice** |
| Pre-flight checks | implemented | **Errors (block launch):** empty or invalid design, too many parts, tech-locked parts. **Warnings (ask to confirm):** no control, no engine, no stages, unstaged parts, empty stage, TWR below 1 or 1.2, unstable fins, loose parts (`checks.ts:47-223`). Confirm dialog at `vab/+page.svelte:221-241` |
| Save / load | implemented, no description | Name up to 48 characters (`TopBar.svelte:19-29`). New, Open and Save, with Ctrl/Cmd+S. IndexedDB autosave 800 ms after an edit and a localStorage draft (`controller:113,452-458,600-633`). The library can rename, duplicate, delete, export and import (`LibraryDialog.svelte`). There are five example rockets. **No description field.** `vab.download()` exists (`controller:713`) but no button calls it |
| Launch | implemented | Goes to `/launch`; **Shift+click** goes straight to `/flight` (`TopBar.svelte:129-142`, `controller:1139-1149`) |
| Touch | partial | Pointer events with `touch-action: none`; one-finger orbit, tap and pinch zoom (`controller:1161-1191`). **No two-finger pan.** Narrow screens get drawers (`TopBar.svelte:108-121`) |

### 2.1 Every VAB binding found

VAB actions are in `web/lib/keybindings.ts:120-132` and can be rebound. They are dispatched in `controller:1296-1417` and are ignored while a dialog is open.

| Input | Action | Source |
|---|---|---|
| X | Cycle symmetry, only while a part is armed | kb:120, ctl:1347 |
| Q / E | Turn radial sites, the connector point, or the selected radial group | kb:121-122 |
| Tab / Shift+Tab | Next / previous attach site, with the canvas focused | kb:123, ctl:1413 |
| Enter / Space | Place the part, or pick a connector end | kb:124 |
| [ / ] | Previous / next part, or cycle sites while armed | kb:125-126 |
| M or G (Shift: single part) | Carry the selection | kb:127 |
| D | Detach | kb:128 |
| Delete, Backspace (Shift: single part) | Delete with children | kb:129, ctl:1325 |
| A | Save the selection as a sub-assembly | kb:130 |
| F | Frame the vessel | kb:131 |
| / | Search | kb:132 |
| Esc | Disarm, then deselect, then close the drawer | ctl:1329 |
| Ctrl/Cmd+Z; Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y | Undo; redo | ctl:1301-1312 |
| Ctrl/Cmd+S | Save to the library | ctl:1313 |
| Arrows / Shift+Arrows | Orbit / pan, with the canvas focused | ctl:1400-1410 |
| + = / - _ | Zoom in / out | ctl:1411 |
| Alt held | No snap | ctl:1227,1250 |
| Alt+↑ / Alt+↓ on a stage chip | Move the part to another stage | StageEditor:66 |
| Arrows / Home / End in the catalogue | Move between tabs and cards | Catalogue:87-120 |
| Left click | Place, select or deselect | ctl:1235-1260 |
| Left-drag or right-drag | Orbit (0.0055 rad/px, after 4 px of movement) | ctl:1197-1202 |
| Middle-drag or Shift+drag | Pan | ctl:1201 |
| Wheel | Zoom, factor `exp(deltaY·0.0012)` | ctl:1271 |
| Pinch | Zoom | ctl:1161-1191 |

### 2.2 VAB layout CSS

- **Columns** (`vab/+page.svelte:248-249,282-292`): the grid has three columns. The left one is `clamp(16rem, 22vw, 21.25rem)` and the right one is `clamp(16rem, 21vw, 18.75rem)`; the middle takes the rest. The concept's widths are about 340 and 300 px.
- **Under 900 px** (`:403-430`): both columns become drawers of width `min(340px, 100vw-24px)`.
- **3D view insets** are fixed in px: top 72, bottom 150 (`controller:573-578`).
- **Compared with the concept** (`SCREENS.md` W1):
  - matches: categories, search, cards, stats, staging Δv, checks, tools, symmetry, CoM/CoT, undo/redo, and the top bar with New/Open/Save/Launch;
  - missing: the Re-root tool.

---

## 3. Flight vessel control

### 3.1 Flight bindings

Actions are listed in `web/lib/keybindings.ts:57-133` and handled in `web/lib/flight-loop.ts:378-483`.

| Key | Action |
|---|---|
| Left Shift / Left Ctrl | Throttle up / down, ramping at 0.5 per second (`flight-loop.ts:92,331-342`) |
| Z / X | Full throttle / cut |
| W S / A D / Q E | Pitch / yaw / roll, sent as held axes in an `attitude` command |
| Space | Stage (the StageStack GO button does the same) |
| T | SAS off ↔ hold |
| 1 | Hold |
| 2–9, 0 | Prograde, retrograde, normal, antinormal, radial out, radial in, maneuver, target, anti-target |
| ; | Level wings |
| [ / ] | Pitch trim ±0.05 |
| C | Brakes group |
| Numpad 1–0 | Custom groups 1–10 |
| M | Map |
| V | Speed reference |
| Y | Next target |
| , / . | Warp down / up |
| F5 / F9 | Quicksave / quickload |
| ? or F1 | Help |
| N | Mute |
| Esc | Pause menu |
| Tab (map) | Next body |
| I / K, L / J, O / U (map) | Maneuver node edits |
| Delete (map) | Delete the node |

The SAS modes are defined in `packages/core/src/protocol.ts:25-39` and the buttons in `web/lib/hud/SasButtons.svelte`.

**Not bound, compared with KSP:**

- R for RCS. The RCS pill is hard-disabled with "No RCS yet" (`SasButtons.svelte:43`).
- G gear, U lights, Backspace abort.
- Caps Lock fine control and Alt+number groups.
- H/N/I/J/K/L translation.
- Yaw and roll trim.

The comment at `flight-loop.ts:314` still says "R and F" step the trim; that is stale.

### 3.2 Descriptors and the vessel panel (plans 110 and 111)

**Descriptors (`packages/core/src/action-groups.ts`):**

- Four kinds: `toggle | value | trigger | mode` (`:6`).
- `PartActionDescriptor` (`:14-32`): label, value, range and unit, options, enabled and reason, group, icon.
- `groupState` gives on, off, mixed or none (`:46-52`). Custom slots are numbered 1..10 (`:78-87`).
- Schemas are at `packages/core/src/schemas.ts:425-476`.
- Mods register groups with `defineActionGroup` (`packages/sdk/src/define.ts:263`).
- A module's `describe()` returns its descriptors, and each one names an entry in the module's `actions` (example: `mods/stock/src/modules.ts:213-224,281-285`).

**How the sim runs them:**

- `action` (`packages/sim/src/commands.ts:381-418`) refuses a part that has failed, and refuses when there is no signal (antennas are exempt). It brings an on-rails vessel back into flight.
- `action-group` (`commands.ts:577-590`) goes through `applyActionGroup` (`packages/sim/src/actions.ts:102-140`). Toggles turn on unless the group is already all on.

**Vessel panel (`web/lib/vessel-panel/VesselPanel.svelte`):** three tabs.

- **Overview** (`:175-188`): one switch per group, with a mixed state. Clicking a mixed switch turns the group off (`vessel-model.ts:95-100`). Empty groups are hidden (`vessel-model.ts:55`).
- **Parts** (`:189-252`): each part's controls by kind. A toggle is a Switch, a value is a slider, a mode is a segmented control, and a trigger is a button. A disabled control shows its reason as a tooltip. Rows are 44 px high. Hovering a part highlights it in 3D (`renderer.ts:147`).
- **Comms** (`:95-174`): route, queue, link budget, stations and transmitter switches.

### 3.3 Part type × flight controls

Stock groups are defined in `mods/stock/src/action-groups.ts:4-17`. `mods/sol` has no parts.

| Part (`mods/stock/src/parts.ts`) | Flight controls | Group | State |
|---|---|---|---|
| Command pod (61-80) | none | — | no controls |
| Probe core (638-657) | Antenna on/off, channel 0–3, encryption (`comms.ts:132-161`) | none | implemented |
| Whip / dish antenna (660-692) | Same three | **no `group` set**, so the Antennas group is always empty | partial |
| Fuel tanks (117-171) | none (`withdraw`/`deposit` exist but have no descriptor, `modules.ts:122-133`) | — | missing |
| Engines LV-T30, KR-4, BST-1 (173, 221, 363) | Engine on/off only (`modules.ts:213-224`). **No thrust limiter, gimbal or mode** | Engines | partial |
| Stack / radial decoupler (268, 337) | Decouple trigger (`modules.ts:339-350`) | — | implemented |
| Reaction wheel (82-97) | on/off (`modules.ts:382-393`) | none | implemented |
| Landing legs (291-308) | Deploy toggle (`modules.ts:476-488`) | Landing gear | implemented |
| Wing (486-522) | Flaps Up / Half / Full (`modules.ts:867-880`) | Flaps | implemented |
| Wheels (795-816) | Brakes toggle (`modules.ts:963-975`); steering comes from yaw | Brakes | implemented |
| Solar panel (697-713) | Deploy toggle (`solar.ts:34-47`) | Solar | implemented |
| Science instruments (557-632) | Run trigger (`science.ts:237-246`); collect and transmit go through the Science dock panel (plan 191) | **no group**, so the Science group is empty | partial |
| Heat shield, nose cone, fins, control surface, strut, fuel line, data drive, life support, scrubber, flotation collar | none | — | none |
| **Battery, parachute, light, docking port, RCS thruster** | **no such part or module exists** (the groups are registered but empty) | — | missing |

### 3.4 Other flight controls

- **Resources:** `web/lib/hud/ResourcesPanel.svelte` is a read-only, vessel-wide meter in the dock. There is **no per-tank view and no transfer command**. Crossfeed is automatic only (`packages/sim/src/resources.ts:4-31`).
- **Crew:** `web/lib/hud/CrewPanel.svelte` (mounted only when touch is off).
  - EVA sends `crew-eva` (`flight-loop.ts:569-577`, `packages/sim/src/eva.ts:132`).
  - Walking uses N/E/S/W buttons at a fixed 1.5 m/s (`flight-loop.ts:578-589`).
  - Flag and Board are also available (`:590-605`).
  - There is **no keyboard walking and no jetpack**.
  - The sim has EVA repair (`commands.ts:569`), but no button for it.
  - The sim has crew transfer (`packages/sim/src/crew.ts:173-190`), but **no UI** for it.
  - **There is no IVA**: the "IVA" text in `CrewPanel.svelte:75` is only a label chip.
- **Warp:** on rails only. The sim refuses warp above 1× while a vessel is in flight, and there is no physics warp (`commands.ts:420-434`). Warp-to works only for nodes; there is no warp to Ap or Pe.
- **Scripting:** `ship.action(...)` is available (`packages/scripting/src/prelude.ts:151`), but there is no `action-group` binding.

---

## 4. Flight HUD layout and sizing (read from CSS)

All sizes assume UI scale 1 (1rem = 16 px). "page" means `web/routes/flight/+page.svelte`.

### 4.1 Tokens and scale

- **Spacing tokens** (`web/lib/ui/tokens.css:73-87`): margin 24, panel pad 10, gap 12, capsule 44, round button 36, touch-min 44, panel radius 16. They match the concept (`refs/.../tokens/tokens.css`).
- **Two type scales are still in use:**
  - new tokens (`:64-68`): `--t-label` 10, `--t-small` 11, `--t-button` 12, `--t-value` 13;
  - legacy aliases (`:146-151`): `--t-xs` 12, `--t-sm` 13, `--s-1..6`.
- **UI scale:** `html { font-size: calc(var(--ui-scale)*100%) }` (`web/lib/ui/base.css:4`). Choices are 0.8, 0.9, 1, 1.1, 1.25 and 1.5 (`settings.ts:39,46`).
- **Documented deviations from the concept:**
  - glass adds `brightness(0.4)` (`tokens.css:28`);
  - `--accent-text` `#8fa9f0`;
  - mono font is IBM Plex Mono, not JetBrains Mono (`:61`);
  - navball colours are gradients, not flat (`:93-96`).
- **Breakpoints:**
  - `max-width: 1279px` (page:1074, 1144), mirrored in JS as `narrow` (page:585);
  - `max-height: 800px` shrinks the ball from 176 to 144 (page:196-197);
  - `pointer: coarse` applies in only three components (`AppBar:166`, `StageStack:224`, `IconButton:34`);
  - below 900×500 the small-screen notice appears (`web/lib/touch/touch-model.ts:56`, `web/lib/layout/layout-model.ts:73-81`).
- **Stacking:** no HUD region sets a z-index, so DOM order decides it. TouchControls is z 2.

### 4.2 Regions against the concept (`refs/.../source/Main.dc.html` positions)

| Region | Implementation | Concept | Verdict |
|---|---|---|---|
| Capsules: world, funds, warp (`.tl`) | top/left 24; flex-wrap with no max-width (page:1058-1073); warp capsule about 420 px, about 540 with catch-up (`WarpControl.svelte:106-196`) | top/left 24 | matches; the row can be very wide |
| Toolbar (`.tb`, `AppBar.svelte`) | top/right 24; 11 buttons of 36 px, about 473 px wide (about 561 on touch) | `Map·VAB·Camera│Dock·Vessel·Staging·Nav·Crew│Menu` | adds Script and Controls; Camera is a placeholder |
| Map switch and situation (`.tc`) | top 80, centred (page:1115-1124); toasts min 240 / max 420 **px** with no count limit (`Toasts.svelte:34-35`) | map switch top 24 beside a back button | moved down |
| Dock (plan 112) | rail about 46 px; panel `16.5rem` = **264** with overflow-y (`web/lib/dock/Dock.svelte:86-147`); goes to the right below 1280 | rail 44, panel 280, top 80 | about 16 px narrower |
| Vessel panel (`.vr`) | 18.75rem = 300, overflow-y auto, max-height above the deck (page:1125-1135) | 300 × 808 fixed | matches (sizes to content) |
| Staging (`.bl`) | 13.75rem = 220, bottom/left 24; **no max-height, no overflow** (page:1136-1148) | 220 | width matches; height unbounded |
| Navball module (`.bc`, `InstrumentDeck.svelte:176-180`) | 430×262 mock px × k; ball 176; ball centred on screen (page:1150-1157) | 390×262 | +40 px for the maneuver/target column (ADR 0144) |
| Maneuver editor (`.mnv`) | 22.5rem = 360 (page:1158) | 360 | matches |
| Crew (`.br`) | 220, bottom/right 24, no max-height; **hidden when touch controls are on** (page:863, 1089-1093) | 220 | matches on desktop |
| Touch controls | overlay z 2; throttle 60×150 px, pad 112 px, all in px (`TouchControls.svelte:149-174`) | not in the concept | — |

### 4.3 Behaviour by width (reasoned, not rendered)

- **1920×1080.** The concept layout: about 650 px free between the capsules and the toolbar, the deck centred at 960, and nothing overlapping. The only risk is staging growing upward without a limit.
- **1440×900.** Still wide mode, ball 176. The capsules and toolbar leave a gap of about 140 px. The left column ends at y 602, which leaves about 274 px for staging. Staging adds about 28 px per stage and its current card is about 110 px, so with 4 or more stages it overlaps an open dock panel.
- **1280×800.** Wide mode (the breakpoint is ≤1279), ball 144.
  - The capsule row (about 776 px) reaches the toolbar edge at about 783. Recover (page:727-731) or "Catch up" (`WarpControl:87-98`) therefore **overlaps the toolbar** instead of wrapping.
  - With the script panel open (right edge about 498), a full-width toast (430–850) overlaps it.
  - About 226 px are left for staging, so 2 or more stages collide with an open dock panel.
- **1024×768 tablet, landscape, touch.** Narrow mode.
  - The capsules stack in a column (y 24–172, up to about 460 px wide) and `.tc` drops to y 132. The situation bar and toasts then **overlap the warp capsule**, the tutorial card (288 px) and the right panel.
  - Staging rises to bottom 310 px. The touch throttle, placed by `throttleAnchor` (`layout-model.ts:44-60`), ignores staging and **overlaps it**.
  - Opening the vessel panel **removes the dock** (page:808-823).
  - Crew, and with it EVA, Board and Flag, is hidden.
- **768 wide.** The small-screen notice (z 60) covers the HUD. Underneath, the world capsule and the AppBar overlap.
- **UI scale other than 1.**
  - Breakpoints stay in CSS px. At 1.25 the top row needs about 1600 px, so it overlaps at 1440.
  - `aboveDeckHeight` subtracts a fixed 60 px (`layout-model.ts:31-33`), but the margins scale. At 1.5 the side columns end 12 px *inside* the deck.
  - The navball canvas is sized in px (`Navball.svelte:34`) while its slot is in rem. At 0.8 the canvas (176 px) is larger than the slot (141 px) and covers the VS arc and SAS pod.
  - The script width, toasts, tutorial card and touch controls do not scale.

### 4.4 Concrete problems in code

1. **The blackout badge renders twice** when there is no link (page:773-776).
2. **Unbounded heights:** staging, crew, `.mnv` and the toast column have no max-height. The capsule row has no max-width.
3. **Narrow layout conflicts:** the throttle overlaps staging (`layout-model.ts:44-60`), and the vessel panel replaces the dock (page:808-823).
4. **Text below 10 px:**
   - `--t-label` becomes 8 px at scale 0.8 and 9 px at 0.9. The 10 px floor of ADR 0107 §5 only holds at 1.0.
   - Navball canvas labels are 8 and 9 px and ignore the scale (`navball-draw.ts:142,168`).
   - `NetworkLayer.svelte:44` and `GhostLayer.svelte:42` use a literal 11 px.
5. **Touch targets under 44 px on coarse pointers:**
   - dock tabs 36 (`Dock:99-100`);
   - vessel-panel tabs 32 (`VesselPanel:271`);
   - MapSwitch 34 (`:36`);
   - SAS pod about 28 at k 0.818 (`SasButtons:142-143`);
   - TargetPanel rows 26–28 (`:133,168`);
   - pause button 36 and catch-up 28 (`WarpControl:122,183`);
   - deck chips about 20 (`InstrumentDeck:306-316`).
6. **Colours outside the tokens:**
   - toast borders (`Toasts:61-69`) do not match `--ok`, `--warn` or `--danger`;
   - `ManeuverLayer:205-225`, `CodeEditor:913-1088` (cyan and yellow), `TargetPanel:138,175`, `StatusCard:70`, `ScriptPanel:337`;
   - page error backdrop `#10243a` (page:1177);
   - `TutorialCard:33-40` uses its own blur and the legacy `--panel` and `--line` tokens.
7. **Literal px spacing:**
   - page: `top:64px` (1101), the fallbacks `200px`, `290px` and `262px` (1066, 1134, 1146);
   - `ManeuverPanel:112`, `CrewPanel:173`;
   - the dock dot is 4 px where `--dot` exists (`Dock:124`).
8. **Mixed type scales inside the dock:**
   - legacy panels use 12/13 px: `OrbitStrip`, `ResourcesPanel`, `TargetPanel`, `ManeuverPanel`, `CrewPanel`, `ScriptPanel`;
   - new panels use 10/11/13: `PanelView`, `MissionsPanel`.
   - So neighbouring panels in the same dock look different.
9. **Pause shows no paused state on the HUD**, because pausing is modal (`WarpControl.svelte:28-50`).

---

## 5. Top 15 gaps against a KSP-grade experience, by player impact

| # | Gap | Impact | Files |
|---|---|---|---|
| 1 | **No single world clock across screens.** Each screen boots a sim from the newest save. Leaving Flight, Mission Center, Space Center, R&D or Admin through a link does not save, so progress and time since the last autosave are lost | lost flights, confusing time | `web/lib/sim-client.ts:239`, `web/lib/hud/WorldCapsule.svelte:14`, `web/lib/hud/AppBar.svelte:61`, `web/lib/mission-center/MissionCenterOverlay.svelte:135`, `web/lib/save/autosave.ts:13` |
| 2 | **No time warp at the Space Center or building screens**, and no free warp in the Mission Center | cannot wait for construction, contracts or windows | `web/routes/space-center/+page.svelte`, `web/lib/mission-center/MissionCenterOverlay.svelte:137,218` |
| 3 | **Missing part families**: no RCS, parachute, docking port, light or battery part or module; their groups are registered but empty | no recovery by chute, no docking, no fine control | `mods/stock/src/parts.ts`, `mods/stock/src/action-groups.ts:4-17`, `web/lib/hud/SasButtons.svelte:43` |
| 4 | **No engine tweakables**: thrust limiter, gimbal, independent throttle; no editor fuel fill | standard KSP craft tuning impossible | `mods/stock/src/modules.ts:194-219`, `web/lib/vab/` |
| 5 | **No resource transfer** between tanks; the resources panel is read-only | no fuel balancing or refuelling | `web/lib/hud/ResourcesPanel.svelte` |
| 6 | **Custom action groups cannot be assigned in the VAB** (keys exist in flight) | Numpad groups are mostly inert | `web/lib/keybindings.ts:72-81`, `mods/stock/src/action-groups.ts` |
| 7 | **Stock group keys missing**: gear (G), lights (U), abort, stage lock | habits from KSP do nothing | `web/lib/keybindings.ts` |
| 8 | **Pause is modal** (opens the menu); no frozen-but-usable pause; no paused indicator | planning while paused impossible | `web/lib/hud/WarpControl.svelte:28-50`, `web/routes/flight/+page.svelte:521-526` |
| 9 | **Vessel switching** only for the save's focus vessel (ADR 0118 §5); there are no per-vessel designs | cannot fly the second craft or stations | `docs/decisions/0118-...md`, `web/routes/mission-center/+page.svelte:228` |
| 10 | **Editor uses sliders, not 3D offset/rotate gizmos**; no re-root, no mirror symmetry, radial-only surface attach | aircraft and complex craft hard to build | `web/lib/vab/controller.svelte.ts:1002-1031`, `web/lib/editor/state.ts` |
| 11 | **World time is not shown** on the Space Center and building screens (the concept has it top left) | no sense of time passing | `web/lib/space-center/SpaceCenterOverlay.svelte:75-78` |
| 12 | **Screen changes cost a full sim boot**, and some use `location.assign` (full reload) | slow transitions | `web/routes/flight/+page.svelte:230,263`, ADR 0118 Consequences |
| 13 | **HUD has one breakpoint (1279 px)**; at 1024 wide with a high UI scale, bottom regions overlap | tablets and small laptops | `web/routes/flight/+page.svelte:1074,1144`, `web/lib/settings/settings.ts:46` |
| 14 | **Duplicate blackout badge**, plus literal px values outside tokens | visual noise and inconsistency | `web/routes/flight/+page.svelte:773-776,1095,1101` |
| 15 | **No camera modes or IVA**: the toolbar Camera is a placeholder per visual-direction | less immersion; no chase/free/locked cameras like KSP | `web/lib/hud/AppBar.svelte:67`, `docs/product/visual-direction.md:29` |
