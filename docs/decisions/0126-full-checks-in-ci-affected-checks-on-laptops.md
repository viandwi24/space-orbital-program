# 0126 — Full checks run in CI; laptops run the checks for what changed

**Status:** accepted
**Date:** 2026-10-18
**Plan:** none (owner request in chat, 2026-10-18); process change to `docs/roadmap/` and `.github/workflows/ci.yml`
**Amends:** `docs/roadmap/team-development-roadmap.md` §2 (test cadence), §7.1 (handover), §7.2 (merge checklist steps 4, 5 and 9), §8; `docs/roadmap/agent-brief.md` steps 6 and 7.

## Context

The owner reported that the full suite gets heavier every day, takes long and heats the laptops. The suite has 214 bun test files, 129 `apps/web` vitest files and 16 e2e files, and it grows with every plan. Each dev ran it before every handover, and Agent 1 ran it again at every merge (about 15 minutes per merge on the M5). Meanwhile the GitHub Actions workflow failed on every push to `main` since kickoff: its `lint` step (`prettier --check .`) finds about twenty unformatted files, because no local checklist runs `lint`. The repository is public, so Actions minutes cost nothing. The owner asked that the change must not slow development down.

## Decision

1. **CI runs the full suite** (`.github/workflows/ci.yml`): typecheck, `bun run test`, web vitest and build. It also runs the Chromium smoke e2e as information only. The runner has no GPU, and software WebGL on 4 vCPU failed the smoke in the first runs. Its result and Playwright report are kept, but it does not decide pass or fail.
   - It runs on every handover tag `ready/*`, on every push to `main` and on pull requests.
   - A push that changes only docs runs `docs:check` alone.
   - A newer push to `main` cancels the older run.
2. **The result of a handover is a ref:** `refs/ci/pass/<sha>` or `refs/ci/fail/<sha>`. Agent 1 reads it with plain git (`git ls-remote origin 'refs/ci/*/<sha>'`), with no `gh` and no API.
3. **Laptops run `bun run check:affected`** (`tools/check-affected.ts`). It runs, one step at a time:
   - prettier on the changed files and `docs:check`;
   - typecheck and `bun test` of the changed workspaces and every workspace that depends on them;
   - only the web vitest tests related to the change (`--changed`, 2 workers);
   - a build or one e2e file only when asked (`--build`, `--e2e <file>`).
   A root config change (`package.json`, `bun.lock`, `tsconfig*`, prettier config) runs everything. `--full` is the local fallback when CI is unavailable.
4. **Handover:** the dev runs `check:affected` (plus the plan's own e2e file on one engine if it names one), pushes `ready/<NNN>` and moves on to its next task while CI runs. A `refs/ci/fail/<sha>` is a bounce.
5. **Merge:** Agent 1 merges a handover only when `refs/ci/pass/<sha>` exists for the handed-over commit. On the rebased result it runs `check:affected` and the M5-only criteria (¹, frame budgets). For a plan that touches `apps/web` or `packages/renderer`, it also runs the Chromium smoke (`--e2e e2e/smoke.e2e.ts`, one engine, about two minutes). The push to `main` runs the full suite in CI. A red `main` is fixed first, before the next merge. Agent 1 deletes the plan's `refs/ci/*` refs with its `claim` and `ready` tags.
6. **Lint until the one-time format:** CI and `check:affected` check formatting of the changed files only. A file you change must be formatted. At the next phase gate with no open claim, Agent 1 runs `prettier --write .` once in its own commit and CI switches back to the whole tree.
7. **Phase gates keep the full local run** on the M5 with the three-engine e2e (unchanged).
8. **Fallback:** when no CI result exists 30 minutes after a handover tag, or GitHub Actions is down, Agent 1 merges with `bun run check:affected --full --e2e e2e/smoke.e2e.ts` as before.

## Alternatives considered

- **Keep the full local suite and only lower parallelism** — rejected: it keeps the heat and the 15-minute merges. Lower parallelism (2 vitest workers, one step at a time) is still part of `check:affected`.
- **CI on every pushed dev branch** — rejected: devs push after every step, so CI would run dozens of times per plan for results nobody reads; the handover is the moment that matters.
- **Format the whole repository now** — rejected for now: Agents 2 and 3 have open branches on those files, and a repo-wide format would turn their rebases into conflicts.

## Consequences

- **Laptops:** devs and Agent 1 run minutes of checks instead of the full suite; the full suite runs on GitHub's machines while the dev continues.
- **Merges:** a merge waits only for a CI result that normally already exists when Agent 1 takes the handover, and the full local suite is gone from it. Development speeds up rather than slowing down.
- `main` becomes green again once the changed-files lint is in; the first push after this ADR shows it.
- `tools/check-affected.ts`, `bun run check:affected`, the workflow and the roadmap steps above.
