# 15 — Space Orbital Program today: inventory 2

> Read-only inventory, branch `lead/followups`, 2026-10-18. Complements `05-orbital-today-inventory.md` (does not repeat world time, VAB editor, vessel panel or HUD sizing). Paths: `web/` = `apps/web/src/`.
>
> **Status:** complete. Sections 1–4, 6 and 7 condense the raw read-only audits [15a](15a-physics-audit-raw.md) (physics), [15b](15b-presentation-release-audit-raw.md) (presentation and release), [15c](15c-navigation-audit-raw.md) (navigation) and [15d](15d-parts-science-crew-audit-raw.md) (parts, science and crew), with spot checks against the code. Section 5 was verified by hand. Section 7.1 (base path) and section 8 are new. Nothing was run: no build, no tests, no browser.

---

## 1. Physics and flight model

The full audit, with citations for every line, is in [15a-physics-audit-raw.md](15a-physics-audit-raw.md). This section condenses it and adds a few spot checks.

| Area | Summary | Key evidence | State |
|---|---|---|---|
| Step and range | Fixed 50 Hz step; rails chunks of up to 10 s; physics range 2.5 km; **at most 2 flight frames**; warp up to 1e6x on rails only, refused while a vessel is in flight | `packages/sim/src/constants.ts:4-16`, `packages/sim/src/commands.ts:420-450` | implemented; **physics warp is missing** |
| Structure | One rigid compound body per vessel (ADR 0018). Struts add no stiffness. No joint failure, no overstress, no part-to-part or vessel-to-vessel collision damage | `docs/decisions/0018-rigid-grouping-compound-bodies.md`, `mods/stock/src/parts.ts:519-536` | implemented by design; failure modes missing |
| Atmosphere | Isothermal exponential profile (288 K), the same for every body | `packages/sim/src/atmosphere.ts:11-15` | partial |
| Drag | Per part and per axis, Cd 0.3 by default with a per-part `dragCoefficient` (nose cone 0.12, wing 0.05). Only attached end faces are shielded | `packages/sim/src/aero.ts:1-33`, `frames.ts:546-553`, `parts.ts:416,494` | implemented, simplified; **no Mach**, no fairings |
| Lift | Fins (flat plate plus damping), wings (finite-wing slope, stall, induced drag), flaps, control surfaces ±25°, pitch trim. No body lift | `mods/stock/src/modules.ts:577-911` | implemented (subsonic) |
| Heating | Sutton-Graves skin heating, radiative cooling, `maxTemperature` (1000 K by default), ablative shield. No conduction, and no heating on rails | `packages/sim/src/thermal.ts:1-160`, `modules.ts:518-571` | implemented; partial on rails |
| Crash tolerance | `impactTolerance` per part (6 m/s by default): above 1x the part breaks off, above 2x it is destroyed; water entry counts at 0.5x speed | `constants.ts:38-41`, `packages/sim/src/vessel.ts:606-627`, `water.ts:120-124` | implemented; no difficulty multiplier (5.2) |
| G-forces | Crew only: proper acceleration against `G_LIMIT x gTolerance` builds stress, then G-LOC (rule "G-load and radiation"). Parts have no g-limit | `packages/sim/src/life.ts:240-266` | crew: implemented; parts: missing |
| Engines | Thrust, linear Isp(p) between two points, propellant ratios, gimbal up to 30° with slew, flameout, cluster engine. **No jets or intakes, no true SRB** (`stock.booster` burns LF/Ox), no ullage or ignition limits, no thrust limiter | `mods/stock/src/engine.ts:38-77`, `modules.ts:141-305`, `parts.ts:358-406` | rockets implemented; air-breathing missing |
| Fuel flow | `none`/`vessel`/`stack` flow modes, `crossfeed:false` barriers, one-way fuel lines (asparagus). **No player transfer**, no priorities | `packages/sim/src/resources.ts:15-98` | implemented; transfer missing |
| SAS | 12 modes including maneuver, target and level; PD controller with integral; snaps analytically on rails; **not gated by pilot or probe level** | `packages/core/src/protocol.ts:25-40`, `packages/sim/src/sas.ts:19-330` | implemented |
| Reaction wheels / RCS | Wheels draw EC and give fixed torque; the pod has none built in. **RCS and monoprop are missing** (the EVA jetpack is the only cold-gas thruster) | `modules.ts:367-429`, `mods/stock/src/eva.ts:28-29` | wheels implemented; RCS missing |
| Wheels / legs | Tyre model (rolling resistance, grip, brakes, steering up to 20°). **No motor, no suspension**; legs are static foot boxes | `modules.ts:435-515,936-998`, `frames.ts:410-477` | partial (rovers cannot drive) |
| Buoyancy (plan 067) | 6 slices per part, buoyancy plus water drag, seabed tile 30 m down, flotation collar | `packages/sim/src/water.ts:22-129`, `parts.ts:775-789` | implemented |
| Parachutes, docking, clamps | Only action-group ids exist | `mods/stock/src/action-groups.ts:11-13` | missing |

**How the player meets it.** The player builds in the VAB, stages with Space, steers with WASDQE and uses SAS from the navball buttons or the keys in 5.3. Heat shows as glow and plasma (6.2). Impacts and overheating raise `part:damaged` toasts and leave debris. A capsule can only come home by splashing down slowly enough, or by a powered landing, because **there is no parachute**.

**Rough edges.**
- Stale comments: `aero.ts:9` says "Lift is out of scope" and `constants.ts:18` says "no per-part data yet".
- The tech text promises "solid boosters" (`mods/stock/src/tech.ts:51`), but the booster burns liquid fuel.
- Planes need rocket engines to take off, since wheels have no motor and there are no jets.
- With two flight frames, a third vessel near an active one is not physically simulated (`constants.ts:16`).

