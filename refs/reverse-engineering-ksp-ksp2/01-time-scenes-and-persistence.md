# 01 — Time, scenes and persistence in KSP1 and KSP2

> Design research only, from public sources (wikis, patch notes, forums, bug trackers, mod pages). No game files were opened. Checked 2026-10-18. Tags: **[KSP1]**, **[KSP2]**, **[KSP2 — announced, never shipped]**, **[Mod: name]**. Numbers or behaviours that no source confirmed are marked *(unverified)*; those usually come from long-standing player knowledge and should be checked before a plan depends on them.
>
> **Builds on, without repeating:** `refs/reverse-engineering-ksp2/01-game-structure-and-modes.md` (save files, quicksave F5/F9, mid-game settings), `04-flight-and-controls.md` §1.4 (warp rates, KSP2 warp under thrust), `beyond/09-time-and-real-solar-system.md` (epoch, calendar, "catch up to now"). Our current decisions: ADR 0118 (each route starts its own sim Worker from the newest save; there is no shared sim), ADR 0096 (world tick, background work as closed forms), ADR 0103 (real clock only as a "catch up" offer).

## 0. Summary

1. **Neither game has a world that runs on every screen.** Both have one number, Universal Time (UT), saved in the save file. Each *scene* decides whether UT moves. In KSP1, UT moves in Flight (including Map view), in the Space Center overview and in the Tracking Station, and you can time-warp in all three. It does not move in the VAB/SPH editors *(still unverified, community consensus)*. KSP1 only started advancing time at the Space Center in 0.21 (2013) [S1] *(verified 2026-10-18: [S37])*.
2. **Scenes are separate Unity scenes with loading screens.** Leaving Flight tears the flight down. Every vessel goes "on rails" (a Kepler orbit or a fixed surface spot) and is written to the save. The feeling of one world comes from cheap tricks: the same UT clock in every scene, warp in the Space Center and Tracking Station, alarms that work everywhere, and closed-form "catch up" for background production [S16].
3. **Background vessels are not simulated, only propagated.** Outside a bubble of about 2.25–2.5 km, vessels are on rails. In an atmosphere that is lethal: an unloaded vessel below a cutoff (about 22 km on Kerbin by player reports) is deleted [S5][S6][S7]. Stock KSP1 has no continuous background economy; ISRU "catches up" when you return [S16][S17]. Mods (Kerbalism) simulate all vessels continuously [S18].
4. **Closing the game stops time.** UT is game time only. The only way to tie it to the wall clock is a mod (Realtime) that holds warp at 1× and warps forward to catch up [S19].
5. **KSP2 kept the KSP1 model** (UT in a save, warp in KSC and Tracking Station, pause in the warp bar) and added warp under thrust. Its scene-change bugs (warp caps stuck at 1000× in KSC and the Tracking Station, orbits changing on SOI overshoot, slow orbit decay of coasting vessels) show how fragile a "per-scene" time model is [S20][S21][S22][S25]. Colonies and background delivery routes were announced and never shipped [S30][S31].

## 1. Scene model and the clock, per scene

### 1.1 KSP1

KSP1 is built from Unity scenes. The ones that matter for time are the **Space Center** (the KSC overview), the **editors** (VAB and SPH), the **Tracking Station** and **Flight**. Map view is not a scene: it is an overlay inside Flight, so switching to it is instant and changes nothing about time. The other buildings (Astronaut Complex, R&D, Administration, Mission Control) are **dialogs opened on top of the Space Center scene**; there is no separate load *(still unverified as an implementation detail; this is what players see: no loading screen)*.

| Scene [KSP1] | UT advances at 1× | Time warp | Pause | Physics active |
|---|---|---|---|---|
| Space Center overview | Yes, since 0.21 [S1]; day and night match flight [S1] | Yes, on-rails rates only. No physics warp, no slow motion [S2] | ESC opens a menu; whether it stops UT *(still unverified)* | No. Every vessel is on rails |
| Astronaut Complex, R&D, Admin, Mission Control | Same clock as the Space Center, since they are dialogs on it *(still unverified whether UT keeps ticking while a dialog is open)* | Through the Space Center controls *(still unverified while a dialog is open)* | As Space Center | No |
| VAB / SPH editors | No *(still unverified; community consensus is that building costs no game time, which is why the Kerbal Construction Time mod exists [S36])* | No | Not needed | No (a craft is edited, not simulated) |
| Tracking Station | Yes | Yes, on-rails rates only [S2] | ESC menu *(still unverified)* | No. All vessels on rails |
| Flight (and Map overlay) | Yes | Physics warp ×2–×4 and on-rails warp up to ×100,000, with altitude limits [S3][S4] | ESC pauses the game and opens the menu [S35] | Yes, for vessels in the physics bubble |

