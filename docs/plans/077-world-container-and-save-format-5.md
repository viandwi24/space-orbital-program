---
id: 077
title: "World container: worlds own saves, save format 5"
status: done
owner: "Agent 1"
depends: []
phase: 4
created: 2026-10-17
updated: 2026-10-17
---

# 077 — World container: worlds own saves, save format 5

## Goal

A world exists as data: the sim's world carries the world fields (rules placeholder, epoch, gravity model, system id and variant, seed, sites list placeholder) and `SimSave` moves to format 5 with a migration from 4; the web client stores world records (`orbital-world`) that own their saves, and existing saves migrate into one "Legacy world".

## Context

- ADRs: 0094, 0050, 0110
- Read: ADR 0050 (format, migration policy), ADR 0094, `packages/core/src/save.ts` (`SIM_SAVE_VERSION = 4`), `apps/web/src/lib/save`.
- This is the first contract of the foundation; keep it small: fields and storage, no rules logic (078), no epoch maths (081), no terrain (084).

## Scope

**In:**
- `WorldInfo` type and schema in core: `id`, `seed`, `systemId`, `systemVersion`, `variant`, `gravityModel` (`patched`), `epoch` (two numbers, default fictional day 0), `rules` (empty map until 078), `sites` (empty until 084).
- A singleton world component in the sim, set by `createSim({ world })`, saved and resumed.
- `SimSave` format 5 with migration 4 to 5 (Legacy defaults) and a frozen `save-v4.json` fixture.
- `WorldStore` interface and IndexedDB store `worlds`; the save envelope gains `worldId`; a one-time client migration creates the Legacy world and attaches existing saves.
- World record: name, created and last played, preset label, mods at creation, changelog (empty), summary.

**Out:** the Worlds screen (087), rules (078), any change to flight behaviour.

## Touches

- **Size:** M
- **Edits:** `packages/core/src/save.ts`, `packages/core/src/schemas.ts`, `packages/core/src/world.ts`, `packages/sim/src/save.ts`, `packages/sim/src/sim.ts`, `packages/sim/test/fixtures`, `apps/web/src/lib/save`
- **Shared contracts:** **core types, save format (4 to 5), web save envelope** — base for every later world plan

## Design notes

Follow ADR 0050 point 6 exactly: bump, pure migration keyed by 4, re-sign, frozen fixture, resume tests. Ids are random UUIDs from the host, never from the sim PRNG.

## Steps

1. Types and schema in core; world component in sim; `createSim({ world })` default = Legacy.
2. Format 5 and migration; fixture; resume tests extended.
3. `WorldStore`, envelope `worldId`, client migration with a test on fake IndexedDB.
4. Journal: measured save size change.

## Acceptance criteria

- [x] `packages/core` test: `readSimSave(save-v4.json)` migrates to format 5 with `gravityModel: "patched"`, a fictional epoch at day 0 and an empty rules map.
- [x] `packages/sim` `resume.test.ts`: a format 5 save resumes byte-exact in the existing scenarios (rails, flight in free space).
- [x] `apps/web` vitest: with two old saves in a fake IndexedDB, the client migration creates exactly one Legacy world owning both, and is idempotent on a second run.
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/077-world-container-and-save-format-5.md` written.
- [x] `docs/architecture/simulation.md` (save section), `architecture/overview.md` (world container).
- [x] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0094, 0050).
- 2026-10-17 — Claimed by Agent 1 (Lead, M5) on `lead/077-world-container`. ADR 0110 written before the code: world info as a sim-core singleton saved as `SimSave.worldInfo` (no ECS entity, so entity ids stay), Legacy world id `"legacy"`, worlds in the existing `orbital-saves` database (version 2). `API_VERSION` 0.1.25. Contract changes (all in Touches): core `WorldInfo` types and schema, save format 4 → 5 (migration, v4 fixture still frozen), web envelope 2 with `worldId`. Also touched outside the Edits list, inside the same contracts: `packages/core/src/version.ts` (API bump), `apps/web/package.json` and `bun.lock` (`fake-indexeddb` 6.2.5 dev dependency for the fake-IndexedDB criterion).
- 2026-10-17 — Acceptance, on the M5:
  - core v4 → 5: `bun test packages/core/test/save.test.ts` — `16 pass, 0 fail` ("the frozen format-4 fixture migrates to the Legacy world: patched, fictional day 0, no rules").
  - sim resume: `bun test packages/sim/test/resume.test.ts` — `16 pass, 0 fail` (new "format 5 saves of a world": rails, warp, staging and a burn in free space, byte for byte; every existing scenario now writes format 5).
  - web: `bunx vitest run src/lib/save/migrate-worlds.test.ts` in the suite — two version 1 saves in a version 1 `fake-indexeddb` database → one Legacy world owning both; a second run and a reload change nothing; an interrupted run finishes without a second world.
  - `bun run test` — `1316 pass, 0 fail` · `bun run --filter @orbital/web test` — `824 passed (824)` · `bun run typecheck` — every package `Exited with code 0` · `bun run build` — `✔ done` · `bun run docs:check` — `OK (129 plans, 109 ADRs)`.
  - Save size: format 4 fixture 4,486 → 4,665 bytes (+179, +4.0 %), journal.
  - Merge (Lead, M5): `merge 9531685` on `main`; Chromium smoke `E2E_PORT=5201 E2E_WORKERS=1 bunx playwright test --project=chromium e2e/smoke.e2e.ts` — `6 passed (2.5m)`. No renderer or flight-view change, so no frame budget run.
  - Note: plain `bun test` at the root also collects `apps/web` vitest files and fails on `$state` (runes need the Svelte compiler); that is unchanged from `main`. The checks are `bun run test` (packages, mods, examples) and the web vitest.
