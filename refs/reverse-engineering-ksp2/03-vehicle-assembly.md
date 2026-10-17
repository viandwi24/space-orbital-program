# 03 — Vehicle assembly (VAB / SPH / KSP2 VAB)

This document covers how players build vehicles in Kerbal Space Program. KSP1 is the baseline: it had two buildings (the Vehicle Assembly Building, VAB, and the Spaceplane Hangar, SPH) with career-gated limits. KSP2 merged them into one VAB that holds several assemblies at once. The aim is to pull out what an editor needs so that building feels like engineering and not fighting the tool. Orbital already has a 3D VAB with a vessel library, staging, Δv and CoM/CoT, and is planning a single "Hangar" building. Facts are tagged **[KSP1]**, **[KSP2]**, **[KSP2 roadmap — never shipped]** or **[Mod: name]**. KSP2 shipped as Early Access on 24 Feb 2023 and got the "For Science!" update (0.2.0.0) on 19 Dec 2023. Its last patch, 0.2.2.0, came out on 11 June 2024 [S10][S11]. The research brief said April 2024, but both the community wiki and Wikipedia give June 2024. Intercept Games was wound down in mid-2024 [S11].

---

## 1. How it works

### 1.1 Buildings, orientation and limits

| Aspect | KSP1 | KSP2 |
|---|---|---|
| Buildings | Two: the VAB (rockets, built vertically, launched from the Launch Pad) and the SPH (planes, built horizontally, launched from the Runway) [S1] | One VAB for every vehicle [S5][S6]. The launch site is chosen at launch time. |
| Part-count limit | Set by the editor building's level in career: L1 = 30 parts, L2 = 255, L3 = unlimited. L2 costs 225,000 funds and L3 costs 845,000 [S1]. | No career-style part caps. KSP2 had no funds-based career; "Exploration Mode" (0.2.0) gates parts through the tech tree [S11]. |
| Mass / size limit | Set by the launch site's level, not the editor. For example the Runway allows 18 t at the start and 140 t at L2. There are also length and width limits [S2]. | None in the shipped game. |
| Action groups | Gated by editor level. L2 gives the basic groups (Abort, Brakes, Gear, Lights, RCS, SAS, Stage). L3 adds custom groups 1–10 [S1]. | Available from the start. |

**Design note:** in KSP1 the building upgrades are what make the editor part of the career economy. Part count stands in for "engineering capacity" and pad mass stands in for "infrastructure". KSP2 dropped that link along with funds.

### 1.2 Editor tools

**[KSP1] tools.** The toolbar has four gizmos: Place, Offset, Rotate and Re-root. A toggle switches between local and absolute coordinates, and angle snap is on the C key. Offset was added in the 0.90 editor overhaul, and it can push a part inside another part [S4]. That makes clipping a deliberate, accepted technique. There are two symmetry modes: **radial**, the VAB default, from 1× to 8× (count from general player knowledge, not verified this session), and **mirror**, the SPH default; the X key cycles between them. Attachment is either node-to-node (stack) or surface attach, and surface attach can be toggled per part.

**[KSP1] other features:**
- **Subassemblies:** a saved partial craft that you drag in like a part.
- **Craft files:** one human-readable `.craft` text file per vessel, saved separately for VAB and SPH. Players share craft by sending these files.
- **Merge** (Making History, 1.4): imports a whole craft into the current one.
- **Part list:** filters by function, mass, cost, size, manufacturer and resource, plus custom categories the player can define (0.90) [S4]. A search box covers names and tags.
- **Staging editor:** a column of stage stacks that you rearrange by drag-and-drop.
- **Engineer's Report:** a checklist panel covering things like missing crew hatch, no power, no control source and no parachute.
- **Overlays:** toggles for the centre of mass (CoM), centre of lift (CoL) and centre of thrust (CoT).