Key points:

- **The clock is one number for the whole save.** Every scene reads the same UT; there is no per-scene time [S9 describes UT as seconds since the campaign began][S15].
- **The Space Center and the Tracking Station are "rails-only" scenes.** Nothing is physically simulated there, so the game can warp at the top rate freely. The Time Control mod confirms that only the normal on-rails rates exist in those two scenes, not its hyper warp or slow motion [S2].
- **Old KSP1 (before 0.21) froze time at the Space Center.** The 0.21 notes record "time now passes in the Space Center scene" with day and night consistent with flight [S1]. This is the closest precedent for the owner's request: Squad made the hub scene part of the running world.
- **The editor is a time-free zone.** Players treat VAB/SPH as outside the world clock; mods that add build time (Kerbal Construction Time) do it by tracking build progress against UT that passes *elsewhere* [S36].

### 1.2 KSP2

KSP2 keeps the same structure with new buildings: **KSC** (a 3D campus with day and night lighting [S23]), **VAB** (which replaced both editors), **Tracking Station**, **Training Center** (tutorials), **R&D** (opened in For Science!, 0.2.0, December 2023, to redeem science and unlock tech [S34]), **Mission Control** (missions list in For Science!), and **Flight** with its Map view. Colonies were never shipped [S31].

| Scene [KSP2] | UT advances | Time warp | Pause | Notes |
|---|---|---|---|---|
| KSC | Yes; building lights follow the time of day [S23], time-of-day sounds were fixed in 0.1.4 [S25] | Yes. A bug at launch capped it at ×1000 when a craft was in orbit [S20][S21] | Pause in the time warp bar *(still unverified key)* | |
| VAB | *(still unverified)*; players report no game time passes while building | No *(still unverified)* | — | Workspaces save sub-assemblies [S28] |
| Tracking Station | Yes | Yes; the warp bar once vanished here (fixed 0.1.2) [S23]; warp failed to unlock fully when coming from Flight (0.1.5 report) [S22] | Yes | "Return to KSC" button added 0.1.2 [S23] |
| Training Center | Opening it from the ESC menu **pauses the current flight** and resumes it after the tutorial [S28] | — | — | |
| R&D, Mission Control | *(still unverified)* | *(still unverified)* | — | |
| Flight + Map | Yes | Physics warp only in atmosphere; on-rails warp **keeps thrust** ("warp under thrust") [prior 04 §1.4] | Yes; pause is part of the warp bar. 0.2.2 added notices when an action is blocked by warp or pause [S26] | Maneuver nodes could not be created while paused [S29] |

The KSP2 ×1000 cap in KSC and the Tracking Station is instructive. Warp limits are computed from vessels, and when the active vessel's limits leaked into scenes where nothing is simulated, players could not warp. The workarounds were to delete the vessel, or to go Flight → KSC → Tracking Station, or to launch any new craft [S20][S21]. A version 0.1.5 report shows the same family of bug a year later [S22]. **The rule "which scene may warp how fast" is state that must be recomputed on every scene change, and both games got it wrong at times.**

## 2. Universal Time and saves

### 2.1 Where UT lives [KSP1]

- The save is a text `.sfs` tree. The main file is `persistent.sfs`; quicksave writes `quicksave.sfs` [prior 01]. UT is stored as a line `UT = …` (seconds as a floating-point number) inside the flight-state block [S15][S36 — a forum user identifies the line]. The kOS docs describe UT as the total seconds since the campaign began [S9].
- **Every vessel is stored with its orbit elements and an epoch**, so loading the save places it where it should be at the saved UT. Nothing is integrated across the gap; a vessel on rails is a pure function of time.
- **Autosave points.** KSP1 writes `persistent.sfs` at many points: on a timer (`AUTOSAVE_INTERVAL = 300` seconds in `settings.cfg`, with a shorter interval key too) [S14], on scene changes, and immediately on entering Flight [S12]. A bug report notes that because of the save on entering Flight, a quickload can overwrite the autosave [S12]. If the game is killed, it reverts to the last write of the persistent file [S14].

### 2.2 Loading rewinds time [KSP1]

Loading any save (or quickloading with F9) sets UT back to the saved value. Everything since is lost: vessels, science, funds, and time. There is no merge [prior 01].

### 2.3 Revert [KSP1]

