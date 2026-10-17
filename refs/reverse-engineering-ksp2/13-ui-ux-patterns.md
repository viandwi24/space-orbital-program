# 13 — UI/UX patterns across KSP1 and KSP2

**Purpose.** This document lists the main UI/UX patterns in Kerbal Space Program 1 (KSP1, Squad, 2011–2021) and Kerbal Space Program 2 (KSP2, Intercept Games, Early Access 2023–2024), and where players said each one failed them. It covers the flight HUD, app bar, part and resource managers, the editor, onboarding, map view and maneuver nodes, accessibility, console controls and UI performance. It ends with design principles and concrete options for Orbital. Sources are public only: official forums and dev posts, wikis, previews and reviews, and player threads used as evidence of what players said. Facts are tagged **[KSP1]**, **[KSP2]** or **[KSP2 roadmap — never shipped]**. Claims that come from background knowledge and were not re-checked in this pass are marked *(unverified)*.

> **Corrections to the brief.** (a) KSP1 *did* have undo in the editor: Ctrl+Z/Ctrl+Y are listed as present since build 0.08.5 [S12]. The real complaint is that undo was easy to miss and buggy, not that it was missing. (b) No feature called "KSP Academy" turned up. KSP2's onboarding is a **Training Center** with lesson sets [S7][S8]. (c) No public source was found for a KSP2 colourblind mode or a dedicated UI-scale accessibility suite.

---

## 1. Patterns by area

### 1.1 Flight HUD layout

- **[KSP1]** The HUD has the navball bottom-centre, the staging stack on the left, altitude and time-warp at the top, and resources and other tools in apps launched from a corner toolbar. Most information lives in floating windows that the player opens on demand. The default HUD gave no orbital numbers: apoapsis and periapsis appeared only in map view or on hover. This gap is a big reason mods such as Kerbal Engineer Redux and MechJeb became near-mandatory *(unverified as a statistic; widely reported in community threads)*.
- **[KSP2]** The layout was rebuilt in a flatter, "glass-cockpit" style. It shows a navball cluster with throttle and readouts, a staging stack with per-stage Δv, a top-left app bar, and a persistent mission and notification area. An Intercept art-direction post said that in a sim, UI carries an unusually heavy information load. It also reviewed the several distinct stages KSP1's UI went through before setting KSP2's direction [S3]. Players responded mainly about **text legibility** (small, thin fonts at 1080p, pixel-style rendering) and asked for scaling that adapts to resolution [S2][S3].
- **Pain point (both).** Numbers players need all the time (Ap/Pe, time to Ap, TWR, stage Δv) were missing in KSP1 and sometimes illegible in KSP2.

### 1.2 App launcher / app bar

- **[KSP1]** The stock "application launcher" is a strip of icons in a screen corner. Stock apps and mod apps (through its API) put buttons there. It became the standard place for mods to attach, which is a good extension point. It also became cluttered, so the community "Toolbar" mod and later toolbar-control mods grew up to manage overflow *(unverified detail)*.
- **[KSP2]** KSP2 has a stylised app bar for stock tools: Part Manager, Resource Manager, Mission Tracker and others. Community UI mods (for example the "Redux" project) added more App Bar buttons such as a Mission Tracker toggle [S18]. This shows that players expected the bar to be extensible, as KSP1's was.

### 1.3 Part interaction: PAW vs Part Manager