---

## 2. Navigation

The full audit, with citations, is in [15c-navigation-audit-raw.md](15c-navigation-audit-raw.md). This is a condensed version. Bare file names are under `apps/web/src/lib/`.

| Area | What exists | Key evidence | State |
|---|---|---|---|
| Map view | M toggles it. It shows the predicted path through SOIs (one colour before a transition, another after), SOI dots, a ghost moon sphere, an encounter label ("Moon Pe X km" or impact), moon orbits and spheres, other vessels' orbits and markers, a region overlay (plan 192), Tab or Shift+Tab to focus a body, and picking (marker, then own path, then other orbits) | `packages/renderer/src/scene.ts:843-924`, `map-pick.ts:35-62`, `maneuver-controller.ts:317-350` | implemented |
| Map markers | Ap and Pe on the current orbit only; one closest-approach pair; **no AN/DN on the map** (the Target card has buttons for them) | `hud/MapMarkers.svelte:23-50`, `rendezvous-aids.ts:163-164` | partial |
| Maneuver nodes (plan 045, ADR 0056) | Click the path to add a node, six handles (Shift ×10, Alt ×0.1), drag along the orbit, keys I/K L/J O/U and Delete, the planned path, burn time across stages with a not-enough-fuel flag, warp to the burn, navball marker, SAS maneuver mode, script API. Up to 8 nodes are chained | `maneuver-controller.ts:119-519`, `hud/ManeuverPanel.svelte:28-82`, `packages/core/src/protocol.ts:53` | implemented; **no numeric Δv entry**, no time ± or "next orbit", only the first node gets a panel, no touch editing, impulsive prediction only |
| Target and rendezvous (plans 035, 057) | Target from a dropdown, Y, or the map; distance, relative speed and closest approach; navball target markers; speed reference "target"; SAS target and anti-target; aids for a node at closest approach, match velocities, Hohmann (circular and coplanar) and plane change | `hud/TargetPanel.svelte:58-95`, `rendezvous-aids.ts:99-291` | implemented; **docking is missing** |
| Alarms / Upcoming | Mission Center lists nodes, the next SOI change and reviews (up to 12), each with warp-to | `mission-center/model.ts:97-170` | partial: no Alarm Clock, no Ap/Pe/AN/DN alarms, no contract deadlines |
| Delta-v | Per stage Δv, burn time, TWR and fuel, switching between sea level and vacuum | `stage-stack.ts:5-60`, `hud-controller.ts:343-356` | implemented |
| Trip planner (plan 034, ADR 0083) | A delta-v map with Hohmann and ascent integration, in the VAB only | `editor/trip.ts`, `vab/StatsStrip.svelte:124-147` | implemented in VAB; missing in flight |
| Vessel list / tracking (plan 113, ADR 0118) | Mission Center system map, object card, filters All/Vessels/Relays/Bodies (Relays is always empty), comms planning. Fly works only for the save's focus vessel; any other is `NOT_FLYABLE` | `mission-center/MissionCenterOverlay.svelte:168`, `mission-center/model.ts:185-237` | partial |
| Vessel switching | None: the flight vessel is set once; `[` and `]` are trim | `flight-loop.ts:259,933,951`, `keybindings.ts:93-94` | missing |
| Recover / terminate / rename | Recover only in flight, for a landed vessel at rest (plan 132). No terminate. No vessel rename | `routes/flight/+page.svelte:272-276,750-794`, `packages/sim/src/commands.ts:472-483` | partial |
| Debris (ADR 0021) | Goes on rails and is deleted at re-entry, or after 10 s at rest on the ground; can be targeted; not persistent; you cannot switch to it | `packages/sim/src/modes.ts:208-230` | implemented, transient by design |
| Launch sites | Choose the site (plan 092); launch from the pad or the runway (plan 094) | `launch/launch-model.ts:33-121` | implemented |
| Autopilot | Ascent autopilot in DEV only (P); no node-execute autopilot | `autopilot.ts:1-7`, `flight-loop.ts:479,645-669` | dev only |

**Rough edges.**
- `docs/STATUS.md:179,186` still say "launch at (0,0)", although site choice exists.
- The Relays filter is always empty (`MissionCenterOverlay.svelte:168`).
- Under the n-body model the map shows osculating conics, not the ephemeris paths (STATUS.md:181).
- The Hohmann aid assumes circular, coplanar orbits and says nothing when they are not (`rendezvous-aids.ts:256`).

---

## 3. Parts and resources

The full audit, with a table of every part and its mass and modules, is in [15d-parts-science-crew-audit-raw.md](15d-parts-science-crew-audit-raw.md) (§A1–A7). This section condenses it.

### 3.1 Parts and modules

**36 stock parts and 19 module types**, all in the 1.25 m size class (`mods/stock/src/parts.ts:38-39`):

- **Command:** pod with 1 seat and 50 EC, probe core with 20 EC, reaction wheel, scrubber.
- **Propulsion:** LV-T30 and KR-4 cluster; BST-1 booster, which burns LF/Ox although the tech text calls it "solid" (`mods/stock/src/tech.ts:51`).
- **Tanks:** small and medium tanks, life-support pack.
- **Structure:** decoupler, radial decoupler, nose cone, fin, control surface, wing with flaps, strut (gives no stiffness), fuel line.
- **Gear:** legs, heat shield, flotation collar, wheel, steering wheel.
- **Science:** five experiments and a data drive.
- **Comms:** whip and dish antennas.
- **Power:** one solar panel.
- **EVA and bases:** EVA suit and flag (`mods/stock/src/eva.ts:33,86`); base kit and drill (`mods/stock/src/bases.ts:38,55`).

Line numbers for each part are in 15d §A1.