- **Revert to Launch** and **Revert to VAB/SPH** restore the state saved at the moment of launch, including UT. So a revert rewinds the world clock, not just the vessel.
- They are only offered while you have been **flying the same craft without interruption** since launch. Switching vessels, going to the Space Center, or loading a save removes the option [S13].
- This is the main place where KSP1 deliberately breaks "one continuous world": the player trades continuity for forgiveness. Difficulty settings can disable revert and quickload [prior 01].

### 2.4 KSP2 save model

- Saves are grouped by **campaign**, with F5/F9 quicksave and quickload and a load menu per campaign [prior 01]. Files grew to hundreds of MB in Early Access; 0.1.3 fixed a "TravelLog" manager that caused runaway save growth [S24].
- Autosaves had cooldown timers that did not trigger (fixed 0.1.3) [S24]; 0.2.2 added more autosave points during flight [S26].
- Revert to Launch and Revert to VAB exist; several bugs show revert loading the wrong vehicle from another save (0.1.3) or losing a vehicle (0.1.2) [S23][S24].
- Time survives scene changes the same way as in KSP1: UT is part of the game state, the KSC and Tracking Station keep advancing it, and vessels are on rails outside Flight.

## 3. Pause

| | KSP1 | KSP2 |
|---|---|---|
| Flight | ESC opens the pause menu and stops the game [S35]. No pause without the menu in stock *(still unverified)* | Pause control in the time warp bar; ESC menu also pauses. Countdown not pausing with the game was fixed in 0.1.3 [S24] |
| Map view | Same as flight (it is an overlay) | Same. Maneuver nodes could not be created while paused, a much-requested change [S29] |
| Space Center / Tracking Station | ESC menu; whether UT stops *(still unverified)*. Warp can be set back to 1× | Warp bar with pause *(still unverified that pause is available in KSC)* |
| Editors | Time does not run, so pause is moot *(still unverified)* | Same *(still unverified)* |
| Other | Kerbal Alarm Clock can "pause" or "kill warp" on alarm; in 0.23.5 it failed to stop warp started from the Space Center [S11] | Training Center from the ESC menu pauses flight [S28] |

**Physics pause vs UI pause.** In both games pausing stops UT and physics; the UI stays live (camera, menus, map). KSP2 forbade many actions while paused (and later explained why with notices [S26]); players asked for maneuver planning to work while paused [S29]. The lesson: pause should freeze time, not the player.

## 4. Time warp

Detail on rates is in prior `04` §1.4. New points:

- **Two kinds of warp [KSP1].** Physics warp ×2, ×3, ×4 keeps simulating with a larger step [S4]. On-rails warp ×5 to ×100,000 stops all physics except gravity along the orbit, and is refused while the vessel is under non-orbital acceleration [S4]. Near Kerbin, on-rails warp is not allowed below 70 km (the top of the atmosphere) [S3]. Higher rates need higher altitudes per body. Kerbin: ×5–×50 above 70 km, ×100 above 120 km, ×1,000 above 240 km, ×10,000 above 480 km, ×100,000 above 600 km; levels are 1, 5, 10, 50, 100, 1,000, 10,000, 100,000 and physics warp 2–4 *(verified 2026-10-18: [S38])*. Other bodies' tables *(still unverified)*. The downshift is not instant: a craft crossing a limit can run too fast for a second or two, which matters at re-entry [S3].
- **Warp outside Flight [KSP1].** Space Center and Tracking Station have warp controls; only on-rails rates [S2]. The Tracking Station is where players do long warps between missions.
- **Warp-to.**
  - [Mod: Kerbal Alarm Clock] was the standard way for ten years: alarms for nodes, SOI changes, Ap/Pe, transfer windows, with warp-to and "kill warp / pause on alarm" in every scene [S11].
  - [Mod: Time Control] added a Warp-To panel with a "Mnv" button for the next node [S2].
  - [KSP1] 1.12 (2021) added a stock **Alarm Clock app** (maneuver, manual time, orbital points). 1.12.2 fixed alarms firing immediately when created and a node alarm not updating for an inactive vessel [S10]. KSP1 also has a stock "Warp To" on the map orbit's context menu, added in 1.0 together with "Warp to next morning" *(verified 2026-10-18: [S39])*.
  - [KSP2] No stock alarm clock *(still unverified; no source mentions one)*. Warp to a maneuver node was handled by the burn timer and warp bar *(still unverified detail)*; community mods restored KSP1 node tools [S29].