- **[KSP1]** Right-clicking a part opens a **Part Action Window (PAW)**. It is a small floating panel with that part's actions, toggles and resources. It is direct: you click the thing and get its controls. It clutters fast, though: many open PAWs, long lists added by mods, and no overview across parts. Late in KSP1's life, PAWs gained collapsible groups *(unverified version)*. Bugs show how fragile PAW state could be: one confirmed tracker issue reset a fairing setting on *every* undo [S13].
- **[KSP2]** KSP2 adds a **Part Manager**, a docked list of every part with search and grouping, alongside per-part windows. Players criticised its information density: heavy vertical padding meant only about two parts' details fit on screen [S2]. They also said it broke the link between "the part I clicked" and "its controls", and that fuel per tank meant switching to the separate Resource Manager [S2]. Developers publicly listed the same issues: watching many parts at once, the awkward Resource Manager hand-off, and matching a list entry to the physical part [S2]. Some players still liked it for reaching parts buried inside a craft [S2].
- **Lesson.** Direct manipulation (click a part, see its controls) and an overview (all parts and all tanks) are both needed. They have to be **linked**: hover or highlight in both directions, and the same controls in both views.

### 1.4 Resource manager

- **[KSP1]** The Resources app lists totals per resource. Transferring fuel between tanks means opening two PAWs and using in/out buttons. It works, but players have to discover it.
- **[KSP2]** The Resource Manager shows per-tank fill and transfers. Players reported that it showed **no rate of change**, so they could not judge whether time warp was safe [S2]. This is a "numbers first" failure: a level without a rate does not answer the question the player has.

### 1.5 Editor (VAB/SPH vs OAB)

- **[KSP1]** VAB/SPH: a parts palette by category on the left, the craft in the centre, the staging stack on the right, and gizmos for offset and rotate. Symmetry and angle snap are toggled with keys. Undo is Ctrl+Z [S12]. The Δv-per-stage readout came only with **1.6 (Dec 2018)** [S1]. Before that, players used mods or a printed Δv map. Even after 1.6, early readouts were described as "either correct or obviously wrong" [S1]. Out-of-order stage activation could leave empty stage icons that confused the Δv calculation [S1].
- **[KSP2]** KSP2 has one Object Assembly Building (OAB) with multiple assemblies on the workspace, an engineer's report, per-stage Δv and TWR in the stack, and a trip/Δv planner. A vocal group of KSP1 veterans asked for the old editor controls to come back [S5]. Undo had its own bugs; one report showed engine-mount shrouds shrinking after undo [S12]. Players said the multi-assembly workspace and in-editor Δv/TWR were real improvements (preview coverage [S10][S11]).
- **Pain point (both).** Staging is the single most confusing concept for new players. A stage list that disagrees with what the player meant to build ("why did my parachutes fire at launch?") is a classic early-game failure. Δv numbers that are sometimes wrong are worse than none: players stop trusting them [S1].

### 1.6 Onboarding and tutorials

- **[KSP1]** Text-box tutorials ("Wernher" style) were thin. The real onboarding was community YouTube; the official site even promoted Scott Manley's 30-part career tutorial series [S21]. KSP1 also had an educational fork (KerbalEdu) with a better interface and pre-made lessons (see doc 14).
- **[KSP2]** Onboarding was a declared top priority. A developer video with astrophysicist guests introduced a "brand new tutorial system" and interface improvements [S8]. The **Training Center** at KSC holds four lesson sets: *Space Is the Place* (7), *Missing the Ground* (6), *Orbits are Weird* (4) and *Orbital Transfers* (4) [S7]. Reviewers disagreed. A German preview called the guided, fully voiced opening missions a major step up [S11]. TechRaptor found the tutorial section fairly bare-bones [S10]. A hands-on preview called it thorough but dense: the writer had to replay lessons to understand the basics [S9].
- **[KSP2]** A **Mission Tracker** (a persistent objectives panel) and story-like "missions" gave goals outside the tutorials (see 06-missions-contracts-achievements.md).
- **[KSP2 roadmap — never shipped]** Colonies, interstellar travel and multiplayer UIs were never delivered, so their onboarding was never tested.

### 1.7 KSC scene navigation

- **[KSP1]** The Space Center is a 3D diorama. You click buildings to enter them, and building tiers are visible. It is charming but slow, and new players often do not know which building does what (see 02-space-center-and-buildings.md).
- **[KSP2]** The KSC is again a navigable 3D hub with buttons for each building. The Training Center joins it as an entry point for onboarding [S7].