**[KSP1] Δv.** For years Δv was the job of mods: **[Mod: Kerbal Engineer Redux]** and **[Mod: MechJeb]** both had VAB readouts [S16]. Stock 1.6 ("To Vee or not To Vee", Dec 2018) added per-stage and whole-vessel Δv in the editor through a Δv app, along with burn time and TWR [S3]. Players could choose which body and situation (sea level, altitude, vacuum) to calculate for. Early 1.6 builds reported 0 Δv for some stages. One fix suggested on the forum was cleaning out empty stages left in the staging list [S3].

**[KSP1] tweakables and later additions.** Right-clicking a part in the editor opens its part action window. Its controls include fuel amounts, thrust limiter, gimbal limit, decoupler force and crossfeed toggles, plus variant selection (part textures and shapes, added around 1.4). Procedural **fairings** have been stock since 1.0: you click to build the profile up section by section. **Robotics** (hinges, rotors and servos with a keyframe controller) came with the Breaking Ground DLC in 2019 [S4]. **Autostrut** is a per-part option to strut a part to the heaviest part, the root or the grandparent. Rigid attachment is another per-part toggle. Both exist mainly as workarounds for joint wobble.

**[KSP2] the new model.** These features shipped in Early Access, per the pre-release notes [S5]:
- **Workspaces.** One save file holds several separate **assemblies** at the same time. The intent is that a workspace is a snapshot of an engineering project, not a single vehicle. The vehicle name, which shows in the Tracking Station, is separate from the workspace file name [S5][S6].
- **Launch Assembly tool.** It marks which assembly in the workspace goes to the pad or runway when you press Launch [S5].
- **Part Anchor tool.** It sets an assembly's root part, the replacement for re-root [S5].
- **Procedural wings.** There are three types: wings, stabilisers and all-moving control surfaces. A wrench icon opens a shape editor, which also has a toggle for an integrated control surface. You build compound wings by joining several wings end to end [S5]. Version 0.1.3.0 (June 2023) added a "multijoint" array of four joints along the wing root to reduce flex [S8].
- **Procedural fairings** with an editor button and a length slider. Several bugs in these were fixed in 0.1.3.0 [S8].
- **Paint.** Each part has a base colour and an accent colour, and a transparency slider can hide either one [S5]. The community project **[Mod: KSP2 Redux]** later added base/accent swap, an eyedropper, saved presets and hex input [S12]. That suggests stock painting was too basic.
- **Parts Manager.** This is the KSP2 version of the part action window list: one panel that lists every part and its settings. It could be opened for subassemblies from 0.1.2.0 [S7].
- **Engineer's Report and Δv/TWR per stage.** The staging stack shows each stage's Δv and TWR, with a body and situation selector. Δv numbers that disagreed with each other, or changed between the VAB, launch and reloads, were a running complaint on the forums. Some players went back to working Δv out by hand for asparagus stacks [S14][S7]. Redux added a "likely viable" icon to the Engineer's Report [S12], which again suggests the stock report was not enough.
- **Camera.** The VAB camera is a free orbit with a blueprint-style backdrop. I could not confirm a separate "blueprint mode" toggle as a feature, so treat that as uncertain.

**[KSP2 roadmap — never shipped].** The Steam page listed "new flight planning tools for the VAB" for 1.0 [S17]. Colony and orbital-VAB construction was promised for the Colonies milestone. Neither shipped [S11].

### 1.3 Part catalogue and counts

- **[KSP1]:** about 380 stock parts once both DLCs are included. I did not verify that figure against a source this session, so treat it as approximate. Categories: Pods, Fuel Tanks, Engines, Command & Control, Structural, Coupling, Payload, Aerodynamics, Ground, Thermal, Electrical, Communication, Science, Cargo, Utility, Robotics.
- **[KSP2]:** I found no reliable public count of stock parts for 0.2.2. For Science! added 9 science parts and a 4-tier tech tree [S11]. KSP2's categories are close to KSP1's, with fewer per-manufacturer filters.

### 1.4 Formulas the editor shows (public and standard)

