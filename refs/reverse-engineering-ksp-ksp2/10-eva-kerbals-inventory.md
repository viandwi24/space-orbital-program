# 10 — EVA and kerbals as actors: an exhaustive KSP1/KSP2 reference

Research written 2026-10-18 for Space Orbital Program. It covers how Kerbal Space Program 1 (with Making History and Breaking Ground) and KSP2 treat EVA and the kerbals themselves: getting out, moving, acting on parts, building, being a person on a roster, staying alive, and being shown on screen. It ends with Adopt / Improve / Avoid notes and a launch checklist, compared against our EVA (ADR 0120, `mods/stock/src/eva.ts`, `packages/sim/src/eva.ts`).

**Method and caveats.**
- Public sources only. Nothing was downloaded from the games or decompiled.
- The live KSP wiki sits behind a bot challenge, which I did not try to get past. KSP1 wiki pages were read from their 2023 Internet Archive snapshots. They describe roughly KSP 1.12, and some wiki text is older than the version it sits beside; where two pages disagree, both are given.
- Forum facts come from search snippets and are marked *(snippet)*. Facts from memory that I could not re-check are marked *(unverified)*.
- Tags: **[KSP1]** base game; **[MH]** Making History; **[BG]** Breaking Ground; **[KSP2]** shipped in KSP2 Early Access (v0.1–v0.2.2); **[KSP2 — never shipped]**; **[Mod]**.
- The sibling note [`../reverse-engineering-ksp2/08-crew.md`](../reverse-engineering-ksp2/08-crew.md) covers crew as an economy and roster system. This document goes deeper on the kerbal as an actor in the world and does not repeat its economy analysis.

---

## 1. Going EVA, boarding, transfer, seats, IVA

### 1.1 Getting out

| Topic | What happens | Tag | Src |
|---|---|---|---|
| Ways to start an EVA | (a) Left-click a crewed part's hatch to open the crew hatch dialog, which has an **EVA** and a **Transfer** button per kerbal. (b) Hover a crew portrait (bottom right) for its EVA button *(still unverified wording)*. | KSP1 | [S27][S2] |
| Which parts allow EVA | Any part with crew capacity and an airlock: pods, cockpits, cabins, the lab and the cupola. The EAS-1 command seat is the exception: the kerbal simply stands up out of it. A part with no airlock (some passenger modules in mods) cannot let crew out *(still unverified)*. | KSP1 | [S1][S13] |
| Hatch obstructed | Before spawning, the game checks the space in front of the airlock. If a collider is there, it shows "hatch obstructed" and refuses. Players hit this with parts in front of the hatch, docking ports, robot-arm scanner ranges, and **any crewed part counted as shielded inside a fairing or cargo bay**, which blocks all its hatches. 1.11 fixed "inconsistency in the detection of hatch obstruction", and 1.11.1 fixed hatches being blocked by the robotic arm's range trigger. A known workaround is transferring the kerbal to another part with a clear hatch. | KSP1 | [S20][S21][S40] *(snippet)* |
| Where EVA is allowed (career) | With **Astronaut Complex level 1**, kerbals can only leave the vessel on Kerbin. **Level 2** (112,500 funds) allows EVA anywhere and flag planting. Level 3 only raises the roster cap. | KSP1 | [S5][S1] |
| Situations | You can go EVA landed, splashed, in orbit, and **in atmospheric flight**. The kerbal keeps the vessel's velocity and from then on is its own vessel, which can be killed by aerodynamic forces and heat. | KSP1 | [S1][S2] |
| Initial temperature | Since 1.6 an EVA kerbal starts at "room temperature", not the part's temperature. The `EVA_INHERIT_PART_TEMPERATURE` setting reverts this. | KSP1 | [S26] |
| Tourists | Tourists cannot go EVA. One exception: a tourist placed in an EAS-1 seat can leave it and act like a normal kerbal until they board a real pod. 1.11 fixed tourists being forced out of command seats. | KSP1 | [S9][S1][S20] |
| Time warp | KSP2 v0.1.1 made EVA require 1× warp. KSP1 behaves similarly *(still unverified)*. | KSP2 | [S45] |

### 1.2 Boarding

- **Range.** You board from the hatch, not from a distance. The kerbal must be grabbing the hatch handhold or a ladder near the airlock: press **F** to grab, then **B** (or F again) to board, or use the "Board" prompt [S1][S14].
- **Facing.** The kerbal may be unable to grab or board when not facing the hatch [S1].
- **Targets.** Any **unoccupied seat** in a command module, habitation module or EAS-1 seat, not only the vessel the kerbal left [S1].
- **On boarding:**
  - **Science.** Carried science moves into the part. A duplicate of something already stored must be discarded or kept elsewhere [S2].
  - **Propellant.** Jetpack propellant refills to full without draining the vessel. This was meant to come from the ship's monopropellant, but a bug kept the refill free [S1][S11]. Since 1.11 the jetpack and EVA cylinders refill when they are moved back into a vessel's inventory, and 1.11.1 limited this to EVA Propellant [S20][S21].
  - **Mass.** Since 1.11 crew and their cargo add mass to the part they sit in (kerbal 45 kg, or about 94 kg with the default jetpack and parachute). Crewed part masses were cut to compensate [S3][S20].
  - **Command seats are different.** An EAS-1 does not refill the jetpack or store science; the kerbal keeps both [S13].
- **SAS state.** Boarding no longer toggles the vessel's SAS (fixed in 0.18.3) [S1].

### 1.3 Crew transfer

- **[KSP1]** Since 0.25, click a crew hatch and press **Transfer** next to a kerbal, then click the target part [S27]. Before 0.25, EVA was the only way to move crew [S1].
  - Transfer works between crewed parts of the **same vessel**. Two docked vessels form one vessel, so docking enables transfer between them.
  - Whether a path through non-crewed parts is needed: stock does not check this *(still unverified: the archived EVA page only says transfer works "between crew modules on the same ship" [S52]; mods such as CLS added a path check)* [Mod: Connected Living Space].
  - 1.2 rebuilt crew transfer on a generic part-to-part transfer class and fires an event before each transfer, so mods can block it [S23].
- **[KSP2]** Crew are moved with a crew-transfer button near the Parts Manager. This is a player answer, not documentation [S48] *(snippet)*. In the VAB, seats are assigned in the **Kerbal Manager** [S50].

### 1.4 Command seats (external seats)

**EAS-1 External Command Seat** [S13]:
- radial-only, 50 kg, impact tolerance 6 m/s;
- full command authority while occupied, but no crew report (an EVA report still works);
- adds the seated kerbal's mass (93.75 kg with gear) and noticeable drag;
- since 1.5, crew can be **assigned to it in the VAB/SPH**; before that you had to EVA a kerbal into it after launch;
- since 1.4.3 the seated kerbal can open the personal parachute without leaving the seat, which players used to build paragliders.

To board a seat, get close and right-click "Board". The board key is **B** (since 1.0); **F** grabs ladders and handholds. The old Ladder page still says F boards *(corrected 2026-10-18: [S52, S53])*. Moderate torques, such as the helmet hitting something, can **throw the kerbal out**.

A seated kerbal counts as EVA for many purposes [S1]:
- They **cannot do construction** from the seat [S16].
- A kerbal in a seat at a mild crash may show as dead but come back when the vessel is recovered [S13].

The seat also works as the poor man's **ejection seat**: decouple it, then deploy the personal chute [S13]. Stock has no true ejection seat; mods add one [Mod: EVA Parachutes & Ejection Seats].

### 1.5 IVA basics

**[KSP1]** Press **C**, or use the portrait's IVA button, to sit inside a pod with working props [S31]:
- navball with zoom;
- speed with a switchable reference;
- altimeter;
- atmosphere gauge;
- throttle lever you can drag;
- window views (double-click).

