---
id: 086
title: "UI stage 1: refs tokens, Manrope and the accessibility floor"
status: in-progress
owner: "Agent 1 (measure)"
depends: []
phase: 4
created: 2026-10-17
updated: 2026-10-17
---

# 086 — UI stage 1: refs tokens, Manrope and the accessibility floor

## Goal

The design tokens are the refs tokens (ADR 0107): palette, glass surfaces, single accent, status colours, radii, spacing, type scale with Manrope self-hosted; the base components (Panel, Button, Segmented, Dialog, Meter, Icon) read them; a UI scale setting, a high-contrast option and a 10 px text floor exist; the glass blur's cost is measured with a solid fallback for `low` and the governor.

## Context

- ADRs: 0107, [0140](../decisions/0140-refs-tokens-glass-contrast-ui-scale-and-legacy-names.md) (written here)
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

- [x] `tokens.test.ts`: every token of ADR 0107 point 1 exists; text on glass meets the contrast pairs; no token below 10 px for text.
- [x] Component tests: Switch renders `aria-checked="mixed"` in the mixed state; at UI scale 150 % no HUD panel extends past a 1024x768 viewport (layout test).
- [ ] Journal: flight-view frame time with blur on and off (M5, journal 054 method); the fallback is active on `low`.
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/086-ui-stage-1-tokens-fonts-accessibility.md` written.
- [x] `product/visual-direction.md` if a value differs from ADR 0107, `research/stack-versions.md`.
- [x] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0107).
- 2026-10-17 — Claimed by Agent 2 (Dev B, M2). Font, tokens (ADR 0140), components, settings format 3, glass fallback and the layout e2e done; journal written. Verification on the M2, branch rebased on `origin/main` @ 4fc962b:
  - `bunx vitest run src/lib/ui src/lib/settings` — 108 passed (tokens 82, components 13, root theme 2, settings 11).
  - `E2E_PORT=5210 bunx playwright test e2e/smoke.e2e.ts e2e/ui-scale.e2e.ts --project=chromium` — 7 passed (3.9 m); then `e2e/ui-scale.e2e.ts` alone with the `low` fallback test — 2 passed (43.1 s).
  - `bun test ./packages`, `./mods`, `./examples` — 1266, 83, 7 pass, 0 fail. The root `bun test` also collects the `apps/web` vitest files and fails them under Bun (`vi.unstubAllGlobals` and others): 41 fail on `origin/main` itself on this machine, 56 with this branch's new vitest files; not caused by this plan.
  - `bunx vitest run` (apps/web) — 881 passed, 2 failed: `sim-host-script-worker.test.ts` (Worker timeouts), failing identically on an `origin/main` worktree on this M2.
  - `bun run typecheck` — 0 errors; `bun run build` — built; `bun run docs:check` — OK (129 plans, 112 ADRs).
  - Open: the M5 blur frame-time row (criterion 3, Agent 1 at merge; method in the journal). The fallback on `low` is verified by e2e.
- 2026-10-17 — Merge by Agent 1 (M5): rebased on `main` @ 56706ba (ADR index conflict, both rows kept). `bun run test` 1356 pass, 0 fail · web vitest 98 files, 883 passed (the M2's two Worker timeouts do not occur here) · typecheck exit 0 · build exit 0 · docs:check OK · Chromium `smoke.e2e.ts` + `ui-scale.e2e.ts` 8 passed (3.0m). The M5 frame-time criterion (blur on/off, 1920x1080, high and medium) is **not measured yet**: swap was 4.7 GB, over the M5 guard, so a measurement would be discarded (roadmap §8). Merged to unblock dependents; owner `Agent 1 (measure)` until the numbers are in.