- Δv per stage = Isp · g0 · ln(m_wet / m_dry), with g0 = 9.80665 m/s². When engines run in parallel, Isp is the thrust-weighted harmonic mean (Σ F / Σ(F / Isp)).
- TWR = F / (m · g_body), where g_body depends on the body and situation selected.
- Isp changes with ambient pressure: there are sea-level and vacuum values with an atmosphere curve between them. That is why the situation selector matters.

---

## 2. Player experience

- **KSP1:** building is very tactile. The build loop is tight: place, look at Δv, launch, revert. It is the core loop that Orbital's spec already names. Clipping with Offset and the "strut everything" habit are part of the culture. Two buildings make you decide early whether you are building a plane or a rocket. That is easy to learn but awkward for mixed vehicles, such as a spaceplane on a rocket or a lander built in the SPH.
- **KSP2:** people liked having several assemblies at once. You can build a lander next to the launcher and then attach it, or keep variants side by side. Procedural wings remove a lot of part spam. Paint gave players a way to express themselves, which KSP1 never had. Early Access also had problems: Δv readouts the players did not trust, staging order that broke on revert [S7], parts landing on the VAB floor when a craft loaded, and duplicated wings or decouplers falling apart at launch. Those last two were still being fixed in 0.2.2 [S10]. Players also said some KSP1 VAB information was missing [S15].

---

## 3. Interactions with other systems

- **02-space-center-and-buildings.md:** building levels control part count, mass and action groups in KSP1. In KSP2 the single VAB took over the job of the SPH.
- **05-science-and-research.md:** the tech tree decides which parts appear in the catalogue. KSP1 also shows a part's entry cost and "purchase" step.
- **07-economy-and-career.md:** in KSP1 every part has a cost, the editor shows vessel cost, and recovery pays back a share of it. KSP2 had no funds.
- **04-flight-and-controls.md:** staging, action groups and the tweakables set in the editor become the flight controls. Revert-to-VAB closes the loop. KSP2 workspaces revert to the workspace with all its assemblies.
- **08-crew.md:** crew assignment happens at launch (KSP1 has a crew tab in the editor). Seat count comes from the parts.
- **11-colonies-resources-interstellar.md:** KSP2 planned to build vehicles in colonies and orbital yards. It never shipped.
- **12-modding.md:** the editor is one of the most modded areas. Examples: **[Mod: Kerbal Engineer Redux]** and **[Mod: MechJeb]** for Δv [S16], procedural parts, part-tweak extensions, and KSP2 painting and Engineer's Report improvements through Redux [S12].
- **13-ui-ux-patterns.md:** gizmos, the part catalogue, the staging stack and right-click windows.

---

## 4. Known problems and criticism

1. **Wobble, the "noodle rocket".** In KSP1, joints between stacked parts flex. Autostrut and rigid attachment are band-aids that players have to know about. **[KSP2]** inherited the problem and early builds were worse. The developers said they adjusted inertia tensors and added extra joints to over-flexible areas. A later "enhanced joint" fix, similar to autostrut and with settings options, was aimed at For Science! [S9]. The community was split between people who wanted wobble gone and people who found KSP1's autostrut too simplistic [S9].
2. **Performance with many parts.** Both games run physics joints per part, so the CPU cost grows with part count. The KSP2 developers acknowledged that joint physics is CPU-bound and that part counts would grow in later milestones [S9]. This is one reason procedural wings and fairings matter: they replace dozens of parts with one.
3. **Untrustworthy Δv.** KSP1 1.6.0 had zero-Δv stages [S3]. KSP2 values changed between the editor and flight, and asparagus staging gave inconsistent numbers [S14]. If the number is wrong, the player cannot plan.
4. **Staging order bugs** on revert and when switching assemblies (KSP2 0.1.2) [S7], and stages that were hard to reorder in the extended stack (fixed in 0.2.2) [S10].
5. **Two buildings in KSP1** make hybrid craft awkward, and craft files are tied to one building.
6. **Gizmo precision.** Offset and rotate have no numeric input in stock KSP1. Mods such as Editor Extensions filled that gap (from general community knowledge, not cited).
7. **Missing information in KSP2** compared with KSP1 plus mods, and too few painting tools [S15][S12].