Flight keys still work. IVA camera shake from g-loads and explosions has its own setting. Mods built full glass cockpits (RasterPropMonitor) [Mod].

**[KSP2]** No IVA was shipped [S50].

---

## 2. EVA movement

### 2.1 Key map (KSP1 defaults)

| Action | Key | Notes | Src |
|---|---|---|---|
| Walk | W A S D | Relative to the **camera**; the kerbal turns to face the way it moves | [S1] |
| Run | hold Shift | Walk about 0.87 m/s, run about 2.35 m/s on Kerbin | [S1][S3] |
| Jump | Space | Jump force uses body plus inventory mass since 1.11.1, after empty-handed kerbals could jump high enough to ragdoll and die. 1.12 fixed "kerbals being able to walk and jump their way to orbit". | [S1][S21][S22] |
| Swim | W A S D in liquid | Same controls as walking; surface samples are allowed while swimming | [S1] |
| Grab ladder or handhold | F | A prompt shows when in range | [S1][S14] |
| Climb | W/S up and down; A/D to a perpendicular ladder | Moving past the end lets go. Since 1.11 the kerbal stops at the end, with an option "Check ladders end". | [S14][S20] |
| Let go | Space | Shift+direction+Space jumps off the ladder in that direction | [S30] |
| Board | B (or F at the hatch) | | [S1][S14] |
| Jetpack on/off | R | | [S1][S30] |
| Jetpack translate | W A S D (horizontal), Shift / Ctrl (up/down) | | [S1][S11] |
| Jetpack yaw | Q / E; pitch and roll by left-drag of the mouse | | [S1][S30] |
| Orient to camera | Space (in free fall) | Turns the kerbal to the camera and puts the head toward north | [S1] |
| Auto-orient on translate | **T** toggles; the "SAS" light shows the state | Added 1.2. There is also a setting "EVAs Auto-Rotate to Camera". | [S23][S32b] |
| Suit lights | U (L before 1.2.1) | 1.11 added a colour picker for the kerbal light | [S1][S20] |
| Parachute | P; steer with W/S (pitch) and A/D (yaw) | | [S12] |
| Plant flag | Right-click the kerbal, then **Plant Flag** (no default key) | | [S15] |
| Construction mode | Hook icon on the right toolbar (the community quotes **I**) | | [S16][S41] |
| Switch to another vessel or EVA | [ and ] | | [S30] |

### 2.2 Physical behaviour

- **Falling and ragdoll [KSP1]** [S2]:
  - A hard impact kills an EVA kerbal.
  - A milder impact, or touching down with horizontal speed, sends them into an uncontrollable ragdoll.
  - In space they recover after about a second. Under gravity they only stand up once fully stopped, and on a slope they can tumble downhill to a fatal speed.
- **Low gravity [KSP1]**:
  - The jetpack can lift off only where surface gravity is below about **3.2 m/s²**. Duna is the largest body where it can take off (some pages say you have to jump first) [S1][S11].
  - Kerbin, Eve, Laythe and Tylo are too heavy for it [S1][S11].
  - From Minmus, Gilly and smaller bodies a kerbal can **reach orbit on the jetpack alone** [S1][S11].
  - Jumping on tiny moons is a known way to drift off.
- **Jetpack figures [KSP1].** 5 units of EVA propellant and about **600 m/s of Δv**. Since 1.11 an EVA Fuel Cylinder brings it to up to 8 units [S1][S11].
  - Thrust is quoted as about 270 N [S1] *(verified 2026-10-18: [S52])*. The archived EVA page still gives 270 N, 5 units (8 with a cylinder), 600 m/s and the 3.2 m/s² lift-off limit; it is still wiki text, not a config value.
  - 1.11.1 added a **thrust limiter** on the jetpack [S21].
  - The Δv is game-balanced, not physical. Our ADR 0120 figure (50 N, Isp 60 s, 5 kg) gives about 31 m/s; see section 8.
- **Pushing a ship [KSP1].** A kerbal can push a stranded vessel by jetpack to deorbit it, refuelling by boarding between pushes. It is slow, but a known rescue trick [S1].
- **Ladders [KSP1]** [S14][S37]:
  - Three ladder parts: the Pegasus I and Kelus (extendable) and the Kelus-LV (bay).
  - Every crewed part has small rungs at its airlock.
  - KSC structures have fixed ladders, which 1.11.1 fixed for use.
  - Kerbals do not collide with ladder parts.
  - An EVA kerbal can extend a ladder even on an uncontrolled craft.
  - A manoeuvring craft can fling a kerbal off its ladder.
- **Grabbing parts [KSP1]** [S1][S14][S21].
  - Stock "grab" means ladders, hatch handholds and the ladder-like rungs. A kerbal holding on moves with the vessel; 1.11.1 fixed phantom forces from kerbals on ladders.
  - Stock has **no free grab of an arbitrary part surface**. KIS/KAS added tethers and grabbing [Mod: KIS/KAS].
- **Helmets [KSP1].**
  - Since 1.6 you can remove the helmet and neck ring (right-click the kerbal) **only in a breathable atmosphere** [S26].
  - A helmetless kerbal takes impacts worse, **dies if the outside pressure gets too low** (climbing too high), and has very low heat tolerance: standing in a rocket exhaust, or flying supersonic low down in a seat, kills them almost at once [S2].
  - Mods can change the rules through the hooks CanSafelyRemoveHelmet, WillDieWithoutHelmet and CanEVAWithoutHelmet [S26].
  - 1.11 fixed the default helmet setting not applying on the first EVA, which implies a per-kerbal default helmet state [S20].
- **Personal parachute [KSP1]** [S12][S24][S26][S20]:
  - A steerable ram-air wing. You can set its deploy altitude and minimum pressure like any chute, cut it, and repack it.
  - Arrived in 1.4, usable from level 3.
  - Since 1.6, pilots at level 0 and others at level 1 can use it (the requirement lives in the trait config).
  - Since 1.11 it is a 4 kg, 10 L **inventory item** carried by default.
  - The Kerbonaut page says it arrived in 1.5 [S2]. The 1.4 changelog is the more reliable date.
- **Lights.** A suit headlamp toggled with U, with a colour picker since 1.11 [S1][S20].
- **EVA camera.**
  - The camera orbits the kerbal, and WASD is camera-relative, which beginners find confusing.
  - The navball shows the camera direction, not the kerbal's attitude, except in map view [S1][S11].
  - Since BG/1.7.1, EVA kerbals also show a **portrait** [S28].
- **[KSP2]** Shipped [S45][S44][S43]:
  - walk and run with tuned animation transitions;
  - jump; heavy suits make kerbals stumble, yet they jump high;
  - **swimming**;
  - jetpack with fuel;
  - ladders: the Kelus Long and Bobus Extra Long Telescopic ladders were fixed in v0.1.1;
  - holding onto a vehicle, saved and loaded since v0.2.0.

  Not documented anywhere for KSP2 *(unverified)*: helmet removal, a personal parachute, a suit light colour, and the ragdoll rules.

---

## 3. EVA actions on parts and science

### 3.1 Action catalogue (KSP1)