### 1.8 Map view

- **[KSP1]** Orbits are coloured conics. Hovering shows Ap/Pe markers, encounter markers and patched-conic previews. Players praised map view as the place where orbital mechanics "clicks". They criticised focus switching, clutter with many vessels, and having to click markers to read numbers.
- **[KSP2]** Map view has new rendering and better trajectory colours. A developer UI post says the planned-trajectory line colours were changed after feedback [S3]. Map view also has a body/vessel list for focus.

### 1.9 Maneuver node editing

- **[KSP1]** Nodes are placed on the orbit line and dragged with six coloured handles (pro/retro, normal/anti, radial in/out). Late in KSP1's life a precise-entry editor was added so players could fine-tune nodes while focused on another object *(precise version unverified)*. Players said the stock "fine tune" did not let them slide a node along the trajectory [S6].
- **[KSP2]** Nodes model **finite burns**: plans include how the vessel behaves under thrust. This made nodes more physically honest. Players called the mechanics better and the interface poor [S6]. Specific complaints: arrows are hard to grab when focused on the target planet, there are no "next orbit" buttons, and the precise-entry gizmo from late KSP1 was missing [S6]. KSP2 also stopped players planning burns beyond the fuel they carried. Developers said that was a consequence of thrust-aware planning and that they were looking at "aspirational" planning like KSP1's [S6]. The community filled the gap with mods such as Maneuver Node Controller [S6].
- **Lesson.** A planning tool should let players plan what they *cannot yet do* and then show the shortfall clearly. Planning only what is currently feasible stops players exploring.

### 1.10 Notifications and messages

- **[KSP1]** Screen messages appear briefly mid-screen (for example "Cannot deploy while stowed"). They are easy to miss and leave no history. Contract and science results appear in a message app with a blinking icon.
- **[KSP2]** KSP2 has a notification stack with persistent history and mission-tracker updates. The KSP2 team acknowledged that an **audio-only launch countdown** caused accessibility and legibility problems [S3]. This is a small but telling example of status that was not always visible.

### 1.11 Accessibility

- **[KSP1]** A UI-scale slider exists in settings *(unverified exact version)*. The Family Gaming Database lists **zero** documented accessibility features for KSP, and notes only that Windows-wide colour filters work [S17]. Console players reported that text size cannot be changed [S16].
- **[KSP2]** No colourblind mode was found. Players repeatedly asked for larger text and resolution-aware scaling [S2][S3].

### 1.12 Controller support (consoles)

- **[KSP1]** The 2016 PS4/Xbox One ports were criticised for controls. The **Enhanced Edition** (2018) advertised a "completely reworked" UI and new controls [S16]. One reviewer said it was much closer to the PC experience, though still slightly behind [S14]. An Xbox review said it was still far from PC in ease of use [S15].
- **[KSP2]** Console versions were announced but **[KSP2 roadmap — never shipped]** (see doc 14).

### 1.13 UI performance

- **[KSP1]** The Unity IMGUI-era windows and many open PAWs were known frame-time costs. Mod windows add more. *(unverified profiling; widely reported)*
- **[KSP2]** At launch, performance was the main complaint (doc 14 [S20]). The UI was not singled out as the cause, but players cannot judge a UI that stutters.

---

## 2. Player experience (evidence)

- Players asked for a stock Δv readout for years. The long-running "should KSP have a Δv readout?" forum thread reached dozens of pages before 1.6 delivered one and announced it as long requested [S1].
- KSP2 forum feedback concentrated on **legibility, information density and the Part Manager** [S2][S3]. A thread asked for the VAB controls to revert to KSP1's [S5].
- On maneuver nodes, KSP2 drew mixed verdicts: a better model and a worse interface [S6].
- Tutorial verdicts ranged from "major improvement" [S11] to "bare-bones" [S10] and "dense" [S9]. The tutorials helped, but did not replace community video content.
- On consoles, players most often asked for adjustable text size and controller ergonomics [S14][S15][S16].

