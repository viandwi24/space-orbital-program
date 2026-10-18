# 17 — Master system catalogue and public-release scope

One list of every player-facing system that KSP1 (with DLCs) and KSP2 offer. Each row shows our status and a release priority. It is built from the launch checklists in docs 01–04 and 07–14 and the inventories 05, 15 and 15a–15d.

Numbers inside the referenced docs may still change in the verification pass (16-verification-log.md). The priorities here do not depend on those numbers.

**Priorities**
- **P0**: blocks the public release. Without it, a KSP player calls the game broken or empty.
- **P1**: expected soon after release, in the first updates.
- **P2**: later.

**Status**
- ✅ have
- ⚠️ partial
- ❌ missing
- ★ beyond KSP (keep it)

The **Doc** column names the evidence: 01–14 are research, 05/15 the inventories.

## A. World, time and screens

| System | Ours | Prio | Doc |
|---|---|---|---|
| One world clock that never loses time across screens (save on leave or one sim) | ❌ | **P0** | 01, 05 #1, 15 #2 |
| Pause/warp control on every in-world screen (Base time bar) | ❌ flight only | **P0** | 01, 05 #2, 05 #8 |
| Non-modal pause with an indicator | ❌ | **P0** | 05 #8 |
| Warp-to and alarms that stop warp | ⚠️ Mission Center upcoming only | **P0** (user alarms) | 08 §4.3, 14 §6.6 |
| Physics warp ×2–×4 | ❌ | P1 | 07, 12 |
| Tab-hidden policy (pause or keep running, explicit) | ⚠️ implicit | **P0** | 12 §6.4, rancangan §2.5 |
| Two tabs on one world | ❌ | P1 | rancangan §2.8 |
| Real-date catch-up (Sol) | ★ ✅ | — | ADR 0103 |

## B. Building (Hangar)

| System | Ours | Prio | Doc |
|---|---|---|---|
| Part-on-cursor carry, node snap, drop to delete | ⚠️ | **P0** | 02 §15 |
| Pick up a subtree, loose parts, Alt-copy | ⚠️ | **P0** | 02 |
| Symmetry 1–8, mirror, inherited by children | ⚠️ 1–6 radial | **P0** | 02 |
| Rotate keys, angle snap C | ⚠️ | **P0** | 02 |
| Turntable camera (wheel = height) | ⚠️ | **P0** | 02 |
| Per-part inspector in editor (fuel fill, thrust limit, chute settings, staging toggle) | ❌ | **P0** | 02, 03 |
| Staging editor, Δv/TWR per stage with body and situation | ⚠️ no body picker | **P0** | 02, 08 |
| Action group editor | ❌ | **P0** | 02, 05 #6 |
| Offset/rotate gizmos with typed values, re-root, part tree | ❌ sliders | P1 | 02 |
| CoM/CoL/CoT, pre-flight report, power budget | ⚠️ no power budget | **P0** (power) | 02, 11 |
| Subassemblies, merge, thumbnails, craft file export/import | ⚠️ | P1 | 02, 12 |
| Procedural fairings | ❌ | **P0** | 09, 14 |
| Procedural tanks/wings | ❌ | P2 | 02 |
| Crew assignment in the Hangar | ❌ launch screen only | P1 | 15d B2 |

## C. Parts and resources

| System | Ours | Prio | Doc |
|---|---|---|---|
| Parachutes (main, radial, drogue; safety state; staging; EVA repack) | ❌ | **P0** | 07, 09, 03 |
| RCS thrusters + monopropellant (tanks, pod reserve) | ❌ | **P0** | 07, 09 |
| Batteries (2–3 sizes) | ❌ | **P0** | 09, 11 |
| Docking ports (3 sizes) and vessel merge/undock | ❌ | **P0** | 08, 09, 14 |
| Vacuum upper-stage engine | ❌ | **P0** | 09 |
| True solid boosters (no throttle, thrust limiter, sizes) | ❌ booster is LF/Ox | **P0** | 07, 09, 15a |
| Launch clamps | ❌ | **P0** | 09, 15a |
| 2.5 m size class (tanks, engines, adapters, decoupler, cone, shield) | ❌ | **P0** | 09 |
| Basic science parts à la Goo / Materials Bay | ❌ | **P0** | 09 |
| Solar panels: sun angle, distance, body shadow; radial and large tracking panels | ⚠️ constant | **P0** | 11 |
| RTG | ❌ | **P0** | 11 |
| Transmission costs EC and time | ❌ instant | **P0** | 11, 15d A4 |
| Lights, ladders, multi-seat pods, lander can, cockpit, crew cabin | ❌ | P1 | 09, 10 |
| Jets and intakes, multimode engine, wheel motors | ❌ | P1 | 07, 09, 15 #15 |
| Nuclear engine, lander engines, separatrons, airbrakes, cargo/service bays, relay antennas | ❌ | P1 | 09 |
| Engine thrust limiter, gimbal lock/limit, independent throttle | ❌ on/off | **P0** (limiter) / P1 | 03, 05 #4 |
| Tank transfer, flow lock, flow priority, rates and time-to-empty | ❌ | **P0** | 03, 11 |
| Vessel drill/converter, ore tanks, scanners, radiators, fuel cells, labs | ❌ | P2 | 11 |
| Robotics, deployed science, surface features | ❌ | P2 | 14 |
| Life support (simple/full), flotation collar, data drive | ★ ✅ | — | 11, 15d |

