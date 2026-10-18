# Reverse engineering KSP1 and KSP2: how the game feels to operate

Research written 2026-10-18 after the owner's review of the finished foundation roadmap. The complaints were:
- the world does not keep running when moving between screens;
- the Hangar is not interactive or flexible enough for KSP-level craft;
- the vessel control panel and panel widths don't match the design;
- not enough can be controlled per part, compared with KSP.

The sibling set [`../reverse-engineering-ksp2/`](../reverse-engineering-ksp2/) covers KSP2's systems broadly (modes, science, economy, crew, comms). This set goes **deep on operating the game**: time across scenes, the editor, per-part control and HUD layout. It ends with a gap analysis against our code.

"Reverse engineering" means design analysis from **public sources only** (wikis, dev diaries, patch notes, forums, reviews, tutorials). No game files were downloaded or inspected.
- Facts are tagged [KSP1], [KSP2], [KSP2 — announced, never shipped] or [Mod: name].
- Each doc cites its own sources.
- The official KSP wiki and forum blocked automated fetching, so some facts come from search excerpts and are marked *(unverified)*. Verify a number before it goes into an ADR.

**Start with [17 — Master catalogue and release scope](17-master-catalogue-and-release-scope.md)**, then [06](06-gap-analysis-and-priorities.md) for the owner complaints.

| # | Document | Answers |
|---|---|---|
| 01 | [Time, scenes and persistence](01-time-scenes-and-persistence.md) | Where KSP's clock runs per scene, pause, warp, background vessels, saves and revert; options for "one world that runs until paused" |
| 02 | [VAB/SPH editor](02-vab-sph-editor.md) | The carry-and-snap interaction model, camera, nodes and surface attach, symmetry, gizmos, catalogue, tweakables, staging and action groups, every binding, feature matrix, a 14-item editor checklist |
| 03 | [Part control and tweakables](03-part-control-and-tweakables.md) | What can be controlled per part type in flight, PAW vs Part Manager, resource transfer, action groups, SAS/RCS/trim; Must/Should/Later per part |
| 04 | [Flight HUD and panel layout](04-flight-hud-and-panel-layout.md) | KSP1/KSP2 screen maps, window behaviour, typography, map view; a region spec with min/default/max widths checked at six viewport sizes |
| 05 | [Orbital today](05-orbital-today-inventory.md) | Our code in the same areas, with file:line references; current bindings and CSS widths; top 15 gaps |
| 06 | [Gap analysis and priorities](06-gap-analysis-and-priorities.md) | The four complaints answered, six work waves, overlaps with open work, decisions the owner must make |
| 07 | [Physics, aero, heat, structure](07-physics-aero-heat-structure.md) | Drag cubes, lift, Mach, atmospheres, heating, joints and autostrut, engines and fuel flow, wheels, water, physics robustness; launch checklist |
| 08 | [Navigation, map, vessel management](08-navigation-map-vessel-management.md) | Map markers, maneuver nodes, targeting, alarms, Tracking Station, switching, recovery, debris, launch sites, cameras; launch checklist |
| 09 | [Parts catalogue](09-parts-catalogue.md) | Every KSP1/MH/BG/KSP2 part type with modules and stats, resource densities, our gap table |
| 10 | [EVA, kerbals, inventory](10-eva-kerbals-inventory.md) | Hatches, ladders, jetpack, EVA actions, inventory and construction, professions and XP, G-LOC; launch checklist |
| 11 | [Resources, power, ISRU](11-resources-power-isru.md) | Electric charge, flow and transfer, ore and converters, heat, science hardware, life support mods; launch checklist |
| 12 | [Settings, difficulty, keys, meta](12-settings-difficulty-keys-meta.md) | All key bindings with our conflicts, difficulty parameters, settings menus, saves, cheats, accessibility; launch checklist |
| 13 | [Camera, visuals, audio, onboarding](13-camera-visuals-audio-onboarding.md) | Camera modes, effects, sound and music, tutorials and KSPedia; launch checklist |
| 14 | [KSP2, DLCs, late updates](14-ksp2-dlc-and-late-updates.md) | 1.6–1.12 features, Making History, Breaking Ground, KSP2 by build, never-shipped systems, feature parity table |
| 15 | [Orbital today, part 2](15-orbital-today-inventory-2.md) (raw: [15a](15a-physics-audit-raw.md), [15b](15b-presentation-release-audit-raw.md), [15c](15c-navigation-audit-raw.md), [15d](15d-parts-science-crew-audit-raw.md)) | Our code in all the areas above, GitHub Pages hosting check, **top 25 gaps** |
| 16 | [Verification log](16-verification-log.md) | Which unverified claims were confirmed or corrected from archived sources |
| 17 | [**Master catalogue and release scope**](17-master-catalogue-and-release-scope.md) | Every system with our status and P0/P1/P2 priority for a public release |

Not committed to git by the research session; the owner or Agent 1 decides whether to commit it beside `../reverse-engineering-ksp2/`.
