# 075 — Apache-2.0: package metadata, credits and the mod manifest licence field

**Plan:** plans/075-apache-2-licence-adoption.md · **Session:** Agent 3 (Dev C, Linux Mint, 2026-10-17), three-agent team mode · **ADRs:** [0106](../decisions/0106-licence-apache-2-0.md) (no new ADR) · **Research:** [licence.md](../research/licence.md) (SPDX ids and expressions, dependency NOTICE review)

**Status when written: criteria met here, handed over as `ready/075`.**

## What was done

| Where | What |
| --- | --- |
| root and 11 workspace `package.json` | `"license": "Apache-2.0"`; `bun install` left `bun.lock` unchanged |
| `apps/web/src/lib/public/licences.test.ts` | expands the root `workspaces` globs and checks every `license` |
| `apps/web/src/lib/public/credits.ts`, `credits.test.ts`, `routes/credits` | `GAME_LICENCE = 'Apache-2.0'`, a link to the licence text, the fonts' copyright lines with a link to the OFL. The credits test moved out of `roadmap.test.ts` |
| `README.md` | status line: "licensed under Apache-2.0" |
| `packages/core/src/mods.ts` | optional manifest `licence`, checked by `isSpdxExpression` (shape only: ids, `AND`/`OR`/`WITH`, `+`, parentheses, at most 64 characters); `API_VERSION` 0.1.27 |
| `apps/web/src/routes/mods`, `lib/mods/format.ts` | licence in the installed list and the trust prompt ("not stated" without one) |
| `examples/mod-sample/mod.json`, guide | the sample states Apache-2.0; the guide documents the field |

## Decisions

- **No `NOTICE` file.** None of the shipped Apache-2.0 dependencies (Rapier, in npm and in its upstream repository) has one. The table and sources are in `research/licence.md`.
- **Fonts (OFL 1.1 condition 2).** The copyright notice and the licence must go with the font files. They go out on the Credits page, which is part of every build. A plan that adds a font adds its line (086 adds Manrope), and `credits.test.ts` fails without it.
- **The licence link goes to apache.org.** The static build does not serve the repository's `LICENSE`. The text is the same (SHA-256 recorded in `research/licence.md`).
- **Shape check, not the SPDX list,** for mod licences. A list would have to ship and grow, and the mod manager only shows what the author wrote.

## Coordination notes

- `API_VERSION`: 077 took 0.1.25 and 079 took 0.1.26 (merged first), so this plan is 0.1.27, set after rebasing on the 079 merge.
- 079 and 075 both edit `apps/web/src/routes/mods/+page.svelte`, in different blocks: 079 the patches under a running mod, 075 the version line and the trust prompt. The rebase on the 079 merge had one conflict, in `lib/mods/format.ts` (both appended a helper), and kept both.
- 074 (Agent 2) also edits `README.md`. This plan changed only the status line (line 5).

## Verification output

```text
bunx vitest run src/lib/public/licences.test.ts   Tests 1 passed
bunx vitest run src/lib/mods src/lib/public       Test Files 7 passed, Tests 32 passed
bun test packages/core/test/mods.test.ts          13 pass, 0 fail
git diff --exit-code origin/main -- bun.lock      no diff
bun run docs:check                                docs-check: OK
bun run test                                      1319 pass, 0 fail (169 s)
bun run typecheck                                 exit 0 (56 s)
bun run build                                     exit 0
bun run --filter @orbital/web test                820 passed, 1 skipped; editor-options and settings suites fail at import on this
                                                  machine only (no Node: vitest runs under Bun, `import { z } from 'zod'`), as in 079
```
