# Vessel programs: control arbitration and persistence (plan 311)

**Checked:** 2026-10-21 · Questions: (1) when an autopilot or script flies a vessel and the player touches the controls too, who wins, and how is that shown; (2) how do programs keep running on a vessel nobody is flying; (3) how does a running program survive closing and reopening the world.

Confidence marks: **[src]** read in the project's own source code, **[doc]** official docs, **[wiki]** community wiki, **[forum]** forum post, not verified.

## 1. KSP 1 stock

- One `FlightCtrlState` per vessel per tick, seeded from the player's input for the active vessel. Fly-by-wire handlers "can leave them as-is, filter them, or override them completely" **[wiki]** https://wiki.kerbalspaceprogram.com/wiki/API:FlightCtrlState (search snippet; page behind a bot wall).
- SAS: the user "can override the current rotation for any axis" **[wiki]** https://wiki.kerbalspaceprogram.com/wiki/Stability_Augmentation_System; a held key overrides SAS and the release becomes the new heading **[forum]** https://forum.kerbalspaceprogram.com/topic/57556-sas-changed-in-023. Override per axis while held, then re-capture.
- Throttle is a latched value (`FlightInputHandler.state.mainThrottle`), not a per-frame axis; autopilots write into it so the gauge matches **[src, via MechJeb and kRPC]**.
- Unloaded vessels (outside about 2.5 km) are data only; no part modules, no control; packed vessels "appear stuck" and throttle needs an unpacked vessel **[doc]** https://ksp-kos.readthedocs.io/en/latest/structures/misc/loaddistance.html.

## 2. kOS

- Cooked control (`LOCK STEERING/THROTTLE`) "prevents the user from manually controlling them" until the program ends **[doc]** https://ksp-kos.github.io/KOS/commands/flight/cooked.html; `SteeringManager.cs` writes pitch/yaw/roll unconditionally **[src]** https://github.com/KSP-KOS/KOS/blob/develop/src/kOS/Control/SteeringManager.cs. It warns when SAS and lock steering are both on (`FightsWithSas`).
- Raw control: "Setting any one of SHIP:CONTROL values will prevent player from manipulating that specific control"; only non-zero axes are overwritten, `NEUTRALIZE` lets go **[doc]** https://ksp-kos.github.io/KOS/commands/flight/raw.html, **[src]** https://github.com/KSP-KOS/KOS/blob/develop/src/kOS/Suffixed/FlightControl.cs.
- `SHIP:CONTROL:PILOT*` is the player's input, zero for a non-active vessel **[doc]** https://ksp-kos.github.io/KOS/commands/flight/pilot.html. Kill switch `CONFIG:SUPPRESSAUTOPILOT`.
- CPUs run on every loaded vessel in physics range **[doc]** https://ksp-kos.github.io/KOS/general/cpu_hardware.html; on unload the script stops (`kOSVesselModule.OnUnloadVessel`) and on reload the boot file runs again **[src]** https://github.com/KSP-KOS/KOS/blob/develop/src/kOS/Module/kOSVesselModule.cs, https://github.com/KSP-KOS/KOS/blob/develop/src/kOS/Module/kOSProcessor.cs. "The kOS computer reboots when you reload the scene" **[doc]** https://ksp-kos.github.io/KOS/general/boot.html. Local volumes are saved in the persistence file; running state is not **[doc]** https://ksp-kos.github.io/KOS/general/volumes.html. Players resume with a run-mode variable in a file (chaOS: https://github.com/NoRePercussions/chaOS).

## 3. MechJeb 2

- Modules are enabled while their `UserPool` is non-empty; autopilots register as users of the attitude and thrust controllers; no priority between modules, last writer wins **[src]** https://github.com/MuMech/MechJeb2/blob/dev/MechJeb2/ComputerModule.cs, https://github.com/MuMech/MechJeb2/blob/dev/MechJeb2/MechJebCore.cs.
- Attitude yields per axis: `userCommandingPitch = !Approx(s.pitch, s.pitchTrim, 0.1)`; that axis's PID is reset and left to the player **[src]** https://github.com/MuMech/MechJeb2/blob/dev/MechJeb2/MechJebModuleAttitudeController.cs. Stock SAS is forced off while it flies.
- Throttle is overridden while a user is engaged (`s.mainThrottle = TargetThrottle`) **[src]** https://github.com/MuMech/MechJeb2/blob/dev/MechJeb2/MechJebModuleThrustController.cs.
- No auto-disengage on manual input; `DeactivateControl` lets other mods (RemoteTech) kill it.

## 4. kRPC

