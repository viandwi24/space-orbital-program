---
id: 075
title: "Apache-2.0: package metadata, credits and the mod manifest licence field"
status: in-progress
owner: "Agent 3"
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
- Read: `apps/web/src/lib/public/credits.ts` and its test (the `credits` block of `apps/web/src/lib/public/roadmap.test.ts`, which asserts "to be decided" today), `apps/web/src/routes/credits/+page.svelte`, `modManifestSchema` in `packages/core/src/mods.ts` (ADR 0057), the installed list and trust prompt in `apps/web/src/routes/mods/+page.svelte`, `docs/research/licence.md`.

## Scope

**In:**
- `"license": "Apache-2.0"` in the root and every workspace `package.json` (`packages/*`, `mods/stock`, `apps/web`, `examples/*`, `tools/*` if they have one).
- `GAME_LICENCE` in `credits.ts` set to `Apache-2.0`, shown on the Credits page as a link to the licence text (the static site does not serve the repository's `LICENSE` file, so the link goes to https://www.apache.org/licenses/LICENSE-2.0). The credits test moves to its own file `credits.test.ts` and asserts it.
- Font credits carry their copyright line (OFL 1.1 condition 2: the notice and licence must accompany the fonts; the Credits page that ships with them is where a player sees them).
- README status line (line 5) updated.
- Dependency licence review: list which licences on the Credits page require attribution in a NOTICE (Apache-2.0 dependencies with NOTICE files, OFL fonts); add `NOTICE` only if required.
- Mod manifest: optional `licence` field, an SPDX licence id or expression (`MIT`, `Apache-2.0`, `MIT OR Apache-2.0`, `LicenseRef-…`; at most 64 characters), shown in the mod manager's installed list and in the trust prompt ("not stated" when absent). Additive: `API_VERSION` patch bump. The sample mod states `"licence": "Apache-2.0"`.

**Out:** per-file licence headers (ADR 0106 point 3: not required); a contributor licence agreement.

## Touches

- **Size:** S
- **Edits:** `package.json`, `packages/*/package.json`, `mods/stock/package.json`, `apps/web/package.json`, `tools/mod-build/package.json`, `examples` (package.json, `mod.json`), `apps/web/src/lib/public/credits.ts` and `credits.test.ts` (new; the credits block leaves `roadmap.test.ts`), `apps/web/src/lib/public/licences.test.ts` (new), `apps/web/src/routes/credits`, `apps/web/src/routes/mods`, `apps/web/src/lib/mods/format.ts`, `packages/core/src/mods.ts` and `packages/core/test/mods.test.ts`, `packages/core/src/version.ts`, `README.md`, `docs/guides/writing-a-mod.md`, `docs/research/licence.md`
- **Shared contracts:** mod manifest schema (optional `licence` field; additive, `API_VERSION` patch bump)

## Design notes

Keep the SPDX id as the single source; the Credits page and the mod manager render it. A manifest without the field still loads.

## Steps

1. Add the `license` field to every workspace package.json (root, `packages/*`, `apps/web`, `mods/stock`, `examples/mod-sample`, `tools/mod-build`) and the test that reads them; run `bun install` and confirm `bun.lock` is unchanged.
2. `credits.ts` (game licence, font copyright lines), the Credits page, `credits.test.ts`, the README status line.
3. Dependency review for NOTICE (Apache-2.0 dependencies that ship a NOTICE; OFL fonts), recorded in `docs/research/licence.md` with sources and dates; add `NOTICE` only if a dependency requires it.
4. The optional manifest `licence` field: schema, `API_VERSION`, core test, the mod manager (installed list and trust prompt) with a vitest test, the sample's `mod.json`, the guide.

## Acceptance criteria

- [ ] `bunx vitest run src/lib/public/licences.test.ts` (apps/web): the test expands the root `workspaces` globs, reads the root and every workspace `package.json`, and asserts `license === "Apache-2.0"` for each (and that it found at least 11 packages).
- [ ] `bunx vitest run src/lib/public/credits.test.ts`: `GAME_LICENCE` is `"Apache-2.0"`, every OFL font credit has a copyright line, and no "to be decided" text is left (`grep -ri "to be decided" apps/web/src README.md` finds nothing about the licence).
- [ ] `bun test packages/core/test/mods.test.ts`: a manifest with `licence: "MIT"` parses and keeps the field, one without it parses, and one with `licence: "not a licence!"` is refused with a message naming the field.
- [ ] `bunx vitest run src/lib/mods`: the installed list and the trust prompt text show the stated licence and "not stated" without one (format helper test).
- [ ] `bun.lock` unchanged by step 1 (`git diff --exit-code origin/main -- bun.lock`).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/075-apache-2-licence-adoption.md` written.
- [ ] `docs/research/licence.md` (dependency review).
- [ ] `guides/writing-a-mod.md` (manifest licence field).
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0106).
- 2026-10-17 — Refined and claimed by Agent 3. The credits test moves to its own `credits.test.ts`, as the criterion names it. The licence link goes to apache.org, because the static build does not serve `LICENSE`. Font copyright lines are added for OFL condition 2. The manifest field accepts SPDX expressions. `API_VERSION`: patch bump from `main`'s value; 079 (`ready/079`) also bumps it, so whichever merges second takes `main` + 1 (roadmap §3.6). 075 and 079 both edit `apps/web/src/routes/mods/+page.svelte` in different blocks; I rebase whichever merges second.
- 2026-10-17 — Handed over as `ready/075`; the handover text is the tag message. Added test files (not named in Touches): `apps/web/src/lib/mods/format.test.ts` for `licenceLabel`. No NOTICE: no shipped Apache-2.0 dependency has one (`research/licence.md`). The full web vitest has the same two environment-only suites failing as in 079 (no Node here).
- 2026-10-17 — Rebased on `origin/main` after the 079 merge (`cp/f1-079-patch`). Conflict in `apps/web/src/lib/mods/format.ts`: both helpers kept. `API_VERSION` 0.1.27 (079 took 0.1.26). `ready/075` was re-tagged.
- 2026-10-17 — Merge by Agent 1 (M5): rebased on `main` @ d2f1b24 (078 merged); `API_VERSION` 0.1.28 (078 took 0.1.27; guide line updated). The Chromium smoke failed on the old credits text (`getByText('To be decided')`, `e2e/smoke.e2e.ts`, not in Touches): the Lead updated it to expect "Apache License, Version 2.0" and no "To be decided"; the test then passed twice in a row (`1 passed (3.9s)`, `1 passed (3.8s)`), the other five smoke tests passed in the full run. `bun run test` 1356 pass, 0 fail · web vitest 96 files, 833 passed (the two Bun-only suites pass with Node) · typecheck exit 0 · build exit 0 · docs:check OK · `bun.lock` unchanged.
