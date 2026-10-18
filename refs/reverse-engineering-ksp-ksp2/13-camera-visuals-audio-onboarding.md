# 13 — Cameras, visual feedback, audio and onboarding in KSP1 and KSP2

**Purpose.** This is a design reference for presentation and onboarding in Kerbal Space Program 1 (KSP1, Squad, 2011–2021, with the DLCs *Making History* and *Breaking Ground*) and Kerbal Space Program 2 (KSP2, Intercept Games, Early Access 2023–2024). It covers cameras, visual effects and feedback, audio, how new players were taught, and the small "juice" details that make the games feel alive. It ends with what Space Orbital Program should adopt, improve or avoid, and a checklist of what a public KSP-like needs at launch.

**Tags.** **[KSP1]** base game; **[MH]** Making History DLC; **[BG]** Breaking Ground DLC; **[KSP2]** shipped in KSP2 Early Access; **[KSP2 — never shipped]** announced or promised but not delivered; **[Mod]** community mod, not stock.

**Method and limits.** Public sources only, checked 2026-10-18. The official KSP1 wiki (wiki.kerbalspaceprogram.com) sits behind bot protection, and several official news and forum pages returned 403 or 404 to direct fetches. Claims from those pages come from search-engine excerpts of the page. They are cited normally but marked in the source list as "excerpt". Claims from background knowledge that this pass could not re-check are marked *(unverified)* and repeated in "Needs verification". Companion documents: `refs/reverse-engineering-ksp2/13-ui-ux-patterns.md` (HUD, onboarding overview) and `14-strengths-weaknesses-and-player-feedback.md` (reception). This document does not repeat their HUD material.

---

## 1. Cameras

### 1.1 KSP1 flight camera modes

KSP1 has one orbiting "chase-style" camera around the active vessel. The player drags with the right mouse button to rotate and uses the wheel to zoom. Separate *modes* decide which way is "up" for that camera. **V** cycles the modes at any time [S1].

| Mode | What "up" means | Best for | Notes |
|---|---|---|---|
| **Auto** | Switches between Free and Orbital by altitude | Default for most players | Automatic switching only happens while the mode is set to Auto. Picking a mode by hand keeps it until you cycle back [S1][S5]. A suborbital craft sits in Free, and reaching orbit can switch it to Orbital [S5]. |
| **Free** | Away from the surface of the nearest body: the planet stays at the bottom of the screen | Launch, planes, landing | The wiki recommends it for aircraft [S1]. |
| **Orbital** | Toward the north pole of the orbited body, so the planet sits beside the craft | Spacecraft in orbit | Matches the map view's orientation, which is why players find it comfortable [S1]. |
| **Chase** | Follows the craft's horizontal surface-prograde direction (not where the nose points); the ground stays down | Atmospheric flight, aerobatics | Mods such as *Improved Chase Camera* extend it [S1][S6]. |
| **Locked** | Rotates with the vessel's attitude; "up" comes from the control part (usually the pod) | Docking alignment, cinematic onboard shots | Still rotatable by hand [S1]. |

Other KSP1 camera behaviour:

- **Focus.** The camera always orbits the *active vessel*. **[** and **]** switch the active vessel among those loaded nearby (about 2.5 km), and on EVA they switch between kerbals [S2][S4]; the wiki calls 2.5 km "the physics range" *(verified 2026-10-18: [S56])*. Double-clicking or using the right-click "Aim camera" option on a part refocuses the camera on that part, which helps on long vessels *(still unverified for the exact menu label)*.
- **Zoom limits.** Minimum zoom is close to the part. Maximum is a few kilometres in flight. Beyond that the player is expected to use the map *(still unverified: no current source gives exact numbers)*.
- **IVA ("Intra-Vehicular Activity").** **C** toggles between the exterior view and the first-person view inside the crewed part. The **IVA button** on a kerbal portrait (bottom right) does the same for that seat [S3]. Inside, the mouse looks around, and some props (switches, gauges) are clickable *(still unverified for the exact stock set)*. Stock IVAs have analogue gauges, a small navball and windows. Most of the depth came from mods such as RasterPropMonitor, which add working screens [Mod][S7].
- **Internal camera parts.** Stock KSP1 has no camera part. Hullcam VDS added external cameras that you can cycle **[Mod]** *(still unverified for current maintenance)*.
- **EVA camera.** The same orbit camera follows the kerbal. **C** in mods like *Through The Eyes* gives a first-person EVA view, which shows the key is free on EVA in stock [Mod][S4].
- **Map camera.** **M** toggles map view: an orbit camera around the focused body with patched-conic orbit lines. Tab / Shift+Tab cycle the map focus and ` resets it *(verified 2026-10-18: [S57])*; the "focus" menu does the same. Map camera distance limits are huge (whole system) and zoom is logarithmic.
- **Space Center camera.** The KSC scene is a 3D orbit camera around the space center, with clickable buildings that highlight on hover. Its zoom and pitch limits are tight on purpose, so the scene always reads as a diorama *(still unverified for exact limits)*.
- **Editors (VAB/SPH).** In the VAB the camera orbits a vertical column: the wheel zooms, Shift+wheel or middle-drag moves it up and down. The SPH uses a free hangar camera. Both reset when a new root part is placed *(still unverified details)*.
- **Screenshot and hide UI.** **F1** saves a screenshot to the game's `Screenshots` folder (since 0.07.3). **F2** toggles all UI (since 0.13.0) [S2][S8]. Players asked for an F2 variant that keeps the navball, which shows people want "clean but informative" shots [S9]. A *supersize* option that renders screenshots at a multiple of screen resolution exists only as the `SCREENSHOT_SUPERSIZE` key in `settings.cfg` (see doc 12 §1.2); the 1.4 in-game Settings menu does not list it *(corrected 2026-10-18: [S58])*.
- **Cinematics.** KSP1 has no stock photo mode. **Camera Tools** [Mod] adds a stationary "flyby" camera, dogfight and pathing (keyframed) cameras. Most KSP trailers and YouTube launch shots use it or similar mods [S10].

### 1.2 KSP2 cameras

- **[KSP2]** KSP2 kept the V-cycling idea but renamed and added modes. A February 2023 Steam thread says there are more modes than before, some names are unclear, and some modes lock user control [S11]. The VAB lost free camera movement at first [S11].
- **[KSP2]** **Celestial** mode was meant to be KSP1's Orbital. Players reported that after the second or third Early Access update it behaved like the horizon-locked mode, so the orbital view effectively disappeared [S12][S13]. Scott Manley's launch stream shows it working at launch [S12]. This was still open in later threads.
- **[KSP2]** IVA was never shipped. Portraits exist, but there is no first-person interior *(still unverified as a final state; no official statement found)*. A 2021 wish-list thread asked for camera screens in IVA [S14].
- **[KSP2]** Patch notes show camera bugs being fixed through 2023. *For Science!* (0.2.0) fixed a vessel falling through the terrain when the camera moved more than about 2,500 m away. It also fixed a camera dead zone around the VAB staging stack and an error flood when looking at the sun from very far away [S15]. 0.1.5 fixed vessel focus with stack separators [S16].
- **[KSP2]** Chase camera on EVA jetpacks could set up a feedback loop: the kerbal turned toward the camera, which turned with the kerbal, and the kerbal spun out of control [S7].
- **[KSP2]** F1/F2-style screenshot and hide-UI toggles exist. Heat bars stayed visible under hidden UI in one bug report [S8].

**Lesson.** The camera is felt in every second of play. KSP1's five modes are confusing by name but each solves a real problem: ground-down for planes, planet-beside for orbits, attitude-locked for docking. KSP2 shows that a regression here, such as losing the orbit-aligned view, is noticed at once and stays a complaint.

---

## 2. Visual feedback and effects

### 2.1 Effects inventory

| Effect | KSP1 | KSP2 | Notes |
|---|---|---|---|
| **Engine plume** | Particle and mesh flame per engine. Since 1.0 it scales with throttle, and from about 1.0–1.2 it widens in vacuum *(still unverified for the stock version)*. Players replaced it with RealPlume + SmokeScreen and later **Waterfall** shader plumes [Mod][S10] | Designed around **three pressure regimes**: sea level, transitional and vacuum. Artists made a mock-up for each and blended between them, tracking colour, shock diamonds and heat distortion [S17]. Thick air gives a narrow plume and vacuum a wide one. Humid air adds visible vapour. Fuel chemistry (oxidiser ratio, burn temperature, soot) set the colour palette per fuel [S18] | KSP2's plume work is the best-documented part of either game's VFX |
| **Launch smoke and dust** | Smoke puffs at the base of engines near the ground *(still unverified)* | Launch clamps and pad steam/smoke with ground interaction *(still unverified detail)* | A cheap, high-impact moment |
| **Staging and separation** | Decouplers and separators puff a small smoke ring with a "pop" sound. Fairings split into panels that tumble away | Similar. Fairing panels flying toward planets was a bug fixed in 0.1.5 [S16] | Separation should read clearly |
| **Reentry and aero FX** | Since 1.0, a "speed streak" effect starts at transonic speeds (Mach effects) and becomes orange plasma glow on reentry, scaled by speed and air density. Parts glow red–white as they heat up [S19] *(visual details still unverified)* | Reentry VFX and a full **thermal system** arrived in *For Science!* (0.2.0) [S15]. The thermal model was rebuilt from scratch, with reentry heating, occlusion shielding and per-part heat resistance [S20] | KSP2 launched in Feb 2023 *without* reentry heating, a gap critics noted |
| **Mach and transonic** | Drag rises between Mach 0.8 and 1.2 (about 270–410 m/s at sea level). The visual streaks start in this range [S19] *(link between visuals and band still unverified)* | Shown with condensation and shock effects *(still unverified)* | Good feedback for "you are fighting the air" |
| **Overheat** | Parts glow. A heat gauge bar appears next to hot parts and warns before they explode [S19]; the part explodes when the bar fills, and the "Temperature Gauges" and "Thermal Highlights" settings (both default on) control it *(verified 2026-10-18: [S58, S59])* | Heat bars on parts. They even showed under F2 [S8] | Warn before destruction, near the part |
| **Explosions and debris** | Each part pops in a fireball with a short debris scatter. Lone parts become debris objects. The flight log lists what blew up (F3, "Toggle results screen") *(verified 2026-10-18: [S57])* | VFX post #2 covered explosions as well as exhaust [S18] | KSP's comedy runs on readable explosions |
| **Part highlighting** | Hover in the editor tints parts light. In flight the PAW (right-click) highlights the part. Staging-list hover highlights the parts in that stage. Parts with problems flash (overheat). Players asked for a stronger hover colour [S21]. Mods use green for symmetry partners [Mod][S22] | Similar. Map trajectories highlight conic sections on hover (0.1.5) [S16] | Highlight from list to world is a core teaching link |
| **Lights and night** | Real day/night. Part lights (spotlights, navigation lights) cast light. KSC has building lights at night *(still unverified)* | Same. Logitech RGB keyboard lighting reacted to crashes, docking and the body you are near [S16] | Night launches are a favourite screenshot |
| **Atmosphere and clouds** | Stock: simple scaled-space atmosphere halo and sky gradient, no clouds. **Scatterer** (scattering, blue distance haze, red sunsets, ocean) and **EVE** (clouds, volumetric with later versions) were near-mandatory mods [Mod][S10] | Precomputed atmospheric scattering, tuned for Kerbal-scale planets, with precision fixes in 16/32-bit textures [S23]. Stock clouds with shadows. 0.1.5 improved cloud lighting (atmospheric transmittance), blending and shadows, and gave redder Kerbin and bluer Duna sunsets [S16] | The single biggest stock visual gain from KSP1 to KSP2 |
| **Terrain** | PQS terrain. 1.8 (Unity 2019.2, DX11) brought new textures and shaders for the Mun, Minmus, Duna, Ike, Eve and Gilly, plus a *Terrain Shader Quality* setting [S24]. Scatter (rocks, trees) can be turned on and does not collide [S25] | Higher close-range terrain resolution in 0.2.0. Biome and triplanar mesh bucketing in 0.1.5 [S15][S16] | Close-up ground under the landing legs is what players see most |
| **Surface features** | **[BG]** Higher-resolution, interactive surface features: rocks on most bodies plus unique ones (cryovolcanoes on Vall, wrinkle ridges on Moho, giant quartz). They can be sampled on EVA or scanned with robotic arms for science [S25] | Not shipped as such | Turns scenery into goals |
| **Splash and water** | Splash particles when parts hit water *(still unverified detail)* | Water refraction upgraded, ocean waves tuned, splash timing fixed in 0.2.0 [S15] | Water landings are a common first "success" |
| **Flags** | EVA kerbals plant flags with a name and plaque text. The flag shows the agency's chosen flag and the vessel flag on parts; plaques can be read only by a kerbal standing near the flag *(verified 2026-10-18: [S60])* | Flags, also on parts | A player-authored mark on the world |
| **Kerbal faces** | Animated portraits: faces change from terrified to elated with G-forces, explosions and danger. EVA faces animate too. Mecanim-based expressions [S26][S27] | Heavier focus on emotion: new hairstyles and expressions, with "terror" as a showcased feature [S28]. 0.1.5 smoothed blinking and self-shadowing on kerbal skin [S16] | The cheapest, best-loved "juice" in the series |

### 2.2 KSP2 visual upgrades in summary

**[KSP2]** players and reviewers consistently praised graphics and audio even when they panned performance and bugs [S29][S30]. A hostile 3/10 review still singled out atmospheric scattering as making launches look better [S30]. The upgrades were: stock scattering and clouds, physically motivated plumes, better water, higher-resolution terrain, more expressive kerbals, and (late) reentry FX. The cost was frame rate. Performance was the main launch complaint (see doc 14).

### 2.3 Lessons

1. **Effects carry physics.** A plume that widens in vacuum, streaks at Mach 1 and a glow on reentry teach the player about pressure, drag and heat without text. KSP2 designed its plume from those regimes first [S17][S18].
2. **What players mod in, they want in stock.** Scatterer, EVE, Waterfall and Chatterer appear on almost every "must-have" list [S10]. These are the clearest signals of missing stock presentation.
3. **Shipping without a signature effect hurts.** KSP2's Early Access had no reentry heating for ten months. Players noticed the effect *and* the missing danger.

---

## 3. Audio

### 3.1 KSP1

- **Engines.** Each engine family has its own loop (liquid roar, solid crackle, jet whine, ion hum). Pitch and volume follow throttle. A separate ignition sound and a flame-out sound frame the loop *(still unverified that every family has a unique loop)*.
- **Atmosphere fade.** Engine and wind sounds fade with air pressure, so space is near-silent apart from the engine *(still unverified for exact behaviour)*. Wind rises with speed in atmosphere.
- **Events.** Decoupling "pop", explosion bangs, parachute deploy, landing-gear thump, docking clunk, part-snap clicks in the editor [S31].
- **UI.** Clicks and confirmation tones. The *UI* volume channel covers part snapping in the VAB/SPH [S31].
- **Music.** Original score credited to **Victor Machado** [S32]. Many tracks, especially ambient space pieces, come from **Kevin MacLeod**'s Creative Commons library [S33]. Each scene has music: main menu theme, KSC, a jazzy VAB/SPH loop that some players found grating, tracking station, and a rotating set of space ambient tracks in flight [S32][S34] *(scene-to-track mapping still unverified)*. In flight, music plays mainly in space, not on the pad or in atmosphere *(still unverified)*. It is scene-based, not adaptive to danger. The *Soundtrack Editor* mod adds playlists per situation [Mod][S33].
- **Voice and kerbals.** Kerbals mumble, giggle and scream: scared kerbals scream, unhappy ones pant [S27]. Tutorials had a *Voices* channel for voice volume [S31].
- **Settings.** Six sliders: **Master, Spacecraft** (engines, parachutes, ignition), **Ambience** (decoupling, wind), **UI, Music, Voices**. All default to 50 % except Music (35 %). A *Sound Normalizer* (on by default) evens out volume swings [S31].
- **Mods.** **Chatterer** adds radio chatter, beeps and SSTV-style noises to crewed pods, plus breathing on EVA and environmental sounds [Mod][S10]. Its popularity shows that players miss "mission control" atmosphere in stock.

### 3.2 KSP2

- **[KSP2]** Audio director and composer **Howard Mostrom** recorded a real ULA **Atlas V launch** (4 October 2022) with more than a dozen microphones for launch sounds [S35]. The Steam page also cites live recordings of VAB construction and ambient noise [S29].
- **[KSP2]** The original score is by Mostrom, recorded with live musicians. **Planet-specific themes** were praised as fitting each body's myth. One player felt the launch-to-space transition lacked the impact of KSP1's music [S36].
- **[KSP2]** *For Science!* added a new **ambient audio system**, fixed ambient sound stopping after scene changes, and stopped KSC ambient music during the first-time orientation [S15].
- **[KSP2]** Tutorials and the first missions were **voiced**: an AI guide narrates tutorials, and a German preview praised the voiced opening missions (see doc 13 in `reverse-engineering-ksp2`) [S37]. A 0.2.0 bug had voice-over stalling after a failed tutorial [S15].
- **[KSP2]** The team acknowledged that an **audio-only launch countdown** caused accessibility and legibility problems (cross-referenced from `reverse-engineering-ksp2/13-ui-ux-patterns.md` §1.10, not re-checked).
- **[KSP2 — never shipped]** A full mission-control voice layer (CAPCOM-style calls) was never part of shipped KSP2 as far as found. Community projects such as *KSP Mission Control* add voice CAPCOM to KSP1 via kRPC [Mod][S38].

### 3.3 Lessons

1. **Sound is the physics of the air.** The fade of roar and wind with altitude is the most "felt" cue of leaving the atmosphere. Both games get this right, and players notice when it is missing.
2. **Music is scene-shaped, and players notice when it is loud or repetitive.** A single short VAB loop for hours of building annoyed people [S34]. Long, quiet, varied tracks and a separate slider are essential.
3. **Status must not be sound-only.** KSP2's audio countdown is a known misstep.

---

## 4. Onboarding

### 4.1 KSP1: layers that came late

| Layer | What it was | When | Verdict |
|---|---|---|---|
| **Tutorials** | Scripted lessons with **Wernher von Kerman** as the text-box instructor ("Construction Basics" was the first) [S39]. 1.1 replaced the flight and editor tutorials with six new ones: *Basic Construction/Getting Started, Basic Flight, Intermediate Construction* (suborbital craft), *Suborbital Flight, Advanced Construction* (orbit-capable craft), *Go For Orbit*. *Orbit 101* and *Science Basics* were updated, and three new **Mun** tutorials covered transfer and insertion, landing, and the rest [S40]. A Docking lesson (added 1.0, fixed for 1.1) and two asteroid lessons existed *(verified 2026-10-18: [S61])*; EVA and plane lessons *(still unverified list)* | Since ~0.17; overhauled in 1.1 (April 2016) | Text-heavy, easy to break. A Steam guide called the built-in rendezvous tutorial poor [S41]. Forum advice: not the best, but a starting point [S41] |
| **Scenarios / training** | Pre-built saves with a goal: an EVA recovery near Kerbin, Mun-orbit landing, a Mun "impending impact" rescue, **Station One** refuelling, **Asteroid Redirect** parts 1–2, **Jool aerobraking** [S42] | Since ~0.17; extended in 1.0–1.1 | Fun challenges, not teaching |
| **KSPedia** | In-game illustrated manual on the Space Center screen and in flight, for new players. Covers building, flying, orbits, kerbals, science and bodies. Mods can add pages [S43][S44] | 1.1 | Useful, but you had to know to open it. Topic list not re-checked *(still unverified)* |
| **Career as guidance** | Early contracts are simple ("launch a vessel", "gather science", "reach orbit") and pay well, so they act as a curriculum [S45]. Altitude milestones were contracts before 1.0.5, then became passive **World Firsts** that pay funds and reputation and are announced in the message app [S46] | 0.24+ | The real teacher for many. Random generation can skip lessons |
| **Tooltips** | Hover tooltips on parts and buttons, part info panels with stats *(still unverified detail)* | — | Informative but dense |
| **Making History** | **[MH]** The Mission Builder lets players author missions with nodes, goals and triggers, and play others' missions. Shipped missions are history-themed *(still unverified for tutorial content)* | 1.4 (2018) | Shows that "missions with a script" are a strong teaching format |
| **YouTube** | The official site promoted **Scott Manley**'s 30-part career tutorial series [S47]. "Learn KSP from YouTube" is the series' best-known onboarding story | — | The real KSP1 onboarding |

There was also **KerbalEdu**, an educational edition with a clearer interface and lesson plans (doc 14).

### 4.2 KSP2: onboarding as a pillar

- **[KSP2]** Onboarding was a stated top priority. A developer video introduced a "brand new tutorial system" and UI/UX improvements [S48].
- **[KSP2]** The **Training Center** at KSC holds four lesson sets: *Space Is the Place* (7 lessons), *Missing the Ground* (6), *Orbits are Weird* (4) and *Orbital Transfers* (4) [S49]. At Early Access launch there were "four main lessons", from basic rocketry to interplanetary manoeuvres [S50]. Lesson names found in patch notes include *Establishing an Orbit* and *Manipulating Orbits* [S15].
- **[KSP2]** Format: short **animated videos** narrated by a guide (often described as an AI/robot voice, with cartoon visuals), then an interactive practice with on-screen arrows and GIFs [S37][S15]. The French press called it cartoon-style tutorials for beginners [S51]. The name "Kerbal Space Academy" did not turn up in any source *(still unverified as a name)*.
- **[KSP2]** **Cadet Orientation**: a first-time user experience inside a new campaign, with messages that can be turned off after creation. *For Science!* added two tutorials and the **K0** starter rocket as a stock vessel [S15].
- **[KSP2]** **Mission Control** and a **Mission Tracker** with 11 primary and 30 secondary missions arrived in *For Science!*. They gave goals outside the tutorials [S15][S52].
- **Reception.** Space.com said the animations replaced KSP1's text boxes and got a first rocket into space fast *(Space.com URL still unverified)*. TechRaptor said they look and sound good and fit the tone, but stay surface-level [S53]. A hands-on preview found them thorough but dense, needing replays (doc 13). The developers credited tutorials and the first-time experience with bringing in new players, but said much work remained [S52]. Players said in-game tutorials still helped less than online videos, and that missions were too scripted and lacked consequences [S54].

### 4.3 What worked and what failed

| Worked | Failed |
|---|---|
| Career contracts as an implicit curriculum (KSP1) [S45] | Text-box tutorials that broke when the player deviated (KSP1) [S41] |
| Short animated explainers before practice (KSP2) [S53] | Dense lessons needing replays; surface-level coverage (KSP2) [S53] |
| A starter rocket and a guided first launch (KSP2 K0) [S15] | Reference material hidden behind a button (KSPedia) |
| World Firsts as celebratory checkpoints [S46] | Rendezvous, docking and transfers left to YouTube in both games |
| Voiced, characterful guidance (KSP2) [S37] | Voice-only cues and long cutscenes during play |

---

## 5. Feel and "juice"

| Detail | Game | Why it works |
|---|---|---|
| **Kerbal portraits** that panic, grin and scream with G-forces and danger [S26][S27] | KSP1, KSP2 | Turns telemetry (G-load, explosions) into emotion. The player cares about the crew |
| **Courage and stupidity stats** shape facial reactions only (no effect on performance); about 10 % of kerbals carry the hidden "BadS" flag that ignores both; tests suggest Stupidity, not Courage, drives fear *(verified 2026-10-18: [S62])* | KSP1 | Personality from two numbers |
| **Flag planting** and plaques on EVA | KSP1, KSP2 | A personal monument; the classic "first landing" screenshot |
| **World Firsts** messages with rewards [S46] | KSP1 | Celebrates progress without a cutscene |
| **Mission Control and Mission Tracker** [S15] | KSP2 | A sense of an agency watching |
| **No launch countdown** in KSP1: the player presses Space when ready *(still unverified, widely known)*. Mods add countdowns (LCD Launch Countdown) [Mod][S55] | KSP1 | Player-paced, but loses the drama. KSP2's audio countdown created its own problem |
| **Explosions and debris** with a flight log | KSP1, KSP2 | Failure is funny, not punishing; the log explains what happened |
| **Space Center at night**, rotating sun, KSC buildings that upgrade visually *(still unverified detail)* | KSP1 | The hub feels lived-in |
| **Revert flight** and quicksave | KSP1, KSP2 | Experimentation stays fun |
| **"Jeb"** and named starter kerbals | KSP1, KSP2 | Characters to root for |
| **Science reports** with humorous flavour text per biome and situation *(still unverified as a list, well known)* | KSP1 | Rewards exploring with writing, not just numbers |
| **RGB keyboard effects** for crashes and docking [S16] | KSP2 | A small extra, but shows care |

---

## 6. Space Orbital Program: what we already have

A brief grep of `apps/web/src/lib` and `packages/renderer/src` (2026-10-18):

| Area | Already present | Gaps relative to KSP |
|---|---|---|
| **Camera** | One orbit rig (`packages/renderer/src/camera-rig.ts`) around the vessel and SOI body, distance clamped to 2–5,000 m in flight, log-linear zoom. Fixed screenshot presets for dev captures (`camera-presets.ts`). The flight toolbar has a disabled **Camera** button for plan 112 (`apps/web/src/lib/hud/AppBar.svelte`) | No modes (free/orbital/chase/locked), no part focus, no IVA, no photo mode, no hide-UI or player screenshot key |
| **Keys** | `apps/web/src/lib/keybindings.ts`: **V** = speed reference, **C** = aircraft brakes, **F1** = controls list, **[ ]** = trim and VAB part selection | **These conflict with KSP muscle memory** (V camera, C IVA, F1 screenshot, F2 hide UI, [ ] vessel switch). Needs a decision before launch |
| **Effects** | `packages/renderer/src/effects/`: plume and plume mesh, particles, smoke noise, **reentry plasma**, glow and ground glow, explosion, shards, wreckage and wreck field, trail ribbons, **waterline** (ripples and splashes), transitions. Environment: atmosphere model, clouds and cloud volume, aurora, light shafts, terrain zones, vegetation, site steam | Check plume regimes (sea level / vacuum), Mach streaks, staging smoke rings, part heat glow, part highlighting by stage |
| **Audio** | `apps/web/src/lib/audio/`: procedural Web Audio (no files): engine roar carried by air and silent in vacuum, wind by speed and density, quiet under warp, one-shots `click`, `sasOn`, `sasOff`, `stage`, `warning`. Volume buses **master, effects, ui** in settings | No music, no ambience bed in space, no per-engine timbres, no explosion/decouple/landing sounds, no voice. Unlocked by first gesture (good) |
| **Onboarding** | `apps/web/src/lib/onboarding/tutorial.ts`: a nine-step first-flight tutorial across VAB and flight (build, launch, throttle, stage, climb with SAS, turn east, raise Ap to 70 km, map, circularise). It is a pure step machine that completes on observed state, uses the player's real key bindings and persists progress. Help overlay on F1/`?`. Toasts and messages logs (`toasts.ts`, `messages.ts`) | Only one lesson. No rendezvous, docking, transfer, landing or plane lessons. No glossary or reference. No explanation videos or diagrams |

---

## 7. Implications for our game

### 7.1 Adopt

1. **Camera modes that solve real problems.** Ship at least *Auto* (free near the surface, orbit-aligned in space), *Free*, *Orbital* and *Locked*. Let V cycle them and show the mode name in a toast. KSP2's lost orbital view shows how much players depend on it [S12].
2. **Hide UI and screenshot.** A "clean view" key and a screenshot button that saves a PNG (with an option to hide the HUD). Browser `canvas.toBlob` makes this cheap. Players share screenshots, and that is our marketing.
3. **Pressure-driven plume** following KSP2's three regimes: sea level, transitional and vacuum, blended by ambient pressure and scaled by throttle [S17].
4. **Sound that fades with the air**, which we already have. Extend it with ignition, flame-out, decoupler pop, explosion and touchdown one-shots, so every visual event has a sound.
5. **Expressive crew portraits** that react to G-load and danger [S26]. Use our own characters; never copy Kerbals.
6. **Progress celebrations** like World Firsts: first launch, first space, first orbit, first landing per body, logged in the messages panel [S46].
7. **Six audio buses** as in KSP1: master, spacecraft, ambience, UI, music, voice [S31]. We have three.

### 7.2 Improve

1. **Layered onboarding.** Keep our state-driven tutorial (better than KSP1's fragile scripts) and add: short diagrams or animations before each lesson (KSP2's strongest idea [S53]), a lesson list (Training), and a searchable **glossary/reference** that is one click from any HUD term. Browser links make "open this lesson" deep links possible.
2. **Teach the YouTube topics in-game.** Rendezvous, docking, transfers and landing were left to Scott Manley in KSP1 [S47]. These should be our lessons 2–6.
3. **Contracts as a curriculum, on purpose.** KSP1's early contracts taught by accident [S45]. Make the first ten missions a designed sequence that maps to lessons.
4. **Music that knows the scene**, with long, quiet, varied tracks, a lower default (KSP1 used 35 %) and per-planet themes like KSP2 [S36]. Avoid one short VAB loop [S34].
5. **Camera on part focus.** Click a part to centre the camera on it (long vessels, docking ports).
6. **Effects as feedback.** Mach streaks (with transonic drag), part heat glow and an on-part heat bar before destruction, staging separation rings, and highlight of the parts in a stage when hovering the stage stack.

### 7.3 Avoid

1. **Sound-only or colour-only status** (KSP2's countdown). Every audio cue has a visible twin.
2. **Mode names that do not say what they do.** KSP2 players could not tell modes apart [S11]. Show a one-line description on switch.
3. **Shipping without signature effects** (KSP2's missing reentry heating). Plume, staging, reentry glow and explosions must all exist at launch, even if simple.
4. **Long, dense or unskippable lessons.** Keep steps short and checkable; let players skip and return.
5. **Breaking KSP key conventions without reason.** Our V, C, F1 and [ ] differ from KSP. Either adopt KSP's defaults (with a "KSP layout" preset) or explain ours in the first lesson.
6. **Effects that kill frame rate.** KSP2's visuals were praised but performance was not. Tie clouds, scattering and particle counts to the existing quality governor.

### 7.4 Presentation and onboarding checklist

**Needed at public launch**

- [ ] Camera: Auto/Free/Orbital/Locked modes, V cycles with a toast, part focus, map camera, sensible zoom limits
- [ ] Hide UI key and screenshot (PNG download)
- [ ] Plume that reacts to throttle and pressure; launch smoke/steam; staging separation effect
- [ ] Reentry glow and part heat warning; explosions and debris with a flight log entry
- [ ] Stage-stack hover highlights parts in the world
- [ ] Engine and wind sound that fade with air; ignition, flame-out, decouple, explosion, touchdown, UI sounds
- [ ] Audio settings: master, spacecraft, ambience, UI, music; mute; starts on first gesture
- [ ] At least a minimal music set: menu, space center, editor, space ambient, all quiet by default
- [ ] First-flight tutorial (have it) plus lessons for landing, rendezvous and transfer
- [ ] Glossary/reference reachable from the HUD; tooltips on every HUD term
- [ ] First-achievement toasts (first launch, space, orbit, landing)
- [ ] Every audio cue mirrored visually; reduced motion respected for camera shake and flashes
- [ ] Key layout decision (KSP-compatible preset or documented differences)

**Can come later**

- [ ] Chase camera and on-board/IVA-style cockpit view
- [ ] Photo mode with free camera, depth of field and time-of-day
- [ ] Cinematic cameras (flyby, keyframed path) for trailers and replays
- [ ] Crew portraits with emotion; voice barks
- [ ] Per-engine sound timbres; per-planet music themes; adaptive music
- [ ] Mission control voice/radio chatter (with subtitles)
- [ ] Animated lesson videos; docking, plane and science lessons
- [ ] Interactive surface features and flags with plaques
- [ ] Clouds with shadows and full scattering on every body (high preset)

---

## 8. Sources

All checked 2026-10-18. "Excerpt" means read via a search-engine summary because the page blocked direct fetching.

- [S1] KSP Wiki, "Camera view". https://wiki.kerbalspaceprogram.com/wiki/Camera_view. Official community wiki (excerpt). High for KSP1 behaviour.
- [S2] KSP Wiki, "Key bindings". https://wiki.kerbalspaceprogram.com/wiki/Keys. Official community wiki (excerpt). High.
- [S3] KSP Wiki, "Intra-Vehicular Activity". https://wiki.kerbalspaceprogram.com/wiki/IVA. Official community wiki (excerpt). High.
- [S4] KSP Forum, "Through The Eyes of a Kerbal" mod thread. https://forum.kerbalspaceprogram.com/topic/166786-112x-through-the-eyes-of-a-kerbal. Mod author (excerpt). Medium.
- [S5] KSP Forum, "Camera switches from orbital to suborbital trajectories". https://forum.kerbalspaceprogram.com/topic/152155-camera-switches-from-orbital-to-suborbital-trajectories. Player thread (excerpt). Medium.
- [S6] CurseForge, "Improved Chase Camera". https://www.curseforge.com/kerbal/ksp-mods/improved-chase-camera-v1-5-1. Mod page (excerpt). Medium.
- [S7] KSP Forum, Camera tag listing (jetpack chase feedback loop; IVA camera height with RasterPropMonitor). https://forum.kerbalspaceprogram.com/tags/Camera. Player reports (excerpt). Medium.
- [S8] KSP Forum, "Need screenshot help" and KSP2 "Heat bars visible on decoupled parts". https://forum.kerbalspaceprogram.com/topic/115594-need-screenshot-help-problem-solved-thanks-for-your-help ; https://forum.kerbalspaceprogram.com/topic/221934-heat-bars-visible-on-decoupled-parts. Player threads (excerpt). Medium.
- [S9] KSP Forum, "Can I make F2 hide everything except navball". https://forum.kerbalspaceprogram.com/topic/70831-can-i-make-f2-hide-everything-except-navball. Player thread (excerpt). Medium.
- [S10] Steam Community KSP1 discussions on essential mods (Scatterer, EVE, Chatterer, Waterfall, Camera Tools). https://steamcommunity.com/app/220200/discussions/0/4526764179300366869 and KSP Wiki mod list https://wiki.kerbalspaceprogram.com/wiki/After_kerbin. Player lists (excerpt). Medium for "what players install".
- [S11] Steam Community, KSP2 discussion on camera modes (Feb 2023). https://steamcommunity.com/app/954850/discussions/0/3772364949847356130. Player thread (excerpt). Medium.
- [S12] KSP Forum, "Camera mode in orbit" (KSP2). https://forum.kerbalspaceprogram.com/topic/220586-camera-mode-in-orbit. Player thread (excerpt). Medium.
- [S13] KSP Forum, "Celestial camera behaves like horizon camera in flight" (KSP2 bug report). https://forum.kerbalspaceprogram.com/topic/221646-celestial-camera-behaves-like-horizon-camera-in-flight. Bug report (excerpt). Medium.
- [S14] KSP Forum, "A new part in KSP2: cameras". https://forum.kerbalspaceprogram.com/topic/205435-a-new-part-in-ksp2-cameras. Wish-list thread (excerpt). Low–medium.
- [S15] kerbal.wiki, "For Science!" (0.2.0.0 notes). https://kerbal.wiki/For_Science! and https://kerbal.wiki/0.2.0.0. Community wiki citing official notes (fetched). High for listed changes.
- [S16] kerbal.wiki, "0.1.5.0". https://kerbal.wiki/0.1.5.0. Community wiki citing official notes (fetched). High.
- [S17] KSP official, "Developer Insights #11 – Engine Exhaust Visual Effects". https://forum.kerbalspaceprogram.com/topic/204884-developer-insights-11-%E2%80%93-engine-exhaust-visual-effects. Developer post (excerpt). High.
- [S18] KSP official, "Developer Insights #2 – Visual Effects". https://forum.kerbalspaceprogram.com/topic/200605-developer-insights-2-%E2%80%93-visual-effects. Developer post (excerpt). High.
- [S19] KSP Wiki, "1.0" release notes, and forum "1.0.5 reentry, drag and heat". https://wiki.kerbalspaceprogram.com/wiki/1.0 ; https://forum.kerbalspaceprogram.com/topic/125083-105-reentry-drag-and-heat. Official notes and player thread (excerpt). High for the model, low for the visuals.
- [S20] KSP official, "Developer Insights #21 – Rockets' Red Glare". https://kerbalspaceprogram.com/news/developer-insights-21-rockets-red-glare. Developer post (excerpt). High.
- [S21] KSP Forum, "Color of highlighted part". https://forum.kerbalspaceprogram.com/topic/53124-color-of-highlighted-part. Player thread (excerpt). Medium.
- [S22] GitHub, "PartWizard" (continued). https://github.com/linuxgurugamer/PartWizard. Mod README (excerpt). Medium.
- [S23] KSP official, "Developer Insights #22 – Sky's the Limit". https://kerbalspaceprogram.com/news/developer-insights-22-skys-the-limit. Developer post (excerpt). High.
- [S24] KSP Wiki, "1.8". https://wiki.kerbalspaceprogram.com/wiki/1.8. Official notes (excerpt). High.
- [S25] KSP Wiki, "Surface features" and "Breaking Ground". https://wiki.kerbalspaceprogram.com/wiki/Surface_features ; https://wiki.kerbalspaceprogram.com/wiki/Breaking_Ground. Community wiki (excerpt). High.
- [S26] KSP Wiki, "Kerbal". https://wiki.kerbalspaceprogram.com/wiki/Kerbal. Community wiki (excerpt). Medium–high.
- [S27] KSP Forum, "How to make kerbals smile/not smile". https://forum.kerbalspaceprogram.com/topic/76305-how-to-make-kerbals-smilenot-smile. Player guide (excerpt). Medium; the mood scale is community-derived.
- [S28] Space.com, "Kerbal Space Program 2 will launch Kerbonauts with wild new hairdos and emotions". https://www.space.com/kerbal-space-program-2-new-features-video. Press (excerpt). Medium–high.
- [S29] Steam store, Kerbal Space Program 2. https://store.steampowered.com/app/954850/Kerbal_Space_Program_2/. Publisher marketing (excerpt). Medium (claims).
- [S30] eXputer, "Kerbal Space Program 2 Review – Failure To Launch". https://exputer.com/reviews/kerbal-space-program-2/. Review (excerpt). Medium.
- [S31] KSP Wiki, "Settings". https://wiki.kerbalspaceprogram.com/wiki/Settings. Community wiki (excerpt). High; the Russian page gives different defaults.
- [S32] IMDb Pro, Kerbal Space Program (credits). https://pro.imdb.com/title/tt5181240. Credits database (excerpt). Medium.
- [S33] KSP Forum, "Soundtrack Editor" mod. https://forum.kerbalspaceprogram.com/topic/59682-161-soundtrack-editor-46-2019-01-28. Mod author (excerpt). Medium.
- [S34] Steam Community, KSP1 discussion about VAB music. https://steamcommunity.com/app/220200/discussions/0/38596747684019680. Player thread (excerpt). Low–medium.
- [S35] Space.com, "Kerbal Space Program 2 to feature Atlas V rocket launch audio". https://www.space.com/kerbal-space-program-2-rocket-launch-audio. Press (excerpt). High.
- [S36] Steam Community, KSP2 discussion on music. https://steamcommunity.com/app/954850/discussions/0/3780246883325972203. Player thread (excerpt). Low–medium.
- [S37] Checkpoint Gaming, "Kerbal Space Program 2 Hands-On Preview". https://checkpointgaming.net/features/2023/02/kerbal-space-program-2-preview-starting-liftoff-in-5/. Preview (excerpt). Medium.
- [S38] SpaceDock, "KSP Mission Control". https://spacedock.info/mod/4378/KSP%20Mission%20Control. Mod page (excerpt). Medium.
- [S39] KSP Wiki, "Wernher von Kerman". https://wiki.kerbalspaceprogram.com/wiki/Wernher_von_Kerman. Community wiki (excerpt). High.
- [S40] KSP Wiki, "1.1". https://wiki.kerbalspaceprogram.com/wiki/1.1. Official notes (excerpt). High.
- [S41] Steam guide, "Rendezvous and Docking 101", and Steam guide "How To Get Started In KSP". https://steamcommunity.com/sharedfiles/filedetails/?id=1906838854 ; https://steamcommunity.com/sharedfiles/filedetails/?id=2144756111. Player guides (excerpt). Medium.
- [S42] KSP Wiki, "Scenarios". https://wiki.kerbalspaceprogram.com/wiki/Scenarios. Community wiki (excerpt). Medium–high; may be incomplete.
- [S43] KSP Wiki, "KSPedia". https://wiki.kerbalspaceprogram.com/wiki/KSPedia. Community wiki (excerpt). High.
- [S44] GamingOnLinux, "Kerbal Space Program 1.1 released". https://www.gamingonlinux.com/2016/04/kerbal-space-program-11-released-updated-to-unity5-new-interface-new-tutorials-and-more/. Press (excerpt). Medium–high.
- [S45] O'Reilly, *The Kerbal Player's Guide*, ch. 1. https://oreilly.com/library/view/the-kerbal-players/9781491913475/ch01.html. Book (excerpt). Medium.
- [S46] KSP Forum, "Contracts in 1.1" and "Career mode contracts". https://forum.kerbalspaceprogram.com/topic/140576-contracts-in-11 ; https://forum.kerbalspaceprogram.com/topic/147222-career-mode-contracts. Player threads (excerpt). Medium.
- [S47] KSP official news, "Career mode guide for beginners". https://kerbalspaceprogram.com/news/career-mode-guide-for-begineers. Official (cross-ref from doc 13, not re-fetched). High.
- [S48] VGC, "Kerbal Space Program 2 video reveals features designed to make it more welcoming for new players". https://www.videogameschronicle.com/news/kerbal-space-program-2-video-reveals-features-designed-to-make-it-more-welcoming-for-new-players. Press (excerpt). Medium–high.
- [S49] kerbal.wiki, "Tutorials". https://kerbal.wiki/Tutorials. Community wiki (fetched). High for structure.
- [S50] KSP Forum, "Kerbal Space Program 2 pre-release notes". https://forum.kerbalspaceprogram.com/topic/212081-kerbal-space-program-2-pre-release-notes. Official notes (excerpt). High.
- [S51] Gamewave, "Kerbal Space Program 2 proposera des tutoriels pour les débutants, sous forme de cartoon". https://gamewave.fr/kerbal-space-program-2/kerbal-space-program-2-proposera-des-tutoriels-pour-les-debutants-sous-forme-de-cartoon/. Press (title only). Medium.
- [S52] KSP official, "Introducing For Science!" and forum "A new chapter". https://kerbalspaceprogram.com/news/introducing-for-science ; https://forum.kerbalspaceprogram.com/topic/222626-a-new-chapter. Developer posts (excerpt). High.
- [S53] TechRaptor, "Kerbal Space Program 2 Preview". https://techraptor.net/gaming/previews/kerbal-space-program-2-preview. Preview (excerpt). Medium.
- [S54] KSP Forum, "My feedback/suggestion on the 0.2.0 For Science! update". https://forum.kerbalspaceprogram.com/topic/222938-my-feedback-suggestion-on-the-020-for-science-update-for-ksp2. Player thread (excerpt). Medium.
- [S55] KSP Forum, "LCD Launch Countdown" mod. https://forum.kerbalspaceprogram.com/topic/39470-112x-lcd-launch-countdown-v180-23-oct-2019. Mod thread (excerpt). Medium.
- [S56] KSP Wiki, "Debris" (Internet Archive snapshot). https://web.archive.org/web/20240121095445/https://wiki.kerbalspaceprogram.com/wiki/Debris. High.
- [S57] KSP Wiki, "Key bindings" (archive). https://web.archive.org/web/20240105022508/https://wiki.kerbalspaceprogram.com/wiki/Key_Bindings. High.
- [S58] KSP Wiki, "Settings" (archive, 1.4). https://web.archive.org/web/20240105230555/https://wiki.kerbalspaceprogram.com/wiki/Settings. High.
- [S59] KSP Wiki, "Heat" (archive). https://web.archive.org/web/20230123203116/https://wiki.kerbalspaceprogram.com/wiki/Heat. High.
- [S60] KSP Wiki, "Extra-Vehicular Activity" (archive). https://web.archive.org/web/20240420190746/https://wiki.kerbalspaceprogram.com/wiki/EVA. High.
- [S61] KSP Wiki, "1.0" and "1.1" changelogs (archive). https://web.archive.org/web/20240106121052/https://wiki.kerbalspaceprogram.com/wiki/1.0 ; https://web.archive.org/web/20240422180507/https://wiki.kerbalspaceprogram.com/wiki/1.1. High.
- [S62] KSP Wiki, "Kerbonaut" (archive). https://web.archive.org/web/20240105030702/https://wiki.kerbalspaceprogram.com/wiki/Kerbonaut. High.

---

## 9. Needs verification

Items marked *(unverified)* above, with where to check:

1. Exact KSP1 flight camera zoom limits, the vessel-switch range (~2.5 km), part-focus menu label, and Tab in map view: https://wiki.kerbalspaceprogram.com/wiki/Camera_view and https://wiki.kerbalspaceprogram.com/wiki/Keys (blocked to fetch; check in a browser).
   - Vessel-switch range (2.5 km) and Tab in map verified [S56][S57]. Still unverified: zoom limits and the part-focus menu label (Camera view page is a stub).
2. KSP1 screenshot *supersize* setting: https://wiki.kerbalspaceprogram.com/wiki/Settings.
   - Corrected: a settings.cfg key, not in the 1.4 menu [S58].
3. Full KSP2 camera mode list and whether IVA was ever shipped: https://forum.kerbalspaceprogram.com/topic/218360-ksp2-keybinds/ (official keybind images).
   - Still unverified: forum blocked.
4. KSP1 stock plume behaviour by pressure, launch smoke, splash particles, Mach-effect thresholds and heat-gauge display: https://wiki.kerbalspaceprogram.com/wiki/1.0 and https://wiki.kerbalspaceprogram.com/wiki/1.2.
   - Heat-gauge display verified [S58][S59]. Still unverified: plume, smoke, splash and Mach thresholds.
5. KSP1 scene-to-music mapping and whether flight music plays only in space: https://pro.imdb.com/title/tt5181240 and game files (`GameData/Squad/Sounds` or the music folder).
   - Still unverified: no source fetched.
6. Whether each KSP1 engine family has a unique sound loop: https://wiki.kerbalspaceprogram.com/wiki/Parts.
   - Still unverified: part pages do not describe sounds.
7. Full KSP1 tutorial list after 1.1 (docking, EVA, plane lessons) and KSPedia topic tree: https://wiki.kerbalspaceprogram.com/wiki/1.1 and https://wiki.kerbalspaceprogram.com/wiki/KSPedia.
   - 1.1 list and Docking lesson verified [S61]; KSPedia added in 1.1. Still unverified: EVA/plane lessons and KSPedia topic tree.
8. Making History tutorial content in the Mission Builder: https://wiki.kerbalspaceprogram.com/wiki/Making_History.
   - Still unverified: the archived MH page names the History Pack missions but no tutorial.
9. KSP2 tutorial lesson names per set and the "Kerbal Space Academy" name (not found): https://kerbal.wiki/Tutorials.
   - Still unverified: kerbal.wiki not re-read.
10. Space.com quote that KSP2's animated tutorials replaced text boxes (URL not confirmed): https://www.space.com/kerbal-space-program-2-early-access-gameplay-trailer.
   - Still unverified: URL not fetched.
11. KSP2 audio-only launch countdown acknowledgement (cross-reference to `refs/reverse-engineering-ksp2/13-ui-ux-patterns.md` [S3]).
   - Still unverified: cross-reference not re-checked.
12. Courage/stupidity mapping to portrait reactions and "Badass" behaviour: https://wiki.kerbalspaceprogram.com/wiki/Kerbal.
   - Verified [S62].
13. Flag plaque text and KSC night lighting/building upgrade visuals: https://wiki.kerbalspaceprogram.com/wiki/Flag.
   - Plaque reading verified [S60]. Still unverified: KSC night lighting and building upgrade visuals.