- `Control.InputMode`: **Additive** (default, client inputs added to the player's) or **Override** (non-zero client inputs replace the player's and SAS) **[src]** https://github.com/krpc/krpc/blob/main/service/SpaceCenter/src/Services/Control.cs, https://github.com/krpc/krpc/blob/main/service/SpaceCenter/src/Services/ControlMode.cs.
- The AutoPilot holds SAS off and refuses SAS while engaged; it disengages when its client disconnects **[src]** https://github.com/krpc/krpc/blob/main/service/SpaceCenter/src/Services/AutoPilot.cs, https://github.com/krpc/krpc/blob/main/service/SpaceCenter/src/PilotAddon.cs.
- Physics-range overrides outlive the client, because packing a vessel mid-flight is worse **[src]** https://github.com/krpc/krpc/blob/main/service/SpaceCenter/src/VesselPhysicsRangeAddon.cs.

## 5. Background burns, KSP 2

- BackgroundThrust burns out of focus and "automatically tracks your SAS mode": the persisted intent is an SAS mode plus throttle **[doc]** https://github.com/Phantomical/BackgroundThrust. PersistentRotation keeps attitude under warp **[doc]** https://github.com/linuxgurugamer/PersistentRotation. WarpThrust warns not to use MechJeb with it (two owners) https://github.com/MapleC-Dev/WarpThrust.
- Principia does not execute burns and points to MechJeb **[doc]** https://github.com/mockingbirdnest/Principia/wiki/Concepts.
- KSP 2: thrust under warp exists; players report it dropping silently below about 25 % throttle **[forum]** https://forum.kerbalspaceprogram.com/topic/218717-acceleration-during-time-warp-doesnt-work. KontrolSystem2 control managers take over and release https://kontrolsystem2.readthedocs.io/en/latest/interact/control.html; no published rule on blending.

## 6. Other games

- **Juno: New Origins (Vizzy):** programs live on parts; the built-in heading lock beats Vizzy roll **[forum]** https://www.simplerockets.com/Forums/View/69445/Let-Vizzy-Control-Roll-on-Autopilot; a seated pilot's input wins the next frame, silently **[forum]** https://www.simplerockets.com/Forums/View/56836/Vizzy-on-Non-Controlled-Craft-What-Works-and-What-Doesnt; far craft (5 to 10 km) stop executing **[forum]** https://steamcommunity.com/app/870200/discussions/0/595143265765852871. Dev blog: https://www.simplerockets.com/Blog/View/41007/Say-Hello-World-to-Vizzy.
- **Space Engineers:** Programmable Blocks run whenever powered, piloted or not; `UpdateFrequency` flags; state only in the `Storage` string written in `Save()` and read in the constructor **[wiki]** https://spaceengineers.wiki.gg/wiki/Programmable_Block, https://spaceengineers.wiki.gg/wiki/Scripting/The_Storage_String, https://spaceengineers.wiki.gg/wiki/Scripting/The_Anatomy_of_a_Script. Gyro override is per actuator: an overridden gyro ignores the mouse, others still answer **[wiki]** https://spaceengineers.wiki.gg/wiki/Gyroscope.
- **From the Depths:** the player can take manual control at any time; one axis needs that axis's AI disabled (per-axis switch) **[wiki]** https://fromthedepths.fandom.com/wiki/Combat, **[forum]** https://steamcommunity.com/app/268650/discussions/0/4211498059467695734/.
- **Starbase (YOLOL):** named fields like `FcuForward`, last writer wins; players put a chip between lever and FCU **[wiki]** https://wiki.starbasegame.com/index.php/Common_YOLOL.
- **Stormworks:** arbitration is whatever the player wires in microcontrollers **[wiki]** https://stormworks.fandom.com/wiki/Wiki/Key_Assignment.
- **Screeps:** only `Memory` (JSON, 2 MB) persists; a global reset wipes the heap at any time **[doc]** https://docs.screeps.com/global-objects.html, **[wiki]** https://wiki.screepspl.us/Global_reset.
- **Factorio:** all game state lives in the mod's `storage` table; anything else desyncs; `on_configuration_changed` migrates **[doc]** https://lua-api.factorio.com/latest/auxiliary/storage.html, https://lua-api.factorio.com/latest/auxiliary/data-lifecycle.html.
- **ComputerCraft:** computers reboot to `startup` after unload **[forum]** https://forum.feed-the-beast.com/goto/post?id=265349. **OpenComputers** resumes programs by persisting Lua coroutines with Eris https://github.com/MightyPirates/OpenComputers/wiki, https://github.com/fnuecke/eris (archived; unsafe on untrusted data).

## 7. Real systems