## D. Flight model

| System | Ours | Prio | Doc |
|---|---|---|---|
| Fixed step 50 Hz, floating origin, rails, physics range | ✅ | — | 07, 15a |
| Mach/transonic drag, per-body atmosphere temperature curves | ❌ isothermal | **P0** | 07 §9.4, 15a |
| Body lift | ❌ | P1 | 07 |
| Parachute aero (deploy pressure/altitude, semi/full) | ❌ | **P0** | 07 |
| Reentry heating (skin) | ✅ | — | 15a §2 |
| Internal temperature, conduction, heating on rails | ❌ | P1 | 07 |
| Reentry heating % difficulty | ❌ | **P0** | 12 §6.2 |
| Crash tolerance and explosions | ✅ | — | 15a §3 |
| Part-to-part/vessel collision damage | ❌ | P1 | 15a |
| Joint flex/overstress (optional) | ❌ by design | P2 | 07, ADR 0018 |
| G-limits for parts; G-LOC takes control | ⚠️ crew G only, no control loss | P1 | 07, 10 |
| SAS levels gated by pilot/probe | ❌ | P1 | 03, 15a §6 |
| Wheels and legs with suspension | ❌ | P1 | 07 |
| Buoyancy | ✅ | — | 15a |
| Persistent debris and a debris cap | ⚠️ | P1 | 08, 15c |

## E. Navigation and vessels

| System | Ours | Prio | Doc |
|---|---|---|---|
| Patched conics, SOI, closest approach | ✅ | — | 15c |
| AN/DN markers; Ap/Pe on planned orbit | ❌ | **P0** | 08, 15c |
| Node: gizmo ✅, **numeric editor**, ±orbit, panel per node | ⚠️ | **P0** | 08 §9.2 |
| Warp to node/Ap/Pe/SOI | ⚠️ node only | **P0** | 08 |
| Targeting, rendezvous aids | ✅ | — | 15c |
| Docking alignment/Locked camera | ❌ | **P0** (with docking) | 08, 13 |
| Vessel switching (`[`/`]`, list, map) and flying any vessel | ❌ | **P0** | 08, 15 #3 |
| Recover/terminate/rename from tracking, refund preview, type filters | ❌ | **P0** | 08, 15c |
| Transfer-window view (next window + Δv) | ❌ | **P0** (minimum) | 14 §6.6 |
| Porkchop, atmospheric impact prediction, ground track | ❌ | P2 | 08 |
| Contract waypoints on the navball | ❌ | P1 | 08 |

## F. Vessel control UI and HUD

| System | Ours | Prio | Doc |
|---|---|---|---|
| Vessel panel 340 px resizable, per-part inspector, pin, two-way highlight | ⚠️ 300 px, no inspector | **P0** | 03, 04, 05 |
| Resources tab with transfer | ❌ | **P0** | 03 |
| Action groups editable in flight | ❌ | P1 | 03 |
| HUD region spec, breakpoints, max heights, 10 px floor at all scales | ⚠️ one breakpoint | **P0** | 04 §6.2, 05 §4 |
| Base layout v2 (time bar, menu bar, status bar, notifications) | ❌ | **P0** | refs UI v2 |
| G-meter, Mach/Q readouts, overheat bars | ⚠️ | P1 | 07 |
| Flight log / results (F3) | ❌ | P1 | 12 |

## G. EVA and crew