| Action | How | Gate in career | Src |
|---|---|---|---|
| EVA report | Kerbal right-click menu | Anyone; can be redone, but only one is carried back at a time | [S1] |
| Surface sample | Right-click, landed or **swimming** | R&D level 2 | [S1] |
| EVA science (kit) | "Perform EVA Science" with an EVA Experiments Kit; standing or floating only (not swimming, falling or on a ladder). Animations differ by place: a spinning wingnut (Dzhanibekov effect) in space, golf on Kerbin, Mun and Duna, smashing a frozen banana on Tylo and Vall. Reusable. | Kit researched | [S17] |
| Take data | "Take Data" from an experiment part, or collect all from a pod. A non-rerunnable experiment stays blocked until cleaned. | Anyone carries data; only scientists *operate* science parts on EVA | [S1][S2] |
| Store data | Into a pod or lab; on boarding automatically; one copy per experiment, biome and situation per kerbal | | [S2] |
| Restore experiments | Reset Goo or Materials Bay, and restore sensors | **Scientist** | [S1][S8] |
| Repack parachute | Right-click the chute, "Repack" | Engineer level 1 | [S1][S7] |
| Repair | Since 1.11, uses an **EVA Repair Kit**: 1 kit per 50 kg of part mass, at most 4 above 150 kg; fixes broken deployables (panels, wheels, legs) but not destroyed parts. Before 1.11 there was no kit: legs needed engineer level 2, wheels level 3. | Engineer level 1 (1.11+) | [S1][S7][S18] |
| Extend or retract panels and ladders | On any vessel, even an unpowered one | Anyone | [S1] |
| Robotics | Play or stop a KAL-1000 sequence from EVA (1.11) | | [S20] |
| Plant flag | Right-click the kerbal; standing on the ground; one flag per EVA; asks for **name and plaque text**; uses the flag of the part the kerbal left | Astronaut Complex level 2 | [S15][S1] |
| Remove or replant a flag | "Take Down" puts it in the kerbal's hands; extra flags are lost on boarding | | [S15] |
| Read a plaque | Only an EVA kerbal nearby can read it | | [S1][S15] |
| Deploy ground items | Work lamps, the ground anchor (1.12.2), BG deployed science, deployed **from the inventory** (down-arrow icon) | Anyone; level bonuses (3.3) | [S10][S19][S42] |
| Push or tow by jetpack | | | [S1] |

**Flags are vessels** [S15]:
- they appear in the Tracking Station and map;
- you can "control" one, which is how players look around a site;
- you can target one, which players use as runway markers;
- they collide and can be knocked over.

1.2 changed flag XP: one planting credits **every landed or splashed kerbal in physics range** [S15][S23].

### 3.2 KSP2 EVA actions **[KSP2]**

- **Science.** EVA gates real science. The **Surface Survey** experiment needs one kerbal on EVA, and Crew Observation needs crew aboard [S50][S51]. v0.2.1 fixed a kerbal becoming uncontrollable when a surface survey ran while planting a flag [S47] *(snippet)*.
- **Flags.** Flags, with a removal dialog, exist [S45].
- **Not documented** *(unverified)*: repair, repacking, inventories and construction. Repair had no purpose in KSP2, which had no part failures.

### 3.3 Breaking Ground deployed science **[BG]**

- **Parts.** Deployable experiments arrive as cargo. They need an **Experiment Control Station** (1 power unit, from a deployable solar panel or a Mini-NUK) [S36]:
  - its built-in 500k-class antenna sends data home through the network;
  - experiments then run for long periods without crew.
