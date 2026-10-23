---
id: 375
title: "Developer tools: one shell, viewers from the loaded plugins, the mod loader log, crew content from mods, Zen Hangar and a sandbox Hangar"
status: in-progress
owner: "developer tools session (jovial-kilby worktree)"
depends: [301, 341]
phase: 8
created: 2026-10-23
updated: 2026-10-23
---

# 375 — Developer tools

## Goal

The owner's requests of 2026-10-23 for the developer tools, quoted in short:

> "developer tools diperbaiki lagi kaya ada navigasi buat back to main menu … part viewer itu membaca semua parts yang terbaca di mods kan, kasih logs juga biar developer bisa baca kalau modnya ada error … crew juga gitu ada kemungkinan ntar mods bisa nambah crew atau mengganti animasi atau texture … hangar … dikasih 2 mode … mode kaya sekarang sama mode zen … kaya aplikasi 3d modelling … hangar ini juga ada di developers pages … bisa untuk melihat blueprint juga … intinya nanti kaya parts, program, texture, crew, animations, blueprint itu semua dari plugin / mods."

When this plan is done:
- every developer page has a way back;
- the viewers show what the game would load, mods included, and who provides or patches each item;
- a mod author can read why their mod failed;
- crew looks and moves come from plugins;
- the Hangar has a studio look;
- the Hangar can be used without a world.

## Context

- Plan 370 (in progress; `/developer`, load logs in `apps/web/src/lib/load-log.ts`), plan 301 (`/dev/parts`), plan 341 + ADR 0291 (the crew character, `packages/renderer/src/crew/`).
- `packages/core/src/plugin.ts` `loadPlugins` and its report (order, disabled, registered, patches, provenance); `packages/core/src/mods.ts` `resolveMods`; `apps/web/src/lib/mods/runtime.ts`.
- The Hangar: `apps/web/src/routes/(world)/vab/+page.svelte`, `apps/web/src/lib/vab/controller.svelte.ts`, `packages/renderer/src/vab/view.ts` and `hangar.ts`.
- Blueprints: `apps/web/src/lib/editor/blueprints.ts` (learn and mission cards built in the web app, mod cards from the registry), `editor/checks.ts`.
- ADRs written here: [0311](../decisions/0311-everything-comes-from-plugins.md) (the principle and what is still hard-coded) and [0313](../decisions/0313-crew-content-api.md) (the crew content API and image assets). ADR 0312 is plan 376's (the Mods page redesign, UI v3 session), which reads this plan's loader log.

## Scope

**In:**
- A developer shell with Back, Main menu and tabs: Overview, Parts, Crew, Hangar, Blueprints, Mods.
- Routes move to `/developer/*`; `/dev/parts` and `/dev/crew` redirect.
- Parts and Crew viewers boot the game's plugin set, with a switch to also boot disabled installed mods.
- Each item shows its provider and its patchers; a mod filter.
- A mod loader log (boot order, results, problems with stacks, patches, counts per kind, asset failures), persisted for the last boot, with Copy and Download.
- A crew content API in core and the SDK:
  - outfits, looks (skin, hair colour, hair style, eye colour), expressions, animations and portraits;
  - image assets (PNG and WebP) in mod packages;
  - stock registers its crew through it;
  - the renderer draws from it;
  - the mod guide has an example.
- Hangar Normal and Zen looks, a toolbar toggle remembered per player, no shader rebuild on a switch.
- A sandbox Hangar under Developer:
  - no world, every part, no tech lock, no funds, no launch;
  - its own library;
  - Zen by default.
- A Blueprints tab: every blueprint by origin and mod, its checks, missing parts and node size mismatches; it opens a blueprint in the sandbox.

**Out (later plans, listed in ADR 0311):**
- Moving the learn examples, the famous missions and the lessons into stock as registered content.
- Mod-defined part generators.
- Textures on the 3D crew (the figure is vertex-coloured, ADR 0291 point 4; mods colour outfits and ship portrait images).
- EVA animation in flight (the EVA figure is a rigid part; the `eva` animation shows in the line-up only).

## Design notes

- **Dev shell.** `apps/web/src/lib/dev/DevShell.svelte`:
  - a slim fixed bar: Back (to `/developer`, or the main menu on the overview), Main menu, the tabs, a slot for page actions;
  - the content area below it;
  - full-screen tools (Parts, Crew, Hangar) fill that area;
  - document-like pages (Overview, Blueprints, Mods) scroll in it, styled like `MenuShell`.
- **Viewer plugin set.** `apps/web/src/lib/dev/dev-content.ts`:
  - the default is the page's mod runtime (enabled installed mods, the set a world loads);
  - "Include disabled mods" re-evaluates the store with every record treated as enabled (`evaluateMods(records, { includeDisabled: true })`), still checking trust, then runs `loadPlugins` with that set and gives the viewers the result;
  - parts get `by` from `report.registered.part`, patchers from `report.provenance` and `report.patches`.
