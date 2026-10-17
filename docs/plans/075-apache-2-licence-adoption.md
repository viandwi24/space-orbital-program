---
id: 075
title: "Apache-2.0: package metadata, credits and the mod manifest licence field"
status: draft
owner: ""
depends: []
phase: 4
created: 2026-10-17
updated: 2026-10-17
---

# 075 — Apache-2.0: package metadata, credits and the mod manifest licence field

## Goal

The licence decision of ADR 0106 is visible everywhere it should be: every workspace `package.json` says `"license": "Apache-2.0"`, the in-game Credits page names the game licence, the README status line no longer says "to be decided", a NOTICE file exists if any dependency requires one, and a mod manifest can state its own licence.

## Context

- ADRs: 0106
- The root `LICENSE` and the README Licence section were added with ADR 0106 (2026-10-17).
- Read: `apps/web/src/lib/public/credits.ts` and its test (asserts "to be decided" today), ADR 0057 (manifest), `docs/research/licence.md`.

## Scope

**In:**
- `"license": "Apache-2.0"` in the root and every workspace `package.json` (`packages/*`, `mods/stock`, `apps/web`, `examples/*`, `tools/*` if they have one).
- `GAME_LICENCE` in `credits.ts` set to Apache-2.0 with a link to `LICENSE`; the credits test updated to assert it.
- README status line (line 5) updated.
- Dependency licence review: list which licences on the Credits page require attribution in a NOTICE (Apache-2.0 dependencies with NOTICE files, OFL fonts); add `NOTICE` only if required.
- Mod manifest: optional `licence` (SPDX id) field, shown in the mod manager and the trust prompt (additive).

**Out:** per-file licence headers (ADR 0106 point 3: not required); a contributor licence agreement.

## Touches

- **Size:** S
- **Edits:** `package.json`, `packages/*/package.json`, `mods/stock/package.json`, `apps/web/package.json`, `examples`, `apps/web/src/lib/public/credits.ts`, `apps/web/src/routes/mods`, `packages/core/src/mods.ts`, `README.md`
- **Shared contracts:** mod manifest schema (optional `licence` field; additive, API minor bump)

## Design notes

Keep the SPDX id as the single source; the Credits page and the mod manager render it. A manifest without the field still loads.

## Steps

1. Add the `license` field to every package.json; run `bun install` to confirm the lockfile is unaffected.
2. Update `credits.ts`, its test and the README status line.
3. Review dependency licences, decide NOTICE, record in `docs/research/licence.md`.
4. Add the optional manifest field with a schema test and mod manager display.

## Acceptance criteria

- [ ] A test in `tools/` or `apps/web` reads every workspace `package.json` and asserts `license === "Apache-2.0"`.
- [ ] `credits.test.ts` asserts `GAME_LICENCE` is "Apache-2.0" (the old "to be decided" assertion is gone).
- [ ] `packages/core` schema test: a manifest with `licence: "MIT"` loads and one without it loads; the mod manager shows the field (vitest).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/075-apache-2-licence-adoption.md` written.
- [ ] `docs/research/licence.md` (dependency review).
- [ ] `guides/writing-a-mod.md` (manifest licence field).
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0106).
