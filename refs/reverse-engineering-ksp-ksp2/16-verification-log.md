# 16. Verification log (2026-10-18)

A verification pass over docs 01–04 and 07–14. The live KSP wiki shows a bot check, so every check used **Internet Archive snapshots** of wiki.kerbalspaceprogram.com (2022–2024 captures). The kOS docs and the KSP2 Steam news API were also used. No bot checks were bypassed and no game files were downloaded. Each doc now carries the archive URLs in its own source list. Tags in the docs:

- *(verified 2026-10-18: [Sx])*: the source confirms the claim.
- *(corrected 2026-10-18: [Sx])*: the text was wrong and has been rewritten.
- *(still unverified …)*: not settled. The doc's "Needs verification" entry says why.

Docs 01–04 had no "Needs verification" section, so this pass added one to each.

**Tag counts after the pass** (inline tags plus Needs-verification notes):

| Doc | Verified | Corrected | Still unverified |
|---|---|---|---|
| 01 | 4 | 1 | 27 |
| 02 | 4 | 0 | 35 |
| 03 | 4 | 0 | 52 |
| 04 | 1 | 0 | 14 |
| 07 | 28 | 6 | 86 |
| 08 | 17 | 3 | 45 |
| 09 | 17 | 15 | 34 |
| 10 | 3 | 1 | 18 |
| 11 | 19 | 3 | 41 |
| 12 | 15 | 9 | 22 |
| 13 | 7 | 1 | 39 |
| 14 | 3 | 2 | 23 |
| **Total** | **122** | **41** | **≈436** |

## Corrections that matter for design

1. **Unloaded-vessel deletion.** The rule depends on pressure: a vessel beyond 2.5 km that sits in air above about **0.1 atm** is removed. On Kerbin that is about **23 km**, so our brief's "about 23 km" is right. Doc 07's "30 km periapsis" was wrong (Debris page).
2. **Camera reset is ` (back quote), not Backspace.** In KSP1, Backspace fires the abort group. ` also resets the map focus (Key bindings).
3. **The board key is B; F grabs ladders and handholds.** The old Ladder page still says F (EVA page, key table).
4. **Helmet O dates from 1.6 and parachute P from 1.4.0**, not 1.11 and 1.7. The Kerbonaut page gives 1.5 for the parachute.
5. **Difficulty presets.** Auto-hire is **on** for Easy and Normal. Allow Stock Vessels is on for **Easy only**. Reputation rewards are 200/100/90/60 %. Starting funds range 0–500k and starting reputation ±1,000.
6. **"Max Persistent Debris" is a main-menu Setting** (default 250, range 0 to unlimited), not a difficulty option.
7. **Solar panels.** The OX-10/SP-10 class gives **8.25 EC/s**, not about 7.
8. **EVA Propellant density is 5 kg/u** (since 1.11), not about 4. Monopropellant is 4 kg/u and IntakeAir 5 kg/u.
9. **Jet speed bands.** The Whiplash peaks near Mach 3 and the RAPIER near Mach 3.75. The doc had Mach 3–4 and Mach 4–5.
10. **SAS history.** SAS was rewritten in **0.21** and reworked in **1.2**, not 1.1. Control-surface deploy (flaps) arrived in **1.0**, not 1.1.
11. **Island Airfield is a launch site** when "Allow other launch sites" (Making History) is on.
12. **Asteroid buttons are "Track" and "Untrack".** Tracking unknown objects needs Tracking Station level 3. The wiki lists no level-1 object cap.
13. **SENTINEL telescope is a science experiment** as well as an asteroid finder.
14. **The tech tree's first tiers were mostly wrong.** Start includes the Flea (not the Hammer), the girder, the EVA jetpack and the personal parachute. Basic Rocketry has the Swivel, Hammer and FL-T100. Tier-2 costs are 15/18/20, not a flat 15. See doc 09 §5.
15. **Breaking Ground names.** Servos are M-06/M-12/M-25/F-12 (there is no M-50). Hinges are G-00/G-11/G-32W plus the alligator hinges G-01L/G-12L.
16. **Making History parts.** MH has no 1.875 m or 3.75 m docking ports and no 5 m heat shield. It adds the Inflatable Airlock and a 1.875 m heat shield.
17. **Scatter collisions.** The 1.4 Settings page says scatter cannot be touched and lists no collision option.
18. **KSP 1.6 is "To Vee or not To Vee"**, not "Breaking Bad". The 1.8 SRBs were four new parts, not a revamp.