- **Mod loader log.** `apps/web/src/lib/mods/boot-log.ts`:
  - built by `evaluateMods` from its states and from one more `loadPlugins` (the one it already ran for patches);
  - `resolveMods` gains a `code` and an optional `stack` on each rejection, so the log can tell API, dependency, import, setup and asset problems apart;
  - a model or portrait that fails at load adds an asset entry;
  - stored in `localStorage['orbital.modBootLog']` (the last boot only);
  - read by `/developer/mods` and by the viewers' "Loader log" link.
- **Crew API (ADR 0313).**
  - Five new registries in core:
    - `crewOutfits`;
    - `crewLooks` (kinds `skin`, `hair-colour`, `hair-style`, `eye-colour`);
    - `crewExpressions` (data: eye shapes, brows, mouth);
    - `crewAnimations` (a role and either keyframes or a pure `pose(t, ctx)` function);
    - `crewPortraits` (an image asset for an outfit or a crew id).
  - `crewOutfit` joins the patch targets, so a mod can recolour a stock outfit.
  - Stock moves `outfits.ts` and `poses.ts` data into `mods/stock/src/crew-look.ts` and registers it.
  - The renderer keeps the geometry and painting, and reads a `CrewContent` table set once per page by the web app (`setCrewContent`). It has a neutral fallback outfit, so nothing throws before the table is set.
  - The animation for a role is the one registered last in boot order, so a mod's `walk` replaces stock's.
  - The API version goes to 0.1.111.
- **Zen Hangar.**
  - `VabView.setLook('normal' | 'zen')` hides the hangar root, the props and the walkers; shows a studio group (gradient backdrop sphere, ground grid, shadow-catching floor); and changes only the light intensities and colours, the background colour and the fog density.
  - Before the first frame, everything is made visible for one `renderer.compile`, so both looks' programs exist and a switch rebuilds nothing.
  - The choice is stored in `orbital.vab.look`; the sandbox defaults to Zen with its own key.
- **Sandbox Hangar.** The world Hangar page's body moves into `apps/web/src/lib/vab/HangarScreen.svelte` with a `sandbox` flag:
  - `VabController` takes `{ sandbox }`, which gives it its own draft key, library database (`orbital-dev`, store `library`), no world tech and no Launch;
  - `/developer/hangar` renders it inside the dev shell;
  - `?blueprint=<id>` loads that blueprint.
- **Blueprint validation** (`apps/web/src/lib/dev/blueprint-check.ts`, pure):
  - parts the loaded content lacks;
  - attach links whose node sizes differ;
  - `checkDesign` with the design's stats and stability.

## Steps

1. Plan and ADRs 0311 and 0313. STATUS row.
2. Dev shell and routes: move the viewers to `/developer/parts` and `/developer/crew`, redirect the old paths, and give the overview tabs.
3. `boot-log.ts`:
   - rejection codes and stacks in `resolveMods`;
   - `evaluateMods` builds the log and stores it;
   - the `/developer/mods` page with Copy and Download.
4. `dev-content.ts`:
   - the Parts viewer shows the provider, patchers and a mod filter, and has the "Include disabled mods" switch;
   - the Crew viewer does the same for crew content.
5. The crew API in core, SDK and stock, the renderer reading it, `/developer/crew` listing by mod, and the mod guide section with an example.
6. Zen look in `VabView`, the toolbar toggle, and remembering it.
7. `HangarScreen` extraction, the sandbox controller options and `/developer/hangar`.
8. The Blueprints tab with validation; it opens a blueprint in the sandbox.
9. Docs, checks and screenshots.

## Acceptance criteria

- [ ] `bun test packages/core` passes, including:
  - `test/mods.test.ts`, which asserts a rejection's `code` for an API mismatch (`api`), a missing dependency (`dependency`) and a throwing setup (`setup`, with a stack);
  - `test/crew-content.test.ts`, which asserts the crew registries validate their definitions and that `crewOutfit` patches apply.
- [ ] `bun test mods/stock` passes, with a test that stock registers 12 outfits, 8 expressions and the five animation roles `idle`, `walk`, `wave`, `work` and `eva`.
- [ ] `bun test packages/renderer` passes:
  - the crew character tests read content from stock's registries;
  - `test/crew-content.test.ts` asserts a later plugin's `walk` replaces stock's, and that keyframe animations interpolate;
  - `test/vab-look.test.ts` asserts that switching looks changes no light count or visibility.
- [ ] `bun test apps/web` passes, including:
  - `src/lib/mods/boot-log.test.ts`: counts per kind, problems by code, and the stored round trip;
  - `src/lib/dev/dev-content.test.ts`: the provider and patchers of a patched part, and the mod filter;
  - `src/lib/dev/blueprint-check.test.ts`: a missing part and a node size mismatch are reported.
- [ ] `bun run typecheck`, `bun run build` and `bun run docs:check` pass.
- [ ] Screenshots (in the shared notes folder `screens-375/`) of:
  - each developer tab;
  - the Hangar in Normal and Zen;
  - the sandbox with a blueprint open.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/375-developer-tools.md` written.
- [ ] `docs/guides/writing-a-mod.md`: crew content, image assets, the loader log.
- [ ] `docs/architecture/*.md` touched where the registries and the mod package format are described.
- [ ] ADRs 0311 and 0313 written and linked above.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.

## Log

- 2026-10-23 — Plan written from the owner's request; started.
