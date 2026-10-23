# 0311 — Content comes from plugins; stock is one plugin among them

**Status:** accepted (owner's request, 2026-10-23)
**Date:** 2026-10-23
**Plan:** plans/375-developer-tools.md
**Extends:** ADR 0003 (stock content is a mod), ADR 0057 (runtime mods), ADR 0170 (patches)

## Context

The owner on 2026-10-23: "intinya nanti kaya parts, program, texture, crew, animations, blueprint itu semua dari plugin / mods."

Most content already arrives through `loadPlugins`:
- parts, modules, resources, bodies and systems;
- contracts, missions, tech, buildings, science;
- panels, autopilots, overlays and keybindings;
- blueprints that mods register.

Some content does not. The game builds it in the web app or in the renderer, so a mod cannot add to it, replace it or see it in the developer tools.

## Decision

1. **Content is registered, never imported.** Anything a player sees as a thing of the game must reach the app through a registry of `loadPlugins`:
   - a part, a program or autopilot, a look (texture or colour), a person, a pose or animation, a blueprint, a lesson or a mission.
   - Stock (`mods/stock`) and the other built-ins register theirs through the same public SDK as a third-party mod (ADR 0003).
   - The web app and the renderer hold only engines: geometry generators, shaders, painters, editors and the UI that reads the registries.
2. **The developer tools are the proof.**
   - `/developer` boots the same plugin list a world boots: built-ins, then the enabled installed mods, with a switch to try disabled ones.
   - Every item it shows names the plugin that registered it and the ones that patched it (`report.registered`, `report.provenance`, `report.patches`).
   - Content that cannot be shown there is still hard-coded and belongs on the list below.
3. **Every boot leaves a loader log.** For each plugin it records:
   - the boot order;
   - the outcome, with the problem's kind (API, dependency, duplicate, import, setup, assets, manifest, cycle, untrusted) and the error's stack;
   - its patches;
   - its registrations per kind;
   - its asset failures.
   The last boot's log is kept in the browser (`orbital.modBootLog`) and shown on `/developer/mods`.
4. **Overrides go through patches or a later registration.**
   - A mod changes stock data through a patch (ADR 0170). This plan adds the `crewOutfit` target.
   - For things chosen by role (the crew's `walk` animation, ADR 0313), the definition registered last in boot order wins.
   - The developer tools show which one won.
5. **What is still hard-coded** (2026-10-23), and where it moves:

   | Content | Where it lives today | Move |
   |---|---|---|
   | Crew outfits, skins, hair, expressions, poses | `packages/renderer/src/crew/outfits.ts`, `poses.ts` | **This plan** (ADR 0313): registries `crewOutfits`, `crewLooks`, `crewExpressions`, `crewAnimations`, `crewPortraits`; stock registers them. |
   | Learn blueprints (two-stage, boosters, asparagus, moon shot, glider) | `apps/web/src/lib/editor/examples.ts`, `blueprints.ts` | A later plan. Stock registers them as blueprints. Their builders run through editor operations, so a blueprint gains an optional `build(content)` beside `design`, or the designs are baked at build time. |
   | Famous-mission blueprints | `apps/web/src/lib/editor/missions.ts` | The same later plan. |
   | Lessons and the first-flight tutorial | `apps/web/src/lib/onboarding/lessons-*.ts`, `tutorial.ts` | A later plan: a `lessons` registry. Steps are data, and checks are pure functions of the snapshot and the Hangar state. |
   | Part generators (procedural looks) | `packages/renderer/src/parts/generators/` | Stays an engine. Mods pick a generator by name and parameters, or ship a `.glb` (ADR 0076). Mods cannot import three (boundaries), so mod-defined generators would need a declarative mesh format. Not planned. |
   | Hangar, site and planet textures | renderer, procedural | Stays an engine (procedural, baked). Mods add planets as bodies with their own maps (ADR 0184). |
   | Image textures from mods | not possible before this plan (packages carried `.glb` only) | **This plan**: PNG and WebP assets in mod packages (format 3, ADR 0313), first used for crew portraits. |
   | Loading-screen shots | `apps/web/static/loading/` | A later plan: a `loadingShots` registry of image assets. |
   | Space Center building looks | `packages/renderer/src/site-buildings.ts` | Buildings are registered (ADR 0115). Their meshes are an engine keyed by building id; a mod building falls back to a generic block. Not planned. |
   | Programs and autopilots | registered (`autopilots`, `panels`; Guidance and Auto Dock are built-in mods) | Done. The sim's control arbitration (`programs.ts`) is an engine. |

## Consequences

- A player's mod list decides what the developer tools show.
- The tools double as a check that nothing new is hard-coded: a plan that adds content in `apps/web` or the renderer without a registry fails this ADR.
- The rows marked "later plan" are tracked in `docs/STATUS.md` as follow-ups.
