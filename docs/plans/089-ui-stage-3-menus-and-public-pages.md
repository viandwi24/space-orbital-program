---
id: 089
title: "UI stage 3: Home, menus, settings and public pages in the refs style"
status: draft
owner: ""
depends: [086, 074, 075, 076]
phase: 5
created: 2026-10-17
updated: 2026-10-17
---

# 089 — UI stage 3: Home, menus, settings and public pages in the refs style

## Goal

Home (logo SPACE ORBITAL PROGRAM, Continue · world, Worlds, Vessel library, Mods, Settings, Roadmap, Credits, last-world card, version footer), the pause menu, settings, the mods manager, credits, roadmap and error/loading screens use the refs style.

## Context

- ADRs: 0107, 0105
- Read: ADR 0107, `refs/space-orbital-program-ui/docs/SCREENS.md` (Home), `apps/web/src/routes/+page.svelte`, `routes/mods`, `routes/credits`, `routes/roadmap`, `lib/ui/MenuShell.svelte`, `SettingsDialog.svelte`, `PauseMenu.svelte`.

## Scope

**In:**
- Home layout with the last-world card (ALT/VEL/Δv and MET from the world's last save summary; `[—]` when unknown).
- Menu, settings, pause, mods, credits, roadmap, error, loading in the new components.
- Keyboard navigation and focus order kept (ADR 0025 accessibility).

**Out:** the Worlds screen (087), any new page content.

## Touches

- **Size:** S
- **Edits:** `apps/web/src/routes/+page.svelte`, `apps/web/src/routes/mods`, `apps/web/src/routes/credits`, `apps/web/src/routes/roadmap`, `apps/web/src/lib/ui`, `apps/web/src/lib/settings`, `apps/web/src/lib/hud/PauseMenu.svelte`
- **Shared contracts:** none

## Design notes

Pure restyle: no data or route changes beyond the Home card.

## Steps

1. Home and last-world card.
2. Menus and dialogs.
3. Public pages.
4. e2e and screenshots.

## Acceptance criteria

- [ ] `bun run e2e` smoke passes in the three engines; keyboard-only test opens Settings and returns focus to the menu.
- [ ] vitest: the last-world card renders `[—]` for a world without a flight summary.
- [ ] Screenshots of Home, Settings, Mods, Credits, Roadmap in `docs/journal/assets/089-*.png` with the self-review.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/089-ui-stage-3-menus-and-public-pages.md` written.

- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0107, 0105).
- 2026-10-17 — `depends` gains 075, 076 (three-agent roadmap review, `docs/roadmap/team-development-roadmap.md` "Notes for the Lead"): it restyles the Credits page of plan 075 and the Roadmap page of plan 076, which edit the same files.