**Modules:** command, resource-container, engine, decoupler, reaction-wheel, landing-leg, heat-shield, fin, control-surface, wing, scrubber and wheel (`mods/stock/src/modules.ts:44-998`); experiment (`science.ts:225`), antenna (`comms.ts:122`), data-storage (`data.ts:45`), solar-panel (`solar.ts:30`), flag (`eva.ts:84`), base-kit and drill (`bases.ts:18,21`).

**Missing families:**
- batteries, RCS and monoprop, true SRBs, parachutes, docking ports;
- ladders, lights, fairings, cargo bays;
- multi-seat pods, crew cabins, a science lab, ore tanks and ISRU converter parts;
- any size class other than 1.25 m.

Part of this is 05 gap 3. KSP ships with more than 300 parts in five size classes.

### 3.2 Resources and power

| Item | What exists | Evidence | State |
|---|---|---|---|
| Resources | LF, Ox (stack); EC, supplies, O2, water, food, EVA propellant (vessel); ablator (none) | `mods/stock/src/resources.ts:12-51`, `eva.ts:20` | implemented; no monoprop, xenon, solid fuel or ore |
| Producers | One solar panel at a **constant 0.5 EC/s**, with no sun angle, no occlusion and no distance falloff, and it also produces in the background | `mods/stock/src/solar.ts:4,25-28` | partial |
| Storage | Built in only: pod 50, probe 20, suit 20. There is no battery part, and the `stock.batteries` group is empty | 15d §A4 | partial |
| Consumers | Reaction wheel 0.6 EC/s × demand; experiments pause without EC; scrubber per person per day, with a CO2 shortage after 30 min of grace. **Antennas draw no EC when they transmit**, though they have a `power` field | `modules.ts:396-420`, `science.ts:169,216-219`, `packages/sim/src/life.ts:150-185`, `comms.ts:75-99` | partial |
| Other generators | No RTG, fuel cell or alternator | — | missing |
| Transfer | No player transfer between tanks (05 gap 5) | `packages/sim/src/resources.ts` | missing |

### 3.3 ISRU and bases (plan 128)

- **What exists:** base hub, ISRU plant, storage, ice, and electrolysis (100 ice + 120 power → 40 LF + 49 Ox per day). `deployBase`, `joinSite`, drilling, and supply routes on the synodic window (`mods/stock/src/bases.ts`; `packages/sim/src/bases.ts:52-186`).
- **Gaps:**
  - **No command refuels a vessel from site storage**; site products can only be sold (`packages/sim/src/market.ts:187`).
  - Bases are not drawn.
  - Bases need no power, crew or life support.
  - Route cargo moves without a flight.
- Status: partial (an economy abstraction, not KSP-style ISRU).

### 3.4 Science

**Situations:** Landed, Splashed, Flying low/high, Space low/high, with regions in every situation except Space high (`mods/stock/src/science.ts:20-69`).

**Regions (plan 104):** home biomes; on Cinder, Highlands, Maria and Crater fields; Sol bodies.

**Experiments:**

| Experiment | Base value | Transmit factor | Situations |
|---|---|---|---|
| Temperature | 8 | 0.5 | any |
| Pressure | 10 | 0.5 | any |
| Seismic | 20 | 0.6 | landed |
| Surface sample | 30 | recover only | landed or splashed |
| Atmosphere sample | 15 | recover only | — |

**Value:** each repeat falls by `repeatFactor`, capped at 3× base (`packages/core/src/science.ts:145-157`).

**Transmission:** queued per radio, with relays and store-and-forward (`packages/sim/src/transmission.ts:42-190`). Recovery pays full value. Discovery science (plan 129) adds facts, data levels and peer review. Body dossiers exist (`science.ts:278-320`).

**Gaps:**
- **No experiment reset or clean, and no lab part.** The R&D `lab` capacity only limits parallel discovery datasets.
- The science dock panel (plan 191) offers only "run next" and "transmit best"; you cannot pick an experiment or a result (`mods/stock/src/panels.ts:14-30`).
- The tech tree has **10 nodes and 1 115 science**, gated by milestones (`mods/stock/src/tech.ts:8-115`); KSP has about 60.

Status: implemented, but thin.

### 3.5 Rough edges

- 15d §A6 says the map has no region overlay ("draft plan 192"). That is out of date: plan 192 is done (commit `6aa1c2e6`, 15c §1, `apps/web/src/lib/hud/RegionsLayer.svelte`).
- `packages/core/src/science.ts:120` still says "until plan 104", but plan 104 is done.
- `mods/stock/src/charges.ts:2` says "operations placeholder".
- Ablator is registered as a resource but lives in module state (`modules.ts:526-530`), so a container cannot hold or refill it.

---

## 4. EVA and crew

The full audit is in [15d-parts-science-crew-audit-raw.md](15d-parts-science-crew-audit-raw.md) (§B1–B4).

