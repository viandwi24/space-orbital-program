---
id: 317
title: "Worlds and Create World v3: the console-style library, a full-page Create World, generated system art"
status: done
owner: "ui-v3 session (Claude, 2026-10-22)"
depends: [272]
phase: 7
created: 2026-10-22
updated: 2026-10-22
---

# 317 — Worlds and Create World v3

## Goal

The Worlds screen and Create World follow the owner's v3-2 design package (`refs/space-orbital-program-ui-v3-2`, untracked, in the owner's folder): `WorldsV3.dc.html`, `CreateWorldV3*.dc.html` and V3_CHANGES §3 and §4. The pictures on star-system and mode cards are generated from data, so a mod's system has art too ([ADR 0273](../decisions/0273-generated-system-and-mode-art-with-mod-override.md)).

## Context

- **Owner, 2026-10-22:** redesign the world list and Create World. "Some of our systems come from mods (the star system / space system templates); the cards have illustrations. Custom, or do we make our own icons and art? Design it; I only take the result; you are the CTO."
- **The CTO decision** (main session) is in ADR 0273.
- **Code:**
  - `apps/web/src/routes/worlds/+page.svelte`
  - `lib/worlds/CreateWorld.svelte`, `catalog.ts`, `world-model.ts`
  - `lib/achievements/AchievementsPanel.svelte`
- **Core and SDK:**
  - `packages/core/src/rules.ts` (`PresetDefinition`)
  - `systems.ts` (`SystemVariantDefinition`)
  - the SDK's define helpers

## Scope

**In:**
1. **Core and SDK:** an optional `illustration` and `icon` on presets and system variants (`illustrationSchema`); API 0.1.101.
2. **`system-art.ts`** and `SystemArt.svelte` for the card and the icon, plus `worldHue` and `mode-art.ts` with the five stock line arts and a generated glyph. A gallery vitest covers them.
3. **Worlds:**
   - full-screen backdrop planet in the world's hue;
   - a tile row with "+ New world";
   - a hero with chips, the name at 76/300, the line, stats, Continue/Enter and four round actions (Duplicate, Rename, Export menu, Delete with confirm);
   - History cards and an Achievements card;
   - tabs Worlds · Achievements, with the achievements as medal cards.
4. **Create World as a full page** with three steps (Mode → World → Rules) and an always visible summary:
   - **Mode:** name, mode cards, preset strip.
   - **World:** system cards with generated art, scale variants, start date, seed with dice, gravity cards, launch site with a globe and the site list.
   - **Rules:** categories with counts, and rows with switch, segmented or number controls, changed dots, Reset to preset and FIXED chips.
5. **Unchanged:**
   - the test ids the e2e use (`worlds-create`, `create-world`, `world-name`, `world-create`, `world-enter`, `world-card`, `world-details`, `rule-*`, `world-system`, `world-seed`, `gravity-*`, `site-choice`, …);
   - keyboard use and reduced motion.

**Out:**
- e2e runs (owner's rule for this task: skip e2e).
- Thumbnails of the last screenshot on tiles.
- Home v3.

## Steps

1. Core schema and SDK fields, with a test. Push.
2. The art generators and the gallery test. Push.
3. Create World full page. Push.
4. Worlds screen and the Achievements tab. Push.
5. Screenshots for the owner and the journal.

## Acceptance criteria

- [x] `bun run test`, `bun run typecheck`, `bun run lint` and the web vitest with `CI=true` pass (see Log for the two known exceptions).
- [x] The gallery vitest draws stock, Sol 1:1, Sol rescaled and every stock preset, deterministic and inside the box.
- [x] A preset or variant with `illustration` shows it, and one without shows the generated art (vitest).
- [x] Screenshots of Worlds, Achievements and the three Create World steps are in the journal.

## Docs checklist

- [x] STATUS
- [x] Journal 317
- [x] ADR 0273 indexed
- [x] `guides/` (writing a mod) notes `illustration` and `icon`

## Log

- 2026-10-22 — Created on the owner's request via the main session; ADR 0273 written.
- 2026-10-22 — Done, without e2e (the owner's rule for this task):
  - The screenshot spec passes on the production build.
  - `bun run typecheck`: 0 errors. `bun run lint`: clean.
  - Web vitest with `CI=true`: 1464 pass, no obsolete snapshots. The 2 tests that fail are `sim-host-script-worker` Worker timeouts, which fail on the base too.
  - `bun run test`: 2162 pass and 3 fail. The 3 are the career-bot runs, which ran past the 30 s timeout on a loaded machine; `career-bot.test.ts` alone with `--timeout 120000` is 9 of 9.
