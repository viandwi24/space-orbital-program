# 0002 — Bun workspace monorepo with per-package boundaries

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/001-repo-bootstrap.md

## Context

Core, math, physics adapter, simulation, SDK, renderer, stock content and the web client have different environment constraints. A single package cannot enforce "core must not import the DOM". Multiple repos would make cross-cutting changes painful at this stage.

## Decision

One repository, Bun workspaces: `packages/*`, `apps/*`, `mods/*`, `tools/*`. Bun is runtime, package manager and test runner (`bun:test`) for everything except the web client build, which uses Vite through SvelteKit. Shared dependency versions live in the root `workspaces.catalog`. Each package has its own `tsconfig.json` extending `tsconfig.base.json`, with `lib` restricted to enforce environment rules.

## Alternatives considered

- **Single package** — cannot enforce boundaries. Rejected.
- **pnpm/turborepo** — fine, but Bun already provides workspaces, catalogs, `--filter`, and a test runner; one tool fewer. Revisit only if Bun workspaces block something.
- **Bun bundler for the web app** — HMR/Svelte tooling is Vite-centric; SvelteKit's official path is Vite. Rejected for now.

## Consequences

- Scripts run per package via `bun run --filter`.
- `apps/web` carries its own TypeScript version if `svelte-check` lags behind; recorded in `research/stack-versions.md`.
- Future WASM packages slot in as `packages/<name>-wasm`.