| Area | What exists | Evidence | State |
|---|---|---|---|
| EVA (plan 109, ADR 0120) | Step out (refused during warp), walk at up to 1.5 m/s, board within 50 m at under 2 m/s if a seat is free, plant a flag, samples into the locker, EVA XP per body, suit radio as a 2 km UHF relay (plan 121) | `packages/sim/src/eva.ts:36-280` | implemented in the sim |
| EVA controls | Driven only from `CrewPanel.svelte`: EVA, N/E/S/W walk, Stop, Flag, Board. **No EVA key bindings**; the suit's status chip always reads "IVA" | `apps/web/src/lib/hud/CrewPanel.svelte:75`, `flight-loop.ts:573-607` | partial |
| Jetpack | Exists in the sim: 50 N, 5 kg of propellant, up axis only. **The HUD cannot fly it**, because throttle and stage act on the launched vessel | `mods/stock/src/eva.ts:28-29,58-73`, `flight-loop.ts:346,416,573` | partial (not usable) |
| EVA science | The suit has a sampler, but the science panel acts on the launched vessel | `apps/web/src/lib/dock/panel-input.ts:7-14` | partial |
| EVA missing | Ladders, climbing and grab (the roadmap promises "climb", `web/lib/public/roadmap.ts:205`), ragdoll, helmet, EVA construction, repair | — | missing |
| Roster (plans 106, 108) | Pilot, engineer, scientist, tourist; 7 ability factors (+5 % per level); 6 traits; XP (flyby 1, orbit 1.5, landed 2.3, EVA 1, ×2 away from home; levels at 2/8/16/32/64) booked at recovery; salaries and recruit cost; capacity from the Astronaut Complex | `mods/stock/src/crew.ts:7-40`, `packages/sim/src/crew.ts` | implemented |
| Professions in play | **Most abilities are never read.** Only `gTolerance` (`life.ts:252`) and `radio` (`packages/sim/src/comms.ts:285`) are read; `controlSmoothing`, `scriptBudget`, `repairRate`, `dataQuality` and `panicResistance` are not. Pilots do not gate SAS (flight tools must never be gated, `packages/core/src/crew.ts:33-43`), engineers do not repair, scientists do not reset | as cited | partial: professions are mostly cosmetic |
| Crew management UI | `crew-dismiss` and `crew-transfer` exist in the sim with no UI (`packages/sim/src/crew.ts:120,173`). Crew are assigned only on the Launch screen, not in the VAB. The toolbar Crew button is disabled (rough edges table) | as cited | partial |
| Crew sim (plan 107) | Life support off/simple/full, integrated exactly on rails, with grace periods (O2/CO2 30 min, water and supplies 3 days, food 10 days); morale; fatigue with **no rest action**; g-load stress and an 8 s G-LOC that **does not remove control** (only a "Blacked out" chip); radiation dose with no limit or effect | `packages/sim/src/life.ts:150-287` | partial |
| Death | Rule `stock.crew-death`: permanent, return after N days (14 by default), or off; `loseMember` runs when a vessel is destroyed or a grace period runs out | `mods/stock/src/rules.ts:152,163`, `packages/sim/src/crew.ts:246-283` | implemented |
| Rescue | **No rescue contracts.** The six templates are altitude, orbit, moon flyby, moon landing, moon return and planet flyby | `mods/stock/src/contracts.ts:69-185` | missing |

**How the player meets it.** The player hires crew in the Astronaut Complex and seats them on the Launch screen. In flight they open the Crew panel to step out and walk with on-screen buttons. A kerbal-style jetpack flight or ladder climb is not possible. XP shows only after recovery.

---

## 5. Settings, difficulty and keys

### 5.1 Player settings (per browser, localStorage)

Stored as one versioned, zod-validated JSON value under `orbital.settings`, format 3 (`web/lib/settings/settings.ts:12,70-75`). Formats 1 and 2 migrate by taking defaults for new fields (`settings.ts:107-130`). If storage is not available, the setting applies for the current session only (`settings.ts:142-147`).

| Setting | Values | Where | State |
|---|---|---|---|
| Graphics quality | Automatic / Low / Medium / High | `web/lib/ui/SettingsDialog.svelte:66-69,124-153`; own key `orbital.graphics` (`web/lib/graphics.ts:16-46`) | implemented |
| Adjust quality while playing (governor, ~55 fps) | on/off | `SettingsDialog.svelte:141-154`; `graphics.ts:48-70` | implemented |
| Interface size | 80, 90, 100, 110, 125, 150 % | `settings.ts:39-49`; `SettingsDialog.svelte:155-170` | implemented |
| High contrast | on/off | `settings.ts:47`; `SettingsDialog.svelte:170-180` | implemented |
| Units | metric / imperial | `settings.ts:16`; `SettingsDialog.svelte:72-73,181-196` | implemented |
| First-flight guide | status pending/active/done/skipped; reset button | `settings.ts:14-22`; `SettingsDialog.svelte:196-205` | implemented |
| Touch controls | auto / on / off | `settings.ts:24`; `SettingsDialog.svelte:76-78` | implemented |
| Key bindings | per-action overrides, clash prompt with swap | `SettingsDialog.svelte:220-221`; `web/lib/ui/ControlsEditor.svelte:23,54-103` | implemented |
| Audio | master 0.7, effects 0.8, interface 0.6, mute | `settings.ts:28-36`; `SettingsDialog.svelte:86-88` | implemented; there is no music channel |
| Dock layout | rail panels + open panel | `settings.ts:62-68` | implemented (no UI in the dialog; set from the dock) |

What is missing compared with KSP: field of view, camera sensitivity or inverted axes, gamepad or joystick input, language, render resolution scale (the governor is automatic only), and separate toggles for shadows, clouds or terrain detail (presets only).

### 5.2 World rules and difficulty (plan 078, ADRs 0094/0111)

Rules are typed registry entries: boolean, enum or number, with per-preset values and a `changeable` flag (`packages/core/src/rules.ts:10-41,140-151`). Identity rules (`system`, `variant`, `gravityModel`, `seed`, `primarySite`) are fixed for the life of the world (`rules.ts:53-59`). Stock rules (`mods/stock/src/rules.ts`):