- **Deploying.** A kerbal on EVA takes each part from the inventory and deploys it on the ground. Parts merely dropped in construction mode do **not** work [S16][S42].
- **Who deploys matters** (players' reports) [S42] *(snippet; exact multipliers still unverified)*:
  - a higher-level **scientist** speeds up the experiment (players quote 3–4× at high levels);
  - a higher-level **engineer** gets more power from deployed panels.
- **Suits and portraits.** BG also added a "Future" suit and EVA portraits [S28].

---

## 4. Inventory and EVA Construction (KSP1 1.11 "Some Reassembly Required", Dec 2020)

### 4.1 Inventory model

- **History.** The inventory first appeared in 1.7.1 for Breaking Ground. In 1.11 it became general: stacks of parts in part inventories and in kerbals' inventories [S10][S20][S49].
- **Items.** Every cargo item has a **mass** and a **packed volume**, and every inventory has mass and volume limits. Items of the same type and variant stack in one slot up to a maximum stack size [S10][S20].
- **The kerbal's inventory** [S2]:
  - **2 slots, 65 kg and 40 L**;
  - comes with the **jetpack and parachute** by default, which must be removed to carry anything else;
  - items carried add to the kerbal's mass, or to the vessel's while aboard, and are drawn on the kerbal's back.
- **Gated items** [S2]:
  - A kerbal can carry ship parts such as a thermometer but **cannot use them** from the inventory.
  - Non-engineers cannot drop them on the ground, only pass them to another inventory.
  - A part container stores items within `EVA_INVENTORY_RANGE` (a game setting replacing a per-part value in 1.11) [S20].
- **Storage parts** [S10][S20]:
  - Cargo containers (SEQ-3, SEQ-9, SEQ-24, SEQ-3C conformal) have the largest inventories for their size.
  - Crew pods and cabins also hold a few slots.
  - Some large parts cannot go in containers but can still be moved in construction mode.
- **Persistence.** Saved as a list of proto-parts (1.11) [S20]. Our equivalent would be module state on the container part.

**Cargo items (stock, from the 1.12 wiki)** [S10][S11][S12][S17][S18][S19]

| Item | Mass | Volume | Stack | Role |
|---|---|---|---|---|
| EVA Jetpack | 45 kg full / 25 kg dry (one page says 40 / 20) | 17 L | 1 | Needed to use the jetpack; 5 u propellant |
| Personal Parachute | 4 kg | 10 L | 1 | Needed for the chute; gated by level |
| EVA Fuel Cylinders | 20 kg full / 8 kg dry | 15 L | – | More jetpack propellant (up to 8 u total) |
| EVA Experiments Kit | 15–20 kg | 5 L | 4 (1 with the jetpack worn) | EVA science |
| EVA Repair Kit | 5–10 kg | 5 L | 4 | Consumed by repairs |
| Work Lamp (small or stand) | 2–3 kg | 20–40 L | 2 / – | Deployable light |
| Stamp-O-Tron Ground Anchor (1.12.2) | 50 kg | **40 L** (the whole kerbal) | 1 | Deployed from the kerbal's menu, it bolts to any surface. It is an anchor that EVA construction can build onto, for example a docking port to park a ship. It must be deployed, not placed in construction mode. |

### 4.2 EVA Construction Mode

- **Who and how.** Only **engineers** (any level since 1.11) can build. Other kerbals get an inventory-only panel. Open it with the crane-hook button [S7][S16].
- **Editor.** The UI is the VAB's in miniature [S16][S20][S21][S22]:
  - place, offset and rotate gizmos, angle snap (Shift for fine steps);
  - **CoM, CoT and CoL overlays in flight**;
  - **no symmetry, single parts only**, no subassemblies;
  - the Reroot button is replaced by "exit".
- **What can be built** [S16][S20][S21][S22]:
  - move parts on and between **loaded** vessels;
  - place parts from inventories in range;
  - **build new small probes** from loose parts;
  - pick up debris parts (1.11.1);
  - edit command pods (1.12).
- **Range.** About **10 m** from the engineer [S16].
- **Mass limit.** It depends on **local gravity** [S16][S21][S41]:
  - On Kerbin a lone engineer can handle about **60 kg**.
  - Each nearby kerbal of any class adds **another 60 kg** (1.11.1); the panel shows the limit and the helper count.
  - The limit scales by gravity: players report about 1.7 t with two kerbals on Ike.
  - **In orbit the limit is effectively unlimited**, because weight is zero.
  - 1.12 added cheats to ignore the construction and inventory limits.
- **Constraints** [S16][S21]:
  - The jetpack is unusable while holding a part.
  - No building from a command seat; building from a **ladder** is recommended, as the kerbal stays still.
  - Placing parts can kick the vessel physically (several fixes in 1.11.1 and 1.12; "Always quicksave" is the community advice).
- **Career hooks** [S20][S33]. New contracts:
  - **vessel repair**;
  - **satellite upgrade**: rendezvous and attach a part with an engineer on EVA;
  - **rover construction**.

  Station and base contracts require the vessel to be launched complete, not assembled by EVA [S21].
- **Mods.** **KIS/KAS** came before this. KIS gave each kerbal about 1 t of carrying capacity, with screwdrivers and wrenches as tools; KAS added winches, struts and pipes [S41][Mod: KIS/KAS]. Stock 1.11 adopted its ideas in a narrower form.
- **KSP2.** Nothing equivalent shipped [**KSP2 — never shipped**; *(unverified)*]. The colonies roadmap would have used kerbals around bases, but no construction-by-hand design was published [S50].

---

## 5. Kerbals as people

### 5.1 Identity

| Aspect | KSP1 | KSP2 | Src |
|---|---|---|---|
| Names | Random first name plus the shared surname **Kerman**. The generator builds names from syllables; the exact tables are *(still unverified; the archived Kerbal page says names are syllable combinations or picked from a preset list [S54])*. Since 1.2 a debug screen creates kerbals with chosen name, gender, trait and level. | First name plus Kerman. Every 40th generated kerbal is a developer "dev kerbal" with a middle initial. | [S2][S23][S43] |
| Gender | Female kerbals since 1.0 (Valentina among the original four). The ratio is *(still unverified)*. | Present, plus the **Kerbal Variety System**: skin tones with a green undertone, hair, facial hair, glasses; "dozens" more items in v0.2.0 | [S3][S43][S44] |
| Personality | **Courage** and **Stupidity** (0–1), and a hidden **BadS** flag (about 10%). They only drive facial expressions and gestures; stupid kerbals stay calm and non-stupid ones show dread. Players report that courage and BadS slightly raise g-tolerance (unconfirmed in docs). | None documented | [S2][S5][S38] *(snippet)* |
| Veterans | The **original four** (Jeb, Bill, Bob, Val): orange suits, BadS, start hired | None | [S2] |
| Suits | Default (revamped in 1.5), **Vintage** [MH], **Future** [BG], **Slim** (1.12), chosen per kerbal. The orange veteran suit got a 10th-anniversary patch in 1.12. | One suit look, with variety on the kerbal | [S25][S29][S28][S22] |
| Mass | 45 kg bare, about 94 kg with jetpack and chute; adds to parts since 1.11 | *(unverified)* | [S3] |

### 5.2 Professions and levels [KSP1]

Kerbal experience is on by default in Career and off in Science and Sandbox. With it off, every kerbal acts at the top level [S4]. **Since 1.2 traits are implemented as "experience effects"**, which mods can recombine [S23].

| Level (XP) | Pilot | Engineer | Scientist | G-tolerance ×: P / E / S |
|---|---|---|---|---|
| 0 (0) | SAS stability hold; personal chute at level 0 | **EVA construction**; ISRU and drill ×25% | Restore experiments on EVA | 1.15 / 1.0 / 1.0 |
| 1 (2) | + prograde/retrograde | **Repack chutes, repair with kits** (1.11+); ISRU 45% | Lab 5× | 1.3 / 1.1 / 1.05 |
| 2 (8) | + normal, radial | (leg repair before 1.11); 65% | Lab 9× | 1.45 / 1.2 / 1.1 |
| 3 (16) | + target, anti-target, manoeuvre | (wheel repair before 1.11); 85% | 13× | 1.6 / 1.3 / 1.15 |
| 4 (32) | – | 105% | 17× | 1.85 / 1.4 / 1.2 |
| 5 (64) | – | 125% | 21× | 2.0 / 1.5 / 1.25 |

Sources: [S4][S6][S7][S8].

**Notes on the table:**
- **Pilots.** Pilots can also **plan manoeuvre nodes with no connection** to Kerbin [S6].
- **Engineers.** With no engineer aboard, ISRU runs at 5% [S7].
- **Scientists.** Since 1.0.5 scientists no longer boost science from recovery or transmission [S8].
- **Tourists:**
  - cannot control a vessel, write crew reports or EVA;
  - have a **g-tolerance of 0.75**;
  - appear only through tourism contracts [S9].
- **Bug history.** 1.11.1 shipped a bug letting any kerbal use any SAS mode, fixed in 1.12.2. 1.11.1 also allowed "kerbals keep class traits but probes have all SAS modes" in Science and Sandbox [S6][S21].

### 5.3 Experience [KSP1]

- **What earns XP.** Achievements per body: flyby 1, orbit 1.5, flight (atmosphere) 2, land 2.3, plant flag 2.5, each × the body's multiplier [S4]:
  - Kerbin is special: flight 1, orbit 2, landing 0;
  - the Mun ×2, Minmus ×2.5, Duna ×5, the Jool moons ×8, Eeloo ×10.
- **Only the best achievement per body counts**, once per kerbal ever. Orbiting the Mun (3) and planting a flag there (5) give 5, not 8 [S4].
- **XP is banked only on recovery** at KSC, or with the Mobile Processing Lab's **"Level Up Crew"** [S4][S23].
- The difficulty option "immediate level up" exists [S38] *(snippet)*.
- **The UI rounds displayed XP**, so a kerbal can look ready to level up when they are not [S4].
- Level thresholds: 2 / 8 / 16 / 32 / 64 total XP [S4].

### 5.4 Roster, hiring, loss [KSP1]

- **Astronaut Complex** [S5]:
  - **Applicants** on the left, with courage and stupidity meters;
  - **Available / Assigned / Lost** tabs on the right;
  - hire with a check mark, fire with a red ✕;
  - the hired list shows level, XP and skills.
- **Roster caps**: 5 / 12 / unlimited by building level. Rescued kerbals join even above the cap [S5].
- **Hire cost**: 150n² + 12,350n for the n-th hire. 1.12 changed the formula to be "not prohibitive", cheaper again if you have lost most of your kerbals [S5][S22].
- **Lost crew.**
  - By default, lost crew are **M.I.A.** and **respawn after a delay**. The "Missing Crews Respawn" difficulty option is on in Easy and Normal, off in Moderate and Hard [S5][S32].
  - With respawn off, they are **K.I.A.** and stay dead.
  - The respawn timer is reportedly in **real hours** (about 2 h by default) [S39] *(snippet)*.
- **Auto-hire.** The difficulty option "Auto-hire crewmembers before flight" fills empty seats from applicants [S32].
- **Recovery.** Recovery is the only way back to the roster, and it can happen anywhere on Kerbin (land or water). Recovered EVA kerbals count too [S34].

### 5.5 KSP2 kerbals [KSP2]

- **What shipped**:
  - crew assigned in the **Kerbal Manager** in the VAB;
  - portraits in flight;
  - EVA;
  - cosmetic variety.
- **What was absent**: professions, XP, personality stats, hiring costs and an Astronaut Complex [S50].
- **The Training Center is tutorials only.** It holds four lessons from basic rocketry to interplanetary transfers and can be opened mid-flight. It is not crew training [S46].
- **Death.** Kerbals "poof" when exposed to vacuum or a non-oxygenated atmosphere, the family-friendly term for dying [S43].
- **[KSP2 — never shipped]** Colonies would have housed crew. No public design for skills was found [S50].

---

## 6. Crew safety

| Hazard | Rule | Tag | Src |
|---|---|---|---|
| **G-force / G-LOC** | Since 1.2 a difficulty option, "Kerbal G limits", with a multiplier slider. Kerbals over their tolerance **pass out**: an unconscious crew cannot control the craft, and the portraits show it. Tolerance is the trait's level multiplier (table 5.2) × the difficulty multiplier; tourists have 0.75. Players see a base of about 5–6 g; at 0.5× kerbals black out near 2.5 g. Veterans and BadS kerbals are reported higher *(snippet)*. The integration formula (g over time with decay) is *(still unverified)*. The Engineer trait multipliers 1.0–1.5× by level are *(verified 2026-10-18: [S55])*; the option itself arrived in 1.2 *(verified 2026-10-18: [S56])*. Tourist contracts may **require** a g-LOC or forbid one. | KSP1 | [S23][S6][S9][S38][S33] |
| Part G and pressure limits | A separate option: parts can break from g and dynamic pressure (1.2) | KSP1 | [S23] |
| Crashes in pods | Crew **live or die with their part**. If the pod survives its impact tolerance, they survive; if the part is destroyed, they are lost (K.I.A. or M.I.A. by setting). Launch escape: the **LES tower** (solid, about 750 kN for 0.5 s, angled thrust), plus parachutes. | KSP1 | [S35] |
| EVA impacts | Fatal above some speed; a ragdoll below it; uncontrolled rolling downhill can kill | KSP1 | [S2] |
| Heat | EVA kerbals burn up on re-entry ("don't handle re-entry very well"). A helmetless kerbal near exhaust or at supersonic speed dies almost at once. | KSP1 | [S1][S2] |
| Low pressure | A helmetless kerbal dies if the air gets too thin (since 1.6) | KSP1 | [S26][S3] |
| Vacuum | Kerbals "poof" when exposed to vacuum or a non-oxygenated atmosphere | KSP2 | [S43] |
| Lava, radiation, starvation | **None in stock KSP1** (no lava biomes; no life support). Mods add life support and radiation (Kerbalism, TAC-LS, USI-LS). | KSP1 / Mod | [S2] |
| Being stranded | Costs nothing but a seat in stock; rescue becomes a self-imposed goal | KSP1 | — |
| Rescue contracts | Spawn a stranded kerbal in orbit (low Kerbin orbit or elsewhere) or on a surface, sometimes with part of a ship. Bringing them home adds them to the roster for free. Rescues are the cheap way to grow the roster late in a career. | KSP1 | [S33][S5] |
| Ejection | No stock ejection seat. The EAS-1 plus personal parachute is the improvised version. | KSP1 / Mod | [S13] |

---

## 7. Feedback and UI

- **Crew portraits** (bottom right) **[KSP1]**:
  - live 3D faces of each kerbal aboard, with name, trait and level;
  - tooltips since 1.2 [S23];
  - per-portrait **IVA/EVA** buttons;
  - expressions driven by situation: fear at high g, launch and explosions; delight in space; BadS kerbals almost always happy [S2];
  - portraits for EVA kerbals since BG [S28];
  - the facial expression system was overhauled in 0.19 and also shows on EVA [S1].

  The portrait is KSP1's main emotional channel: you watch Jeb grin as the rocket shakes.
- **Portraits [KSP2]**:
  - portraits shipped;
  - probe cores get a graphic in the portrait slot (v0.1.1) [S45];
  - fixes for missing portraits after docking, and for jetpacks showing in portraits (v0.2.0) [S44].
- **EVA HUD [KSP1]**:
  - the navball stays (camera-referenced);
  - the jetpack's EVA propellant shows as a gauge, with a "SAS" light for auto-orient [S23];
  - grab and board prompts appear as on-screen messages when in range [S1];
  - the right-click menu on the kerbal holds report, sample, flag, helmet and EVA science;
  - construction mode shows the mass limit and helper count [S21].

  The exact layout of the fuel gauge is *(unverified)*.
- **Staging.** Pressing Space while jetpacking can "stage" the EVA pack in some setups, a well-known player trap [snippet in search, Steam].
- **Roster status [KSP1]**: Available / Assigned (with vessel or "EVA") / Lost (K.I.A. or M.I.A. with respawn) [S5].
- **Tracking Station**: EVA kerbals and flags are listed as vessels and can be focused [S15].
- **[KSP2]** Tracking Station kerbal entries gained "control" and "focus" buttons (v0.2.0) [S44].

---

## 8. Implications for Space Orbital Program

### 8.1 Where we are (from ADR 0120, 0100, 0176, 0181, 0193 and the code)

| Area | Ours today | KSP1 equivalent |
|---|---|---|
| Suit as an actor | `stock.eva-suit` is a one-part **vessel** (85 kg, seat, command, life-support pack, EC 20, jetpack, reaction wheel, surface sampler, suit radio) | Kerbal EVA is a vessel too |
| Going out | `crew-eva { vessel, member }`: spawns 2 m beside the part, inherits velocity, wakes the vessel from rails | Hatch dialog or portrait; hatch-obstruction check; AC level gate |
| Boarding | `crew-board`: any free seat **within 50 m**, refused if over 2 m/s relative; carried samples go to the locker | Must hold the hatch (about 1–2 m); refills jetpack; data moves in |
| Walking | `crew-walk { heading, speed ≤ 1.5 }` sets the ground velocity (a controller); UI buttons N/E/S/W and stop | WASD camera-relative; run; jump; swim |
| Jetpack | Stock engine on 5 kg `stock.eva-propellant`, 50 N, Isp 60 → **Δv ≈ 31 m/s, acceleration ≈ 0.55 m/s²**; along the up axis only (no translation) | About 600 m/s; 6-DOF translation plus orient; lifts off where g < 3.2 m/s² |
| Flag | `plant-flag` → `stock.flag` vessel with `keep: true`; milestone `eva` and place `eva:<body>` (XP 1) | Name and plaque; take down; XP to all landed kerbals nearby |
| Repair | `repair { suit, vessel, part }` needs an engineer in the suit (part reliability, ADR 0156) | Engineer level 1 plus repair kits per 50 kg |
| Crew transfer | `crew-transfer` within one vessel | Same (0.25+) |
| People | Professions, traits as data, XP per place × body booked at recovery, salaries, death rule (permanent / return after N days / off), morale, fatigue, **g-load stress and G-LOC**, radiation dose, life support | Cosmetic courage and stupidity; G-LOC option; no life support |
| Comms | The suit radio relays through a crewed vessel (2 km, UHF), plus voice and broadcasts | None (CommNet ignores kerbals) |
| Missing | ladders, grab, jump, run, swim, ragdoll and impact death on EVA, helmets, personal parachute, suit lights, EVA report, take/store data from experiments, repack, command seats, hatch obstruction, inventory, construction, plaque text, portraits and expressions, suits, focus switch (the HUD keeps the launched vessel) | — |

### 8.2 Adopt

1. **EVA as a vessel (already done).** Keep it. It gives saves, targeting, map, comms and scripts a single model, as in KSP1, where flags and kerbals are vessels too.
2. **Flags with a name and plaque text**, readable only by a suit nearby, and **take down / replant**. These are cheap and are the main storytelling device. Add the "credit all landed crew in range" rule, so nobody has to throw flag-planting parties.
3. **Hatch-obstruction check** at `crew-eva`: test a short probe in front of the part's hatch, and refuse with a reason ("hatch blocked by X"). Treat parts inside a closed bay or fairing as blocked, as KSP1 does. This needs a `hatch` attach point on crewed parts (our `attach` map can carry it).
4. **Boarding from close range.** Shrink the 50 m range to about 3 m from a hatch, or to a ladder grab, and **refill the suit from the vessel**. Unlike KSP1, actually take the propellant from the vessel's tanks; KSP1 meant to do this but a bug left it free. Keep the generous range only as a world-rule "assist".
5. **Ladders and grab.** A `ladder` part capability (a line segment). A suit within 1 m can latch on, follows the vessel rigidly, climbs, and lets go. Every crewed part gets a short ladder at its hatch. This also gives construction a stable stance (see 8.5).
6. **Personal parachute** as an inventory item with a deploy action and simple glide steering. It is the stock answer to "kerbal falling in atmosphere", and it makes command-seat ejection possible.
7. **EVA report and take/store data.** These close the science loop. Taking data from a part into the suit and storing it on boarding already half exists through the sample locker.
8. **Engineer repair with consumable repair kits** (1 kit per 50 kg, at most 4) and **repack parachute**. Our reliability system already raises the failures; the kits make it a logistics question.
9. **Professions and levels as quality factors.** We already rejected KSP1's SAS gates (ADR 0098/0100). Keep that rejection, but borrow KSP1's **per-level g-tolerance table** shape (pilot to 2.0×, others to 1.5×/1.25×, tourists 0.75×) for our `gTolerance` ability.
10. **Missing crews respawn as a world rule (already done)**, with K.I.A./M.I.A. tabs. We count respawn in **game days**, not real hours, which is better than KSP1.
11. **Rescue contracts** spawning a suit or a stranded pod. Our contract system and "suit is a vessel" make this nearly free.

### 8.3 Improve

1. **Jetpack balance.** Ours gives about 31 m/s and 0.55 m/s², which cannot lift off any Mun-like body and is a quarter of what you need to get around a station comfortably.
   - Suggested target: about 100–200 m/s and 1.5–3 m/s² (for example 150–250 N, Isp 100–150 s, 5–8 kg). That lets a suit hop on small moons but not on home.
   - Keep it **physical** (rocket equation) instead of KSP1's 600 m/s, and **document the g threshold** in the part tooltip ("can lift off below X m/s²").
   - Add **6-DOF translation** (the RCS input that STATUS lists as missing) and an "orient to camera / prograde" assist like KSP1's T toggle.
2. **Walking input.** Replace the N/E/S/W buttons with **WASD relative to the camera**, Shift to run, Space to jump. Swimming follows when water exists. Run speed is about 1.6× walk (KSP1: 0.87 → 2.35 m/s).
3. **Falling and ragdoll as a state, not physics chaos.** When ground contact comes with horizontal speed above a threshold, or an impact above a threshold, set `stunnedUntil`; fatal above the suit's impact tolerance (8 m/s). Show it ("Bill tumbled, 2 s"). Avoid KSP1's endless downhill roll: the stun should end once speed is low.
4. **Helmets tied to our life support.** A helmet-off action is allowed only where the atmosphere is breathable (a body flag). It stops drawing suit oxygen. Lethal limits (low pressure, heat, impact) are explicit, shown in the tooltip and deterministic. This joins KSP1's flavour to our ADR 0181 consumables.
5. **Inventory as module state with mass and volume.** Generalise ADR 0120's "suit holds samples" into a `ModuleInventory { slots, maxMass, maxVolume }` on suits, pods and cargo parts. Cargo items get `{ mass, volume, stack }`. Default suit: 2 slots, 65 kg, 40 L, holding the jetpack and chute, as in KSP1. Resources inside items (propellant) refill when stored in a vessel **only from the vessel's tanks**.
6. **Construction later, but planned for.** When it arrives:
   - engineer-only;
   - about 10 m range;
   - mass limit = `base × g0/g_local × (1 + helpers)`, effectively unlimited in free fall but with a **momentum/torque limit** so orbital construction is not free;
   - single parts only;
   - a CoM/CoT overlay;
   - ADR 0018's compound bodies re-formed on attach.

   Scripts (our kOS-like API) can drive it too, which no KSP did.
7. **Portraits with sim-driven expressions.** A 2D portrait per crew member in the crew panel, with a few expression frames driven by our deterministic state (g-stress, G-LOC, shortage, morale, fatigue, re-entry blackout), plus a status chip (IVA / EVA / unconscious / out of oxygen). This is where our real simulation pays back emotionally. KSP1's expressions were flavour only; ours would **tell the truth**.
8. **Courage and stupidity, or our traits, made visible.** Show the factors they change (g-tolerance, panic) in the tooltip. KSP1's meters did nothing, and players noticed.
9. **Focus switching.** Pressing `[`/`]` to switch to a suit or flag, and the HUD showing the suit's propellant, oxygen, radio and inventory. This is the STATUS follow-up: a vessel switcher.
10. **Hatch dialog or crew panel.** Put EVA, Transfer and IVA (later) on each crew row (we have the crew panel), plus a hatch hover on the part. KSP1 split this between the hatch click and the portrait hover, which new players did not find.
11. **Gate EVA by career building level as data**, not hard-coded (KSP1: Kerbin-only at Astronaut Complex level 1). Make it a building capability in mod data.

### 8.4 Avoid

1. **Free jetpack refills** (a KSP1 bug that became a feature) and **free respawn by real-time timers**.
2. **Camera-referenced navball on EVA** that silently differs from the map view's kerbal reference. Show both, or label which is which.
3. **"Space" meaning jump, release, orient and stage** on different occasions. Our key table (ADR 0061) should give EVA its own context with distinct verbs.
4. **Obstruction rules nobody can see.** KSP1's "hatch obstructed" gave no reason. Ours should name the blocking part.
5. **Hidden XP rounding and invisible pending XP** [S4]. We already show places; also show pending XP live.
6. **Personality stats with no effect** (KSP1) and **interchangeable crew** (KSP2).
7. **Physics kicks on placement** in construction: attach through the compound-body rebuild at zero relative velocity, never by teleporting colliders.
8. **Jump exploits** (KSP1 needed two patches): scale jump impulse by the suit's total mass and cap the speed.

### 8.5 Checklist: EVA and crew at public launch vs later

**Must have at launch** (a public KSP-like will be judged on these):

| # | Feature | Status | Note |
|---|---|---|---|
| 1 | Step out and board from the crew panel | ✅ have | Tighten boarding range (8.2-4) |
| 2 | Hatch obstruction with a reason | ❌ | 8.2-3 |
| 3 | Walk with WASD, run, jump | ⚠️ partial | Only heading buttons today |
| 4 | Jetpack with translation and an orient assist, physical Δv shown | ⚠️ partial | Up-axis only, 31 m/s |
| 5 | Ladders (hatch rungs and a ladder part), grab, climb, let go | ❌ | Needed to board landers |
| 6 | Fall / stun / impact death on EVA | ❌ | Suit impact tolerance exists, but no stun state |
| 7 | Flag with name and plaque, read nearby, take down | ⚠️ partial | Planting done |
| 8 | Surface sample, **EVA report**, take/store experiment data | ⚠️ partial | Sample done |
| 9 | Engineer repair (have) with kits; repack chutes | ⚠️ partial | |
| 10 | Personal parachute | ❌ | |
| 11 | Suit lights | ❌ | Cheap |
| 12 | Focus switch to the suit and an EVA HUD (propellant, O₂, radio) | ❌ | STATUS follow-up |
| 13 | Crew portraits with state-driven expressions | ❌ | High emotional value |
| 14 | Crew transfer in a vessel and across docked vessels | ✅ have (one vessel) | Check that docking merges vessels for transfer |
| 15 | Professions, XP, roster tabs, K.I.A./M.I.A. rule, rescue contracts | ✅ mostly | Rescue contract to check |
| 16 | G-LOC and g-tolerance by trait and level | ✅ have | Show it on the portrait |
| 17 | Tourists who cannot EVA, with g-tolerance 0.75 | ⚠️ check | |
| 18 | External command seat (with crew assignable in the Hangar) | ❌ | Rovers need it |

**Later (post-launch waves):**
- Inventory with cargo items (mass, volume, stacks); EVA science kit; work lamps.
- EVA construction (engineer, gravity × helpers limit, single parts, overlays) and construction / satellite-upgrade contracts.
- Deployed surface science with a control station, where who deploys it matters.
- Helmets off in breathable air, with lethal limits.
- Swimming.
- Suits and cosmetics (a variety system à la KSP2, never a KSP likeness).
- IVA, or a simple cockpit view.
- Ground anchor.
- Script API for EVA (walk to a point, take a sample, plant a flag), which no KSP offered.

---

## Sources

KSP1 wiki pages were read through Internet Archive snapshots from 2023 (`web.archive.org/web/2023id_/…`), because the live wiki blocks automated access. All checked 2026-10-18.

| # | Source | Reliability |
|---|---|---|
| S1 | KSP Wiki, "Extra-Vehicular Activity", https://wiki.kerbalspaceprogram.com/wiki/EVA | Community wiki, fairly good; some numbers (270 N) dated |
| S2 | KSP Wiki, "Kerbonaut", https://wiki.kerbalspaceprogram.com/wiki/Kerbonaut | Community wiki, good |
| S3 | KSP Wiki, "Kerbal", https://wiki.kerbalspaceprogram.com/wiki/Kerbal | Community wiki; lore mixed with mechanics |
| S4 | KSP Wiki, "Experience", https://wiki.kerbalspaceprogram.com/wiki/Experience | Community wiki, good (full XP table) |
| S5 | KSP Wiki, "Astronaut Complex", https://wiki.kerbalspaceprogram.com/wiki/Astronaut_Complex | Community wiki, good |
| S6 | KSP Wiki, "Pilot", https://wiki.kerbalspaceprogram.com/wiki/Pilot | Community wiki, good |
| S7 | KSP Wiki, "Engineer", https://wiki.kerbalspaceprogram.com/wiki/Engineer | Community wiki, good |
| S8 | KSP Wiki, "Scientist", https://wiki.kerbalspaceprogram.com/wiki/Scientist | Community wiki, good |
| S9 | KSP Wiki, "Tourist", https://wiki.kerbalspaceprogram.com/wiki/Tourist | Community wiki |
| S10 | KSP Wiki, "Cargo item", https://wiki.kerbalspaceprogram.com/wiki/Cargo_item | Community wiki |
| S11 | KSP Wiki, "EVA Jetpack", https://wiki.kerbalspaceprogram.com/wiki/EVA_Jetpack | Community wiki (stub) |
| S12 | KSP Wiki, "EVA Parachute", https://wiki.kerbalspaceprogram.com/wiki/EVA_Parachute | Community wiki |
| S13 | KSP Wiki, "EAS-1 External Command Seat", https://wiki.kerbalspaceprogram.com/wiki/EAS-1_External_Command_Seat | Community wiki |
| S14 | KSP Wiki, "Ladder", https://wiki.kerbalspaceprogram.com/wiki/Ladder | Community wiki |
| S15 | KSP Wiki, "Extend-o-matic Series A1 Deployable Flag", https://wiki.kerbalspaceprogram.com/wiki/Extend-o-matic_Series_A1_Deployable_Flag | Community wiki, good |
| S16 | KSP Wiki, "EVA Construction Mode", https://wiki.kerbalspaceprogram.com/wiki/EVA_Construction_Mode | Community wiki; 60 kg figure from players |
| S17 | KSP Wiki, "EVA Experiments Kit", https://wiki.kerbalspaceprogram.com/wiki/EVA_Experiments_Kit | Community wiki |
| S18 | KSP Wiki, "EVA Repair Kit", https://wiki.kerbalspaceprogram.com/wiki/EVA_Repair_Kit | Community wiki |
| S19 | KSP Wiki, "Stamp-O-Tron Ground Anchor", https://wiki.kerbalspaceprogram.com/wiki/Stamp-O-Tron_Ground_Anchor | Community wiki |
| S20 | KSP Wiki, "1.11" (official changelog transcribed), https://wiki.kerbalspaceprogram.com/wiki/1.11 | High: copy of Squad's changelog |
| S21 | KSP Wiki, "1.11.1" changelog, https://wiki.kerbalspaceprogram.com/wiki/1.11.1 | High |
| S22 | KSP Wiki, "1.12" changelog, https://wiki.kerbalspaceprogram.com/wiki/1.12 | High |
| S23 | KSP Wiki, "1.2" changelog, https://wiki.kerbalspaceprogram.com/wiki/1.2 | High |
| S24 | KSP Wiki, "1.4" changelog, https://wiki.kerbalspaceprogram.com/wiki/1.4 | High |
| S25 | KSP Wiki, "1.5" changelog, https://wiki.kerbalspaceprogram.com/wiki/1.5 | High |
| S26 | KSP Wiki, "1.6" changelog, https://wiki.kerbalspaceprogram.com/wiki/1.6 | High |
| S27 | KSP Wiki, "0.25" changelog, https://wiki.kerbalspaceprogram.com/wiki/0.25 | High |
| S28 | KSP Wiki, "Breaking Ground", https://wiki.kerbalspaceprogram.com/wiki/Breaking_Ground | Community wiki plus official text |
| S29 | KSP Wiki, "Making History", https://wiki.kerbalspaceprogram.com/wiki/Making_History | Community wiki plus official text |
| S30 | KSP Wiki, "Key bindings", https://wiki.kerbalspaceprogram.com/wiki/Keys | Community wiki; **old** (lists L for lights, F to board) |
| S31 | KSP Wiki, "IVA", https://wiki.kerbalspaceprogram.com/wiki/IVA | Community wiki, dated |
| S32 | KSP Wiki, "Game Difficulty", https://wiki.kerbalspaceprogram.com/wiki/Game_Difficulty | Community wiki (presets table) |
| S32b | KSP Wiki, "Settings", https://wiki.kerbalspaceprogram.com/wiki/Settings | Community wiki (1.4-era stub) |
| S33 | KSP Wiki, "Contracts", https://wiki.kerbalspaceprogram.com/wiki/Contracts | Community wiki |
| S34 | KSP Wiki, "Recovery", https://wiki.kerbalspaceprogram.com/wiki/Recovery | Community wiki |
| S35 | KSP Wiki, "Launch Escape System", https://wiki.kerbalspaceprogram.com/wiki/Launch_Escape_System | Community wiki |
| S36 | KSP Wiki, "Probodobodyne Experiment Control Station", https://wiki.kerbalspaceprogram.com/wiki/Probodobodyne_Experiment_Control_Station | Community wiki (stub) |
| S37 | KSP Wiki, "Mk1 Command Pod", https://wiki.kerbalspaceprogram.com/wiki/Mk1_Command_Pod | Community wiki |
| S38 | KSP Forum, "New career: kerbal G-force tolerance multiplier", https://forum.kerbalspaceprogram.com/topic/154152-new-career-kerbal-g-force-tolerance-multiplier ; Steam discussion https://steamcommunity.com/app/220200/discussions/0/2949168687324763024 | Player posts (*snippet*) |
| S39 | KSP Forum, respawn threads, https://forum.kerbalspaceprogram.com/topic/142953-respawning-dead-kerbals-in-career-mode and https://forum.kerbalspaceprogram.com/topic/154433-killed-kerbal-not-respawning | Player posts (*snippet*) |
| S40 | KSP bug tracker #26917, https://bugs.kerbalspaceprogram.com/issues/26917 ; forum https://forum.kerbalspaceprogram.com/topic/198784-why-is-this-hatch-blocked-unless-transfer-option-is-used | Bug report and player posts (*snippet*) |
| S41 | KSP Forum, https://forum.kerbalspaceprogram.com/topic/206857-questions-about-eva-construction ; bug #27237, https://bugs.kerbalspaceprogram.com/issues/27237 ; https://forum.kerbalspaceprogram.com/topic/200050-eva-construction-mode-limits-uses-using-while-continuing-old-saves | Player posts (*snippet*) |
| S42 | KSP Forum, https://forum.kerbalspaceprogram.com/topic/186130-deployed-science-a-few-basics ; https://forum.kerbalspaceprogram.com/topic/203628-how-do-you-deploy-breaking-grounds-surface-experiments | Player posts (*snippet*) |
| S43 | Kerbal Wiki (KSP2), "Kerbals", https://kerbal.wiki/Kerbals | KSP2 community wiki, fetched |
| S44 | Kerbal Wiki (KSP2), "0.2.0.0", https://kerbal.wiki/0.2.0.0 | Release-note transcription, fetched |
| S45 | Kerbal Wiki (KSP2), "0.1.1.0", https://kerbal.wiki/0.1.1.0 | Release-note transcription, fetched |
| S46 | KSP Forum, "Kerbal Space Program 2 – Pre-Release Notes", https://forum.kerbalspaceprogram.com/topic/212081-kerbal-space-program-2-pre-release-notes | Official (via archive) |
| S47 | KSP2 v0.2.1.0 release notes, https://www.kerbalspaceprogram.com/news/ksp-marketing-ksp2-v0-2-1-0-patch-notes | Official (*snippet*) |
| S48 | Steam, KSP2 discussion on moving crew, https://steamcommunity.com/app/954850/discussions/0/3824158244537273354 | Player post (*snippet*) |
| S49 | PCGamesN, "Kerbal Space Program's latest update lets Kerbals do on-site space welding", https://www.pcgamesn.com/kerbal-space-program/eva-construction-update ; GamingOnLinux, https://www.gamingonlinux.com/2020/12/kerbal-space-program-111-is-out-with-an-eva-construction-mode/ | Press |
| S50 | Internal: `refs/reverse-engineering-ksp2/08-crew.md` and its sources | Our prior research |
| S51 | Kerbal Wiki (KSP2), "Science", https://kerbal.wiki/Science | KSP2 community wiki |
| S52 | KSP Wiki, "Extra-Vehicular Activity" (Internet Archive snapshot), https://web.archive.org/web/20240420190746/https://wiki.kerbalspaceprogram.com/wiki/EVA ; key table https://web.archive.org/web/20240105022508/https://wiki.kerbalspaceprogram.com/wiki/Key_Bindings | Community wiki, full text |
| S53 | KSP Wiki, "Ladder" (archive), https://web.archive.org/web/20240106212014/https://wiki.kerbalspaceprogram.com/wiki/Ladder | Community wiki (older text) |
| S54 | KSP Wiki, "Kerbal" and "Kerbonaut" (archive), https://web.archive.org/web/20240105030405/https://wiki.kerbalspaceprogram.com/wiki/Kerbal ; https://web.archive.org/web/20240105030702/https://wiki.kerbalspaceprogram.com/wiki/Kerbonaut | Community wiki |
| S55 | KSP Wiki, "Engineer" (archive), https://web.archive.org/web/20231230000145/https://wiki.kerbalspaceprogram.com/wiki/Engineer | Community wiki |
| S56 | KSP Wiki, "1.2", "1.6", "1.11" changelogs and "EVA Construction Mode" (archive), https://web.archive.org/web/20240225060311/https://wiki.kerbalspaceprogram.com/wiki/1.2 ; https://web.archive.org/web/20240121092216/https://wiki.kerbalspaceprogram.com/wiki/1.6 ; https://web.archive.org/web/20240609065532/https://wiki.kerbalspaceprogram.com/wiki/1.11 ; https://web.archive.org/web/20240106115233/https://wiki.kerbalspaceprogram.com/wiki/EVA_Construction_Mode | Official changelogs |

Internal code and decisions compared: `docs/decisions/0120-eva-the-suit-is-a-vessel-commands-walking-jetpack-flag.md`, `0100-…`, `0176-…`, `0181-…`, `0193-…`, `0152-…`; `mods/stock/src/eva.ts`; `packages/sim/src/eva.ts`; `packages/sim/src/reliability.ts` (`repair`); `docs/journal/109-eva-crew-outside-the-vessel.md`.

---

## Needs verification

Check each of these before it goes into an ADR. Ideally test in-game.

1. **The stock G-LOC formula and base threshold**: the physics config keys, the base g, and the time integration. The 5–6 g base is from players. See https://forum.kerbalspaceprogram.com/topic/154152-new-career-kerbal-g-force-tolerance-multiplier.
   - Still unverified: no archived page gives the formula or base g; the Engineer page [S55] confirms per-level multipliers and 1.2 [S56] the option.
2. **The EVA construction mass limit per kerbal** (the 60 kg on Kerbin, gravity scaling, helpers): https://wiki.kerbalspaceprogram.com/wiki/EVA_Construction_Mode and https://bugs.kerbalspaceprogram.com/issues/27237.
   - Verified 2026-10-18: 60 kg per kerbal on Kerbin, scaled by gravity, +60 kg per nearby kerbal since 1.11.1 [S56].
3. **Jetpack thrust (270 N) and the 3.2 m/s² lift-off threshold after 1.11**: https://wiki.kerbalspaceprogram.com/wiki/EVA.
   - Verified 2026-10-18 against the archived EVA page [S52] (270 N, 3.2 m/s², 5/8 units, 600 m/s); still wiki text rather than config values.
4. **The exact hatch-obstruction test** (probe distance and shape): https://bugs.kerbalspaceprogram.com/issues/26917.
   - Still unverified: bug tracker not fetched; no archived wiki text on the probe.
5. **The M.I.A. respawn timer** (real time vs game time, default length): https://forum.kerbalspaceprogram.com/topic/142953-respawning-dead-kerbals-in-career-mode.
   - Still unverified: forum blocked; no archived wiki statement found.
6. **Who deploys BG science**: scientist and engineer multipliers. https://forum.kerbalspaceprogram.com/topic/186130-deployed-science-a-few-basics.
   - Still unverified: forum blocked.
7. **EVA from the portrait** (button wording) and the default board key (B vs F): https://wiki.kerbalspaceprogram.com/wiki/EVA, https://wiki.kerbalspaceprogram.com/wiki/Ladder.
   - Board key verified B (since 1.0) [S52]; portrait button wording still unverified.
8. **Whether stock crew transfer needs a connected crewed path** (vs the CLS mod): https://wiki.kerbalspaceprogram.com/wiki/0.25.
   - Still unverified: the archived EVA page [S52] says only "same ship".
9. **The parachute's arrival version** (1.4 changelog vs "1.5" on the Kerbonaut page): https://wiki.kerbalspaceprogram.com/wiki/1.4.
   - Still unverified: sources conflict. Key table says P since 1.4.0 [S52]; Kerbonaut page says 1.5 [S54].
10. **Name generator tables and gender ratio**: https://forum.kerbalspaceprogram.com/topic/155492-030-kspnamegen-random-name-generator-for-ksp.
   - Still unverified: forum blocked.
11. **KSP2 EVA key bindings**, personal parachute, helmet behaviour and crew transfer UI: https://kerbal.wiki/0.2.0.0, https://steamcommunity.com/app/954850/discussions/0/3824158244537273354.
   - Still unverified: no KSP2 source fetched this pass.
12. **EVA kerbal maximum temperature and impact tolerance in KSP1** (our suit uses 800 K and 8 m/s): https://wiki.kerbalspaceprogram.com/wiki/Kerbonaut.
   - Still unverified: the archived Kerbonaut page [S54] gives no numbers.
