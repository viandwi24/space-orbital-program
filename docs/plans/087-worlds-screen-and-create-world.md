---
id: 087
title: "Worlds screen and Create World"
status: in-progress
owner: "Agent 2"
depends: [077, 078, 081, 086]
phase: 5
created: 2026-10-17
updated: 2026-10-17
---

# 087 — Worlds screen and Create World

## Goal

The game starts from worlds: a Worlds screen (cards with planet thumbnail, preset, system, vessel and crew counts, last played, a missing-mod warning; details with Enter, Duplicate, Rename, Delete) and a Create World dialog (name, preset, star system and scale variant, difficulty and every rule, start date, gravity model with "N-body — Coming soon" disabled, agency type, primary site template). Loading a world behind the real date offers "Catch up to now".

## Context

- ADRs: 0094, 0095, 0103, 0107, [0143](../decisions/0143-worlds-screen-active-world-record-world-info-and-catch-up.md) (written here)
- Read: ADR 0094, 0095 point 2, 0103 points 2 and 3, 0107, `refs/space-orbital-program-ui/docs/SCREENS.md` (Worlds), `apps/web/src/routes/+page.svelte` (main menu), `lib/save`.
- The site template list is "Default site" only until plan 092 adds templates.

## Scope

**In:**
- Route `/worlds` and the world details panel in the refs style.
- Create World: presets fill the rules; every rule editable grouped by category; identity rules marked; start date Today (host clock read once) / fixed date / J2000; gravity model selector with the disabled n-body option and its one-line explanation; agency type; star system and variant from the registered systems.
- Duplicate (new id, same rules, optionally new name and seed), Rename, Delete (confirm; deletes the world's saves).
- Main menu Continue enters the last world; Load from the save list moves under a world.
- Catch-up offer on load when the world date is behind the real date and every vessel is on rails: a `warp-to` the real date, never backwards; also a button in the time panel.

**Out:** site choice on the globe (092), Space Center screen (091), thumbnails rendered from a 3D scene (use the body colour from data).

## Touches

- **Size:** M
- **Edits:** `apps/web/src/routes/worlds`, `apps/web/src/routes/+page.svelte`, `apps/web/src/lib/save`, `apps/web/src/lib/ui`, `apps/web/src/lib/hud/WarpControl.svelte`
- **Shared contracts:** none (consumes the world contract of 077 and 078)

## Design notes

The dialog is generated from the rule registry (labels, types, presets), so mod rules appear without UI work. The real date is read by the page, converted with 081's functions, and only the epoch is stored.

## Steps

1. Worlds list and details.
2. Create World generated from the registries.
3. Duplicate, Rename, Delete with tests.
4. Catch-up offer and button.
5. e2e: create a Career world, enter, leave, it is listed first.

## Acceptance criteria

- [ ] vitest: Create World with the Career preset produces a world whose rules equal the preset values; changing one rule marks the preset "Custom".
- [ ] vitest: the n-body option is rendered, `disabled`, labelled "Coming soon"; submitting a forged `n-body` value is refused by the validator.
- [ ] vitest: a world whose date is 40 days behind the mocked clock shows the catch-up offer; accepting dispatches `warp-to` with the real date's sim time; with a vessel in flight the offer explains why it is unavailable.
- [ ] `bun run e2e` (Chromium): create, enter and re-list a world.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/087-worlds-screen-and-create-world.md` written.
- [ ] `product/spec.md` core loop (worlds), `architecture/overview.md`.
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0094, 0095, 0103, 0107).
- 2026-10-17 — Defaults updated by ADR 0109: control needs a command source (crew aboard or linked probe), `controlWithoutSignal` none in Career/Science and full in Sandbox, Career crew presets standard + hardcore.