- **Boeing 737 CWS:** column force reverted the autopilot to CWS; crews "may not recognise" the switch, so a silent reversion is a hazard https://www.atsb.gov.au/sites/default/files/media/5774046/ao-2017-030-final.pdf, https://skybrary.aero/articles/control-wheel-steering-cws.
- **Airbus:** sidestick force or the takeover button disconnects, with the aural "cavalry charge" and "AP OFF"; dual input is summed and announced https://en.wikipedia.org/wiki/Side-stick.
- **Autothrottle:** the pilot overrides by hand; on release the levers return, except in HOLD https://skybrary.aero/articles/autothrottle-autothrust, https://www.easa.europa.eu/sites/default/files/dfu/proposed_SC-ATS_for%20CS23_%20aircraft.pdf.
- **ArduPilot:** in AUTO, roll/pitch/throttle input is ignored but yaw can be overridden, and the autopilot retakes yaw later https://ardupilot.org/copter/docs/auto-mode.html; stick mixing nudges in LOITER/AUTO https://ardupilot.org/plane/docs/loiter-mode.html.
- **PX4:** moving the sticks switches from offboard/auto to Position mode, on by default, "the best way to ensure that an operator can easily take control" https://docs.px4.io/main/en/ros/offboard_control.
- **Tesla Autosteer:** cancelled by wheel torque, brake or stalk, with a chime https://tesla.cn/ownersmanual/model3/en_eu/GUID-20F2262F-CDF6-408E-A752-2AD9B0CC2FD6.html.
- **Space Shuttle:** moving the stick past the detent on an axis switches AUTO to control-stick steering on that axis, with a lit indicator https://www.globalsecurity.org/space/library/report/1988/sts-rhc.html.
- **Apollo LM DAP:** stick out of detent → manual rate on all axes, then after release and rate damping it returns to the programmed attitude (nudge and resume) https://ibiblio.org/apollo/Documents/Memo-Kalan700507_text.pdf.
- **TORU:** the manual backup to Kurs automatic docking https://en.wikipedia.org/wiki/TORU.
- **ROS `twist_mux`:** sources with priority (0 to 255) and timeout; the highest active source wins, a silent source times out and the next takes over; locks mask lower priorities. Example: navigation 10, keyboard 90, joystick 100, 0.5 s timeouts https://mirror.umd.edu/roswiki/twist_mux.html, https://docs.ros.org/en/api/twist_mux/html/twist__mux_8cpp_source.html.
- **Subsumption:** a higher layer suppresses a lower one for a fixed time, then the lower resumes https://en.wikipedia.org/wiki/Subsumption_architecture.

## 8. Persisting a running program (QuickJS)

- `quickjs-emscripten` has no snapshot API; its Asyncify build suspends only one call at a time https://github.com/justjake/quickjs-emscripten.
- `quickjs-wasi` (Vercel Labs) snapshots the whole linear memory (≥256 KB, bound to the exact WASM build; host functions re-bound by name) https://github.com/vercel-labs/quickjs-wasi.
- Durable Objects: in-memory state is not kept across eviction; reload from storage in the constructor https://developers.cloudflare.com/durable-objects/reference/in-memory-state/.
- Temporal replays workflow code against an event history; any code change needs versioning https://docs.temporal.io/workflow-definition.
- Ink saves interpreter position and variables as JSON https://github.com/inkle/ink/blob/master/Documentation/RunningYourInk.md.

## Patterns and what they mean for us

1. **Per-axis override:** player input on an axis takes that axis; the program keeps the rest (stock SAS, MechJeb, kOS raw, ArduPilot yaw, Shuttle CSS).
2. **Nudge and resume:** the program takes the axis back once the input has been released for a while (Apollo DAP, autothrottle, `twist_mux` timeout, subsumption timers). Reset the program's integrators on the axis the player took (MechJeb).
3. **Disengage on input / kill switch:** simplest and safest, needs a loud cue (Airbus, Tesla, PX4, kOS `SUPPRESSAUTOPILOT`).
4. **Never silent:** Boeing CWS and Vizzy show that a silent change of who flies is the main hazard.
5. **Throttle is latched**, not an axis: define who releases it and to what (kOS, kRPC, autothrottle).
6. **One owner per vessel, refuse a second** (kRPC refuses SAS under its AutoPilot; WarpThrust plus MechJeb is the failure case).
7. **Persistence:** every shipped game except OpenComputers saves an explicit state object and restarts the program with it (kOS boot plus files, Space Engineers `Storage`, Screeps `Memory`, Factorio `storage`). A VM snapshot is bound to the engine build and makes the save an attack surface.
