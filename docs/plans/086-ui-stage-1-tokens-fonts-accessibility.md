---
id: 086
title: "UI stage 1: refs tokens, Manrope and the accessibility floor"
status: draft
owner: ""
depends: []
phase: 4
created: 2026-10-17
updated: 2026-10-17
---

# 086 — UI stage 1: refs tokens, Manrope and the accessibility floor

## Goal

The design tokens are the refs tokens (ADR 0107): palette, glass surfaces, single accent, status colours, radii, spacing, type scale with Manrope self-hosted; the base components (Panel, Button, Segmented, Dialog, Meter, Icon) read them; a UI scale setting, a high-contrast option and a 10 px text floor exist; the glass blur's cost is measured with a solid fallback for `low` and the governor.

## Context

- ADRs: 0107
- Read: ADR 0107, ADR 0026, `refs/space-orbital-program-ui/docs/STYLE.md` and `tokens/tokens.css` (git-ignored; values are restated in ADR 0107 and must be copied into the tokens file with the refs as source), `apps/web/src/lib/ui/tokens.css` and `tokens.test.ts`, `SettingsDialog.svelte`.
- Check `@fontsource/manrope` on npm (version, licence) and record it in `research/stack-versions.md` before installing.

## Scope

**In:**
- Tokens file rewritten to the refs values with our names; token test updated (contrast pairs at least 4.5:1 for body text, 3:1 for large).
- Manrope 300 to 700 via `@fontsource/manrope`; Barlow and Plex dropped where unused.
- New base components: Capsule, Switch (on, off, mixed), Chip, StatCell, ListRow, SignalBars, BackButton.
- Settings: UI scale 80 to 150 %, high contrast; minimum 10 CSS px text at 100 %.
- Blur cost on the flight view (frame time with and without blur at 1920x1080, `high` and `medium`); `low` and the governor's lowest rung use the solid surface.

**Out:** restyling whole screens (stages 2 to 5).

## Touches

- **Size:** S
- **Edits:** `apps/web/src/lib/ui`, `apps/web/package.json`, `apps/web/src/lib/settings`, `docs/research/stack-versions.md`
- **Shared contracts:** **design tokens** (base for every UI plan)

## Design notes

Existing screens may look mixed after this stage; that is accepted (ADR 0107 point 3). Keep token names semantic so stages 2 to 5 only swap components.

## Steps

1. Research and install the font.
2. Tokens and test.
3. New components with vitest component tests.
4. Settings additions.
5. Blur measurement and fallback.

## Acceptance criteria

- [ ] `tokens.test.ts`: every token of ADR 0107 point 1 exists; text on glass meets the contrast pairs; no token below 10 px for text.
- [ ] Component tests: Switch renders `aria-checked="mixed"` in the mixed state; at UI scale 150 % no HUD panel extends past a 1024x768 viewport (layout test).
- [ ] Journal: flight-view frame time with blur on and off (M5, journal 054 method); the fallback is active on `low`.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/086-ui-stage-1-tokens-fonts-accessibility.md` written.
- [ ] `product/visual-direction.md` if a value differs from ADR 0107, `research/stack-versions.md`.
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0107).