- **KSP2 warp problems.** Overshoot across SOI boundaries changed orbits (fixed 0.1.4) [S25]; vessels teleporting inside Kerbin when fuel ran out during warp (fixed 0.1.3) [S24]; EVA kerbals disappearing when a vessel warped into their range [S24]; landing gear clipping into terrain after warp (fixed 0.2.2) [S26]; the ×1000 cap in KSC and Tracking Station [S20][S21][S22]. 0.2.2 added a "signpost" UI while warping [S26].

## 5. Background vessels

### 5.1 Loaded, packed and on rails [KSP1]

- Only vessels near the active one are **loaded** (parts exist). Inside a smaller distance they are also **unpacked** (physics runs). Players quote about 2.25 km to load and 2.5 km to unload [S8]. Each situation (landed, flying, orbit, etc.) has its own load, unload, pack and unpack distances, and the rules are load < unload and unpack < pack [S9]. Landed vessels use a short pack distance so parked landers do not tip over [S9]. A 2015 thread reports that stock 1.0 extended the unload distance for *flying* vessels to 22.5 km *(still unverified)* [S8].
- Everything else is **on rails**: its position is computed from the orbit and UT, or from a fixed point on the surface. Rails ignore the atmosphere [S5].

### 5.2 Atmosphere kills unloaded vessels [KSP1]

- Because rails have no drag, the game **deletes** an unloaded vessel that is inside an atmosphere below a cutoff. Players put the cutoff at about 20–22 km on Kerbin [S5][S6]; one recalls it as about 1 % of sea-level pressure [S5]. The wiki's Debris page gives the rule as: unloaded (beyond 2.5 km) and in air above **0.1 atm**, which is **about 23 km** on Kerbin *(corrected 2026-10-18: [S40])*. Our brief's "about 23 km" therefore matches the wiki *(verified 2026-10-18: [S40])*.
- A bug report describes debris going on rails at 2.5 km and being destroyed at about 20 km distance, including a crewed stage [S7]. The only stock workaround is to stay within the bubble until the other vessel lands [S6].
- This is the most hated consequence of the scene and bubble model: dropped stages and crewed pods vanish. Mods (e.g. FMRS, StageRecovery *(still unverified names in this pass)*) exist to recover them.

### 5.3 Background production [KSP1]

- Stock KSP1 does **not** simulate unloaded vessels. Converters (ISRU) "catch up" when the vessel is loaded again: the game stores the last active time and applies the elapsed time in chunks (players say six-hour chunks) [S17].
- The wiki notes the catch-up even makes converters run without electricity or cooling while unloaded, which is exploitable [S16]. Another mod's logistics module does not run during catch-up, so containers can run dry until physics resumes [S17].
- [Mod: Kerbalism] simulates **all** vessels, loaded and unloaded, with a shared resource cache and approximations for performance [S18]. [Mod: BackgroundProcessing] did similar work in older versions; its 1.0 build did not run ISRU in the background [S17].

### 5.4 KSP2

- Rails and bubble work the same way. 0.1.4 "improved orbits decaying when vessels are not applying any thrust" [S25]; 0.1.4.1 still listed tiny decay after stopping thrust in a low-gravity SOI, and players argued the causes were several [S27]. Orbit decay of coasting vessels was among the most reported KSP2 bugs.
- Probes "hibernate in time warp" (to save power during warp) was fixed in 0.1.4 [S25], which shows KSP2 at least modelled power during warp for the active vessel.
- **[KSP2 — announced, never shipped]** Colonies would build their own extraction rovers, and **delivery routes** would automate resource transport between colonies and across star systems over time [S30]. That is the only planned background economy in either game; it never shipped [S31].

## 6. Real time while the game is closed

- **Nothing happens.** UT is game time saved in the file; when you load, the world continues from the saved UT, regardless of how many real days passed. No source suggests otherwise for either game.
- The only real-time link is a mod: [Mod: Realtime] (KSP1 1.12.5) syncs game time to the wall clock after a "base time" is set, forces 1× warp in every scene, and auto-warps forward on rails when game time falls more than 10 seconds behind real time. It warns that the catch-up warp can make days flash past at the Space Center [S19]. This is exactly our ADR 0103 "catch up to now" idea, made automatic.

## 7. Scene transitions as the player feels them

