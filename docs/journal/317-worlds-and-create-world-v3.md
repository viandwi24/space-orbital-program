# 317 — Worlds and Create World v3, with generated system art

**Plan:** [plans/317-worlds-and-create-world-v3.md](../plans/317-worlds-and-create-world-v3.md) · **ADR:** [0273](../decisions/0273-generated-system-and-mode-art-with-mod-override.md) · **Session:** ui-v3 session (Claude, M5), 2026-10-22

## The question and the answer

The owner asked whether the pictures on the star-system and mode cards are custom per system, or something we draw. Systems and presets can come from mods. ADR 0273's answer:

- **Generated art from the data**, so every system has a picture, a mod's included.
- **An optional `illustration` / `icon`** on presets and system variants for a mod that wants its own (`data:` URLs, 128 KiB, shown as images; API 0.1.101).
- **No image files per system** in the repo.

The five stock modes keep the design's line art.

## What was done

| Where | What |
|---|---|
| `core/illustration.ts`, `rules.ts`, `systems.ts` | `illustrationSchema`; optional `illustration`/`icon` on `PresetDefinition` and `SystemVariantDefinition`; API 0.1.101; `core/test/illustration.test.ts` |
| `web/lib/worlds/system-art.ts`, `SystemArt.svelte` | The star, the planets in orbit order with moons, log-scale sizes, and tints read from the data (`bodyKind`: terran, rock, giant, ice), with jitter seeded by the id. A short hint table covers Sol (Mars red, Saturn's ring). Card (300 × 96) and icon (48 × 48) layouts. `worldHue` gives each world its planet colours |
| `web/lib/worlds/mode-art.ts` | The five stock line arts from `CreateWorldV3.dc.html`; a seeded orbit glyph for any other preset |
| `web/lib/worlds/CreateWorld.svelte` | A full page:<br>• **Mode:** a 40/300 name, mode cards and the preset strip.<br>• **World:** system cards with art, scale variants with their facts, start date, seed with dice, gravity cards, and a globe with the site list.<br>• **Rules:** categories with counts, rows with a switch, segmented or number control, a changed dot, FIXED chips and Reset to preset.<br>• **Summary:** always shown, with the Create button. |
| `web/routes/worlds/+page.svelte` | The console-style library:<br>• a backdrop planet in the world's hue;<br>• tiles with "+ New world";<br>• the hero: chips (mode, system, CHEATS USED, RULES CHANGED), the name, the line, stats, Continue/Enter and four round actions (Duplicate, Rename, an Export menu, Delete with a confirm);<br>• History cards and the Achievements card;<br>• the Worlds · Achievements tabs. |
| `web/lib/achievements/AchievementsPanel.svelte` | The profile count with its bar, the All · Unlocked · Locked filter, medal cards (unlocked, locked, hidden) and Export/Import profile |

The e2e test ids are kept: `worlds-create`, `create-world`, `world-name`, `world-create`, `world-enter`, `world-card`, `world-details`, `used-cheats`, `rules-changed`, `world-delete-confirm`, `world-seed`, `gravity-*`, `site-choice`, `rule-*` and `rules-*`. The mode cards are radios named by their preset, so `getByRole('radio', { name: 'Career' })` still finds them.

## Screens

Chromium on the production build (`e2e/v3-worlds-screens.e2e.ts`, pictures only with `SHOTS_DIR`), at 1440 × 900 and 1280 × 800:

- Create World, Mode: `assets/317-create-mode-1440.jpg`, `assets/317-create-mode-1280.jpg`
- Create World, World (Sol, both scales): `assets/317-create-world-1440.jpg`, `assets/317-create-world-1280.jpg`
- Create World, Rules (Crew): `assets/317-create-rules-1440.jpg`, `assets/317-create-rules-1280.jpg`
- Worlds with two worlds: `assets/317-worlds-1440.jpg`, `assets/317-worlds-1280.jpg`
- The Delete confirm: `assets/317-worlds-delete-1440.jpg`
- Achievements: `assets/317-achievements-1440.jpg`, `assets/317-achievements-1280.jpg`

## Differences from the design, on purpose

- **Launch sites.** Our sites are templates resolved on the seed (plan 092). The globe shows the chosen site's pin once resolved, and the list shows each template's latitude band until then. The design draws six fixed pins.
- **Two columns on the World step** only from 1700 px wide. Below that, the globe sits under the choices, because at 1440 it had no room beside them.
- **The star system cards** say "N bodies · M scales" rather than a sentence, because a mod's system has no such sentence. The scale variant cards carry the facts and description.
- **History cards** show the last four firsts. The full list stays in the Markdown and JSON export.
- **e2e not run** (the owner's rule for this task). Only the screenshot spec ran.

## Checks

See the plan's Log for `bun run test`, typecheck, lint and the web vitest with `CI=true`.