## 3. Distilled design principles

1. **Numbers the player needs are always visible.** Ap/Pe, time to node, stage Δv/TWR and resource *rates* do not hide behind a click. KSP1 lacked them; KSP2 had some but made them hard to read.
2. **Legibility before style.** Pick font size and contrast first, then the aesthetic. Scale to resolution and DPI by default.
3. **Link direct manipulation to the overview.** Click a part to see its controls, and use the list for every part. Highlighting works in both directions.
4. **Trustworthy numbers or none.** A Δv value that is sometimes wrong is worse than a placeholder that says "unknown".
5. **Plan freely, then show the gap.** Let players plan the impossible and show the shortfall.
6. **Status is persistent.** Messages leave a log. No information is only audio or only a 2-second toast.
7. **Extension points belong to the UI system.** KSP1's launcher API was a success because mods could attach to it, and its clutter was a failure.
8. **Onboarding is layered.** Short guided steps, then a mission tracker, then reference material. Dense, one-time lessons get replayed.

## 4. Interactions with other systems

- 03-vehicle-assembly.md: editor UI, staging stack and the Δv/TWR engineer's report.
- 04-flight-and-controls.md: navball, SAS, time-warp and maneuver-node mechanics behind the HUD.
- 05-science-and-research.md: science/experiment UI and R&D tree browsing.
- 06-missions-contracts-achievements.md: Mission Tracker and contract windows.
- 02-space-center-and-buildings.md: KSC hub navigation.
- 09-communications-network.md: signal/CommNet overlays in map view.
- 10-celestial-bodies-and-world.md: map view, body info panels.
- 12-modding.md: app launcher API, UI mod ecosystem (Toolbar, KER, MechJeb, Maneuver Node Controller).
- 14-strengths-weaknesses-and-player-feedback.md: reception context for these UI decisions.

## 5. Known problems / criticism (summary)

| Area | KSP1 | KSP2 |
|---|---|---|
| Orbital info in HUD | Missing by default; mods needed | Present but small and hard to read [S2][S3] |
| Δv | Absent until 1.6 (2018); early readouts unreliable [S1] | In OAB and staging; trusted more, still buggy in places |
| Part controls | PAW clutter, state bugs [S13] | Part Manager low density, disconnected from the part [S2] |
| Resources | Transfers through two PAWs | No rate of change shown [S2] |
| Maneuver nodes | Handle-dragging; fine-tune added late *(unverified)* | Finite-burn model good, UI poor; no planning without fuel [S6] |
| Onboarding | Thin; YouTube carried it | Training Center; reviewers split [S9][S10][S11] |
| Accessibility | 0 documented features [S17]; console text size fixed [S16] | Font/scale complaints; audio-only countdown acknowledged |
| Consoles | Rough ports; Enhanced Edition better [S14][S15] | Never shipped |

## 6. Implications for Orbital