---

## 5. Implications for Orbital

Orbital's Hangar is planned as one building, with a 10-category part rail, a blueprint grid, CoM/CoT markers, stats (mass, parts, height, Δv, TWR, cost), per-stage Δv, pre-flight checks, Place/Move/Rotate/Re-root/Staging tools, ×1–×6 symmetry and undo/redo (SCREENS.md W1). It also has a Launch screen for choosing Launchpad or Runway (W2).

1. **Adopt: one building, with the launch site chosen at launch.** This is KSP2's best structural decision, and it matches Orbital's Hangar and Launch screen. Filter the vessel library by "fits this site" instead of "built in this building".
2. **Improve: multi-assembly workspaces, kept explicit.** Let the Hangar hold several assemblies, with a visible "Launch assembly" marker on one of them. Make the workspace file different from vessel designs: a vessel library entry is one assembly, and a workspace is a project. That avoids KSP2's confusion between vehicle name and workspace name [S6].
3. **Adopt: a body and situation selector for per-stage Δv and TWR,** covering sea level, any altitude and vacuum on any registered body, including bodies added by mods (the trip planner already lists mod bodies). Recompute the numbers live from the same simulation code the flight uses, never a separate estimate, so the editor and flight numbers are the same by construction. Add a regression test for the asparagus and crossfeed cases that broke KSP2 [S14].
4. **Improve: show the Δv formula's inputs on hover:** wet mass, dry mass, mixed Isp, and burn time per stage. Players who feel like engineers want to see why a number is what it is, not just the number.
5. **Adopt: procedural wings and fairings as first-class SDK parts.** For example a `definePart` with `shape: procedural` parameters that the module reads for lift and mass. One procedural wing replaces many parts, which helps part-count performance in a browser.
6. **Avoid: per-part joint wobble as the default.** Orbital simulates the vessel as one rigid compound body (ADR 0018), and that is the right default. If structural flex is ever added, make it an opt-in difficulty setting and never require strut micromanagement.
7. **Adopt: numeric precision in gizmos.** Typed offset and rotation values, plus angle-snap steps of 5°, 15° and 45°. These are the KSP1 mod features players kept installing.
8. **Improve: Engineer's Report as pre-flight checks with a verdict.** Orbital's "pre-flight checks" should lead with a single go / caution / no-go verdict (the Redux idea [S12]). Each check should link to the part, so clicking "no power" highlights the probe core. Mods can register checks through the SDK, for example `contributes.preflightChecks`.
9. **Adopt: subassemblies and merge** in the vessel library: save a selection as a reusable part group, and import a whole design into the current one.
10. **Improve: career limits as engineering capacity, not hard walls.** If the Hangar has levels, scale the part-count and mass caps by level as KSP1 did [S1][S2], but show the cap and the upgrade cost in the stats strip. That makes it an "investor" decision: upgrading the pad lets you fly heavier rockets.
11. **Adopt: paint with two colours plus presets and an eyedropper** from the start. It is cheap, and players clearly wanted it [S12]. Expose the palette to mod parts, which already declare a `palette`.
12. **Avoid: separate craft files per building, and binary or opaque save formats.** Keep vessels as plain JSON that can be shared (Orbital already does). Add a "copy as link" share option, since it is a browser game.
13. **Improve: a part-count performance budget.** Show a soft "complex vessel" indicator based on measured frame cost instead of a hidden hard cap. Mobile and low-end browsers need it more than desktop KSP did.
14. **Adopt: overlays for CoM, CoT and CoL,** plus a dry-CoM ghost that shows the CoM after the fuel is spent. A CoM that moves during flight is a common reason planes become unstable. Orbital already computes lift for its stability read-out.

---

## Sources

