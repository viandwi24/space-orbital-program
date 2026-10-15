# 001 — Repo bootstrap

**Plan:** plans/001-repo-bootstrap.md · **Session:** bootstrap (Claude, chat) · **Date:** 2026-10-16

## What was done

Scaffolded the monorepo with official commands, then edited the output:

```sh
# root (Bun 1.4.2)
bun init --yes                         # then converted package.json into a workspace root
# web client (sv 1.1.1, SvelteKit 3.1, Svelte 5.57)
bunx sv@1.1.1 create apps/web --template minimal --types ts \
  --add prettier vitest="usages:unit" sveltekit-adapter="adapter:static" \
  --no-install --no-download-check
# each library package
cd packages/<name> && bun init --yes   # then: moved index.ts → src/, rewrote package.json & tsconfig.json
bun install
```

Edits after scaffolding: root `workspaces.packages` + `catalog`; per-package `package.json` (names `@orbital/*`, `exports` to `src/index.ts`, `workspace:*` deps, `catalog:` versions); `tsconfig.base.json` from the bun-generated root config, per-package tsconfigs with `lib: ["ESNext"]` (no DOM) except renderer; `apps/web`: `fallback: '200.html'` in `vite.config.ts`, `src/routes/+layout.ts` with `prerender = true`, workspace deps on sim/sdk/renderer/stock. Placeholder `src/index.ts` per package; one smoke test.

Docs system: `AGENTS.md`, `CLAUDE.md`, `docs/**`, `tools/docs-check.ts`.

## What surprised me

- `bun init -y` (short flag) created a sub-folder named `init` in the sandbox where `BUN_OPTIONS=--smol` was exported; `bun init --yes` with that variable unset behaved. If scaffolding misbehaves, check `BUN_OPTIONS` first.
- SvelteKit 3 has **no `svelte.config.js`**: adapter and compiler options live in `vite.config.ts` inside `sveltekit({...})`. Older tutorials are wrong for this version.
- `sv create` with `vitest="usages:unit,component"` pulls in Playwright + browser testing; we chose `usages:unit` only to keep installs light. Component tests can be added later with `sv add vitest`.
- `sv create` pinned `typescript ^6.0.3` for `svelte-check`; Bun's own `bun init` wants `^7`. Both coexist (root catalog pins `^6.0.3`; `bun check` is not used as the typecheck command). See STATUS known issues.
- adapter-static with `strict: true` fails the build until the root layout sets `prerender = true` (we also set the SPA fallback).

## Decisions made

ADRs 0001–0009.

## Open questions / follow-ups

- Package scope name and project name are placeholders.
- Lint rule enforcing import boundaries (currently tsconfig `lib` + manifests only). Add a plan when a violation slips through.
- License.

## Verification output

```
bun test packages mods      → 1 pass, 0 fail
bun run typecheck           → all packages exit 0; svelte-check 0 errors
bun run build               → Wrote site to "build" (index.html, 200.html)
bun run docs:check          → OK
```
