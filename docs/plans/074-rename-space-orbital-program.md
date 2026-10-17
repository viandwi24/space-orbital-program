---
id: 074
title: "Rename the product to Space Orbital Program"
status: done
owner: "Agent 2"
depends: []
phase: 4
created: 2026-10-17
updated: 2026-10-17
---

# 074 — Rename the product to Space Orbital Program

## Goal

Everything the player and the public see says **Space Orbital Program**: page titles and meta, the menu logo text, credits, roadmap, notices, social image text, the README and the docs that describe the product. Identifiers, file formats and storage keys keep "orbital" (ADR 0105).

## Context

- ADRs: 0105
- Read: `product/spec.md`, `apps/web/src/lib/public/`, `apps/web/src/lib/ui/PageMeta.svelte`, root `README.md`.
- Do not edit `done` plans, journals or accepted ADRs (history keeps "Orbital").

## Scope

**In:**
- A `grep` inventory of player-facing "Orbital" strings in `apps/web` (titles, meta, menu, credits, roadmap, notices, error screen, loading screen, social image text) and their replacement.
- `README.md` title and intro, `AGENTS.md` first line, `docs/README.md`, `product/*.md` product name.
- A test that pins the product name in one constant (`apps/web/src/lib/public/product.ts` or the existing meta module) and that no page title uses the old name.

**Out:** package scope, file format markers, IndexedDB and `localStorage` names (ADR 0105 point 2); logo artwork.

## Touches

- **Size:** S
- **Edits:** `apps/web/src/lib/public`, `apps/web/src/lib/ui`, `apps/web/src/routes`, `apps/web/static`, `README.md`, `AGENTS.md`, `docs/product`, `docs/README.md`
- **Shared contracts:** none (player-facing strings only)

## Design notes

One constant for the name, read by `PageMeta` and the menu; the e2e smoke test that checks the title is updated. The social image is generated in code (plan 023); its text changes with the constant.

## Steps

1. Inventory with `grep -rn "Orbital" apps/web/src apps/web/static` and classify each hit (player-facing or identifier).
2. Introduce the name constant, replace player-facing strings.
3. Update README, AGENTS.md, docs/README.md, product docs.
4. Update tests (title, credits, roadmap snapshot).

## Acceptance criteria

- [x] `grep -rn ">Orbital<\|title.*Orbital\b" apps/web/src` finds no player-facing use of the old name (identifiers excluded by the inventory list in the journal).
- [x] A unit test asserts the name constant is "Space Orbital Program" and that `PageMeta` renders it in `<title>`.
- [x] `bun run e2e` smoke (Chromium) sees the new title on `/`.
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/074-rename-space-orbital-program.md` written.
- [x] `README.md`, `AGENTS.md`, `docs/product/spec.md` say the new name.
- [x] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0105).
- 2026-10-17 — Claimed by Agent 2 (Dev B, M2). `GAME_NAME` (in `lib/public/about.ts`) is "Space Orbital Program"; every title, notice and message reads it or says it; README, AGENTS.md, docs/README and the spec renamed; journal with the inventory. Verification on the M2:
  - `grep -rn ">Orbital<\|title.*Orbital\b" apps/web/src` — one hit, the guard regex in `about.test.ts` itself.
  - `bunx vitest run src/lib/public src/lib/save src/lib/browser-support.test.ts` — 69 passed (`about.test.ts`: constant, `PageMeta` `<title>` and `og:site_name`, no old name in any `.svelte`).
  - `E2E_PORT=5210 bunx playwright test e2e/smoke.e2e.ts --project=chromium` — 6 passed (3.6 m), title `^Space Orbital Program: ` on `/`.
  - `bun test ./packages`, `./mods`, `./examples` — 1266, 83, 7 pass, 0 fail (the root `bun test` also collects `apps/web` vitest files under Bun, as on `origin/main`; journal 086).
  - `bunx vitest run` (apps/web) — 834 passed, 2 failed in `sim-host-script-worker.test.ts`, the same on `origin/main` on this M2.
  - `bun run typecheck` — 0 errors; build — ok (inside the e2e run); `bun run docs:check` — OK.
- 2026-10-17 — Merge by Agent 1 (M5): rebased on `main` @ 270b537 (clean). `bun run test` 1356 pass, 0 fail · web vitest 99 files, 886 passed · typecheck exit 0 · build exit 0 · docs:check OK · Chromium smoke 6 passed (2.6m). Left for later (outside Touches): `packages/core/src/save.ts` still says "not an Orbital save" in two player-facing `SaveError` messages (STATUS issue).