- [S1] Vehicle Assembly Building — KSP Wiki (official community wiki), https://wiki.kerbalspaceprogram.com/wiki/VAB — checked 2026-10-17. Direct fetch was blocked by bot protection, so the content comes from search excerpts. Reliable for KSP1 career numbers.
- [S2] Kerbal Space Center — KSP Wiki, https://wiki.kerbalspaceprogram.com/wiki/KSC — checked 2026-10-17. Facility upgrade table, from search excerpts. Reliable, but the version is not stated.
- [S3] "Kerbal Space Program 1.6: To Vee or not To Vee is now available" — official news, https://kerbalspaceprogram.com/news/1-6-to-vee-or-not-to-vee-is-now-available — checked 2026-10-17, together with forum thread 182245 on the 1.6 Δv glitch. Official source plus community troubleshooting.
- [S4] Kerbal Space Program — Wikipedia, https://en.wikipedia.org/wiki/Kerbal_Space_Program — checked 2026-10-17. Secondary source for version dates and the 0.90 editor overhaul.
- [S5] "Kerbal Space Program 2 Pre-Release Notes" — official KSP forum, https://forum.kerbalspaceprogram.com/topic/212081-kerbal-space-program-2-pre-release-notes — checked 2026-10-17. Official feature description of KSP2 EA. Fetch returned 403, so the content comes from search excerpts.
- [S6] "Workspaces" — KSP forum thread 214050, https://forum.kerbalspaceprogram.com/topic/214050-workspaces — checked 2026-10-17. Mixes official wording and community discussion.
- [S7] 0.1.2.0 — kerbal.wiki (KSP2 community wiki), https://kerbal.wiki/0.1.2.0 — checked 2026-10-17. A transcription of the official patch notes. Reliable.
- [S8] "KSP2 v0.1.3.0 Patch Notes" (mirror), https://ui.lemm.ee/post/263724 — checked 2026-10-17. A mirror of the official notes, from search excerpts. Moderately reliable.
- [S9] "Bug status 10/23" and "Please no wobble" — KSP forum, https://forum.kerbalspaceprogram.com/topic/220179-bug-status-1023 and https://forum.kerbalspaceprogram.com/topic/214159-please-no-wobble — checked 2026-10-17. Developer posts and community reaction, from search excerpts.
- [S10] 0.2.2.0 — kerbal.wiki, https://kerbal.wiki/0.2.2.0 — checked 2026-10-17. The last KSP2 patch (11 June 2024). Reliable transcription.
- [S11] Kerbal Space Program 2 — Wikipedia, https://en.wikipedia.org/wiki/Kerbal_Space_Program_2 — checked 2026-10-17, together with the kerbal.wiki For Science! page (https://kerbal.wiki/For_Science!) for the 9 science parts and the 4-tier tree. Secondary sources; good for timeline.
- [S12] Redux: New features — kerbal.wiki, https://kerbal.wiki/Redux:New_features — checked 2026-10-17. A community fan project, last edited Sept 2025. Shows what players felt was missing; not stock.
- [S14] "Asparagus staging help" — KSP forum thread 222457, https://forum.kerbalspaceprogram.com/topic/222457-asparagus-staging-help — checked 2026-10-17. Community reports of inconsistent KSP2 Δv. Anecdotal.
- [S15] KSP2 Steam discussion on the UI, https://steamcommunity.com/app/954850/discussions/0/3772365358797995618 — checked 2026-10-17. Player opinions. Anecdotal.
- [S16] PCGamesN "Best Kerbal Space Program mods" and RP-1 wiki "Extra Mods to Consider", https://www.pcgamesn.com/kerbal-space-program/ksp-mods and https://github.com/KSP-RO/RP-1/wiki/Extra-Mods-to-Consider — checked 2026-10-17. Secondary mod descriptions. Fair.

- [S17] Kerbal Space Program 2 — Steam store page (developer FAQ and roadmap), https://store.steampowered.com/app/954850/Kerbal_Space_Program_2/ — checked 2026-10-17. Official, from search excerpts.

(S13 is unused.)