Confirmed numbers that matter for design: the recovery formula (0.98 on KSC grounds, about `0.98 − d_km/2150` elsewhere on Kerbin, resources refunded) and the Kerbin warp limits (×5–×50 above 70 km, ×100 above 120 km, ×1,000 above 240 km, ×10,000 above 480 km, ×100,000 above 600 km; physics warp ×2–×4). Also confirmed:

- parachute defaults: main chutes 0.04 atm and 1,000 m, drogues 0.02 atm and 2,500 m; sliders 0.01–0.5 atm and 50–5,000 m; "risky" from about 250 m/s; "when safe" is the default since 1.2;
- RCS block: 1 kN, Isp 240/100; Vernor: 12 kN;
- jetpack: 270 N, 5 units (8 with a cylinder), 600 m/s, lift-off only below 3.2 m/s²;
- batteries: 5 kg per 100 EC; RTG 0.75 EC/s; fuel cells 1.5 and 18 EC/s; Dawn 8.74 EC/s;
- docking port sizes: Jr. 0.625 m, standard 1.25 m, Sr. 2.5 m; sizes do not cross-dock;
- G-LOC option added in 1.2; engineer G-tolerance multipliers 1.0–1.5×; SAS target hold needs pilot level 3;
- Space Center time has passed since 0.21;
- EVA construction carry limit: 60 kg per kerbal, plus 60 kg per helper.

Still open, high priority:

- physics-range table (pack and unpack distances);
- the G-LOC formula and base threshold;
- whether the VAB/SPH or the ESC menu stops UT;
- re-entry heating and abundance values per preset, and the decline penalty;
- KSP2 HUD positions;
- docking capture ranges.

Sources used across docs (Internet Archive, `web.archive.org/web/<timestamp>/https://wiki.kerbalspaceprogram.com/wiki/<page>`): Key_Bindings, Game_Difficulty, Debug_Toolbar, Settings, EVA, Ladder, Kerbal, Kerbonaut, Engineer, EVA_Construction_Mode, EVA_propellant, Time_warp, Kerbin, Duna, Jool, Debris, Recovery, Tracking_Station, Map_view, Maneuver_node, SAS, Camera_view, Vessel, Asteroid, Island_Airfield, Parachute, RV-105, Vernor_Engine, Dawn, Launch_Escape_System, TT18-A, Illuminator_Mk1, Parts, Parts/Electrical, Parts/Thermal, Resource, Monopropellant, Reaction_wheel, Radiator, Antenna, Mobile_Processing_Lab, Convert-O-Tron_250, M700_Survey_Scanner, SENTINEL, Jet_engine, Heat, Strut, Swivel, RAPIER, Docking, Clamp-O-Tron Jr./Sr., Making_History(_parts), Breaking_Ground(_parts), Technology_tree, changelogs 0.21, 1.0, 1.0.5, 1.1, 1.2, 1.4, 1.6, 1.7, 1.8, 1.11, 1.12. Exact snapshot URLs are in each doc's source list.

---

## Doc 01 — time, scenes, persistence

| Item | Result | Source |
|---|---|---|
| Space Center UT advances (0.21) | verified | 01 [S37] |
| VAB/SPH stop UT | still unverified | no source |
| ESC menu / KSC dialogs stop UT | still unverified | no source |
| Warp altitude table (Kerbin) and warp levels | verified | 01 [S38] |
| Stock "Warp To" on orbit (version) | verified 1.0 | 01 [S39] |
| Flying unload 22.5 km | still unverified | forum only |
| Atmospheric deletion cutoff ~23 km / 0.1 atm | corrected (1 % recollection) and verified (23 km brief) | 01 [S40] |
| KSP2 rows (pause key, VAB time, R&D) | still unverified | no KSP2 source |
| Recovery mod names | still unverified | not fetched |

## Doc 02 — VAB/SPH editor