| System | Ours | Prio | Doc |
|---|---|---|---|
| EVA out/board ✅; board only at hatch/ladder; hatch obstruction | ⚠️ 50 m | **P0** | 10 §8.5 |
| Suit focus and EVA HUD; keys (WASD, run, jump, jetpack translation) | ❌ | **P0** | 10, 15d |
| Jetpack able to leave the Mun (≈150–250 N, translation) | ⚠️ 50 N up only | **P0** | 10 |
| Ladders, grab, climb | ❌ | **P0** | 10 |
| Fall/stun, personal parachute, suit lights, EVA report, flag plaque | ❌ | P1 | 10 |
| Crew portraits driven by state | ❌ | P1 | 10, 13 |
| Professions with effect (pilot SAS, engineer repair, scientist reset) | ⚠️ cosmetic | P1 | 15d B2 |
| Rescue contracts | ❌ | P1 | 10, 15 #19 |
| External command seat | ❌ | P1 | 10 |
| Inventory, EVA construction, helmets, IVA | ❌ | P2 | 10 |
| G-load, life support, radiation, suit radio | ★ ✅ | — | 15d B3 |

## H. Career content

| System | Ours | Prio | Doc |
|---|---|---|---|
| Tech tree depth (10 nodes vs ~60) | ⚠️ | P1 | 15d A7 |
| Contract variety (6 templates; rescue, satellite, station, base, survey missing) | ⚠️ | P1 | 15 #19 |
| Science: choose experiment/result, reset, lab | ⚠️ | P1 | 15d A6 |
| Economy, markets, buildings, missions, milestones, comms tiers, agencies, bases, discovery | ★ ✅ | — | 14 §5 |

## I. Presentation and onboarding

| System | Ours | Prio | Doc |
|---|---|---|---|
| Camera modes (Auto/Free/Orbital/Locked, V), part focus | ❌ | **P0** | 13 §7.4 |
| Hide UI and screenshot | ❌ | **P0** | 12, 13 |
| Plumes, smoke, reentry, explosions, water | ✅ | — | 15b |
| RCS puffs, chute visuals, touchdown dust | ❌ | **P0** (with parts) | 15b |
| Sounds: explosion, decouple, chute, touchdown, RCS, EVA; music set | ❌ | **P0** (sounds), **P0** (minimal music) | 13 §7.4, 15b |
| Lessons past first orbit (landing, nodes, rendezvous/docking, transfer) | ❌ | **P0** | 13, 14 |
| Tooltip system and glossary | ❌ title only | **P0** | 13 |
| Chase/IVA cameras, photo mode, voice, adaptive music | ❌ | P2 | 13 |

## J. Settings, difficulty and keys

| System | Ours | Prio | Doc |
|---|---|---|---|
| Key conflicts with KSP (C, [ ], V, N, digits) settled, or a "KSP classic" profile | ❌ | **P0** | 12 §6.3 |
| Missing keys: R, G, U, B, Backspace, F2, screenshot, stop warp, precision, translation | ❌ | **P0** | 12 |
| Rules: allow revert / quickload, reentry heating % | ❌ | **P0** | 12 §6.2 |
| Rules editable mid-game with a change log | ❌ (`set-rule` has no UI) | P1 | 15 §5 |
| Easy/Normal/Hard bundles | ⚠️ | P1 | 12 |
| UI scale to 200 %, colourblind palette, graphics toggles, frame cap, camera shake, mouse sensitivity | ❌ | P1 | 12 §6.1 |
| Save export/import guarded against browser eviction | ⚠️ check | **P0** | 12 §6.4 |
| Sandbox cheat panel | ❌ | P1 | 12 |
| Gamepad, localisation | ❌ | P2 | 12 |

## K. Release operations

| System | Ours | Prio | Doc |
|---|---|---|---|
| Static build ✅; **sub-path base** (`paths.base`, links via `base`, ephemeris path), `404.html` fallback | ❌ | **P0** (for GitHub Pages) | 15 §7.1 |
| CSP without headers (meta CSP) or a host that sets headers | ❌ | **P0** | 15 §7.1 |
| Global error handler (`hooks.client.ts`, `unhandledrejection`), friendly error card | ⚠️ | **P0** | 15b §2 |
| Deploy job in CI, release tags | ❌ | **P0** | 15b §2 |
| Blocking e2e in more than one engine before release | ⚠️ | P1 | 15b |
| Opt-in crash reporting / privacy page | ❌ | P1 | 15b |
| PWA/offline, ephemeris caching | ❌ | P2 | 15b |
| Human acceptance test (plan 023 step) | pending | **P0** | STATUS |

## Count

- **P0:** about 60 rows. Most are small to medium each. The large ones are:
  - one world clock and the Base layout;
  - parts breadth: parachute, RCS, battery, docking, SRB, clamps, 2.5 m, fairings;
  - vessel switching with docking;
  - the editor carry loop with the inspector;
  - lessons;
  - hosting.
- **P1:** about 40.
- **P2:** about 20.

Already beyond both KSPs (keep and market them): worlds and rules, life support, comms tiers 1–6, markets and economy, AI agencies, off-world bases with ISRU routes, n-body, real solar system with real dates, discovery science, scripting, mod SDK, touch support, high contrast.