1. **Adopt**: show Ap/Pe, time to Ap/node, stage Δv/TWR permanently in the flight HUD. This removes KSP1's biggest "you need mods" gap and fits "numbers first".
2. **Adopt**: show resource *rates* and time-to-empty next to levels. That answers "is warp safe?", which KSP2's Resource Manager could not [S2].
3. **Improve**: link the PAW and the Part Manager. Clicking a part opens a compact inspector, a docked list shows all parts, and hover highlights work in both directions. Both use the same controls, so the views never drift apart.
4. **Improve**: let maneuver nodes plan beyond current Δv and show the deficit in amber, plus "next orbit" and numeric-entry controls. This keeps KSP2's honest finite-burn preview without blocking exploration [S6].
5. **Adopt**: honest placeholders. Δv shows "—" with a reason ("fuel flow ambiguous") instead of a wrong number. Trust matters more than coverage [S1].
6. **Adopt**: legibility settings in v1. UI scale, a minimum font size, a high-contrast option, a colourblind-safe orbit palette, and no information conveyed only by colour or only by audio. Both KSP games were criticised here [S16][S17].
7. **Adopt**: a persistent notification log in the dock. Toasts also go to history, so status is always visible.
8. **Improve**: the dock-plugin panel system is Orbital's equivalent of KSP1's app launcher. Give it layout management (snap, collapse, presets, per-scene layouts) so third-party panels cannot recreate the KSP1 toolbar clutter.
9. **Improve**: layered onboarding. Short, interactive, skippable steps tied to the real UI, plus the mission tracker and a searchable glossary. KSP2's dense lessons were replayed [S9]. Browser delivery makes deep links possible ("open this lesson").
10. **Adopt**: a staging editor that previews what fires per stage (icons and part highlight) and warns about common mistakes such as chutes in stage 1 or decouplers with no engines. Staging is the most common beginner failure.
11. **Avoid**: thin, stylised fonts and heavy padding for "premium" looks. KSP2's look-first density cost it readability [S2][S3]. Orbital's compact, flat style should stay dense.
12. **Improve**: tablet and touch first, controller second. Learn from the Enhanced Edition's reworked controls [S14] by designing a focus/radial model early rather than porting a mouse UI later.
13. **Adopt**: kOS-like scripting panels as first-class dock panels. That builds the "engineer" fantasy into the UI instead of leaving it to mods.
14. **Avoid**: modal, scene-blocking windows for routine tasks. Keep the KSC hub fast (a list or command palette as well as the 3D diorama) so navigation is never slower than the decision.

## 7. Sources

