# 06 — Gap analysis and priorities: KSP-grade feel vs Space Orbital Program today

This document combines docs 01–04 (how KSP1 and KSP2 work) with doc 05 (what our code does on 2026-10-18). It answers the owner's four complaints of 2026-10-18 one by one, then orders the work. It records research and options, not decisions; each wave below would need an ADR and draft plans before code.

Every claim has its evidence in the source doc named in brackets, for example (01 §1) or (05 §5 #3).

## 1. The four complaints

### 1.1 "The world is not always running; switching screens breaks it"

| | KSP1 | KSP2 | Space Orbital Program today |
|---|---|---|---|
| One clock in the save (UT) | yes (01 §2.1) | yes (01 §2.4) | yes, `t` in the save |
| Clock moves at the Space Center | yes, since 0.21 (01 §1.1) | yes (01 §1.2) | only while the Space Center page has a sim; **no warp there** (05 §5 #2) |
| Clock moves in the Tracking Station / map | yes, with warp (01 §1.1) | yes, with warp, buggy limits (01 §8) | Mission Center: own sim, warp-to only (05 §1.3) |
| Clock moves in the VAB/SPH | no (consensus, 01 §1.1) | not documented *(unverified)* | no sim at all (05 §1.3) |
| Leaving a screen keeps the time | yes: a scene change saves and loads the next scene from that state (01 §7) | yes (01 §7) | **no**: Flight autosaves on a timer; the Mission Center saves only on Fly; the Space Center, R&D and Admin save only after an action. Time spent since the last save is lost (05 §1.5, §5 #1) |
| Pause | ESC in flight, warp ×0 in hubs (01 §3) | pause key in all scenes *(unverified)* (01 §3) | flight only, and only as a modal menu (05 §5 #8) |
| Game closed | time stops (01 §6) | time stops (01 §6) | time stops; manual "Catch up to now" in flight (ADR 0103) |

**Reading.** The owner's request ("the world runs until I pause it") goes **further than KSP**, which also stops the clock in the editor and rebuilds each scene from the save. KSP feels continuous anyway because a scene change never loses time, the same clock shows on every screen, warp works from the hubs, and alarms stop warp anywhere (01 §7).

The biggest gap today is not the missing always-on clock. **We lose time on navigation, and we have no warp or pause outside flight.**

**Options** (01 §9, 05 §5 #1, #2, #8, #11, #12):
- **A. KSP parity.** Every screen saves on leave (navigation, `pagehide`). Show the same clock capsule with pause and warp on the Space Center, the Mission Center and the building screens. Stop warp on alarms. This is a small change and keeps ADR 0118.
- **B. One world sim owned by the app.** One sim is started when a world is opened and kept across client-side navigation (no `location.assign`). Every screen subscribes to it. There is a global pause and warp in the top-left capsule, and the Hangar does not stop the world. This is what the owner asked for. It replaces ADR 0118 and 0152, and screen changes become instant, with no sim boot.
- Either way: auto-pause or offer catch-up when the tab is hidden, never delete unloaded vessels in the atmosphere (avoid KSP's 22 km rule), and have one warp-limit rule computed from the world instead of per screen (KSP2's stuck ×1000 bug, 01 §8).

### 1.2 "The Hangar is not interactive or flexible enough"

KSP's editor feel comes from one loop: the **part sticks to the cursor**, nodes light up as it nears them, it snaps, and one click commits. Modifier keys act on the carried part: Alt copies, Shift moves the whole craft, X sets symmetry, C toggles angle snap, R switches mirror. Keys 1–4 switch between the place, offset, rotate and re-root tools (02 §1, §5).

Our editor has the data model (nodes, radial symmetry 1–6, undo, subassemblies, drag staging, Δv/TWR, CoM/CoP/CoT), but not the hand feel (05 §2, 02 §15).

| Minimum KSP-grade editor feature (02 §15, ordered by impact) | Today (05 §2, §5) |
|---|---|
| 1. Part on cursor with live node snapping, ghost, click to commit, drop on catalogue to delete | partial: placement exists, no carry-and-snap loop |
| 2. Pick up a placed part with its subtree; loose assemblies; Alt-click copy | partial |
| 3. Surface attach anywhere, Alt for node-only | radial-only surface attach |
| 4. Symmetry 1–8 + mirror, **inherited by children** | 1–6 radial, no mirror, no inheritance |
| 5. Rotation keys WASDQE (Shift fine), Space reset, angle snap C | partial |
| 6. Turntable camera (wheel = height), focus; pan camera for planes | partial |
| 7. Per-part inspector: fuel fill, thrust limiter, staging toggle, chute settings | **missing** |
| 8. Staging editor with groups and per-stage Δv/TWR per body/situation | yes, except body/situation choice |
| 9. Offset/rotate gizmos with local/absolute and typed values | sliders only |
| 10. Re-root and a part tree list | missing |
| 11. Subassemblies, merge, save/load with thumbnails | partial (subassemblies yes) |
| 12. Procedural tanks/fairings/wings with 3D handles | missing |
| 13. Action group editor | **missing** (keys exist, groups cannot be assigned) |
| 14. Overlays CoM (wet/dry), CoL, CoT, pre-flight report | yes |

**Do better than KSP** (02 §15 Improve): offset with typed values instead of a hard cap, a list of snap steps, staging and tweaks as single undo steps, and no camera rebinding (KSP2's top editor complaint).

### 1.3 "The vessel control panel is odd; widths are not considered"

- **Width.** KSP's widest control row is a labelled slider with a typed value and unit. At our type sizes that row needs about 334–398 px, but the vessel panel is 300 px.

  Recommendation: default **340 px, resizable 300–440 px**, with steppers instead of sliders below 300 px (03 §6, 04 §6.2).
- **Layout.** Our concept's layout (time top left, toolbar top right, navball bottom centre, staging bottom left, crew bottom right) is **KSP1's**, the one players know. KSP2 moved the navball to the bottom left and players asked for it back in the centre (04 §0).

  Earlier research (`../reverse-engineering-ksp2/13-ui-ux-patterns.md`) placed KSP2's navball bottom centre; that is corrected by 04 §1.2.
- **Breakpoints.** Today we have one breakpoint (1279 px), and heights are not capped (05 §4). This causes:
  - a collision between the top row and the toolbar at 1280 px;
  - toasts over the warp capsule, and the touch throttle over staging, at 1024 px;
  - text below 10 px at UI scale 0.8–0.9.

  Neither KSP solved widths with layout rules; both relied on a scale slider and kept patching the extremes (04 §0). **Adopt the region spec in 04 §6.2:**
  - min/default/max per region;
  - one side panel at a time below 1280 px;
  - staging and crew get a max height and scroll;
  - toasts sit under the toolbar and never cover the navball module.
- **Model.** KSP1's floating windows (clutter, patched 1.5–1.10) and KSP2's single Part Manager (too few parts visible, entries not linked to the part, fuel elsewhere) both failed (03 §2).

  Keep our Parts tab, and add:
  - a small **per-part inspector** that opens by clicking a part in 3D or in the list;
  - up to three pinned inspectors;
  - two-way highlighting between the list and the 3D view;
  - tank levels, rates and **transfers inside the vessel panel** (03 §6).
- **Bug to fix.** The blackout badge renders twice (`apps/web/src/routes/flight/+page.svelte:773-776`, 05 §4.4).

### 1.4 "Not enough can be controlled like in KSP"

This is mostly **breadth of parts and modules**, not the panel. Stock has no RCS, parachute, docking port, light or battery part. Engines are on/off only, and the Antennas and Science groups are always empty (05 §3.3, §5 #3–#7).

| Part family | KSP day-one "Must" controls (03 §6) | Today |
|---|---|---|
| Engine | activate/shutdown, thrust limiter, gimbal lock/limit, independent throttle *(Should)* | on/off |
| Tank | per-resource level, flow enable, transfer in/out, flow priority *(Should)* | read-only levels |
| RCS | enable, thrust limiter, per-axis toggles | **no part** |
| Parachute | arm/deploy, cut, deploy altitude/pressure, safety state | **no part** |
| Docking port | decouple/undock, control from here, angle snap | **no part** |
| Light, battery | toggle, colour; charge level | **no part** |
| Command pod / probe | control from here, rename, SAS level by pilot/probe, crew transfer, EVA | partial (ADR 0109 command source) |
| Legs/gear/wheels | raise/lower, brakes, friction, steering, motor | partial |

Flight keys that KSP players expect and that do nothing today (03 §3–4, 05 §5 #7):
- G (gear), U (lights), B (brakes, held), Backspace (abort)
- 1–0 (custom groups), Caps Lock (precision)
- Alt+WASDQE (trim), Alt+X (trim reset)

## 2. Priorities

Ordered by player impact against effort. The waves are independent enough to run in parallel lanes, like the foundation roadmap.

| Wave | What | Why first | Size |
|---|---|---|---|
| **W1 — Never lose time** | Save on leave on every sim screen. Global clock capsule with pause and warp on the Space Center, Mission Center and building screens. Non-modal pause with an indicator. Alarms stop warp. Fix the double badge. | Data loss and "dead world" feel; smallest change (option A) | M |
| **W2 — Part breadth** | RCS, parachute, docking port, light, battery parts and modules. Engine thrust limiter and gimbal. Tank transfer. Stock keys G/U/B/Backspace/precision/trim. | "Not enough to control" is mostly missing parts | L |
| **W3 — Editor hand feel** | Items 1–7 of §1.2: carry-and-snap loop, Alt-copy, symmetry 1–8 + mirror with inheritance, rotation keys and snap, turntable camera, per-part inspector in the editor | The owner's main Hangar complaint | L |
| **W4 — HUD layout spec** | 04 §6.2 regions with min/default/max: vessel panel 340 (300–440) resizable; one side panel below 1280 px; max heights; toast placement; text floor at every UI scale | Widths and overlaps | M |
| **W5 — Editor depth** | Items 8–14 of §1.2: gizmos with typed values, re-root and part tree, action group editor, procedural parts, merge and thumbnails | KSP-level complexity | L |
| **W6 — One world sim (option B)** | App-level sim kept across client-side navigation; Hangar keeps the world running; replaces ADR 0118/0152 | The owner's full request, beyond KSP; only after W1 shows the rest works | L–XL |

## 3. Interaction with the work in progress

- **Agent 1's queue.** The foundation roadmap's 68 plans are done. Seven drafts remain (132 onward: funds in the HUD and recovery dialog, silhouette anti-aliasing, and others found during the work).
  - W4 overlaps "funds in the HUD" (same top-left capsule row).
  - W1 overlaps nothing that is open, but must amend ADR 0118 point 5 (Fly keeps the time) and 0123 (Space Center save on change).
- **Plans already done that these waves touch:** 110/111 (part actions, vessel panel), 112 (dock), 088 (HUD), 093 (Hangar), 091/096 (Space Center), 113 (Mission Center), 117 (signal-delay rule, for control from probes).
- **Owner decisions needed before W1/W6:**
  - (a) Does the world clock stop in the Hangar? KSP stops it; the owner asked for it to keep running.
  - (b) When the tab is hidden or the game is closed: pause, or catch up?
  - (c) A or B for the clock architecture, or A now and B later.

## 4. Index of evidence

| Doc | Read it for |
|---|---|
| [01 Time, scenes and persistence](01-time-scenes-and-persistence.md) | per-scene clock tables KSP1/KSP2, pause, warp, background vessels, revert |
| [02 VAB/SPH editor](02-vab-sph-editor.md) | the interaction model, binding table, feature matrix, editor checklist and touch notes |
| [03 Part control and tweakables](03-part-control-and-tweakables.md) | controls per part type, PAW vs Part Manager history, action groups, SAS/trim keys, Must/Should/Later per part |
| [04 Flight HUD and panel layout](04-flight-hud-and-panel-layout.md) | KSP1/KSP2 screen maps, window behaviour, region spec with widths, fit check at 6 viewport sizes |
| [05 Orbital today](05-orbital-today-inventory.md) | our code, file:line for every gap, all current bindings, CSS widths, top 15 gaps |