| Rule | Type / values | Default | Line |
|---|---|---|---|
| Economy | bool | true | 23 |
| Procedural contracts | bool | true | 34 |
| Funds rewards ×| number | 1 | 44 |
| Costs × | number | 1 | 54 |
| Science depth | classic / discovery | classic | 66 |
| Science rewards × | number | 1 | 76 |
| Tech tree | bool | true | 86 |
| Professions, traits, experience | bool | true | 97 |
| Salaries and recruit costs | bool | true | 106 |
| Life support | off / simple / full | simple | 115 |
| Morale | bool | true | 125 |
| Rest and fatigue | bool | false | 134 |
| G-load and radiation | bool | true | 143 |
| Crew death | permanent / return / off | permanent | 152 |
| Days until a lost crew member returns | number | 14 | 163 |
| Communications network | bool | true | 176 |
| Radio interference | bool | true | 185 |
| Signal delay | display / enforced / flight-computer | display | 193 |
| Probe control without signal | full / partial / none | none | 202 |
| Comms range scale | number | 1 | 212 |
| Range safety | cost / hard / off | cost | 224 |
| Part reliability | bool | false | 235 |
| Agency type | government / company / hybrid | government | 245 |
| Rival agencies | number | 3 | 254 |
| Starting funds | number | 100 000 | 267 |

The presets are Sandbox, Science, Career, Career (hardcore) and Career (engineering), which is Career plus reliability (`mods/stock/src/rules.ts:306-340`). You choose them in Create World (`web/lib/worlds/CreateWorld.svelte:51-127,377`).

Gaps:
- **Rules cannot be changed after the world is created from the UI.** The sim accepts `set-rule` (`packages/sim/src/commands.ts:468`), but nothing in `apps/web/src` sends it. The status is partial.
- There are **no flight-difficulty rules**, which KSP has: re-entry heating multiplier, crash tolerance, unbreakable joints, quicksave/revert allowed, "no crash damage", infinite fuel or electricity, or a G-limit multiplier. Search found none, so these are missing.
- **There is no player-facing cheat or debug menu** (KSP Alt+F12). The only dev hooks are DEV-only: the autopilot on `P` (`web/lib/flight-loop.ts:479`, `web/lib/autopilot.ts:2`), HUD cost counters (`flight-loop.ts:287,723,761`), and `window.__vab` (`web/lib/vab/controller.svelte.ts:538`).

### 5.3 Every remappable binding

All remappable bindings are in `web/lib/keybindings.ts:57-133`. Flight and map share one clash scope; the VAB has its own (`:13-22`).