- [S1] KSP Wiki, "1.6" and forum threads on the 1.6 Δv readout. https://wiki.kerbalspaceprogram.com/wiki/1.6 (also https://forum.kerbalspaceprogram.com/topic/182245-ksp-16-variant-and-deltav-glitch). Checked 2026-10-17. Community wiki changelog plus player threads; reliable for dates, anecdotal for quality.
- [S2] KSP Forums, "UI/UX Feedback Megathread" (KSP2). https://forum.kerbalspaceprogram.com/topic/221025-ui-ux-feedback-megathread. Checked 2026-10-17 (seen through search excerpts; direct fetch blocked with 403). Player feedback with developer acknowledgements; good player-voice evidence.
- [S3] KSP Forums, Intercept art/UI dev post "You can't spell user interface without U & I" and replies. https://forum.kerbalspaceprogram.com/topic/223204-you-can%E2%80%99t-spell-user-interface-without-u-i. Checked 2026-10-17 (search excerpts). Official dev blog; replies are player opinion.
- [S5] KSP Forums, "Please revert all VAB controls back to KSP1". https://forum.kerbalspaceprogram.com/topic/212501-please-revert-all-vab-controls-back-to-ksp1. Checked 2026-10-17 (title/excerpt only). A single player thread; shows a sentiment exists, not how widespread it is.
- [S6] KSP Forums, maneuver-node threads (KSP2): https://forum.kerbalspaceprogram.com/topic/222362-maneuver-nodes-for-interplanetary-burns ; https://forum.kerbalspaceprogram.com/topic/222291-maneuver-nods-with-no-fuel ; https://forum.kerbalspaceprogram.com/topic/212419-maneuver-nodes-are-really-really-bad/page/4. Checked 2026-10-17 (search excerpts). Player opinion plus one developer reply; dates not always visible.
- [S7] kerbal.wiki, "Tutorials" (KSP2). https://kerbal.wiki/Tutorials. Checked 2026-10-17. Community wiki; reliable for the lesson structure.
- [S8] Private Division press release (via Bastion/MyNewsdesk), "Here's how Kerbal Space Program 2 is making the series welcoming for newcomers". https://mynewsdesk.com/uk/bastion-uk/news/heres-how-kerbal-space-program-2-is-making-the-series-welcoming-for-newcomers-427244. Checked 2026-10-17. Publisher PR; states intent, not outcome.
- [S9] GODisageek, "Kerbal Space Program 2 is more ambitious than ever before — hands-on preview" (Feb 2023). https://www.godisageek.com/2023/02/kerbal-space-program-2-is-more-ambitious-than-ever-before-hands-on-preview/. Checked 2026-10-17. Press preview; a single reviewer's view.
- [S10] TechRaptor, "Kerbal Space Program 2 Preview". https://techraptor.net/gaming/previews/kerbal-space-program-2-preview. Checked 2026-10-17 (search excerpt). Press preview.
- [S11] PC Games (DE), KSP2 Early Access preview, "Zugänglichkeit im Vordergrund" page. https://www.pcgames.de/Kerbal-Space-Program-2-Spiel-72055/Specials/vorschau-preview-early-access-weltraum-simulation-sandbox-1414225/3/. Checked 2026-10-17 (search excerpt). Established German outlet; preview.
- [S12] KSP Wiki, "Key bindings" (Ctrl+Z undo since 0.08.5). https://wiki.kerbalspaceprogram.com/wiki/Keys ; and the KSP2 undo bug thread https://forum.kerbalspaceprogram.com/topic/214292-engine-mount-shroud-shrinks-when-undoing-changes-to-the-craft. Checked 2026-10-17. Community wiki (reliable for bindings); a single bug report.
- [S13] KSP bug tracker, issue #25865 (fairing PAW setting reset on undo). https://bugs.kerbalspaceprogram.com/issues/25865. Checked 2026-10-17 (search excerpt). Official tracker; confirmed, low severity.
- [S14] GODisageek, "Kerbal Space Program: Enhanced Edition Review". https://godisageek.com/reviews/kerbal-space-program-enhanced-edition-review/. Checked 2026-10-17 (search excerpt). Press review.
- [S15] XboxAddict, "Staff Review of Kerbal Space Program Enhanced Edition (Xbox One)". https://xboxaddict.com/Staff-Review/Xbox-One/14055/Kerbal-Space-Program-Enhanced-Edition.html. Checked 2026-10-17 (search excerpt). Enthusiast press, 2018.
- [S16] PlayStation Store, "Kerbal Space Program: Enhanced Edition". https://store.playstation.com/concept/217244. Checked 2026-10-17 (search excerpt). Official store description plus user reviews (anecdotal).
- [S17] Family Gaming Database, accessibility page for Kerbal Space Program. https://www.familygamingdatabase.com/accessibility/Kerbal+Space+Program. Checked 2026-10-17 (search excerpt). Third-party accessibility catalogue; "0 documented" may mean it was never audited.
- [S18] kerbal.wiki, "Redux: New features" (community KSP2 UI mod). https://kerbal.wiki/Redux:New_features. Checked 2026-10-17 (search excerpt). Community mod documentation.
- [S19] KSP official news, "Developer Insights #7 – KSP 2 UX Architects" (Levin Sadsad). https://kerbalspaceprogram.com/news/dev-diaries-developer-insights-7-ksp-2-ux-architects. Checked 2026-10-17 (returned 404; known from search listing and forum mirror https://forum.kerbalspaceprogram.com/topic/200599-developer-insights-7-%E2%80%93-ksp-2-ux-architects). Official dev diary; content not re-read.
- [S20] GameSpot, "Kerbal Space Program 2 Is Catching Fire For A Buggy Early Launch" (Feb 2023). https://gamespot.com/articles/kerbal-space-program-2-is-catching-fire-for-a-buggy-early-launch/1100-6511910/. Checked 2026-10-17 (search excerpt). Major outlet news.
- [S21] KSP official news, "Career mode guide for beginners" (Scott Manley tutorial series). https://kerbalspaceprogram.com/news/career-mode-guide-for-begineers. Checked 2026-10-17 (search excerpt). Official site.

*(Source ID S4 is intentionally unused.)*