- **Loading screens.** Every change between Space Center, editor, Tracking Station and Flight shows a loading screen [KSP1][KSP2]. Map view is the exception: it is instant because it is in the same scene.
- **Flight is torn down when you leave it [KSP1].** Going to the Space Center or Tracking Station saves the game, puts every vessel on rails, and unloads the flight scene. Coming back loads the vessel again from the save. Any vessel in atmosphere and unloaded at that moment is subject to the deletion rule (§5.2). Revert is lost [S13].
- **What carries the feeling of one world:**
  1. **One clock everywhere.** The top bar in every time-running scene shows the same date and time.
  2. **Warp in hub scenes.** You can wait for a launch window in the Space Center or Tracking Station without a vessel in flight.
  3. **Alarms that work everywhere** (KAC, later stock), which stop warp in any scene [S11][S10].
  4. **Day and night at the Space Center** matching the flight (0.21) [S1]; KSP2's KSC lights and sounds follow the time of day [S23][S25].
  5. **Catch-up** for production, so returning to a base "looks like" it kept working [S16].
- **What breaks the feeling:** the editors stop time; loading screens; revert and quickload rewind the world; vessels deleted in the atmosphere; and in KSP2, warp limits and orbits that change on a scene change.

## 8. Complaints and praise

**Complaints**

- **Load times.** KSP1 scene changes slow down with save size: one report measured 7 s on 1.4.5 versus 30 s on 1.6.1 after using the Tracking Station with many objects [S32]; another reports 5–10 minute hangs going to flight [S32]. Heavily modded installs took 20 minutes or more to start [S32]. KSP2 transitions were faster for some players (under 5 s) but had infinite loading screens on launch and parts loading in low resolution first [S33][S32].
- **Vanishing vessels** in atmosphere (§5.2) [S5][S6][S7].
- **Save and autosave surprises.** Autosave on entering flight overwrote progress [S12]; quickload overwrote autosave [S14]; KSP2 save bloat [S24].
- **KSP2 time warp bugs** and **orbit decay** (§4, §5.4) [S20]–[S27].
- **No stock alarm clock** in KSP1 until 1.12 [S10][S11].

**Praise**

- Warp in the Tracking Station and Space Center makes long missions practical.
- On-rails propagation is exact and cheap: a satellite is where it should be after years of warp.
- KSP2's warp under thrust made long low-thrust burns playable [prior 04].
- Kerbalism-style continuous background simulation is loved by its players because bases and stations "live" [S18].

## 9. Implications for our game (options, not decisions)

The owner's goal: **one world clock that runs on every screen until the player pauses it.** Today each route starts its own sim Worker from the newest save (ADR 0118), so moving between Flight, Map, Mission Center, Hangar, Space Center and Launch restarts the sim and loses the time spent on the previous screen unless it was autosaved.

**Adopt**

1. **One clock, many views.** KSP's strongest continuity cue is the same UT on every screen. Options: (a) one long-lived sim Worker owned at the app level, with routes as views that attach to it and send commands; (b) keep per-route Workers but hand over the full sim state in memory on navigation (no restart from disk). Option (a) is closest to "the world runs until I pause it".
2. **Time runs in the hub screens.** KSP made the Space Center part of the running world in 0.21 [S1]. Space Center, Mission Center and Map should advance time and allow on-rails warp, as KSP1's Space Center and Tracking Station do [S2].
3. **Warp limits recomputed from world state, never per scene.** The KSP2 ×1000 cap shows the cost of scene-local warp state [S20][S22]. One function of the world gives the allowed rate, the reason, and every screen shows it.
4. **Alarms that stop warp on every screen** (stock, from the start) [S10][S11].
5. **Rails for everything outside the active vessel**, as both games do, plus our ADR 0096 closed-form background work, evaluated on tick and on demand.
6. **Day and night and the date on every screen**, driven by the same clock (KSC lights in KSP2 [S23]).

**Improve**

1. **A global pause and warp control** in the app chrome, not per screen, with a visible state ("Paused", "×1000") on every route. KSP2 put pause in the warp bar; we can go further and keep it in one place.
2. **Pause freezes time, not the player.** Allow planning (nodes, Mission Center, Hangar editing) while paused, unlike KSP2 [S29], and explain blocked actions as KSP2 0.2.2 did [S26].
3. **Decide explicitly what the editors (Hangar) do.** Options: (a) KSP-style, building stops the clock; (b) the clock keeps running at 1× (or at the current warp) while you build, which matches "runs until paused" and makes build time meaningful later; (c) a player setting. KSP's frozen editor is a known break in continuity, and mods added build time to fix it [S36].
4. **No deletion of unloaded vessels in atmosphere.** Give background vessels in atmosphere a cheap analytic drag or landing model instead of deleting them [S5][S6][S7].
5. **Background production that runs, not "catches up" unseen.** KSP's catch-up skipped power and cooling [S16]; our world tick (ADR 0096) can apply the same rules to loaded and unloaded vessels.
6. **Autosave cadence.** KSP1 used a 300-second timer plus scene changes [S14], and its "save on entering flight" overwrote progress [S12]. Options: autosave on a game-time and real-time cadence from the one sim, on route change, and on tab hide; keep a ring of several autosaves so one bad write cannot erase the world.
7. **Tab hidden or closed.** KSP has nothing to copy here (closing stops time). Options: (a) pause automatically when the tab is hidden and resume on return (simple, honest); (b) keep running in the background Worker at a capped rate (browsers throttle timers in hidden tabs, so results drift); (c) on return after a long absence, offer the ADR 0103 "catch up" as the Realtime mod does [S19]. The clock should never silently jump.