| Item | Result | Source |
|---|---|---|
| 5 m (and 1.875 m) parts in KSP1 DLC | verified (MH) | 02 [S46] |
| Delete key for selected part | verified | 02 [S47] |
| Part search version | verified 1.1 (` key) | 02 [S47] |
| Gear spring/damper limit | verified (1.6 raised to 3) | 02 [S48] |
| KSP2 editor keys, custom categories | still unverified | KSP2 forum blocked |
| Camera pitch limits, snap radius, marker colours, node-size mapping | still unverified | no page |
| Fairing/staging labels, crew tab, thumbnails, merge date | still unverified | no source read |

## Doc 03 — part control and tweakables

| Item | Result | Source |
|---|---|---|
| Probe hibernate version | verified 1.2 | 03 [S37] |
| Parachute min pressure / altitude ranges and defaults | verified (forum 0.75 tip outside wiki range) | 03 [S38] |
| Parachute safe/risky speeds | verified (~250 m/s main, ~2× drogue) | 03 [S38] |
| SAS momentary F | verified | 03 [S39] |
| KSP2 Part Manager equivalents | still unverified | no documentation |
| Advanced-Tweakables split of controls | still unverified | Settings page too vague |
| Wheel modes, invert, brake torque, light blink, flow-lock wording | still unverified | part pages silent |

## Doc 04 — flight HUD

| Item | Result | Source |
|---|---|---|
| SAS selector left of navball | verified | 04 [S26] |
| KSP1 time warp / career gauges top left | still unverified | pages say "above the MET" only |
| KSP2 staging right, warp bar top left, HUD scale range | still unverified | no KSP2 layout source |
| Z-order, window counts, ultrawide, small screens | still unverified | estimates |
| Maneuver drag speed | still unverified | not on page |

## Doc 07 — physics, aero, heat, structure

| Item | Result | Source |
|---|---|---|
| Duna 50 km / 6.755 kPa; Jool 200 km | verified | 07 [S39] |
| F12 aero overlay; F11 thermal overlay; F10 gauges | verified | 07 [S49] |
| Debug Aero labels; cheat labels; autostrut visualisation | verified | 07 [S38] |
| Aerodynamic FX setting | verified ("Aerodynamic FX Quality") | 07 [S37] |
| Radiators/core heat 1.0.5; break at 2.5 kPa | verified | 07 [S41][S51] |
| Exhaust heats parts | verified (pushing still unverified) | 07 [S45] |
| Temperature Gauges setting | verified; bar threshold still unverified | 07 [S37] |
| Autostrut / rigid attachment in 1.2 | verified | 07 [S40] |
| Strut drag / physicsless | verified | 07 [S50] |
| Crash tolerances (tanks 6, Mk1 pod 14, lander can 8, legs 12) | verified | 07 [S53] |
| Max persistent debris | corrected (Settings, default 250) | 07 [S37] |
| Jet speed bands | corrected (Whiplash ~M3, RAPIER ~M3.75) | 07 [S44] |
| RAPIER auto-switch | verified | 07 [S47] |
| Reaction wheel EC per torque | verified | 07 [S52] |
| Swivel gimbal 3° | verified (Vector still unverified) | 07 [S46] |
| SAS rewrite version | corrected (0.21, reworked 1.2) | 07 [S40][S41] |
| Control-surface deploy version | corrected (1.0) | 07 [S41] |
| Wheel repair level | verified (L3 wheels, L2 legs; kits from 1.11) | 07 [S48] |
| Scatter collision option | corrected (none) | 07 [S37] |
| Max physics delta default 0.04 | verified (range, 0.02 s step still unverified) | 07 [S37] |
| Atmospheric deletion rule | corrected (pressure, ~23 km) | 07 [S42] |
| Warp refused under acceleration | verified | 07 [S43] |
| Physics-range pack/unpack values | still unverified | no primary table |
| G-LOC formula; G kills | still unverified | no page |
| Re-entry heating slider range | still unverified | not on archived page |
| Curve names, body lift config, deflection range, shock term, Mk-series 2400 K | still unverified | pages not fetched / silent |
| KSP2 items (HUD, joints, heating feel, SAS wobble, aero model) | still unverified | no KSP2 source |

## Doc 08 — navigation, map, vessel management

| Item | Result | Source |
|---|---|---|
| Recovery formula (0.98, −d/2150) | verified | 08 [S51] |
| Recover button conditions | verified | 08 [S51] |
| Warp To on orbit (1.0) | verified (marker wording still unverified) | 08 [S43] |
| Node delete control; node chaining | verified | 08 [S44] |
| SAS target hold level | verified (pilot L3 / top probes) | 08 [S45] |
| Tracking Station L1 object cap | corrected (none listed; asteroids need L3) | 08 [S46] |
| Fly/Recover/Terminate wording; no off-Kerbin recovery | verified | 08 [S46][S47] |
| Asteroid classes A–E; button wording | verified / corrected (Track/Untrack) | 08 [S46][S48] |
| Nine vessel types; rename via Rename Vessel or "i" panel | verified | 08 [S49] |
| Debris naming | verified | 08 [S47] |
| Max persistent debris 250 | verified | 08 [S50] |
| Terminate kills crew | verified | 08 [S46][S47] |
| Island Airfield not a launch site | corrected | 08 [S52] |
| V cycle includes Locked | verified | 08 [S53] |
| Orbit colours, intercept labels, filter list, double-click, drag speed, Maneuver Mode steps, capture ranges, alarm types, waypoints, MechJeb, rendezvous rule, gizmo version | still unverified | not on archived pages / forum blocked |

## Doc 09 — parts catalogue

| Item | Result | Source |
|---|---|---|
| RCS block 1 kN, Isp 240/100; Vernor 12 kN 0.08 t | verified | 09 [S21] |
| Dawn 8.74 EC/s | verified | 09 [S21] |
| Jet thrust 20–360 kN | verified | 09 [S24] |
| LES mass | verified (0.90 dry / 1.13 wet) | 09 [S21] |
| KV pods built-in ablator | verified (20 Ab) | 09 [S23] |
| Engine plates 1.25–5 m; MH tubes | verified | 09 [S23] |
| MH docking ports 1.875/3.75 m | corrected (none; Inflatable Airlock) | 09 [S22][S23] |
| MH heat shields 1.875 and 5 m | corrected (1.875 only) | 09 [S23][S25] |
| MH engines attribution | verified | 09 [S23] |
| Launch clamp EC | verified 1.0 EC/s | 09 [S21] |
| Fourth landing leg; LY-60 | corrected / verified | 09 [S21] |
| Light 0.04 EC/s | verified | 09 [S21] |
| IntakeAir 5 kg/u | verified | 09 [S26] |
| EVA Propellant density | corrected (5 kg/u) | 09 [S26] |
| Drain version | corrected (1.9) | 09 [S26] |
| BG hinge and servo names | corrected | 09 [S27] |
| BG rotors, blades, ducted fans | verified | 09 [S27] |
| Tech tree tiers 0–2 | corrected | 09 [S28] |
| Engine vacuum thrust (full table), module names, fairing panels, EVA chute base/MH, KSP2 colonies, our code | still unverified | not fetched / out of scope |

## Doc 10 — EVA and kerbals

| Item | Result | Source |
|---|---|---|
| Board key | corrected (B; F grabs) | 10 [S52][S53] |
| Jetpack 270 N, 3.2 m/s², 5/8 units, 600 m/s | verified (wiki figures) | 10 [S52] |
| EVA construction mass limit | verified | 10 [S56] |
| Engineer G multipliers; G option in 1.2 | verified | 10 [S55][S56] |
| G-LOC formula | still unverified | no page |
| Portrait EVA wording, airlock rule, KSP1 warp for EVA, CLS path rule | still unverified | no source |
| Respawn timer, BG deploy multipliers, name tables, gender ratio | still unverified | forum blocked |
| Parachute arrival version | still unverified (1.4.0 key table vs 1.5 Kerbonaut) | 10 [S52][S54] |
| KSP2 EVA items | still unverified | no KSP2 source |

## Doc 11 — resources, power, ISRU

| Item | Result | Source |
|---|---|---|
| OX-STAT 0.35, 1x6 1.64, RTG 0.75, fuel cells 1.5/18 | verified | 11 [S20] |
| OX-10 class output | corrected (8.25 EC/s) | 11 [S20] |
| Battery masses | verified (5 kg / 100 EC) | 11 [S20] |
| Dawn 8.74, lights 0.04 | verified | 11 [S21] |
| MPL 5 EC/s, 500 science store, 750 data | verified | 11 [S22] |
| Reaction-wheel EC | verified | 11 [S23] |
| Communotron 16 6 EC/Mit | verified | 11 [S24] |
| Monoprop STAGE_PRIORITY_FLOW; ore 10 kg/u | verified | 11 [S25] |
| No stock dump | corrected (drainable since 1.9) | 11 [S25] |
| M700 band and survey science | verified | 11 [S26] |
| Convert-O-Tron 250 ratios, no xenon | verified | 11 [S27] |
| Radiator kW and EC draw | verified | 11 [S28] |
| SENTINEL not a science experiment | corrected | 11 [S29] |
| Probe-core draws, solar config fields, shadows, warp EC, ore tanks, drill core max temp, CoT 125, Magnetometer origin, BG power, KSP2, mods, our code | still unverified | not fetched / forum blocked |

## Doc 12 — settings, difficulty, keys

| Item | Result | Source |
|---|---|---|
| Mod+F10 load dialog | verified | 12 [S31] |
| Alt+F2 debug console | still unverified | not in key table |
| Brakes toggle Mod+B | corrected (no stock toggle) | 12 [S31] |
| Camera reset key | corrected (`) | 12 [S31] |
| Map focus reset | corrected (`) | 12 [S31] |
| Maneuver editor / keys | corrected (editor in 1.7); no keys verified | 12 [S31][S36] |
| Helmet O version | corrected (1.6) | 12 [S31][S40] |
| Parachute P version | corrected (1.4.0; Kerbonaut says 1.5) | 12 [S31][S35] |
| Allow Stock Vessels per preset | corrected (Easy only) | 12 [S32] |
| Auto-hire default | corrected (on for Easy/Normal) | 12 [S32] |
| Entry purchase per preset, ranges, reputation rewards | verified | 12 [S32] |
| Decline penalty; heating/abundance/Advanced per preset | still unverified | not on archived page |
| Island Airfield as MH launch site | verified | 12 [S38][S39] |
| Debug cheats, Set Position, funds/science/rep UI, Physics and Kerbals tabs | verified / corrected | 12 [S33] |
| Set Vessel Situation, Contracts detail | still unverified | not on page |
| Full SAS in Sandbox key | still unverified (setting exists, 1.6) | 12 [S40] |
| EVA construction limit | verified | 12 [S37][S41] |
| KSPedia version | verified 1.1 | 12 [S36] |
| Training list | partly verified (1.1 list) | 12 [S36] |
| Per-widget UI scale names, Workshop/MH missions, KSP2 settings, PC data, DLC keys, re-entry range | still unverified | not fetched |

## Doc 13 — camera, visuals, audio, onboarding

| Item | Result | Source |
|---|---|---|
| Vessel-switch range 2.5 km | verified | 13 [S56] |
| Tab / ` in map | verified | 13 [S57] |
| Screenshot supersize in Settings | corrected (cfg key only) | 13 [S58] |
| Heat gauge behaviour | verified | 13 [S58][S59] |
| F3 flight log | verified | 13 [S57] |
| Flag plaque | verified | 13 [S60] |
| Docking tutorial (1.0/1.1) | verified; EVA/plane lessons still unverified | 13 [S61] |
| Courage/stupidity/BadS mapping | verified | 13 [S62] |
| Zoom limits, aim-camera label, plumes, music, engine sounds, KSC night, KSP2 items, MH tutorials | still unverified | no source |

## Doc 14 — DLC and late updates

| Item | Result | Source |
|---|---|---|
| 1.6 name | corrected ("To Vee or not To Vee") | 14 [S40] |
| 1.6 Δv details | partly verified; per-body still unverified | 14 [S40] |
| 1.8 SRB revamp | corrected (four new SRBs) | 14 [S41] |
| 1.12 date | verified 24 Jun 2021 | 14 [S42] |
| MH vintage suits | verified | 14 [S43] |
| ROC acronym | still unverified | not in BG pages |
| BG blade version, role effects, seismometer, robotics problems, KSP2 items, SOP plans | still unverified | forum blocked / out of scope |