| Mode / group | Actions (default key) | Lines |
|---|---|---|
| Fly | throttle up (LShift), throttle down (LCtrl), full (Z), cut (X), pitch W/S, yaw A/D, roll Q/E, stage (Space) | 58-68 |
| SAS | toggle (T), hold (1), prograde 2, retrograde 3, normal 4, antinormal 5, radial out 6, radial in 7, maneuver 8, target 9, anti-target 0, level wings (;) | 69-70, 82-91 |
| Action groups | custom 1–10 (Numpad1–0) | 72-81 |
| Aircraft | trim up (]), trim down ([), brakes (C) | 93-95 |
| See | map (M), speed reference (V), next target (Y) | 96-98 |
| Time and menus | warp down (,), up (.), quicksave F5, quickload F9, help (? / F1), mute (N, global) | 99-111 |
| Map: maneuver nodes | next body (Tab), prograde I/K, normal L/J, radial O/U, delete node (Delete) | 112-119 |
| VAB | listed in 05 §2.1 | 120-132 |

Reserved keys: Esc, Backspace, the arrows, `+ - = _` (`:157-168`). Fixed keys are Esc for the pause menu and drag/wheel for the camera (`:171-182`). Other hard-coded keys: Space Center `R` rotates a building and Esc cancels the build (`web/routes/space-center/+page.svelte:228-230`); Esc deselects in the Mission Center (`web/routes/mission-center/+page.svelte:262`).

**KSP bindings with no action:** RCS toggle (R), RCS translation (H/N/I/J/K/L), docking mode, gear (G), lights (U), abort (Backspace, which is reserved here), stage lock (Alt+L), camera mode (V is used for the speed reference), focus next vessel (]/[ are used for trim), EVA keys (board, jetpack, ladder), and precision control (Caps Lock). EVA exists, but it is driven only from the UI (`web/lib/flight-loop.ts:192-193,573-607`).

### 5.4 Save management, craft sharing, mods, localisation

- **Game saves:** the load dialog has a thumbnail, Load, Rename, Export file, Delete with confirm, and a "Load anyway" warning when mods are missing (`web/lib/save/LoadDialog.svelte:20,43-44,82-166`). You can import a save file (`:178-188`). Names are up to 48 characters (`web/lib/save/saves.ts:31`). Older save worlds are migrated (`web/lib/save/migrate-worlds.ts`). Status: implemented.
- **Craft sharing:** VAB library export and import (see 05 §2). Script share is in `web/lib/script-share.ts`; replays and challenges as files come from plan 131 (`web/lib/replays/`, `web/lib/challenges/`). There is no online hub, so that part is missing.
- **Mods UI:** `/mods` installs from a `.orbital-mod.json` file or a URL, with a trust prompt, enable/disable and remove. The code runs on the next load (`web/routes/mods/+page.svelte:25-46,68-135`; `web/lib/mods/manager.svelte.ts:1-5`). Status: implemented.
- **Localisation: missing.** `lang="en"` is fixed (`apps/web/src/app.html:2`), numbers are formatted as `en-US` (`web/lib/format.ts:19,85`), all strings are inline English, and no i18n library exists (search for i18n/locale/paraglide found nothing).

---

## 6. Presentation and onboarding

The full audit, with citations, is in [15b-presentation-release-audit-raw.md](15b-presentation-release-audit-raw.md) (§1a–1e). This is a condensed version.

| Area | What exists | Evidence | State |
|---|---|---|---|
| Flight camera | One orbit camera round the vessel (yaw, pitch, log zoom 2 m – 5 km); mouse, one-finger orbit and pinch; follows the EVA suit; frames itself round HUD insets | `packages/renderer/src/camera-rig.ts:24-46`, `apps/web/src/lib/flight-loop.ts:496-579` | implemented (a single mode) |
| Camera modes / IVA | No chase, locked, free or cinematic mode; no mode API on `Renderer`. `camera-presets.ts` holds dev screenshot poses only. "IVA" appears only as a crew status chip | `packages/renderer/src/renderer.ts:109-160`, `camera-presets.ts:1-5`, `web/lib/hud/AppBar.svelte:48,62-68` (disabled button) | missing |
| Map view | Focus body, system scope, highlight, layers (details in 2.1) | `renderer.ts:122-145` | implemented |
| Effects | Plume (throttle, pressure, shock diamonds, multi-nozzle), plume light on the ground, liftoff smoke and dust, separation gas, drifting trail, re-entry plasma and glow, explosion with shards, wreckage that stays, waterline ripples and splashes, pad steam | `packages/renderer/src/effects/*` (`plume.ts`, `reentry.ts`, `explosion.ts`, `wreckage.ts`, `waterline.ts`) | implemented; touchdown dust, RCS puffs and chute visuals missing (their parts are missing too) |
| Audio | Synthesised with Web Audio, no sample files (ADR 0062). Continuous layers: engine roar, rumble, wind. One-shots: click, SAS on/off, stage, warning (heat ≥ 0.8, flameout, damage). Master, effects and UI buses, mute on N | `apps/web/src/lib/audio/engine.ts:118-215`, `director.ts:21-60`, `params.ts:80-96` | partial: 3 layers and 5 one-shots |
| Music | None, by decision | ADR 0062; no music bus in `settings.ts:28-36` | missing |
| First-run guide | First-flight guide, 9 steps from build to circularise, with skip and reset; steps show the player's own keys and touch wording | `apps/web/src/lib/onboarding/tutorial.ts:41-150`, `TutorialCard.svelte` | implemented |
| Help | F1 or ? opens a controls overlay | `HelpOverlay.svelte`, `routes/flight/+page.svelte:517,827` | implemented |
| Tooltips | Native `title=` only (about 147 uses) plus key hints on `IconButton`; no tooltip component | `web/lib/ui/IconButton.svelte:7,13` | partial |
| Tutorials past the first orbit | None for landing, maneuver nodes, rendezvous, docking, science, EVA or planes; no manual or knowledge base | — | missing |
| Achievements and milestones | Milestones in the sim, 7 stock achievements, unlock tracker, IndexedDB profile, panel on Worlds, toasts | `packages/core/src/milestones.ts:1-79`, `mods/stock/src/achievements.ts:9-45` | implemented; small set |

**Rough edges.**
- The engine roar gain is `throttle·√p` in code (`params.ts:80-81`) but `throttle·(0.25+0.75p)` in ADR 0062. The roar is quieter at altitude than the ADR intends.
- An explosion plays only the generic `warning` beep. There is no impact or explosion sound.
- The toolbar Camera button is still a disabled placeholder that points at a finished plan (see the rough edges table at the end).

---

## 7. Release readiness

The full audit is in [15b-presentation-release-audit-raw.md](15b-presentation-release-audit-raw.md) (§2). The base-path check below is new to this file. The build reports version `1.0.0-rc.1` (`apps/web/src/lib/public/about.ts:4`).

| Area | Summary | Evidence | State |
|---|---|---|---|
| Build | `adapter-static` with fallback `200.html`; every route prerendered | `apps/web/vite.config.ts:2,15`, `routes/+layout.ts:7`, ADR 0006 | implemented |
| Reference server | Bun server: CSP per page with inline-script hashes, gzip, immutable cache, SPA fallback. It is a reference for hosts, not a deploy target | `apps/web/scripts/serve.ts:1-82` | implemented |
| CSP and headers | Computed in `hosting-headers.ts`. There is no `_headers`, `netlify.toml` or `vercel.json`, so each host must re-derive the hashes. No HSTS or COEP | `apps/web/src/lib/hosting-headers.ts:33-59`, `docs/architecture/hosting.md:21` | partial |
| Deploy | No deploy script or job; domain and CDN undecided. CI runs the e2e smoke on Chromium only, and it does not block | `docs/architecture/hosting.md:56-58`, `.github/workflows/ci.yml` | partial |
| Performance | Low, medium and high presets, an automatic choice, and a governor aiming for 55 fps. Frame budgets were measured on an M5 only; M1/M2, Intel and phones were not measured (STATUS rows 019–039) | `packages/renderer/src/presets.ts`, `quality-governor.ts`, `docs/STATUS.md` | implemented; hardware coverage thin |
| Browser support | Gate on WebGL2, Workers and WASM; Chrome/Edge 97+, Firefox 114+, Safari 16+ (ADR 0040); tablets (ADR 0063); small-screen notice; phones unsupported | `apps/web/src/lib/browser-support.ts:20-58` | implemented |
| Error handling | Error page, `<svelte:boundary>`, a sim-worker crash card. No `window.onerror`, `unhandledrejection` handler or `hooks.client.ts` | `+layout.svelte:89-98`, `web/lib/sim-client.ts:149` | partial |
| Crash reporting, analytics, telemetry | None (the game makes no requests of its own). `packages/scripting/src/telemetry.ts` is in-game script telemetry, not product telemetry | `docs/architecture/hosting.md:3` | missing |
| Save migration | Sim save v8 with steps 1→8; game envelope v2; world v1 plus legacy migration; autosave every 120 s, on events and on hide; mod mismatch report | `packages/core/src/save.ts:31,341-491`, `web/lib/save/migrate-worlds.ts` | implemented |
| Public pages | `/credits` (Apache-2.0, OFL), `/roadmap` (about 45 items), main menu, metadata, social image, `robots.txt`. No About, privacy or licence page in the app | `web/lib/public/roadmap.ts:43-365` | partial |
| PWA / offline | No manifest, no service worker; the 7.2 MB ephemeris in `static/ephemeris/` is not cached | `apps/web/static/ephemeris/`, `web/lib/ephemeris-asset.ts:10` | missing |

### 7.1 Base path and static hosts such as GitHub Pages (new check)

- **No `paths.base` is configured.** The adapter is set up with no `kit.paths` option, and there is no `svelte.config.js` (`apps/web/vite.config.ts:9-16`). The build therefore assumes it is served at the domain root.
- **At least 40 root-absolute links** (`href="/…"`, `goto('/…')`, `location.assign('/…')`) are spread through `apps/web/src`. Examples: `web/lib/ui/MenuShell.svelte:22`, `web/lib/space-center/SpaceCenterOverlay.svelte:75`, `web/lib/mission-center/MissionCenterOverlay.svelte:121`, `web/lib/vab/TopBar.svelte:18`, `web/lib/save/LoadDialog.svelte:173`. Only the script sandbox uses `asset()` from `$app/paths` (`web/lib/script-sandbox-web.ts:2,60`).
- **The ephemeris is fetched from a root-absolute path:** `'/ephemeris/de440-2000-2100.bin.gz'` (`web/lib/ephemeris-asset.ts:10,41`).
- **Consequence:** on a project page (`user.github.io/space-orbital/`) every in-app link and the ephemeris fetch go to the domain root and fail with 404. Status: **missing**.
- **SPA fallback name.** The fallback is `200.html` (`vite.config.ts:15`), which Surge and some hosts use. GitHub Pages only serves `404.html`. Prerendered routes still work there; dynamic or unknown routes do not.
- **Headers.** GitHub Pages cannot set response headers. The CSP that `hosting-headers.ts` computes, with hashes per page, cannot be applied there unless it is moved into `<meta http-equiv>`, which drops `frame-ancestors`. The script sandbox depends on an opaque-origin iframe with a no-network CSP (ADR 0038), so a host without headers weakens that isolation.

---

## 8. Top 25 gaps against a KSP-grade public release, by player impact

This list combines sections 1–7 here (raw files 15a–15d) with the gaps in [05-orbital-today-inventory.md](05-orbital-today-inventory.md) §5, which is marked "05 #n". Rank is by how soon and how often a new public player hits the gap.

| # | Gap | Why it matters to a player | Files involved |
|---|---|---|---|
| 1 | **No parachutes.** The only way home is a slow splashdown or a powered landing | The first crewed flight of every KSP player ends under a chute | `mods/stock/src/parts.ts`, `mods/stock/src/modules.ts`, `mods/stock/src/action-groups.ts:13`, `packages/sim/src/aero.ts` (15a §7) |
| 2 | **No single world clock across screens.** Leaving a screen through a link does not save, so progress since the last autosave is lost (05 #1) | Lost flights, and time that is confusing | `apps/web/src/lib/sim-client.ts:239`, `web/lib/hud/AppBar.svelte:60-62`, `web/lib/save/autosave.ts:13` |
| 3 | **No vessel switching.** Only the save's focus vessel can be flown; there is no `[`/`]`, and other vessels show `NOT_FLYABLE` (05 #9, 15c §7) | Stations, landers left in orbit, rescues and multi-launch missions are impossible | `web/lib/flight-loop.ts:259,933,951`, `web/lib/mission-center/model.ts:185-237`, ADR 0118 |
| 4 | **No docking ports and no docking** (05 #3, 15c §3) | The whole rendezvous toolset leads nowhere | `mods/stock/src/action-groups.ts:11`, `packages/sim/src/vessel.ts`, `web/lib/rendezvous-aids.ts` |
| 5 | **No RCS or monopropellant**, and no translation keys (05 #3, 15a §4) | No fine control for docking or landing | `mods/stock/src/modules.ts`, `mods/stock/src/resources.ts`, `web/lib/keybindings.ts:57-133` |
| 6 | **Static hosting assumes the domain root.** No `paths.base`, 40+ root-absolute links, a root-absolute ephemeris fetch, a `200.html` fallback, and a CSP that needs headers (7.1) | A GitHub Pages or sub-path deploy is broken on first load | `apps/web/vite.config.ts:9-16`, `web/lib/ephemeris-asset.ts:10`, `web/lib/ui/MenuShell.svelte:22`, `web/lib/hosting-headers.ts` |
| 7 | **Tutorials end at the first orbit.** No landing, node, rendezvous, science or EVA lessons; no manual; tooltips are `title=` only (15b §1d) | Players drop off right after orbit | `web/lib/onboarding/tutorial.ts`, `web/lib/ui/IconButton.svelte` |
| 8 | **Batteries missing and power is too simple.** Constant solar output, no battery part, antennas draw no EC (3.2) | Power is never a design constraint, and probes cannot ride out the night | `mods/stock/src/solar.ts:4,25-28`, `mods/stock/src/comms.ts:75-99`, `mods/stock/src/parts.ts` |
| 9 | **Small part catalogue.** 36 parts, one size class, no fairings, cargo bays, lights, ladders, multi-seat pods or labs (3.1) | Little room to build creatively; heavy lift is impossible | `mods/stock/src/parts.ts`, `mods/stock/src/tech.ts` |
| 10 | **No engine tweakables or resource transfer.** No thrust limiter, independent throttle, editor fuel fill or tank-to-tank transfer (05 #4, #5) | Standard KSP craft tuning is impossible | `mods/stock/src/modules.ts:141-305`, `packages/sim/src/resources.ts`, `web/lib/hud/ResourcesPanel.svelte` |
| 11 | **EVA cannot be flown or bound to keys.** The jetpack is unreachable from the HUD; there are no ladders; the suit sampler cannot be used from the panel (section 4) | EVA, KSP's signature activity, is a button panel | `web/lib/hud/CrewPanel.svelte:75`, `web/lib/flight-loop.ts:346,416,573-607`, `web/lib/dock/panel-input.ts:7-14`, `packages/sim/src/eva.ts` |
| 12 | **No camera modes and no IVA.** Orbit camera only; the toolbar Camera button is disabled (05 #15, 15b §1a) | Less immersion, and planes are hard to fly | `packages/renderer/src/renderer.ts:109-160`, `web/lib/hud/AppBar.svelte:48,62-68` |
| 13 | **Maneuver node editing is coarse.** No numeric Δv entry, no time ± or next-orbit, a panel for the first node only, no touch editing; no AN/DN markers on the map, and no Ap/Pe on the planned orbit (15c §1-2) | Precise transfers are fiddly | `web/lib/hud/ManeuverPanel.svelte:48-82`, `web/lib/hud-controller.ts:265-282`, `web/lib/hud/MapMarkers.svelte:23-50` |
| 14 | **No time warp at the Space Center or building screens** (05 #2) | You cannot wait for construction, contracts or windows | `apps/web/src/routes/space-center/+page.svelte`, `web/lib/mission-center/MissionCenterOverlay.svelte:137,218` |
| 15 | **Planes and rovers are crippled.** No jets or intakes, no wheel motor, no Mach effects (15a §1, §4, §7) | An aircraft line needs rocket engines; rovers cannot drive | `mods/stock/src/modules.ts:936-998`, `packages/sim/src/frames.ts:410-477`, `packages/sim/src/atmosphere.ts` |
| 16 | **VAB editing tools are limited.** No 3D gizmos, re-root, mirror symmetry or VAB action-group editor (05 #6, #10) | Complex craft are hard to build; Numpad groups do nothing | `web/lib/vab/controller.svelte.ts:1002-1031`, `web/lib/editor/state.ts`, `mods/stock/src/action-groups.ts` |
| 17 | **No operations safety net.** No global error handler, no opt-in crash reporting, CI e2e on Chromium only and not blocking, no deploy job (15b §2) | Public bugs are invisible to the team | `apps/web/src/routes/+layout.svelte:89-98`, `.github/workflows/ci.yml`, `docs/architecture/hosting.md:56-58` |
| 18 | **Professions are mostly cosmetic.** Five ability factors are never read; no repair; no experiment reset; G-LOC does not remove control; fatigue has no rest (section 4) | Crew choice does not matter | `mods/stock/src/crew.ts:7-40`, `packages/sim/src/life.ts`, `packages/core/src/crew.ts:33-43` |
| 19 | **Thin career content.** A 10-node tech tree; 6 contract templates; no rescue contracts; science runs cannot be chosen (3.4, 4) | A career run ends within a few hours | `mods/stock/src/tech.ts:8-115`, `mods/stock/src/contracts.ts:69-185`, `mods/stock/src/panels.ts:14-30` |
| 20 | **No tracking actions.** No recover, terminate or rename from the Mission Center; no Alarm Clock; the Relays filter is always empty (15c §4, §6) | Hard to manage a growing fleet | `web/lib/mission-center/model.ts:97-237`, `web/lib/mission-center/MissionCenterOverlay.svelte:168`, `packages/sim/src/commands.ts:472-483` |
| 21 | **Sound is sparse and there is no music.** 3 layers and 5 one-shots; no explosion, decouple, landing or EVA sounds (15b §1c) | The game feels empty, and crashes are silent | `apps/web/src/lib/audio/engine.ts`, `director.ts`, `params.ts`, ADR 0062 |
| 22 | **No flight difficulty or cheat options, and rules are locked after creation.** No re-entry or crash multiplier, no unbreakable joints, no infinite fuel; `set-rule` has no UI (5.2) | Newcomers cannot soften the game; testers cannot debug | `mods/stock/src/rules.ts`, `packages/sim/src/commands.ts:468`, `web/lib/ui/SettingsDialog.svelte` |
| 23 | **Structure never fails.** Rigid vessels, struts give no stiffness, no overstress and no part-to-part collision damage (15a §3) | Bad designs never fail in flight; no KSP drama | ADR 0018, `packages/sim/src/vessel.ts:606-654`, `mods/stock/src/parts.ts:519-536` |
| 24 | **No PWA or offline mode, and no localisation.** No manifest or service worker; the 7.2 MB ephemeris is not cached; English only (15b §2, 5.4) | Slow repeat loads; non-English players are excluded | `apps/web/static/ephemeris/`, `apps/web/src/app.html:2`, `web/lib/format.ts:19,85` |
| 25 | **No gamepad, FOV or camera sensitivity settings**, and the HUD has a single breakpoint (5.1, 05 #13) | Players on small laptops or tablets, or used to a controller, lose out | `web/lib/settings/settings.ts`, `apps/web/src/routes/flight/+page.svelte:1074,1144` |

Gaps from 05 that are left out because they rank lower than the 25 above: pause is modal (05 #8); world time is not shown on building screens (05 #11); a full sim boot on every screen change (05 #12); a duplicate blackout badge (05 #14). They still apply.

---

## Rough edges found (verified)

| Finding | Evidence |
|---|---|
| The toolbar Camera button is disabled, with the tooltip "Camera views: comes with plan 112". Plan 112 is done | `web/lib/hud/AppBar.svelte:48,62-68` |
| The toolbar Crew panel button is disabled, with the tooltip "comes with plan 108". Plan 108 is done | `web/lib/hud/AppBar.svelte:108-113` |
| The toolbar VAB link is a plain `<a href="/vab">`; leaving does not save | `web/lib/hud/AppBar.svelte:60-62` (see also 05 §1.3) |
| The `set-rule` command has no UI | `packages/sim/src/commands.ts:468` |
| No TODO/FIXME/"coming soon" strings in `apps/web/src` apart from the two `later(...)` tooltips | grep over `web/lib`, `web/routes` |