**Avoid**

1. **Restarting the sim from disk on every screen change.** It is our version of KSP's loading screen and of KSP2's scene-state bugs; it also loses time not yet saved.
2. **Scene-local time rules** (warp caps, pause state stored in a screen). Both games had bugs here [S20][S22][S25].
3. **Rewinding the world as a side effect.** Revert and quickload rewind everything in KSP [S13]; if we offer revert, say clearly that it rewinds the world clock, or limit it to a flight-only rewind.
4. **Silent catch-up with different rules** from live play (power free during catch-up [S16]).
5. **A wall-clock-locked sim.** Already rejected in ADR 0103; the Realtime mod shows the side effects (forced 1×, flashing days) [S19].

## Sources

All checked 2026-10-18. Several KSP forum and wiki pages refused direct fetching (403 or bot protection); for those, the claim comes from search-result excerpts of the page and is marked "excerpt" below.

- **[S1]** KSP Wiki, "0.21" changelog — https://wiki.kerbalspaceprogram.com/wiki/0.21 — Community wiki copy of official notes; excerpt. Reliable for the "time passes in the Space Center scene" change.
- **[S2]** KSP Forum, "[1.12] Time Control 2.11" — https://forum.kerbalspaceprogram.com/topic/143763-112-time-control-211 — Mod author's thread; excerpt. Reliable for what the mod (and stock) allows in KSC and Tracking Station.
- **[S3]** KSP Wiki, "Physics warp" — https://wiki.kerbalspaceprogram.com/wiki/Physics_warp — Community wiki; excerpt. 70 km limit and downshift lag.
- **[S4]** KSP Wiki, "Time Warp" — https://wiki.kerbalspaceprogram.com/wiki/Time_Warp — Community wiki (older revision); excerpt. Physics warp ×1–×4, rails up to ×100,000, no warp under acceleration.
- **[S5]** KSP Forum, "How does KSP handle out-of-range vessels?" (topic 99170) and "A clarification of on rails" (123592) — https://forum.kerbalspaceprogram.com/topic/99170-how-does-ksp-handle-out-of-range-vessels — Player posts; excerpt. Rails ignore atmosphere; cutoff about 22 km; "1 % pressure" recollection.
- **[S6]** KSP Forum, "In-atmosphere deletion of spacecraft with kerbals" (41291) — https://forum.kerbalspaceprogram.com/topic/41291-in-atmosphere-deletion-of-spacecraft-with-kerbals — Player posts, old version; excerpt.
- **[S7]** KSP bug tracker, issue 5396 — https://bugs.kerbalspaceprogram.com/issues/5396 — Bug report with developer reply; excerpt. 2.5 km rails, ~20 km destruction.
- **[S8]** KSP Forum, "Physics/rails distance option" (109654) and "New extended physics range" (109634) — https://forum.kerbalspaceprogram.com/topic/109654-physicsrails-distance-option — Player posts (2015); excerpt. 2.25–2.5 km figures; 22.5 km for flying vessels (unverified).
- **[S9]** kOS documentation, "Vessel Load Distance" — https://ksp-kos.readthedocs.io/en/latest/structures/misc/loaddistance.html — Mod docs, fetched. Per-situation load/unload/pack/unpack and their ordering; UT definition is from kOS time docs (search excerpt).
- **[S10]** KSP Wiki, "1.12.2" and GOG release notes — https://wiki.kerbalspaceprogram.com/wiki/1.12.2 , https://www.gogdb.org/product/1429864849/releasenotes — Official notes copies; excerpt. Stock Alarm Clock (1.12) and fixes.
- **[S11]** KSP Forum, "Kerbal Alarm Clock" thread, page 26 — https://forum.kerbalspaceprogram.com/topic/22809-112x-kerbal-alarm-clock-v31300-april-10/page/26 — Mod thread (0.23.5 era); excerpt.
- **[S12]** KSP bug tracker, feedback 5438 — https://bugs.kerbalspaceprogram.com/issues/5438 — Bug report; excerpt. Autosave on entering flight.
- **[S13]** KSP Forum, "Can't revert flights, save the game or use orbital cheats" (204354) — https://forum.kerbalspaceprogram.com/topic/204354-cant-revert-flights-save-the-game-or-use-orbital-cheats — Player answer; excerpt. Revert needs uninterrupted flight.
- **[S14]** KSP Forum, "Auto save, the great destroyer of games" (72219) and "Settings keep resetting" (107139) — https://forum.kerbalspaceprogram.com/topic/72219-auto-save-the-great-destroyer-of-games — Player posts; excerpt. `AUTOSAVE_INTERVAL = 300`; quickload overwrites autosave; kill reverts to last persistent write.
- **[S15]** sfsutils (KSP SFS parser) — https://github.com/mark9064/sfsutils/ — Third-party tool; search excerpt. SFS format.
- **[S16]** KSP Wiki, "ISRU" — https://wiki.kerbalspaceprogram.com/wiki/ISRU — Community wiki; excerpt. Converters run while unloaded via catch-up, without charge or cooling.
- **[S17]** KSP Forum, "Resource handling for unloaded vessels" (159026) and BackgroundProcessing on SpaceDock — https://forum.kerbalspaceprogram.com/topic/159026-resource-handling-for-unloaded-vessels , https://spacedock.info/mod/288/BackgroundProcessing — Player and mod pages; excerpt. Six-hour catch-up chunks (player claim).
- **[S18]** Kerbalism documentation — https://kerbalism.readthedocs.io/en/stable/ — Mod docs; excerpt. All vessels simulated, resource cache.
- **[S19]** SpaceDock, "Realtime" mod — https://spacedock.info/mod/3679/Realtime — Mod page, fetched. KSP 1.12.5; real-time sync, 1× lock, 10 s catch-up rule.
- **[S20]** Steam, KSP2 discussions, "Can't time warp more than 1000x, even in KSC" — https://steamcommunity.com/app/954850/discussions/0/3772364949851005492/ — Player thread, 25 Feb 2023, fetched.
- **[S21]** KSP Forum, "Can't time warp past 1000 even in KSC and tracking station when craft is in orbit — v0.1.0" (212722) — https://forum.kerbalspaceprogram.com/topic/212722-cant-time-warp-past-1000-even-in-ksc-and-tracking-station-when-craft-is-in-orbit/ — Bug report forum; excerpt. Workarounds.
- **[S22]** KSP Forum, "Warp speed not unlocking fully when switching from Flight to Tracking Station — v0.1.5" (220453) — https://forum.kerbalspaceprogram.com/topic/220453-warp-speed-not-unlocking-fully-when-switching-from-flight-to-tracking-station/ — Bug report title only; excerpt.
- **[S23]** kerbal.wiki, "0.1.2.0" (KSP2 patch, 12 Apr 2023) — https://kerbal.wiki/0.1.2.0 — Community copy of official notes, fetched.
- **[S24]** kerbal.wiki, "0.1.3.0" (KSP2 patch, 22 Jun 2023) — https://kerbal.wiki/0.1.3.0 — Same, fetched.
- **[S25]** kerbal.wiki, "0.1.4.0" (KSP2 patch, 30 Aug 2023) — https://kerbal.wiki/0.1.4.0 — Same, fetched.
- **[S26]** kerbal.wiki, "0.2.2.0" (KSP2 patch, 11 Jun 2024) — https://kerbal.wiki/0.2.2.0 — Same, fetched.
- **[S27]** KSP2 v0.1.4.1 hotfix notes as summarised by SteamDB / PatchBot — https://steamdb.info/patchnotes/12526347 , https://patchbot.io/games/kerbal-space-program-2 — Aggregators; excerpt only, version attribution not confirmed. Residual orbit decay in low-gravity SOIs.
- **[S28]** KSP Forum, "Kerbal Space Program 2 pre-release notes" (212081) — https://forum.kerbalspaceprogram.com/topic/212081-kerbal-space-program-2-pre-release-notes — Official notes; excerpt. Training Center pauses flight; VAB workspaces.
- **[S29]** Gamepressure KSP2 maneuver node guide; Steam KSP2 thread; KSP Forum 214696 "Maneuver UI should be fully usable while game is paused"; KSP Forum 214244 "Maneuver Node Controller" — https://www.gamepressure.com/S013-amp.asp?ID=20897 , https://forum.kerbalspaceprogram.com/topic/214696-maneuver-ui-should-be-fully-usable-while-game-is-paused — Guide and player posts; excerpt.
- **[S30]** PC Gamer, "Kerbal Space Program 2: everything we know" — https://www.pcgamer.com/au/kerbal-space-program-2-release-date-multiplayer-everything-we-know/ — Press interview with the director; excerpt. Delivery routes and colonies plan.
- **[S31]** KSP2 official "What's next: Early Access roadmap" — https://kerbalspaceprogram.com/news/ksp-2-news-article-whats-next-early-access-roadmap-1 — Official; excerpt. Colonies, interstellar, multiplayer listed; none shipped after 0.2.2 (June 2024).
- **[S32]** KSP bug tracker issues 13120 and 21234; KSP Forum 216858, 213065 — https://bugs.kerbalspaceprogram.com/issues/13120 , https://bugs.kerbalspaceprogram.com/issues/21234 — Bug reports and player posts; excerpt. Load-time figures.
- **[S33]** Reddit r/KerbalSpaceProgram, "KSP 1 vs KSP 2" comments (2 Mar 2023) — https://redlib.hackliberty.org/r/KerbalSpaceProgram/comments/11g7wgz/ksp_1_vs_ksp_2/janf3a4 — Player comments via a mirror; excerpt. Anecdotal.
- **[S34]** kerbal.wiki, "For Science!" — https://kerbal.wiki/For_Science! — Community wiki; excerpt. 0.2.0.0, 19 Dec 2023, R&D redeems science.
- **[S35]** KSP Wiki, "Key bindings" — https://wiki.kerbalspaceprogram.com/wiki/Keys — Community wiki; excerpt. ESC pause menu, `/` stop warp.
- **[S36]** KSP Forum, "Kerbal Construction Time" (182877) and "Time of launch in 0.14" (8134) — https://forum.kerbalspaceprogram.com/topic/182877-112x-not-ro-kerbal-construction-time-unrapid-planned-assembly , https://forum.kerbalspaceprogram.com/topic/8134-time-of-launch-in-014 — Mod thread and player post; excerpt. Building costs no game time in stock; `UT=` line in the save.
- **[S37]** KSP Wiki, "0.21" changelog (Internet Archive) — https://web.archive.org/web/20240121095032/https://wiki.kerbalspaceprogram.com/wiki/0.21 — Official notes: "Time now passes in the Space Center scene".
- **[S38]** KSP Wiki, "Time warp" and "Kerbin" (archive) — https://web.archive.org/web/20231130112639/https://wiki.kerbalspaceprogram.com/wiki/Time_warp ; https://web.archive.org/web/20231228015152/https://wiki.kerbalspaceprogram.com/wiki/Kerbin — Warp levels and Kerbin altitude limits.
- **[S39]** KSP Wiki, "1.0" and "1.1" changelogs (archive) — https://web.archive.org/web/20240106121052/https://wiki.kerbalspaceprogram.com/wiki/1.0 ; https://web.archive.org/web/20240422180507/https://wiki.kerbalspaceprogram.com/wiki/1.1 — Warp To, Warp to next morning (1.0), Warp To Next Day in every scene (1.1).
- **[S40]** KSP Wiki, "Debris" (archive) — https://web.archive.org/web/20240121095445/https://wiki.kerbalspaceprogram.com/wiki/Debris — Unloaded-vessel removal above 0.1 atm, about 23 km on Kerbin; default debris cap 250.
- **[S41]** KSP Wiki, "Settings" (archive, 1.4) — https://web.archive.org/web/20240105230555/https://wiki.kerbalspaceprogram.com/wiki/Settings — "Simulate in Background" (default on) and "Max Physics Delta-Time per Frame" (0.04 s).

## Needs verification

Added 2026-10-18 by the verification pass (see `16-verification-log.md`).

- VAB/SPH editors stop UT: still unverified: no archived page says so; only player consensus and the KCT mod [S36].
- ESC menu stops UT at the Space Center and Tracking Station, and UT while a KSC dialog is open: still unverified: no source found.
- Physics range numbers (2.25 / 2.5 km, flying 22.5 km): still unverified: the kOS page [S9] lists no values and the forum is blocked.
- KSP2 rows (KSC pause key, VAB time, R&D and Mission Control): still unverified: no KSP2 source read this pass.
- Stage-recovery mod names: still unverified: mod pages not fetched.
